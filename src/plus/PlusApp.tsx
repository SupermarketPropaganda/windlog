import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AircraftProfile,
  Wind,
  WindMode,
  WindState,
  RouteToken,
  NavLogSummary,
  Waypoint,
  RunwayWindResult,
  SavedFlight,
  AlternatePlan,
  FuelCalculationValues,
} from '../types';
import { ScratchpadView } from '../components/ScratchpadView';
import { InFlightCockpitPage } from './InFlightCockpitPage';
import { PlusSideMenu } from './PlusSideMenu';
import { PlusActiveView } from './types-plus';
import { DisclaimerModal } from '../components/DisclaimerModal';
import { KneeboardModal } from '../components/KneeboardModal';
import { MassBalanceView } from '../components/MassBalanceView';
import { RunwayWindView } from '../components/RunwayWindView';
import { SavedFlightsView } from '../components/SavedFlightsView';
import { AuthPage } from '../components/AuthPage';
import { LandingPage } from '../components/LandingPage';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AdProvider, useAdBreak } from '../context/AdContext';
import { AdInterstitialModal } from '../components/ads/AdInterstitialModal';
import { WaypointDB, initWaypointDatabase } from '../data/waypoint-db';
import { searchOsmReportingPoint } from '../data/osm-vrp';
import { fetchWindsAloft, parseManualWind } from '../data/winds-aloft';
import { getSavedFlightsSync, saveFlightRecord } from '../data/saved-flights';
import { AVIATION_NOTICE } from '../data/legal-terms';
import { hasCurrentLegalAcceptance, recordLegalAcceptance } from '../data/legal-acceptance';
import { computeNavLog, computeAlternatePlan } from '../engine/navlog-engine';
import { greatCircleDistance } from '../engine/coordinate-math';
import { getAirportWaypoint, getAllCandidateAlternates } from '../data/airport-runways';
import { parseRouteString } from '../utils/route-parser';
import { decodeRouteFromUrl, copyShareableRouteLink } from '../utils/url-route';
import { initStorage, getStorageItemSync, setStorageItem } from '../data/storage-manager';
import { CURRENT_DATABASE_METADATA } from '../data/airac-meta';
import { checkDatabaseAiracStatus } from '../engine/airac';
import { initializeNativeShell } from '../utils/platform';

const DEFAULT_PLUS_SAMPLE_ROUTE = 'LPCS/3500 LPSO/4500 LPEV/3500';

function plusViewFromHash(hash: string): PlusActiveView {
  if (new URLSearchParams(hash.replace(/^#/, '')).has('route')) return 'navlog';
  switch (hash.toLowerCase()) {
    case '#landing':
      return 'landing';
    case '#inflight':
    case '#fly':
    case '#efb':
      return 'inflight';
    case '#saved-flights':
      return 'saved-flights';
    case '#mass-balance':
      return 'mass-balance';
    case '#runway-wind':
      return 'runway-wind';
    case '#profile':
    case '#account':
    case '#security':
      return 'auth';
    case '#navlog':
    case '#cockpit':
    default:
      return 'navlog';
  }
}

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

  const stored = getStorageItemSync<any>('gustlog_profile', null);
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
  setStorageItem('gustlog_profile', p);
}

function loadCustomWaypoints(): Record<string, Waypoint> {
  return getStorageItemSync<Record<string, Waypoint>>('gustlog_custom_wpts', {});
}

function saveCustomWaypoints(wpts: Record<string, Waypoint>) {
  setStorageItem('gustlog_custom_wpts', wpts);
}

function loadRouteInput(): string {
  const shared = decodeRouteFromUrl();
  if (shared?.route) {
    return shared.route;
  }
  const saved = getStorageItemSync<string>('gustlog_route', '');
  if (saved && saved.trim().length > 0) {
    return saved;
  }
  const autoFillHome = getStorageItemSync<boolean>('gustlog_auto_home_base', false);
  const homeBase = getStorageItemSync<string>('gustlog_home_base', '');
  if (autoFillHome && homeBase && homeBase.trim()) {
    return `${homeBase.trim().toUpperCase()} `;
  }
  return DEFAULT_PLUS_SAMPLE_ROUTE;
}

function saveRouteInput(s: string) {
  setStorageItem('gustlog_route', s);
}

function loadWindMode(): WindMode {
  return getStorageItemSync<WindMode>('gustlog_wind_mode', 'auto');
}

function loadManualWind(): string {
  return getStorageItemSync<string>('gustlog_manual_wind', '');
}

interface PlusCockpitSuiteProps {
  activeView: PlusActiveView;
  onChangeView: (view: PlusActiveView) => void;
}

function PlusCockpitSuite({ activeView, onChangeView }: PlusCockpitSuiteProps) {
  const [db, setDb] = useState<WaypointDB | null>(null);
  const [dbReady, setDbReady] = useState(false);

  const [profile, setProfile] = useState<AircraftProfile>(loadProfile);
  const [routeInput, setRouteInput] = useState(loadRouteInput);
  const [acceptedUserId, setAcceptedUserId] = useState<string | null>(null);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState<boolean>(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 980) {
      return true;
    }
    try {
      const stored = localStorage.getItem('gustlog_sidebar_open');
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
  const legalUserId = user?.id || 'guest';
  const showDisclaimer = acceptedUserId !== legalUserId && !hasCurrentLegalAcceptance(legalUserId);
  const { triggerAdBreak } = useAdBreak();
  const [departureTime, setDepartureTime] = useState<string | null>(() =>
    getStorageItemSync<string | null>('gustlog_departure_time', null)
  );
  const [savedFlightsCount, setSavedFlightsCount] = useState<number>(() =>
    getSavedFlightsSync(user?.id).length
  );

  useEffect(() => {
    setSavedFlightsCount(getSavedFlightsSync(user?.id).length);
  }, [user?.id]);

  const handleDepartureTimeChange = useCallback((time: string | null) => {
    setDepartureTime(time);
    setStorageItem('gustlog_departure_time', time);
    windCacheRef.current.clear();
  }, []);

  useEffect(() => {
    initializeNativeShell();
    initStorage().catch(console.warn);
  }, []);

  // Live Cross-Tab Sync with GustLog Lite Dashboard (storage + window focus)
  useEffect(() => {
    const syncFromLiteStorage = () => {
      const latestRoute = getStorageItemSync<string>('gustlog_route', '');
      if (latestRoute && latestRoute.trim().length > 0) {
        setRouteInput((prev) => (prev !== latestRoute ? latestRoute : prev));
      }
      const latestProfile = getStorageItemSync<any>('gustlog_profile', null);
      if (latestProfile) {
        setProfile((prev) => {
          const next: AircraftProfile = {
            aircraftModel: latestProfile.aircraftModel || prev.aircraftModel,
            cruiseAltitude: latestProfile.cruiseAltitude || prev.cruiseAltitude,
            tas: latestProfile.tas || prev.tas,
            fuelFlow:
              latestProfile.fuelFlow !== undefined
                ? latestProfile.fuelFlow
                : prev.fuelFlow,
            fuelUnit: latestProfile.fuelUnit || prev.fuelUnit,
          };
          return JSON.stringify(prev) !== JSON.stringify(next) ? next : prev;
        });
      }
      const latestCustomWpts = getStorageItemSync<Record<string, Waypoint>>(
        'gustlog_custom_wpts',
        {}
      );
      setCustomWaypoints((prev) =>
        JSON.stringify(prev) !== JSON.stringify(latestCustomWpts)
          ? latestCustomWpts
          : prev
      );
    };

    window.addEventListener('storage', syncFromLiteStorage);
    window.addEventListener('focus', syncFromLiteStorage);
    return () => {
      window.removeEventListener('storage', syncFromLiteStorage);
      window.removeEventListener('focus', syncFromLiteStorage);
    };
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSideMenuOpen((prev) => {
      const next = !prev;
      try {
        setStorageItem('gustlog_sidebar_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const [tokens, setTokens] = useState<RouteToken[]>([]);
  const [resolvedWaypoints, setResolvedWaypoints] = useState<Waypoint[]>([]);
  const [activeLegIndex, setActiveLegIndex] = useState<number | null>(null);
  const [legAltitudeOverrides, setLegAltitudeOverrides] = useState<Record<number, number>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const notifyToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

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

  useEffect(() => {
    initWaypointDatabase(
      (percent) => setDbProgress({ percent }),
      CURRENT_DATABASE_METADATA.airacCycle
    ).then((waypointDb) => {
      setDb(waypointDb);
      setDbReady(true);
    });
  }, []);

  const handleProfileChange = useCallback((p: AircraftProfile) => {
    setProfile(p);
    saveProfile(p);
  }, []);

  const handleRouteInputChange = useCallback((s: string) => {
    setRouteInput(s);
    saveRouteInput(s);
  }, []);

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
    const autoFillHome = getStorageItemSync<boolean>('gustlog_auto_home_base', false);
    const homeBase = getStorageItemSync<string>('gustlog_home_base', '');
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
      notifyToast('Flight route link copied to clipboard!');
    }
  }, [routeInput, profile, notifyToast]);

  // Tactile "Rubber-Band" Map Route Dragging: insert nearest aerodrome/fix or custom GPS waypoint into Leg
  const handleRubberBandInsertWaypoint = useCallback(
    (legIndex: number, lat: number, lon: number) => {
      const candidates = [
        ...getAllCandidateAlternates(),
        ...Object.values(customWaypoints),
      ];
      let nearestWp: Waypoint | null = null;
      let nearestDistNm = Infinity;

      for (const wp of candidates) {
        const d = greatCircleDistance(lat, lon, wp.latitude, wp.longitude);
        if (d < nearestDistNm) {
          nearestDistNm = d;
          nearestWp = wp;
        }
      }

      let insertIdent = '';
      if (nearestWp && nearestDistNm <= 3.8) {
        insertIdent = nearestWp.identifier;
      } else {
        // Create a clean custom tactical VFR fix (VP01, VP02, ...)
        let idx = 1;
        while (customWaypoints[`VP${idx.toString().padStart(2, '0')}`]) {
          idx++;
        }
        insertIdent = `VP${idx.toString().padStart(2, '0')}`;
        const newCustomWp: Waypoint = {
          id: Date.now(),
          identifier: insertIdent,
          name: `GPS ${lat.toFixed(3)}N ${Math.abs(lon).toFixed(3)}W`,
          type: 'custom',
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lon.toFixed(5)),
          elevation: 0,
          country: 'PT',
          isCustom: true,
        };
        const updatedCustom = { ...customWaypoints, [insertIdent]: newCustomWp };
        setCustomWaypoints(updatedCustom);
        saveCustomWaypoints(updatedCustom);
      }

      const parsedItems = parseRouteString(routeInput);
      const legAlt =
        parsedItems[legIndex + 1]?.altitudeOverride ??
        parsedItems[legIndex]?.altitudeOverride ??
        profile.cruiseAltitude ??
        3500;
      const insertToken = `${insertIdent}/${legAlt}`;

      if (parsedItems.length >= 2) {
        const clampedIdx = Math.max(0, Math.min(parsedItems.length - 2, legIndex));
        const nextRawTokens = parsedItems.map((p) => p.raw);
        nextRawTokens.splice(clampedIdx + 1, 0, insertToken);
        const nextRouteStr = nextRawTokens.join(' ');
        setRouteInput(nextRouteStr);
        saveRouteInput(nextRouteStr);
        notifyToast(
          `Rubber-band reroute: inserted ${insertIdent} (${legAlt} FT) into Leg ${
            clampedIdx + 1
          }`
        );
      }
    },
    [customWaypoints, routeInput, profile.cruiseAltitude, notifyToast]
  );

  const resolveWaypoint = useCallback(
    async (identifier: string, waypointDb: WaypointDB, signal?: AbortSignal): Promise<Waypoint | null> => {
      const upper = identifier.toUpperCase().trim();
      if (!upper) return null;

      if (customWaypoints[upper]) {
        return customWaypoints[upper];
      }

      const dbResult = waypointDb.findByIdentifier(upper);
      if (dbResult) return dbResult;

      try {
        const osmResult = await searchOsmReportingPoint(upper, signal);
        if (osmResult) return osmResult;
      } catch {
        // Offline or cancelled
      }

      return null;
    },
    [customWaypoints]
  );

  useEffect(() => {
    if (!dbReady || !db) return;

    const trimmed = routeInput.trim();
    if (!trimmed) {
      setTokens([]);
      setResolvedWaypoints([]);
      return;
    }

    const parsedItems = parseRouteString(trimmed);

    setTokens(
      parsedItems.map((item) => ({
        raw: item.raw,
        identifier: item.identifier,
        altitudeOverride: item.altitudeOverride,
        waypoint: null,
        status: 'resolving' as const,
      }))
    );

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

  const navLog: NavLogSummary | null = (() => {
    if (resolvedWaypoints.length < 2) return null;

    const legAlts: number[] = [];
    for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
      const tokenAlt = tokens[i + 1]?.altitudeOverride || tokens[i]?.altitudeOverride;
      const legAlt =
        legAltitudeOverrides[i] !== undefined
          ? legAltitudeOverrides[i]
          : tokenAlt || profile.cruiseAltitude;
      legAlts.push(legAlt);
    }

    const effectiveLegWinds =
      windState.mode === 'auto' && perLegWinds.length > 0 ? perLegWinds : undefined;

    return computeNavLog(resolvedWaypoints, profile, windState.wind, legAlts, effectiveLegWinds);
  })();

  const [selectedAlternate, setSelectedAlternate] = useState<Waypoint | null>(() => {
    const stored = getStorageItemSync<string>('gustlog_alternate_icao', '');
    return stored ? getAirportWaypoint(stored) : null;
  });
  const [alternateAltitude, setAlternateAltitude] = useState<number>(() => {
    return getStorageItemSync<number>('gustlog_alternate_alt', 2500);
  });

  const handleAlternateChange = useCallback((alt: Waypoint | null) => {
    setSelectedAlternate(alt);
    setStorageItem('gustlog_alternate_icao', alt?.identifier || '');
  }, []);

  const handleAlternateAltitudeChange = useCallback((alt: number) => {
    setAlternateAltitude(alt);
    setStorageItem('gustlog_alternate_alt', alt);
  }, []);

  const alternatePlan: AlternatePlan | null = useMemo(() => {
    if (!selectedAlternate || resolvedWaypoints.length < 2) return null;
    const dest = resolvedWaypoints[resolvedWaypoints.length - 1];
    const lastWind =
      navLog && navLog.legs.length > 0
        ? navLog.legs[navLog.legs.length - 1].wind || null
        : windState.wind;
    return computeAlternatePlan(
      dest,
      selectedAlternate,
      profile,
      lastWind,
      alternateAltitude,
      navLog?.totalFuel || 0
    );
  }, [selectedAlternate, resolvedWaypoints, profile, windState.wind, alternateAltitude, navLog]);

  if (navLog && alternatePlan) {
    navLog.alternatePlan = alternatePlan;
  }

  const [fuelOverrides, setFuelOverrides] = useState<Partial<FuelCalculationValues>>({});

  const fuelCalculations: FuelCalculationValues = useMemo(() => {
    const reserveMode = fuelOverrides.reserveMode ?? 'day';
    const fuelFlow = profile.fuelFlow > 0 ? profile.fuelFlow : 0;

    const defaultTaxi =
      alternatePlan?.taxiFuel ?? (fuelFlow > 0 ? Number((fuelFlow * 0.4 * 0.25).toFixed(1)) : 0.8);
    const defaultTrip = navLog ? Number(navLog.totalFuel.toFixed(1)) : 0;
    const defaultContingency =
      alternatePlan?.contingencyFuel ??
      Number(Math.max(defaultTrip * 0.05, (5 / 60) * fuelFlow).toFixed(1));
    const defaultAlternate = alternatePlan ? Number(alternatePlan.fuelBurn.toFixed(1)) : 0;
    const reserveMinutes = reserveMode === 'day' ? 30 : 45;
    const defaultFinalReserve = Number(((reserveMinutes / 60) * fuelFlow).toFixed(1));
    const defaultExtra = 0;

    const taxi = fuelOverrides.taxiFuel !== undefined ? fuelOverrides.taxiFuel : defaultTaxi;
    const trip = fuelOverrides.tripFuel !== undefined ? fuelOverrides.tripFuel : defaultTrip;
    const contingency =
      fuelOverrides.contingencyFuel !== undefined
        ? fuelOverrides.contingencyFuel
        : defaultContingency;
    const alternate =
      fuelOverrides.alternateFuel !== undefined ? fuelOverrides.alternateFuel : defaultAlternate;
    const finalReserve =
      fuelOverrides.finalReserveFuel !== undefined
        ? fuelOverrides.finalReserveFuel
        : defaultFinalReserve;
    const extra = fuelOverrides.extraFuel !== undefined ? fuelOverrides.extraFuel : defaultExtra;

    const sumComponents = Number(
      (taxi + trip + contingency + alternate + finalReserve + extra).toFixed(1)
    );
    const totalRequired =
      fuelOverrides.totalFuelRequired !== undefined
        ? fuelOverrides.totalFuelRequired
        : sumComponents;

    const defaultFob = totalRequired > 0 ? Number((totalRequired * 1.2).toFixed(1)) : 0;
    const fob = fuelOverrides.fob !== undefined ? fuelOverrides.fob : defaultFob;

    const isCustomized = Object.keys(fuelOverrides).length > 0;

    return {
      taxiFuel: taxi,
      tripFuel: trip,
      contingencyFuel: contingency,
      alternateFuel: alternate,
      finalReserveFuel: finalReserve,
      extraFuel: extra,
      totalFuelRequired: totalRequired,
      fob,
      reserveMode,
      isCustomized,
    };
  }, [fuelOverrides, profile.fuelFlow, alternatePlan, navLog]);

  const handleUpdateFuelCalculation = useCallback((updates: Partial<FuelCalculationValues>) => {
    setFuelOverrides((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleResetFuelCalculation = useCallback(() => {
    setFuelOverrides({});
  }, []);

  const handleSaveFlight = useCallback(async () => {
    if (!routeInput.trim()) {
      notifyToast('Please enter a route before saving.');
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
        notifyToast(`Flight "${saved.name}" saved!`);
      },
    });
  }, [routeInput, departureTime, profile, legAltitudeOverrides, navLog, user?.id, triggerAdBreak, notifyToast]);

  const isFlightSaved = useMemo(() => {
    if (!routeInput.trim()) return false;
    const flights = getSavedFlightsSync(user?.id);
    return flights.some((f) => f.routeInput.trim().toUpperCase() === routeInput.trim().toUpperCase());
  }, [routeInput, user?.id, savedFlightsCount]);

  const handleLoadSavedFlight = useCallback(
    (flight: SavedFlight) => {
      setRouteInput(flight.routeInput);
      saveRouteInput(flight.routeInput);
      setProfile(flight.profile);
      saveProfile(flight.profile);
      setLegAltitudeOverrides(flight.legAltitudeOverrides || {});
      setDepartureTime(flight.departureTime);
      setStorageItem('gustlog_departure_time', flight.departureTime);
      windCacheRef.current.clear();
      onChangeView('navlog');
      notifyToast(`Flight "${flight.name}" loaded into GustLog Plus!`);
    },
    [onChangeView, notifyToast]
  );

  const handleLegAltitudeChange = useCallback((legIndex: number, newAlt: number) => {
    setLegAltitudeOverrides((prev) => ({
      ...prev,
      [legIndex]: newAlt,
    }));
  }, []);

  const handleTokenClick = useCallback((token: RouteToken) => {
    if (token.status === 'not-found') {
      setCoordPrompt({ identifier: token.identifier });
    }
  }, []);

  const handleWindModeChange = useCallback(
    (mode: WindMode) => {
      localStorage.setItem('gustlog_wind_mode', mode);

      if (mode === 'manual') {
        const parsed = parseManualWind(manualWindInput);
        setPerLegWinds([]);
        setWindState({
          mode: 'manual',
          wind: parsed,
          source: parsed ? 'Manual' : null,
          lastUpdated: parsed ? new Date() : null,
        });
      } else {
        setWindState((prev) => ({
          ...prev,
          mode: 'auto',
          source: null,
        }));
      }
    },
    [manualWindInput]
  );

  const handleWindChange = useCallback((wind: Wind | null) => {
    const windStr = wind ? `${wind.direction}/${wind.speed}` : '';
    setManualWindInput(windStr);
    localStorage.setItem('gustlog_manual_wind', windStr);
    setPerLegWinds([]);
    setWindState({
      mode: 'manual',
      wind,
      source: wind ? 'Manual' : null,
      lastUpdated: new Date(),
    });
  }, []);

  useEffect(() => {
    if (windState.mode !== 'auto') return;
    if (!navLog || navLog.legs.length === 0) return;

    let isMounted = true;
    setIsWindLoading(true);

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
        const firstValidWind = winds.find((w) => w !== null) || null;
        setWindState((prev) => ({
          ...prev,
          wind: firstValidWind,
          lastUpdated: new Date(),
          source: firstValidWind
            ? departureTime
              ? 'Auto (Aloft forecast)'
              : 'Auto (Aloft per-leg)'
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

  const handleCoordConfirm = useCallback(
    (waypoint: Waypoint) => {
      const newCustom = { ...customWaypoints, [waypoint.identifier]: waypoint };
      setCustomWaypoints(newCustom);
      saveCustomWaypoints(newCustom);
      setCoordPrompt(null);
    },
    [customWaypoints]
  );

  const handleCoordCancel = useCallback(() => {
    setCoordPrompt(null);
  }, []);

  const handleAcceptDisclaimer = useCallback(() => {
    recordLegalAcceptance(legalUserId);
    setAcceptedUserId(legalUserId);
    setIsLegalModalOpen(false);
  }, [legalUserId]);

  if (showDisclaimer) {
    return (
      <DisclaimerModal
        key={legalUserId}
        onAccept={handleAcceptDisclaimer}
        onClose={() => onChangeView('landing')}
      />
    );
  }

  if (!dbReady) {
    return (
      <div
        className="app-container"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛩️</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Loading GustLog Plus In-Flight EFB (AIRAC {airacReport.currentCycle.cycle})...
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {dbProgress.percent > 0
              ? `Loading cached assets: ${dbProgress.percent}%`
              : 'Initializing Aeronautical DB & In-Flight Telemetry Engine...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`cockpit-app-root ${isSideMenuOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <PlusSideMenu
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

      <main className="cockpit-main-content">
        <div className="plus-edition-ribbon">
          <div className="plus-edition-ribbon-left">
            <span className="plus-edition-pill">🛩️ GUSTLOG PLUS</span>
            <span className="plus-edition-sub">
              Pre-Flight Planner + Dedicated In-Flight Cockpit EFB
            </span>
          </div>
          <div className="plus-edition-ribbon-right">
            {activeView !== 'inflight' ? (
              <button
                type="button"
                className="plus-launch-cockpit-top-btn"
                onClick={() => onChangeView('inflight')}
              >
                🛫 Enter In-Flight Cockpit →
              </button>
            ) : (
              <button
                type="button"
                className="plus-return-planner-top-btn"
                onClick={() => onChangeView('navlog')}
              >
                ← Return to Flight Planner
              </button>
            )}
            <a href="./index.html#navlog" className="plus-edition-switch-link">
              Switch to GustLog Lite ↗
            </a>
          </div>
        </div>

        <aside className="platform-safety-notice">
          <span>{AVIATION_NOTICE}</span>
          <button type="button" onClick={() => setIsLegalModalOpen(true)}>
            Terms &amp; privacy
          </button>
        </aside>

        {activeView === 'auth' && (
          <AuthPage
            onNavigate={onChangeView}
            profile={profile}
            onProfileChange={handleProfileChange}
          />
        )}

        {activeView === 'saved-flights' && (
          <SavedFlightsView onLoadFlight={handleLoadSavedFlight} onNavigate={onChangeView} />
        )}

        {activeView === 'navlog' && (
          <>
            {/* Prominent Call-to-Action Card in the Flight Planner to Launch the Cockpit-Ready In-Flight Page */}
            <div className="plus-planner-cockpit-cta-banner">
              <div className="plus-cta-left">
                <span className="plus-cta-icon">🛩️</span>
                <div className="plus-cta-copy">
                  <div className="plus-cta-title">
                    Ready to Fly? Launch the Cockpit-Ready In-Flight EFB
                  </div>
                  <div className="plus-cta-subtitle">
                    Switches to a distraction-free cockpit screen with Live GPS, Moving Map Ownship, Track Vector &amp; Green Banana, Direct-To (DCT), Breadcrumbs, and Look-Ahead Visual Alerts.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="plus-cta-launch-btn"
                onClick={() => onChangeView('inflight')}
              >
                <span>🛫 Launch In-Flight Cockpit</span>
                <span className="plus-cta-arrow">→</span>
              </button>
            </div>

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
              alternateAirport={selectedAlternate}
              onAlternateAirportChange={handleAlternateChange}
              alternateAltitude={alternateAltitude}
              onAlternateAltitudeChange={handleAlternateAltitudeChange}
              alternatePlan={alternatePlan}
              fuelCalculations={fuelCalculations}
              onUpdateFuelCalculation={handleUpdateFuelCalculation}
              onResetFuelCalculation={handleResetFuelCalculation}
            />
          </>
        )}

        {activeView === 'inflight' && (
          <InFlightCockpitPage
            profile={profile}
            routeInput={routeInput}
            resolvedWaypoints={resolvedWaypoints}
            navLog={navLog}
            activeLegIndex={activeLegIndex}
            onSelectLeg={(idx) => setActiveLegIndex(idx)}
            onLegAltitudeChange={handleLegAltitudeChange}
            onInsertWaypointInLeg={handleRubberBandInsertWaypoint}
            alternateAirport={selectedAlternate}
            alternatePlan={alternatePlan}
            fuelCalculations={fuelCalculations}
            onOpenKneeboard={() => setIsKneeboardOpen(true)}
            onExitToPlanner={() => onChangeView('navlog')}
            toastMessage={toastMessage}
            onNotifyToast={notifyToast}
          />
        )}

        {activeView === 'mass-balance' && <MassBalanceView navLogSummary={navLog} />}

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
          plannedAlternate={alternatePlan}
          fuelCalculations={fuelCalculations}
          onUpdateFuelCalculation={handleUpdateFuelCalculation}
        />
      )}

      {(showDisclaimer || isLegalModalOpen) && (
        <DisclaimerModal
          onAccept={handleAcceptDisclaimer}
          onClose={isLegalModalOpen && !showDisclaimer ? () => setIsLegalModalOpen(false) : undefined}
          isReadOnly={isLegalModalOpen && !showDisclaimer}
        />
      )}

      <AdInterstitialModal />
    </div>
  );
}

function PlusCockpitApp() {
  const { isLoading } = useAuth();
  const [cockpitView, setCockpitView] = useState<PlusActiveView>(() =>
    plusViewFromHash(window.location.hash)
  );
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isLoading) setIsReady(true);
  }, [isLoading]);

  useEffect(() => {
    const handleHashChange = () => setCockpitView(plusViewFromHash(window.location.hash));
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (view: PlusActiveView) => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setCockpitView(view);
    if (view === 'navlog' && decodeRouteFromUrl()) return;
    const hash = view === 'auth' ? '#profile' : '#' + view;
    window.history.pushState(null, '', window.location.pathname + window.location.search + hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  if (!isReady && isLoading) {
    return (
      <div className="pure-black-root">
        <div
          style={{
            color: '#ffffff',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '13px',
            letterSpacing: '0.1em',
          }}
        >
          Gustlog Plus.
        </div>
      </div>
    );
  }

  if (cockpitView === 'landing') {
    return <LandingPage onNavigate={navigate} />;
  }

  return <PlusCockpitSuite activeView={cockpitView} onChangeView={navigate} />;
}

export default function PlusApp() {
  return (
    <AuthProvider>
      <AdProvider>
        <PlusCockpitApp />
      </AdProvider>
    </AuthProvider>
  );
}
