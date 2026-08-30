import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AircraftProfile,
  Wind,
  WindMode,
  WindState,
  RouteToken,
  NavLogSummary,
  Waypoint,
} from './types';
import { ScratchpadView } from './components/ScratchpadView';
import { DisclaimerModal } from './components/DisclaimerModal';
import { WaypointDB, initWaypointDatabase } from './data/waypoint-db';
import { searchOsmReportingPoint } from './data/osm-vrp';
import { fetchWindsAloft, parseManualWind } from './data/winds-aloft';
import { computeNavLog } from './engine/navlog-engine';
import { parseRouteString } from './utils/route-parser';
import { decodeRouteFromUrl, copyShareableRouteLink } from './utils/url-route';

// ─── Local storage helpers ───

function loadProfile(): AircraftProfile {
  // Check if shared via URL first
  const shared = decodeRouteFromUrl();
  if (shared?.profile) {
    return {
      aircraftModel: shared.profile.aircraftModel || 'c172',
      cruiseAltitude: shared.profile.cruiseAltitude || 4500,
      tas: shared.profile.tas || 105,
      fuelFlow: shared.profile.fuelFlow !== undefined ? shared.profile.fuelFlow : 8.5,
      fuelUnit: shared.profile.fuelUnit || 'gph',
    };
  }

  try {
    const stored = localStorage.getItem('windlog_profile');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        aircraftModel: parsed.aircraftModel || 'c172',
        cruiseAltitude: parsed.cruiseAltitude || 4500,
        tas: parsed.tas || 105,
        fuelFlow: parsed.fuelFlow !== undefined ? parsed.fuelFlow : 8.5,
        fuelUnit: parsed.fuelUnit || 'gph',
      };
    }
  } catch { /* ignore */ }

  return {
    aircraftModel: 'c172',
    cruiseAltitude: 4500,
    tas: 105,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
  };
}

function saveProfile(p: AircraftProfile) {
  localStorage.setItem('windlog_profile', JSON.stringify(p));
}

function loadCustomWaypoints(): Record<string, Waypoint> {
  try {
    const stored = localStorage.getItem('windlog_custom_wpts');
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function saveCustomWaypoints(wpts: Record<string, Waypoint>) {
  localStorage.setItem('windlog_custom_wpts', JSON.stringify(wpts));
}

function loadRouteInput(): string {
  const shared = decodeRouteFromUrl();
  if (shared?.route) {
    return shared.route;
  }
  return localStorage.getItem('windlog_route') || '';
}

function saveRouteInput(s: string) {
  localStorage.setItem('windlog_route', s);
}

function loadWindMode(): WindMode {
  return (localStorage.getItem('windlog_wind_mode') as WindMode) || 'auto';
}

function loadManualWind(): string {
  return localStorage.getItem('windlog_manual_wind') || '';
}

// ─── App Component ───

export default function App() {
  const [db, setDb] = useState<WaypointDB | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const [profile, setProfile] = useState<AircraftProfile>(loadProfile);
  const [routeInput, setRouteInput] = useState(loadRouteInput);
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('windlog_disclaimer_accepted');
    } catch {
      return true;
    }
  });
  const [tokens, setTokens] = useState<RouteToken[]>([]);
  const [resolvedWaypoints, setResolvedWaypoints] = useState<Waypoint[]>([]);
  const [activeLegIndex, setActiveLegIndex] = useState<number | null>(null);
  const [legAltitudeOverrides, setLegAltitudeOverrides] = useState<Record<number, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [windState, setWindState] = useState<WindState>({
    mode: loadWindMode(),
    wind: null,
    lastUpdated: null,
    source: null,
  });
  const [isWindLoading, setIsWindLoading] = useState(false);
  const [manualWindInput, setManualWindInput] = useState(loadManualWind);
  const [perLegWinds, setPerLegWinds] = useState<(Wind | null)[]>([]);

  const [coordPrompt, setCoordPrompt] = useState<{ identifier: string } | null>(null);
  const [customWaypoints, setCustomWaypoints] = useState<Record<string, Waypoint>>(loadCustomWaypoints);

  const windCacheRef = useRef<Map<string, Wind | null>>(new Map());

  // ─── Initialize database ───
  useEffect(() => {
    initWaypointDatabase().then((waypointDb) => {
      setDb(waypointDb);
      setDbReady(true);
    });
  }, []);

  // ─── Profile persistence ───
  const handleProfileChange = useCallback((p: AircraftProfile) => {
    setProfile(p);
    saveProfile(p);
  }, []);

  // ─── Route input persistence ───
  const handleRouteInputChange = useCallback((s: string) => {
    setRouteInput(s);
    saveRouteInput(s);
  }, []);

  // ─── Route Actions ───
  const handleReverseRoute = useCallback(() => {
    const trimmed = routeInput.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const reversed = parts.reverse().join(' ');
    setRouteInput(reversed);
    saveRouteInput(reversed);
    setLegAltitudeOverrides({});
    setActiveLegIndex(null);
  }, [routeInput]);

  const handleClearRoute = useCallback(() => {
    setRouteInput('');
    saveRouteInput('');
    setTokens([]);
    setResolvedWaypoints([]);
    setLegAltitudeOverrides({});
    setActiveLegIndex(null);
  }, []);

  const handleShareRoute = useCallback(async () => {
    const success = await copyShareableRouteLink(routeInput, profile);
    if (success) {
      setToastMessage('Flight route link copied to clipboard!');
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [routeInput, profile]);

  // ─── Waypoint resolution helper with AbortSignal ───
  const resolveWaypoint = useCallback(async (
    identifier: string,
    waypointDb: WaypointDB,
    signal?: AbortSignal
  ): Promise<Waypoint | null> => {
    const upper = identifier.toUpperCase().trim();
    if (!upper) return null;

    // 1. Check custom waypoints first (synchronous instant match)
    if (customWaypoints[upper]) {
      return customWaypoints[upper];
    }

    // 2. Check bundled SQLite database (synchronous instant match)
    const dbResult = waypointDb.findByIdentifier(upper);
    if (dbResult) return dbResult;

    // 3. Try OpenStreetMap for VFR reporting points (online only with timeout/signal)
    try {
      const osmResult = await searchOsmReportingPoint(upper, signal);
      if (osmResult) return osmResult;
    } catch {
      // Offline, cancelled or API error — skip
    }

    return null;
  }, [customWaypoints]);

  // ─── Parse route and resolve waypoints (debounced with race-condition guard) ───
  useEffect(() => {
    if (!dbReady || !db) return;

    const trimmed = routeInput.trim();
    if (!trimmed) {
      setTokens([]);
      setResolvedWaypoints([]);
      return;
    }

    const parsedItems = parseRouteString(trimmed);

    // Show initial resolving status with currently typed identifiers
    setTokens(parsedItems.map(item => ({
      raw: item.raw,
      identifier: item.identifier,
      altitudeOverride: item.altitudeOverride,
      waypoint: null,
      status: 'resolving' as const,
    })));

    let isCancelled = false;
    const abortCtrl = new AbortController();

    const timer = setTimeout(async () => {
      const newTokens: RouteToken[] = [];
      const newWaypoints: Waypoint[] = [];

      for (let i = 0; i < parsedItems.length; i++) {
        if (isCancelled) return;
        const item = parsedItems[i];
        const wpt = await resolveWaypoint(item.identifier, db, abortCtrl.signal);
        if (isCancelled) return;

        if (wpt) {
          newTokens.push({
            raw: item.raw,
            identifier: item.identifier,
            altitudeOverride: item.altitudeOverride,
            waypoint: wpt,
            status: 'resolved',
          });
          newWaypoints.push(wpt);
        } else {
          newTokens.push({
            raw: item.raw,
            identifier: item.identifier,
            altitudeOverride: item.altitudeOverride,
            waypoint: null,
            status: 'not-found',
          });
        }
      }

      if (!isCancelled) {
        setTokens(newTokens);
        setResolvedWaypoints(newWaypoints);
      }
    }, 150);

    return () => {
      isCancelled = true;
      abortCtrl.abort();
      clearTimeout(timer);
    };
  }, [routeInput, dbReady, db, customWaypoints, resolveWaypoint]);

  // ─── Synchronous NavLog Computation (0ms instant reactivity) ───
  const navLog: NavLogSummary | null = (() => {
    if (resolvedWaypoints.length < 2) return null;

    const legAlts: number[] = [];
    for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
      const tokenAlt = tokens[i + 1]?.altitudeOverride || tokens[i]?.altitudeOverride;
      const legAlt = legAltitudeOverrides[i] !== undefined
        ? legAltitudeOverrides[i]
        : (tokenAlt || profile.cruiseAltitude);
      legAlts.push(legAlt);
    }

    return computeNavLog(
      resolvedWaypoints,
      profile,
      windState.wind,
      legAlts,
      perLegWinds
    );
  })();

  // ─── Per-Leg Altitude Change Handler (Instant synchronous update) ───
  const handleLegAltitudeChange = useCallback((legIndex: number, newAlt: number) => {
    setLegAltitudeOverrides(prev => ({
      ...prev,
      [legIndex]: newAlt,
    }));
  }, []);

  // ─── Token Click Handler ───
  const handleTokenClick = useCallback((token: RouteToken) => {
    if (token.status === 'not-found') {
      setCoordPrompt({ identifier: token.identifier });
    }
  }, []);

  // ─── Wind mode handling ───
  const handleWindModeChange = useCallback((mode: WindMode) => {
    localStorage.setItem('windlog_wind_mode', mode);
    setWindState(prev => ({ ...prev, mode }));

    if (mode === 'manual') {
      const parsed = parseManualWind(manualWindInput);
      setWindState(prev => ({
        ...prev,
        mode: 'manual',
        wind: parsed,
        source: parsed ? 'Manual' : null,
      }));
    }
  }, [manualWindInput]);

  const handleWindChange = useCallback((wind: Wind | null) => {
    if (windState.mode === 'manual') {
      const windStr = wind ? `${wind.direction}/${wind.speed}` : '';
      setManualWindInput(windStr);
      localStorage.setItem('windlog_manual_wind', windStr);
      setWindState(prev => ({
        ...prev,
        wind,
        source: wind ? 'Manual' : null,
        lastUpdated: new Date(),
      }));
    }
  }, [windState.mode]);

  // ─── Auto winds aloft fetch (with per-altitude awareness) ───
  useEffect(() => {
    if (windState.mode !== 'auto') return;
    if (!navLog || navLog.legs.length === 0) return;

    let isMounted = true;
    setIsWindLoading(true);

    // Fetch winds for each leg based on its specific altitude & coordinates
    const fetchPromises = navLog.legs.map(async (leg) => {
      const midLat = (leg.from.latitude + leg.to.latitude) / 2;
      const midLon = (leg.from.longitude + leg.to.longitude) / 2;
      const cacheKey = `${midLat.toFixed(2)}_${midLon.toFixed(2)}_${leg.altitude}`;

      if (windCacheRef.current.has(cacheKey)) {
        return windCacheRef.current.get(cacheKey) || null;
      }

      try {
        const wind = await fetchWindsAloft(midLat, midLon, leg.altitude);
        windCacheRef.current.set(cacheKey, wind);
        return wind;
      } catch {
        return null;
      }
    });

    Promise.all(fetchPromises)
      .then((winds) => {
        if (!isMounted) return;
        setPerLegWinds(winds);
        const firstValidWind = winds.find(w => w !== null) || null;
        setWindState(prev => ({
          ...prev,
          wind: firstValidWind,
          lastUpdated: new Date(),
          source: firstValidWind ? 'Auto (Aloft per-leg)' : null,
        }));
      })
      .finally(() => {
        if (isMounted) setIsWindLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [windState.mode, navLog?.legs.length, profile.cruiseAltitude, legAltitudeOverrides]);

  // ─── Custom waypoint confirmation ───
  const handleCoordConfirm = useCallback((waypoint: Waypoint) => {
    const newCustom = { ...customWaypoints, [waypoint.identifier]: waypoint };
    setCustomWaypoints(newCustom);
    saveCustomWaypoints(newCustom);
    setCoordPrompt(null);
  }, [customWaypoints]);

  const handleCoordCancel = useCallback(() => {
    setCoordPrompt(null);
  }, []);

  const handleAcceptDisclaimer = useCallback(() => {
    try {
      localStorage.setItem('windlog_disclaimer_accepted', 'true');
    } catch { /* ignore */ }
    setShowDisclaimer(false);
  }, []);

  // ─── Loading state ───
  if (!dbReady) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✈</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Loading 84,000+ waypoints...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ScratchpadView
        profile={profile}
        onProfileChange={handleProfileChange}
        windState={windState}
        onWindChange={handleWindChange}
        onWindModeChange={handleWindModeChange}
        isWindLoading={isWindLoading}
        routeInput={routeInput}
        onRouteInputChange={handleRouteInputChange}
        tokens={tokens}
        resolvedWaypoints={resolvedWaypoints}
        navLog={navLog}
        activeLegIndex={activeLegIndex}
        onSelectLeg={(idx) => setActiveLegIndex(activeLegIndex === idx ? null : idx)}
        onReverseRoute={handleReverseRoute}
        onClearRoute={handleClearRoute}
        onShareRoute={handleShareRoute}
        onTokenClick={handleTokenClick}
        onLegAltitudeChange={handleLegAltitudeChange}
        toastMessage={toastMessage}
        coordPrompt={coordPrompt}
        onCoordConfirm={handleCoordConfirm}
        onCoordCancel={handleCoordCancel}
      />

      {showDisclaimer && (
        <DisclaimerModal onAccept={handleAcceptDisclaimer} />
      )}
    </>
  );
}
