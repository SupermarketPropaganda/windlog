import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AircraftProfile,
  Wind,
  WindMode,
  WindState,
  RouteToken,
  NavLogSummary,
  Waypoint,
  ActiveView,
  RunwayWindResult,
  SavedFlight,
} from './types';
import { ScratchpadView } from './components/ScratchpadView';
import { DisclaimerModal } from './components/DisclaimerModal';
import { KneeboardModal } from './components/KneeboardModal';
import { SideMenu } from './components/SideMenu';
import { MassBalanceView } from './components/MassBalanceView';
import { RunwayWindView } from './components/RunwayWindView';
import { SavedFlightsView } from './components/SavedFlightsView';
import { AuthPage } from './components/AuthPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdProvider, useAdBreak } from './context/AdContext';
import { AdInterstitialModal } from './components/ads/AdInterstitialModal';
import { WindLogProModal } from './components/ads/WindLogProModal';
import { WaypointDB, initWaypointDatabase } from './data/waypoint-db';
import { searchOsmReportingPoint } from './data/osm-vrp';
import { fetchWindsAloft, parseManualWind } from './data/winds-aloft';
import { getSavedFlightsSync, saveFlightRecord } from './data/saved-flights';
import { CURRENT_LEGAL_VERSION } from './data/legal-terms';
import { computeNavLog } from './engine/navlog-engine';
import { parseRouteString } from './utils/route-parser';
import { decodeRouteFromUrl, copyShareableRouteLink } from './utils/url-route';
import { initStorage, getStorageItemSync, setStorageItem } from './data/storage-manager';
import { CURRENT_DATABASE_METADATA } from './data/airac-meta';
import { checkDatabaseAiracStatus } from './engine/airac';
import { initializeNativeShell } from './utils/platform';

// ─── Local storage helpers via StorageManager ───

function loadProfile(): AircraftProfile {
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

  const stored = getStorageItemSync<any>('windlog_profile', null);
  if (stored) {
    return {
      aircraftModel: stored.aircraftModel || 'c172',
      cruiseAltitude: stored.cruiseAltitude || 4500,
      tas: stored.tas || 105,
      fuelFlow: stored.fuelFlow !== undefined ? stored.fuelFlow : 8.5,
      fuelUnit: stored.fuelUnit || 'gph',
    };
  }

  return {
    aircraftModel: 'c172',
    cruiseAltitude: 4500,
    tas: 105,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
  };
}

function saveProfile(p: AircraftProfile) {
  setStorageItem('windlog_profile', p);
}

function loadCustomWaypoints(): Record<string, Waypoint> {
  return getStorageItemSync<Record<string, Waypoint>>('windlog_custom_wpts', {});
}

function saveCustomWaypoints(wpts: Record<string, Waypoint>) {
  setStorageItem('windlog_custom_wpts', wpts);
}

function loadRouteInput(): string {
  const shared = decodeRouteFromUrl();
  if (shared?.route) {
    return shared.route;
  }
  const saved = getStorageItemSync<string>('windlog_route', '');
  if (saved && saved.trim().length > 0) {
    return saved;
  }
  const autoFillHome = getStorageItemSync<boolean>('windlog_auto_home_base', false);
  const homeBase = getStorageItemSync<string>('windlog_home_base', '');
  if (autoFillHome && homeBase && homeBase.trim()) {
    return `${homeBase.trim().toUpperCase()} `;
  }
  return '';
}

function saveRouteInput(s: string) {
  setStorageItem('windlog_route', s);
}

function loadWindMode(): WindMode {
  return getStorageItemSync<WindMode>('windlog_wind_mode', 'auto');
}

function loadManualWind(): string {
  return getStorageItemSync<string>('windlog_manual_wind', '');
}

// ─── Cockpit Suite (Authenticated Flight Environment) ───

interface CockpitSuiteProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
}

function CockpitSuite({ activeView, onChangeView }: CockpitSuiteProps) {
  const [db, setDb] = useState<WaypointDB | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const [profile, setProfile] = useState<AircraftProfile>(loadProfile);
  const [routeInput, setRouteInput] = useState(loadRouteInput);
  const [showDisclaimer, setShowDisclaimer] = useState<boolean>(() => {
    try {
      const acceptedVersion = localStorage.getItem('windlog_legal_version_accepted');
      return acceptedVersion !== CURRENT_LEGAL_VERSION;
    } catch {
      return true;
    }
  });
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 980) {
      return true;
    }
    try {
      const stored = localStorage.getItem('windlog_sidebar_open');
      if (stored !== null) return stored === 'true';
      return false;
    } catch {
      return false;
    }
  });
  const [runwayWindResult, setRunwayWindResult] = useState<RunwayWindResult | null>(null);
  const [isKneeboardOpen, setIsKneeboardOpen] = useState<boolean>(false);
  const [dbProgress, setDbProgress] = useState<{ percent: number }>({ percent: 0 });
  const [airacReport] = useState(() => checkDatabaseAiracStatus(CURRENT_DATABASE_METADATA.airacCycle));

  const { user } = useAuth();
  const { triggerAdBreak } = useAdBreak();
  const [departureTime, setDepartureTime] = useState<string | null>(() =>
    getStorageItemSync<string | null>('windlog_departure_time', null)
  );
  const [savedFlightsCount, setSavedFlightsCount] = useState<number>(() =>
    getSavedFlightsSync(user?.id).length
  );

  useEffect(() => {
    setSavedFlightsCount(getSavedFlightsSync(user?.id).length);
  }, [user?.id]);

  const handleDepartureTimeChange = useCallback((time: string | null) => {
    setDepartureTime(time);
    setStorageItem('windlog_departure_time', time);
    windCacheRef.current.clear();
  }, []);

  // ─── Native shell & Storage initialization ───
  useEffect(() => {
    initializeNativeShell();
    initStorage().catch(console.warn);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSideMenuOpen((prev) => {
      const next = !prev;
      try {
        setStorageItem('windlog_sidebar_open', String(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [tokens, setTokens] = useState<RouteToken[]>([]);
  const [resolvedWaypoints, setResolvedWaypoints] = useState<Waypoint[]>([]);
  const [activeLegIndex, setActiveLegIndex] = useState<number | null>(null);
  const [legAltitudeOverrides, setLegAltitudeOverrides] = useState<Record<number, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [windState, setWindState] = useState<WindState>(() => {
    const mode = loadWindMode();
    const manualStr = loadManualWind();
    const manualParsed = mode === 'manual' ? parseManualWind(manualStr) : null;
    return {
      mode,
      wind: manualParsed,
      lastUpdated: manualParsed ? new Date() : null,
      source: manualParsed ? 'Manual' : null,
    };
  });
  const [isWindLoading, setIsWindLoading] = useState(false);
  const [manualWindInput, setManualWindInput] = useState(loadManualWind);
  const [perLegWinds, setPerLegWinds] = useState<(Wind | null)[]>([]);

  const [coordPrompt, setCoordPrompt] = useState<{ identifier: string } | null>(null);
  const [customWaypoints, setCustomWaypoints] = useState<Record<string, Waypoint>>(loadCustomWaypoints);

  const windCacheRef = useRef<Map<string, Wind | null>>(new Map());

  // ─── Initialize database with IndexedDB cache & progress ───
  useEffect(() => {
    initWaypointDatabase(
      (percent) => setDbProgress({ percent }),
      CURRENT_DATABASE_METADATA.airacCycle
    ).then((waypointDb) => {
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
    const autoFillHome = getStorageItemSync<boolean>('windlog_auto_home_base', false);
    const homeBase = getStorageItemSync<string>('windlog_home_base', '');
    const defaultRoute = autoFillHome && homeBase && homeBase.trim() ? `${homeBase.trim().toUpperCase()} ` : '';
    setRouteInput(defaultRoute);
    saveRouteInput(defaultRoute);
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

    const effectiveLegWinds =
      windState.mode === 'auto' && perLegWinds.length > 0 ? perLegWinds : undefined;

    return computeNavLog(
      resolvedWaypoints,
      profile,
      windState.wind,
      legAlts,
      effectiveLegWinds
    );
  })();

  // ─── Save & Load Flight Actions ───
  const handleSaveFlight = useCallback(async () => {
    if (!routeInput.trim()) {
      setToastMessage('Please enter a route before saving.');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    triggerAdBreak({
      placement: 'save_flight',
      title: 'Archiving Flight to Hangar',
      subtitle: 'Saving waypoints, leg fuel burns, and wind calculations',
      onComplete: async () => {
        const saved = await saveFlightRecord({
          routeInput,
          departureTime,
          profile,
          legAltitudeOverrides,
          summary: navLog
            ? {
                totalDistance: navLog.totalDistance,
                totalEte: navLog.totalEte,
                totalFuel: navLog.totalFuel,
                legsCount: navLog.legs.length,
              }
            : undefined,
          userId: user?.id,
        });

        setSavedFlightsCount(getSavedFlightsSync(user?.id).length);
        setToastMessage(`Flight "${saved.name}" saved!`);
        setTimeout(() => setToastMessage(null), 3000);
      },
    });
  }, [routeInput, departureTime, profile, legAltitudeOverrides, navLog, user?.id, triggerAdBreak]);

  const isFlightSaved = useMemo(() => {
    if (!routeInput.trim()) return false;
    const flights = getSavedFlightsSync(user?.id);
    return flights.some(f => f.routeInput.trim().toUpperCase() === routeInput.trim().toUpperCase());
  }, [routeInput, user?.id, savedFlightsCount]);

  const handleLoadSavedFlight = useCallback((flight: SavedFlight) => {
    setRouteInput(flight.routeInput);
    saveRouteInput(flight.routeInput);
    setProfile(flight.profile);
    saveProfile(flight.profile);
    setLegAltitudeOverrides(flight.legAltitudeOverrides || {});
    setDepartureTime(flight.departureTime);
    setStorageItem('windlog_departure_time', flight.departureTime);
    windCacheRef.current.clear();
    onChangeView('navlog');
    setToastMessage(`Flight "${flight.name}" loaded into cockpit!`);
    setTimeout(() => setToastMessage(null), 3000);
  }, [onChangeView]);

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

    if (mode === 'manual') {
      const parsed = parseManualWind(manualWindInput);
      setPerLegWinds([]); // Clear auto per-leg cache so manual wind takes absolute precedence
      setWindState({
        mode: 'manual',
        wind: parsed,
        source: parsed ? 'Manual' : null,
        lastUpdated: parsed ? new Date() : null,
      });
    } else {
      setWindState(prev => ({
        ...prev,
        mode: 'auto',
        source: null,
      }));
    }
  }, [manualWindInput]);

  const handleWindChange = useCallback((wind: Wind | null) => {
    const windStr = wind ? `${wind.direction}/${wind.speed}` : '';
    setManualWindInput(windStr);
    localStorage.setItem('windlog_manual_wind', windStr);
    setPerLegWinds([]); // Clear any leftover auto per-leg cache
    setWindState({
      mode: 'manual',
      wind,
      source: wind ? 'Manual' : null,
      lastUpdated: new Date(),
    });
  }, []);

  // ─── Auto winds aloft fetch (with per-altitude awareness) ───
  useEffect(() => {
    if (windState.mode !== 'auto') return;
    if (!navLog || navLog.legs.length === 0) return;

    let isMounted = true;
    setIsWindLoading(true);

    // Fetch winds for each leg based on its specific altitude & coordinates and departure schedule
    const fetchPromises = navLog.legs.map(async (leg) => {
      const midLat = (leg.from.latitude + leg.to.latitude) / 2;
      const midLon = (leg.from.longitude + leg.to.longitude) / 2;
      const cacheKey = `${midLat.toFixed(2)}_${midLon.toFixed(2)}_${leg.altitude}_${departureTime || 'live'}`;

      if (windCacheRef.current.has(cacheKey)) {
        return windCacheRef.current.get(cacheKey) || null;
      }

      try {
        const wind = await fetchWindsAloft(midLat, midLon, leg.altitude, departureTime);
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
          source: firstValidWind
            ? (departureTime ? 'Auto (Aloft forecast)' : 'Auto (Aloft per-leg)')
            : null,
          forecastTime: departureTime,
        }));
      })
      .finally(() => {
        if (isMounted) setIsWindLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [windState.mode, navLog?.legs.length, profile.cruiseAltitude, legAltitudeOverrides, departureTime]);

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
    setStorageItem('windlog_legal_version_accepted', CURRENT_LEGAL_VERSION);
    setStorageItem('windlog_legal_timestamp', new Date().toISOString());
    setShowDisclaimer(false);
    setIsLegalModalOpen(false);
  }, []);

  // ─── Loading state ───
  if (!dbReady) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✈</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Loading Aeronautical Database (AIRAC {airacReport.currentCycle.cycle})...
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {dbProgress.percent > 0 ? `Loading cached assets: ${dbProgress.percent}%` : 'Initializing IndexedDB & WebAssembly...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`cockpit-app-root ${isSideMenuOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {/* Gemini-Style Persistent Fixed Side Menu */}
      <SideMenu
        activeView={activeView}
        onChangeView={onChangeView}
        isOpen={isSideMenuOpen}
        onToggle={handleToggleSidebar}
        onOpenKneeboard={() => setIsKneeboardOpen(true)}
        onOpenLegal={() => setIsLegalModalOpen(true)}
        airacCycle={airacReport.currentCycle.cycle}
        airacStatus={airacReport.status}
        navLogSummary={navLog}
        runwayWindResult={runwayWindResult}
        savedFlightsCount={savedFlightsCount}
      />

      {/* Main Content Area (Shifts smoothly with sidebar) */}
      <main className="cockpit-main-content">
        {activeView === 'auth' && (
          <AuthPage
            onNavigate={onChangeView}
            profile={profile}
            onProfileChange={handleProfileChange}
          />
        )}

        {activeView === 'saved-flights' && (
          <SavedFlightsView
            onLoadFlight={handleLoadSavedFlight}
            onNavigate={onChangeView}
          />
        )}

        {activeView === 'navlog' && (
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
            onOpenKneeboard={() => setIsKneeboardOpen(true)}
            onTokenClick={handleTokenClick}
            onLegAltitudeChange={handleLegAltitudeChange}
            toastMessage={toastMessage}
            coordPrompt={coordPrompt}
            onCoordConfirm={handleCoordConfirm}
            onCoordCancel={handleCoordCancel}
            departureTime={departureTime}
            onDepartureTimeChange={handleDepartureTimeChange}
            onSaveFlight={handleSaveFlight}
            isFlightSaved={isFlightSaved}
          />
        )}

        {activeView === 'mass-balance' && (
          <MassBalanceView
            navLogSummary={navLog}
          />
        )}

        {activeView === 'runway-wind' && (
          <RunwayWindView
            routeWaypoints={resolvedWaypoints}
            navLogSummary={navLog}
            onResultChange={setRunwayWindResult}
          />
        )}
      </main>

      {isKneeboardOpen && (
        <KneeboardModal
          navLog={navLog}
          profile={profile}
          onClose={() => setIsKneeboardOpen(false)}
        />
      )}

      {(showDisclaimer || isLegalModalOpen) && (
        <DisclaimerModal
          onAccept={handleAcceptDisclaimer}
          onClose={isLegalModalOpen && !showDisclaimer ? () => setIsLegalModalOpen(false) : undefined}
          isReadOnly={isLegalModalOpen && !showDisclaimer}
        />
      )}

      {/* Duolingo-style Pre-Flight Clearance & Super Pro Modals */}
      <AdInterstitialModal />
      <WindLogProModal />
    </div>
  );
}

// ─── Top-Level Application Orchestrator ───

function CockpitApp() {
  const { isLoading } = useAuth();
  const [cockpitView, setCockpitView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#auth' || hash === '#login' || hash === '#signup') return 'auth';
      if (hash === '#saved-flights') return 'saved-flights';
      if (hash === '#mass-balance') return 'mass-balance';
      if (hash === '#runway-wind') return 'runway-wind';
    }
    return 'navlog';
  });

  // Handle URL hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#auth' || hash === '#login' || hash === '#signup') {
        setCockpitView('auth');
      } else if (hash === '#saved-flights') {
        setCockpitView('saved-flights');
      } else if (hash === '#mass-balance') {
        setCockpitView('mass-balance');
      } else if (hash === '#runway-wind') {
        setCockpitView('runway-wind');
      } else if (hash === '#navlog' || hash === '' || hash === '#') {
        setCockpitView('navlog');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isLoading) {
    return (
      <div className="db-loading-screen">
        <div className="db-loading-spinner" />
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem' }}>
          WindLog Flight Planning Suite
        </div>
      </div>
    );
  }

  // Load CockpitSuite directly with pinned fixed sidebar and full flight planning suite
  return (
    <CockpitSuite
      activeView={cockpitView}
      onChangeView={setCockpitView}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AdProvider>
        <CockpitApp />
      </AdProvider>
    </AuthProvider>
  );
}
