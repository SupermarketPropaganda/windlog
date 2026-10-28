import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  AircraftProfile,
  WindState,
  WindMode,
  Wind,
  RouteToken,
  NavLogSummary,
  Waypoint,
  AlternatePlan,
  FuelCalculationValues,
} from '../types';
import {
  getAllCandidateAlternates,
  getAirportWaypoint,
} from '../data/airport-runways';
import {
  findNearestCandidateAlternates,
  getSemicircularOptions,
} from '../engine/navlog-engine';
import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import {
  fetchTerrainProfile,
  TerrainProfileResult,
} from '../engine/terrain-engine';
import { magneticDeclination } from '../engine/wmm2025';
import { AircraftBar } from '../components/AircraftBar';
import { WindPanel } from '../components/WindPanel';
import { NavLogRow } from '../components/NavLogRow';
import { RouteChipsBuilder, PlannerSectionTab } from '../components/RouteChipsBuilder';
import { CoordPrompt } from '../components/CoordPrompt';
import { AirspaceAlertBanner } from '../components/AirspaceAlertBanner';
import { InFlightHudBar } from './InFlightHudBar';
import { LookAheadAlertBanner } from './LookAheadAlertBanner';
import { PlusRouteMap, AirspaceFilterType } from './PlusRouteMap';
import { PlusAltitudeProfile } from './PlusAltitudeProfile';
import {
  computeInFlightNavSolution,
  exportBreadcrumbsToGpx,
  normalizeDegrees,
} from './inflight-nav';
import { FlightTelemetryController } from './telemetry-service';
import {
  BreadcrumbPoint,
  DirectToState,
  LegRuntimeRecord,
  OwnshipTelemetry,
} from './types-plus';

export interface PlusScratchpadViewProps {
  profile: AircraftProfile;
  onProfileChange: (p: AircraftProfile) => void;
  windState: WindState;
  onWindChange: (w: Wind | null) => void;
  onWindModeChange: (m: WindMode) => void;
  isWindLoading: boolean;
  routeInput: string;
  onRouteInputChange: (s: string) => void;
  tokens: RouteToken[];
  resolvedWaypoints: Waypoint[];
  navLog: NavLogSummary | null;
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  onLegAltitudeChange: (legIdx: number, newAlt: number) => void;
  onShareRoute: () => void;
  onOpenKneeboard: () => void;
  onReverseRoute: () => void;
  onClearRoute: () => void;
  onTokenClick: (token: RouteToken) => void;
  coordPrompt: { identifier: string } | null;
  onCoordConfirm: (w: Waypoint) => void;
  onCoordCancel: () => void;
  departureTime?: string | null;
  onDepartureTimeChange?: (time: string | null) => void;
  onSaveFlight?: () => void;
  isFlightSaved?: boolean;
  alternateAirport?: Waypoint | null;
  onAlternateAirportChange?: (alt: Waypoint | null) => void;
  alternateAltitude?: number;
  onAlternateAltitudeChange?: (alt: number) => void;
  alternatePlan?: AlternatePlan | null;
  fuelCalculations?: FuelCalculationValues;
  onUpdateFuelCalculation?: (updates: Partial<FuelCalculationValues>) => void;
  onResetFuelCalculation?: () => void;
  toastMessage: string | null;
  onNotifyToast?: (msg: string) => void;
}

const formatTime = (seconds: number): string => {
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
};

const BREADCRUMBS_STORAGE_KEY = 'gustlog_plus_breadcrumbs_v1';

function loadStoredBreadcrumbs(): BreadcrumbPoint[] {
  try {
    const raw = localStorage.getItem(BREADCRUMBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const PlusScratchpadView: React.FC<PlusScratchpadViewProps> = (props) => {
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'profile'>('map');
  const [plannerSection, setPlannerSection] = useState<PlannerSectionTab>('flight');

  // Shared Airspace Filtering State
  const [showAirspaces, setShowAirspaces] = useState<boolean>(true);
  const [airspaceFilter, setAirspaceFilter] =
    useState<AirspaceFilterType>('ALL');
  const [showSectorLabels, setShowSectorLabels] = useState<boolean>(true);
  const [onlyRouteAirspaces, setOnlyRouteAirspaces] = useState<boolean>(false);

  // Alternate ICAO input
  const [customAltIcao, setCustomAltIcao] = useState<string>('');
  const [localReserveMode, setLocalReserveMode] = useState<'day' | 'night'>(
    'day'
  );
  const [fuelEditDrafts, setFuelEditDrafts] = useState<Record<string, string>>(
    {}
  );

  // ─── GustLog Plus In-Flight State ───
  const [isFlightModeActive, setIsFlightModeActive] = useState<boolean>(true);
  const [lookAheadMinutes, setLookAheadMinutes] = useState<number>(5);
  const [directToState, setDirectToState] = useState<DirectToState | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbPoint[]>(
    loadStoredBreadcrumbs
  );
  const [legAtaRecords, setLegAtaRecords] = useState<
    Record<number, LegRuntimeRecord>
  >({});
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isSimPlaying, setIsSimPlaying] = useState<boolean>(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(1);
  const [isMapClickPlacementMode, setIsMapClickPlacementMode] =
    useState<boolean>(false);
  const [focusHazardRequest, setFocusHazardRequest] = useState<{
    lat: number;
    lon: number;
    airspaceId?: string;
    nonce: number;
  } | null>(null);
  const [terrainProfile, setTerrainProfile] =
    useState<TerrainProfileResult | null>(null);

  // Initial Ownship state seeded from first route waypoint (or Cascais LPCS default)
  const [ownship, setOwnship] = useState<OwnshipTelemetry>(() => {
    const dep = props.resolvedWaypoints[0];
    const nextWp = props.resolvedWaypoints[1];
    const lat = dep?.latitude ?? 38.725;
    const lon = dep?.longitude ?? -9.355;
    const alt = props.profile.cruiseAltitude || 3500;
    const trk =
      dep && nextWp
        ? Math.round(
            initialBearing(
              dep.latitude,
              dep.longitude,
              nextWp.latitude,
              nextWp.longitude
            )
          )
        : 20;
    const magVar = magneticDeclination(lat, lon, alt);
    return {
      timestamp: Date.now(),
      latitude: lat,
      longitude: lon,
      rawGpsAltitudeFt: alt,
      altimeterOffsetFt: 0,
      altitudeMslFt: alt,
      groundSpeedKt: props.profile.tas || 105,
      trueTrackDeg: trk,
      magneticTrackDeg: Math.round(normalizeDegrees(trk - magVar)),
      magneticVariationDeg: magVar,
      verticalSpeedFpm: 0,
      horizontalAccuracyM: 5,
      verticalAccuracyM: 8,
      gpsQuality: 'HIGH',
      source: 'manual-test',
      flightPhase: 'AIRBORNE',
    };
  });

  const controllerRef = useRef<FlightTelemetryController | null>(null);
  const lastSequencedTimeRef = useRef<number>(0);

  // Append breadcrumb point when aircraft moves >= 18 meters
  const appendBreadcrumbIfMoved = useCallback((state: OwnshipTelemetry) => {
    setBreadcrumbs((prev) => {
      const last = prev[prev.length - 1];
      if (last) {
        const distNm = greatCircleDistance(
          last.latitude,
          last.longitude,
          state.latitude,
          state.longitude
        );
        if (distNm * 1852 < 18) return prev;
      }
      const nextPoint: BreadcrumbPoint = {
        latitude: state.latitude,
        longitude: state.longitude,
        altitudeFt: state.altitudeMslFt ?? 0,
        groundSpeedKt: state.groundSpeedKt,
        trackDeg: state.trueTrackDeg,
        timestamp: state.timestamp,
      };
      const updated = [...prev.slice(-1999), nextPoint];
      try {
        localStorage.setItem(BREADCRUMBS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage quota errors
      }
      return updated;
    });
  }, []);

  // Initialize FlightTelemetryController
  useEffect(() => {
    const ctrl = new FlightTelemetryController(
      (nextOwnship) => {
        setOwnship(nextOwnship);
        setGpsError(null);
        appendBreadcrumbIfMoved(nextOwnship);
      },
      (errMsg) => {
        setGpsError(errMsg);
      }
    );
    controllerRef.current = ctrl;

    // Seed controller with initial state
    ctrl.setManualOwnship({
      latitude: ownship.latitude,
      longitude: ownship.longitude,
      altitudeMslFt: ownship.altitudeMslFt ?? 3500,
      groundSpeedKt: ownship.groundSpeedKt,
      trueTrackDeg: ownship.trueTrackDeg,
      verticalSpeedFpm: ownship.verticalSpeedFpm,
    });

    return () => {
      ctrl.stopAll();
      controllerRef.current = null;
    };
  }, [appendBreadcrumbIfMoved]);

  // When route loads for the first time and ownship hasn't moved yet, align ownship to departure airport
  const hasSeededRouteRef = useRef<boolean>(false);
  useEffect(() => {
    if (
      !hasSeededRouteRef.current &&
      props.resolvedWaypoints.length >= 2 &&
      controllerRef.current &&
      ownship.source === 'manual-test' &&
      !isSimPlaying
    ) {
      hasSeededRouteRef.current = true;
      const dep = props.resolvedWaypoints[0];
      const second = props.resolvedWaypoints[1];
      const leg0Alt =
        props.navLog?.legs[0]?.altitude ?? props.profile.cruiseAltitude ?? 3500;
      const leg0Gs = props.navLog?.legs[0]?.groundSpeed ?? props.profile.tas ?? 105;
      const trk = initialBearing(
        dep.latitude,
        dep.longitude,
        second.latitude,
        second.longitude
      );
      controllerRef.current.setManualOwnship({
        latitude: dep.latitude,
        longitude: dep.longitude,
        altitudeMslFt: leg0Alt,
        groundSpeedKt: Math.round(leg0Gs),
        trueTrackDeg: Math.round(trk),
        verticalSpeedFpm: 0,
      });
    }
  }, [
    props.resolvedWaypoints,
    props.navLog,
    props.profile.cruiseAltitude,
    props.profile.tas,
    ownship.source,
    isSimPlaying,
  ]);

  // Fetch DEM Terrain Profile along active route legs for Look-Ahead Terrain Scanner & 2D Profile
  useEffect(() => {
    if (!props.navLog || props.navLog.legs.length === 0) {
      setTerrainProfile(null);
      return;
    }
    let mounted = true;
    fetchTerrainProfile(props.navLog.legs)
      .then((res) => {
        if (mounted) setTerrainProfile(res);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [props.navLog?.legs]);

  const hasWaypoints = props.resolvedWaypoints.length > 0;
  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';

  const effectiveFuel: FuelCalculationValues = useMemo(() => {
    if (props.fuelCalculations) {
      return props.fuelCalculations;
    }
    const fuelFlow = props.profile.fuelFlow > 0 ? props.profile.fuelFlow : 0;
    const taxi =
      props.alternatePlan?.taxiFuel ??
      (fuelFlow > 0 ? Number((fuelFlow * 0.4 * 0.25).toFixed(1)) : 0.8);
    const trip = props.navLog ? Number(props.navLog.totalFuel.toFixed(1)) : 0;
    const contingency =
      props.alternatePlan?.contingencyFuel ??
      Number(Math.max(trip * 0.05, (5 / 60) * fuelFlow).toFixed(1));
    const alternate = props.alternatePlan
      ? Number(props.alternatePlan.fuelBurn.toFixed(1))
      : 0;
    const reserveMinutes = localReserveMode === 'day' ? 30 : 45;
    const finalReserve = Number(((reserveMinutes / 60) * fuelFlow).toFixed(1));
    const extra = 0;
    const totalRequired = Number(
      (taxi + trip + contingency + alternate + finalReserve + extra).toFixed(1)
    );
    const fob = totalRequired > 0 ? Number((totalRequired * 1.2).toFixed(1)) : 0;

    return {
      taxiFuel: taxi,
      tripFuel: trip,
      contingencyFuel: contingency,
      alternateFuel: alternate,
      finalReserveFuel: finalReserve,
      extraFuel: extra,
      totalFuelRequired: totalRequired,
      fob,
      reserveMode: localReserveMode,
      isCustomized: false,
    };
  }, [
    props.fuelCalculations,
    props.profile.fuelFlow,
    props.alternatePlan,
    props.navLog,
    localReserveMode,
  ]);

  const effectiveActiveLegIdx = useMemo(() => {
    const legsLen = props.navLog?.legs.length ?? 0;
    if (legsLen === 0) return 0;
    if (props.activeLegIndex === null || props.activeLegIndex < 0) return 0;
    return Math.min(legsLen - 1, props.activeLegIndex);
  }, [props.activeLegIndex, props.navLog?.legs.length]);

  // ─── Compute Real-Time In-Flight Navigation & Look-Ahead Alerts (<1ms) ───
  const navSolution = useMemo(() => {
    return computeInFlightNavSolution({
      ownship,
      navLog: props.navLog,
      waypoints: props.resolvedWaypoints,
      activeLegIndex: effectiveActiveLegIdx,
      directToState,
      terrainProfile,
      lookAheadMinutes,
      fuelRemainingGalOrL: effectiveFuel.fob,
      fuelFlowPerHour: props.profile.fuelFlow,
    });
  }, [
    ownship,
    props.navLog,
    props.resolvedWaypoints,
    effectiveActiveLegIdx,
    directToState,
    terrainProfile,
    lookAheadMinutes,
    effectiveFuel.fob,
    props.profile.fuelFlow,
  ]);

  // Automatic Waypoint Leg Sequencing when crossing active waypoint capture cylinder / turn bisector
  useEffect(() => {
    if (!isFlightModeActive || !navSolution.shouldSequenceNextLeg) return;
    const now = Date.now();
    if (now - lastSequencedTimeRef.current < 3500) return;
    lastSequencedTimeRef.current = now;

    const legs = props.navLog?.legs ?? [];
    if (directToState) {
      // Completed Direct-To target; if it's a route waypoint, sequence to the leg departing that waypoint
      const targetIdx = directToState.targetWaypointRouteIndex;
      const crossedIdent = directToState.targetWaypoint.identifier;
      setDirectToState(null);
      if (targetIdx !== null && targetIdx < legs.length) {
        props.onSelectLeg(targetIdx);
        // Auto-steer simulator track toward new leg if running in test sim
        if (ownship.source === 'manual-test' && controllerRef.current) {
          const nextLeg = legs[targetIdx];
          if (nextLeg) {
            controllerRef.current.setManualOwnship({
              latitude: ownship.latitude,
              longitude: ownship.longitude,
              altitudeMslFt: ownship.altitudeMslFt ?? nextLeg.altitude,
              groundSpeedKt: ownship.groundSpeedKt,
              trueTrackDeg: Math.round(nextLeg.trueTrack),
              verticalSpeedFpm: ownship.verticalSpeedFpm,
            });
          }
        }
        props.onNotifyToast?.(
          `Direct-To ${crossedIdent} reached — Sequenced to Leg ${targetIdx + 1}`
        );
      }
      return;
    }

    const nextLegIdx = effectiveActiveLegIdx + 1;
    if (nextLegIdx < legs.length) {
      const crossedWpt = legs[effectiveActiveLegIdx].to.identifier;
      setLegAtaRecords((prev) => ({
        ...prev,
        [effectiveActiveLegIdx]: {
          legIndex: effectiveActiveLegIdx,
          toIdentifier: crossedWpt,
          ataTimestamp: now,
          altitudeAtCrossingFt: ownship.altitudeMslFt,
          groundSpeedAtCrossingKt: ownship.groundSpeedKt,
        },
      }));
      props.onSelectLeg(nextLegIdx);

      // If in Cockpit Simulator mode, automatically turn onto the new leg's course!
      if (ownship.source === 'manual-test' && controllerRef.current) {
        const nextLeg = legs[nextLegIdx];
        if (nextLeg) {
          controllerRef.current.setManualOwnship({
            latitude: ownship.latitude,
            longitude: ownship.longitude,
            altitudeMslFt: ownship.altitudeMslFt ?? nextLeg.altitude,
            groundSpeedKt: ownship.groundSpeedKt,
            trueTrackDeg: Math.round(nextLeg.trueTrack),
            verticalSpeedFpm: ownship.verticalSpeedFpm,
          });
        }
      }

      props.onNotifyToast?.(
        `Waypoint ${crossedWpt} crossed (ATA logged) — Sequenced to Leg ${nextLegIdx + 1}`
      );
    }
  }, [
    isFlightModeActive,
    navSolution.shouldSequenceNextLeg,
    directToState,
    effectiveActiveLegIdx,
    props.navLog?.legs,
    props.onSelectLeg,
    props.onNotifyToast,
    ownship,
  ]);

  // Handlers for InFlightHudBar & PlusRouteMap
  const handleStartLiveGps = useCallback(() => {
    setIsSimPlaying(false);
    setIsMapClickPlacementMode(false);
    controllerRef.current?.startLiveGps();
  }, []);

  const handleAdjustManualOwnship = useCallback(
    (
      updates: Partial<{
        latitude: number;
        longitude: number;
        altitudeMslFt: number;
        groundSpeedKt: number;
        trueTrackDeg: number;
        verticalSpeedFpm: number;
      }>
    ) => {
      if (!controllerRef.current) return;
      controllerRef.current.setManualOwnship({
        latitude: updates.latitude ?? ownship.latitude,
        longitude: updates.longitude ?? ownship.longitude,
        altitudeMslFt: updates.altitudeMslFt ?? ownship.altitudeMslFt ?? 3500,
        groundSpeedKt: updates.groundSpeedKt ?? ownship.groundSpeedKt,
        trueTrackDeg: updates.trueTrackDeg ?? ownship.trueTrackDeg,
        verticalSpeedFpm: updates.verticalSpeedFpm ?? ownship.verticalSpeedFpm,
      });
    },
    [ownship]
  );

  const handleToggleSimPlay = useCallback(
    (requestedSpeed?: number) => {
      if (!controllerRef.current) return;
      const spd = requestedSpeed ?? simSpeedMultiplier;
      if (requestedSpeed !== undefined && requestedSpeed !== simSpeedMultiplier) {
        setSimSpeedMultiplier(requestedSpeed);
        if (isSimPlaying) {
          controllerRef.current.startContinuousTestFlight(requestedSpeed);
          return;
        }
      }
      const nextPlaying = !isSimPlaying;
      setIsSimPlaying(nextPlaying);
      if (nextPlaying) {
        controllerRef.current.startContinuousTestFlight(spd);
      } else {
        controllerRef.current.stopSimTimer();
      }
    },
    [isSimPlaying, simSpeedMultiplier]
  );

  const handleMapPlaceOwnship = useCallback(
    (lat: number, lon: number) => {
      if (!controllerRef.current) return;
      // Compute bearing toward active next waypoint so track vector points usefully
      const targetWp =
        directToState?.targetWaypoint ??
        props.navLog?.legs[effectiveActiveLegIdx]?.to ??
        props.resolvedWaypoints[props.resolvedWaypoints.length - 1];
      const nextTrack = targetWp
        ? Math.round(initialBearing(lat, lon, targetWp.latitude, targetWp.longitude))
        : ownship.trueTrackDeg;

      const updated = controllerRef.current.setManualOwnship({
        latitude: lat,
        longitude: lon,
        altitudeMslFt: ownship.altitudeMslFt ?? props.profile.cruiseAltitude ?? 3500,
        groundSpeedKt: Math.max(85, ownship.groundSpeedKt),
        trueTrackDeg: nextTrack,
        verticalSpeedFpm: ownship.verticalSpeedFpm,
      });
      appendBreadcrumbIfMoved(updated);
      setIsMapClickPlacementMode(false);
    },
    [
      directToState,
      props.navLog?.legs,
      effectiveActiveLegIdx,
      props.resolvedWaypoints,
      ownship.trueTrackDeg,
      ownship.altitudeMslFt,
      ownship.groundSpeedKt,
      ownship.verticalSpeedFpm,
      props.profile.cruiseAltitude,
      appendBreadcrumbIfMoved,
    ]
  );

  const handleActivateDirectTo = useCallback(
    (target: Waypoint, routeIndex: number | null) => {
      setIsFlightModeActive(true);
      setDirectToState({
        targetWaypoint: target,
        originLat: ownship.latitude,
        originLon: ownship.longitude,
        originAltFt: ownship.altitudeMslFt ?? props.profile.cruiseAltitude ?? 3500,
        activatedAt: Date.now(),
        targetWaypointRouteIndex: routeIndex,
      });

      // If in manual/sim mode, automatically turn aircraft heading toward the Direct-To fix
      if (ownship.source === 'manual-test' && controllerRef.current) {
        const dctBrg = initialBearing(
          ownship.latitude,
          ownship.longitude,
          target.latitude,
          target.longitude
        );
        controllerRef.current.setManualOwnship({
          latitude: ownship.latitude,
          longitude: ownship.longitude,
          altitudeMslFt: ownship.altitudeMslFt ?? 3500,
          groundSpeedKt: ownship.groundSpeedKt,
          trueTrackDeg: Math.round(dctBrg),
          verticalSpeedFpm: ownship.verticalSpeedFpm,
        });
      }

      props.onNotifyToast?.(`⚡ Direct-To (DCT) ${target.identifier} activated!`);
    },
    [ownship, props.profile.cruiseAltitude, props.onNotifyToast]
  );

  const handleCancelDirectTo = useCallback(() => {
    setDirectToState(null);
    props.onNotifyToast?.('Direct-To cancelled — Resumed planned route leg.');
  }, [props.onNotifyToast]);

  const handleClearBreadcrumbs = useCallback(() => {
    setBreadcrumbs([]);
    try {
      localStorage.removeItem(BREADCRUMBS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const handleExportGpx = useCallback(() => {
    if (breadcrumbs.length === 0) return;
    const gpxXml = exportBreadcrumbsToGpx(
      breadcrumbs,
      props.routeInput.trim() || 'GustLog Plus Track'
    );
    const blob = new Blob([gpxXml], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gustlog-plus-track-${new Date().toISOString().slice(0, 10)}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [breadcrumbs, props.routeInput]);

  const handleSetAltimeterOffset = useCallback((offsetFt: number) => {
    controllerRef.current?.setAltimeterOffsetFt(offsetFt);
  }, []);

  const handleFocusHazardCoordinate = useCallback(
    (lat: number, lon: number, airspaceId?: string) => {
      setRightPanelTab('map');
      setFocusHazardRequest({
        lat,
        lon,
        airspaceId,
        nonce: Date.now(),
      });
    },
    []
  );

  const fuelMargin = Number(
    (effectiveFuel.fob - effectiveFuel.totalFuelRequired).toFixed(1)
  );
  const fuelEnduranceSec =
    props.profile.fuelFlow > 0 && effectiveFuel.fob > 0
      ? (effectiveFuel.fob / props.profile.fuelFlow) * 3600
      : 0;

  const getFuelDisplayVal = (
    key: keyof FuelCalculationValues,
    currentVal: number
  ): string => {
    if (fuelEditDrafts[key] !== undefined) {
      return fuelEditDrafts[key];
    }
    return currentVal.toFixed(1);
  };

  const handleFuelEditChange = (
    key: keyof FuelCalculationValues,
    rawStr: string
  ) => {
    setFuelEditDrafts((prev) => ({ ...prev, [key]: rawStr }));
    const parsed = parseFloat(rawStr);
    if (!isNaN(parsed) && parsed >= 0) {
      props.onUpdateFuelCalculation?.({ [key]: parsed });
    }
  };

  const handleFuelEditBlur = (key: keyof FuelCalculationValues) => {
    setFuelEditDrafts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleReserveModeToggle = (mode: 'day' | 'night') => {
    setLocalReserveMode(mode);
    props.onUpdateFuelCalculation?.({ reserveMode: mode });
  };

  const handleResetFuel = () => {
    setFuelEditDrafts({});
    props.onResetFuelCalculation?.();
  };

  const destination = useMemo(() => {
    if (props.resolvedWaypoints.length > 1) {
      return props.resolvedWaypoints[props.resolvedWaypoints.length - 1];
    }
    return null;
  }, [props.resolvedWaypoints]);

  const candidateAirports = useMemo(() => getAllCandidateAlternates(), []);

  const nearestAlternates = useMemo(() => {
    if (!destination) return [];
    return findNearestCandidateAlternates(destination, candidateAirports, 6);
  }, [destination, candidateAirports]);

  const semicircularHint = useMemo(() => {
    if (!props.alternatePlan) return null;
    return getSemicircularOptions(
      props.alternatePlan.magneticTrack,
      props.alternateAltitude ?? 3500
    );
  }, [props.alternatePlan, props.alternateAltitude]);

  const handleApplyCustomAlt = () => {
    const code = customAltIcao.trim().toUpperCase();
    if (!code) return;
    const wp = getAirportWaypoint(code);
    if (wp && props.onAlternateAirportChange) {
      props.onAlternateAirportChange(wp);
      setCustomAltIcao('');
    }
  };

  return (
    <div className="app-container plus-cockpit-container">
      {props.toastMessage && (
        <div className="toast-notification">✓ {props.toastMessage}</div>
      )}

      {/* Top Header: Aircraft Settings & Live Wind */}
      <div className="app-header">
        <AircraftBar profile={props.profile} onChange={props.onProfileChange} />
        <WindPanel
          windState={props.windState}
          onWindChange={props.onWindChange}
          onModeChange={props.onWindModeChange}
          isLoading={props.isWindLoading}
          departureTime={props.departureTime}
          onDepartureTimeChange={props.onDepartureTimeChange}
          navLog={props.navLog}
          profile={props.profile}
        />
      </div>

      {/* Flight Route Scratchpad Input */}
      <div className="route-section">
        <RouteChipsBuilder
          routeInput={props.routeInput}
          tokens={props.tokens}
          resolvedWaypoints={props.resolvedWaypoints}
          onRouteInputChange={props.onRouteInputChange}
          onSaveFlight={props.onSaveFlight}
          isFlightSaved={props.isFlightSaved}
          onShareRoute={props.onShareRoute}
          onOpenKneeboard={props.onOpenKneeboard}
          onReverseRoute={props.onReverseRoute}
          onClearRoute={props.onClearRoute}
          onTokenClick={props.onTokenClick}
          activeSection={plannerSection}
          onSectionChange={setPlannerSection}
          legsCount={props.navLog?.legs.length ?? 0}
          alternateIdentifier={props.alternateAirport?.identifier ?? null}
          totalRequiredFuelLabel={
            props.profile.fuelFlow > 0 && effectiveFuel.totalFuelRequired > 0
              ? `${effectiveFuel.totalFuelRequired.toFixed(1)} ${fuelUnitLabel}`
              : null
          }
        />
      </div>

      {/* ─── GUSTLOG PLUS IN-FLIGHT EFB TELEMETRY HUD & CONTROLS ─── */}
      <InFlightHudBar
        isFlightModeActive={isFlightModeActive}
        onToggleFlightMode={setIsFlightModeActive}
        ownship={ownship}
        navSolution={navSolution}
        waypoints={props.resolvedWaypoints}
        alternateAirport={props.alternateAirport}
        activeLegIndex={effectiveActiveLegIdx}
        totalLegsCount={props.navLog?.legs.length ?? 0}
        onSelectLeg={props.onSelectLeg}
        directToState={directToState}
        onActivateDirectTo={handleActivateDirectTo}
        onCancelDirectTo={handleCancelDirectTo}
        lookAheadMinutes={lookAheadMinutes}
        onChangeLookAheadMinutes={setLookAheadMinutes}
        breadcrumbs={breadcrumbs}
        onClearBreadcrumbs={handleClearBreadcrumbs}
        onExportGpx={handleExportGpx}
        onStartLiveGps={handleStartLiveGps}
        onAdjustManualOwnship={handleAdjustManualOwnship}
        isSimPlaying={isSimPlaying}
        simSpeedMultiplier={simSpeedMultiplier}
        onToggleSimPlay={handleToggleSimPlay}
        isMapClickPlacementMode={isMapClickPlacementMode}
        onToggleMapClickPlacementMode={() =>
          setIsMapClickPlacementMode((prev) => !prev)
        }
        onSetAltimeterOffset={handleSetAltimeterOffset}
        gpsError={gpsError}
        fuelUnitLabel={fuelUnitLabel}
      />

      {/* ─── VISUAL-ONLY LOOK-AHEAD AIRSPACE & TERRAIN ALERTS ─── */}
      {isFlightModeActive && (
        <LookAheadAlertBanner
          alerts={navSolution.lookAheadAlerts}
          lookAheadMinutes={lookAheadMinutes}
          onFocusCoordinate={handleFocusHazardCoordinate}
        />
      )}

      {/* Main Responsive Dashboard Grid */}
      <div
        className={`flight-dashboard-grid ${
          hasWaypoints ? 'with-sidebar' : 'single-col'
        }`}
      >
        {/* Left Column: Selected Planner Section (Flight, Alternates, or Fuel) */}
        <div className="dashboard-left-col">
          {plannerSection === 'flight' && (
            <>
              {/* In-Flight Next-Points Progression Card */}
              {isFlightModeActive && navSolution.nextPoints.length > 0 && (
            <div className="plus-next-points-card">
              <div className="plus-next-card-header">
                <div className="plus-next-title-wrap">
                  <span className="plus-next-icon">🧭</span>
                  <strong>IN-FLIGHT WAYPOINT PROGRESSION</strong>
                </div>
                <span className="plus-next-sub">
                  Live from Ownship ({ownship.latitude.toFixed(3)}°N,{' '}
                  {Math.abs(ownship.longitude).toFixed(3)}°W)
                </span>
              </div>

              <div className="plus-next-points-table-wrap">
                <table className="plus-next-table">
                  <thead>
                    <tr>
                      <th>FIX</th>
                      <th>ROLE</th>
                      <th>BRG (°M)</th>
                      <th>DIST</th>
                      <th>ETE</th>
                      <th>PLAN ALT</th>
                      <th>REQ VS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {navSolution.nextPoints.map((np) => (
                      <tr
                        key={`${np.waypoint.identifier}-${np.waypointIndex}`}
                        className={
                          np.role === 'ACTIVE_NEXT' ? 'row-active-next' : ''
                        }
                      >
                        <td className="col-ident">
                          <strong>{np.waypoint.identifier}</strong>
                        </td>
                        <td>
                          <span
                            className={`np-role-pill ${
                              np.isDirectToTarget
                                ? 'is-dct'
                                : np.role === 'ACTIVE_NEXT'
                                ? 'is-active'
                                : 'is-upcoming'
                            }`}
                          >
                            {np.isDirectToTarget
                              ? '⚡ DCT'
                              : np.role === 'ACTIVE_NEXT'
                              ? 'ACTIVE'
                              : 'NEXT'}
                          </span>
                        </td>
                        <td className="col-mono">
                          {Math.round(np.bearingMagDeg)
                            .toString()
                            .padStart(3, '0')}
                          °M
                        </td>
                        <td className="col-mono">
                          {np.distanceFromOwnshipNm.toFixed(1)} NM
                        </td>
                        <td className="col-mono">{formatTime(np.eteSeconds)}</td>
                        <td className="col-mono">
                          {np.plannedAltitudeFt.toLocaleString()} FT
                        </td>
                        <td className="col-mono">
                          {np.requiredVsFpm !== null
                            ? `${
                                np.requiredVsFpm > 0
                                  ? `+${np.requiredVsFpm}`
                                  : np.requiredVsFpm
                              } fpm`
                            : 'LEVEL'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="plus-table-dct-btn"
                            onClick={() =>
                              handleActivateDirectTo(
                                np.waypoint,
                                np.waypointIndex
                              )
                            }
                          >
                            ⚡ DCT
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="navlog-list">
            {props.navLog?.climbDescent && props.navLog.legs.length > 0 && (
              <div className="navlog-phase-card phase-climb">
                <div className="phase-card-header">
                  <div className="phase-card-title-group">
                    <span className="phase-card-icon">▲</span>
                    <span className="phase-card-title">
                      CLIMB TO TOP OF CLIMB (TOC)
                    </span>
                  </div>
                  <span className="phase-card-tag">DEP ➔ TOC</span>
                </div>
                <div className="phase-metrics-row">
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Profile</span>
                    <span className="phase-metric-val val-cyan">
                      {(props.resolvedWaypoints[0]?.elevation ?? 0).toLocaleString()}{' '}
                      FT ➔{' '}
                      {props.navLog.climbDescent.tocAltitudeFt.toLocaleString()}{' '}
                      FT
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb Dist</span>
                    <span className="phase-metric-val">
                      {props.navLog.climbDescent.climbDistanceNm.toFixed(1)} NM
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb ETE</span>
                    <span className="phase-metric-val">
                      {formatTime(props.navLog.climbDescent.climbTimeSeconds)}
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb Rate</span>
                    <span className="phase-metric-val val-gold">
                      +{props.profile.climbRateFpm || 700} FPM
                    </span>
                  </div>
                  {props.profile.fuelFlow > 0 && (
                    <div className="phase-metric-box">
                      <span className="phase-metric-label">Fuel Burn</span>
                      <span className="phase-metric-val val-fuel">
                        {props.navLog.climbDescent.climbFuelBurn.toFixed(1)}{' '}
                        {fuelUnitLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {props.navLog?.legs.map((leg, idx) => {
              const stepTransition =
                props.navLog?.climbDescent?.stepTransitions?.find(
                  (st) => st.fromLegIndex === idx
                );
              const ataRecord = legAtaRecords[idx];

              return (
                <React.Fragment key={leg.id}>
                  <NavLogRow
                    leg={leg}
                    legIndex={idx}
                    fuelUnit={props.profile.fuelUnit}
                    isActive={effectiveActiveLegIdx === idx}
                    onSelect={() => props.onSelectLeg(idx)}
                    onAltitudeChange={(newAlt) =>
                      props.onLegAltitudeChange(idx, newAlt)
                    }
                  />
                  {ataRecord && (
                    <div className="plus-leg-ata-stamp">
                      <span>
                        ✓ Crossed <strong>{ataRecord.toIdentifier}</strong> at{' '}
                        {new Date(ataRecord.ataTimestamp)
                          .toISOString()
                          .slice(11, 19)}
                        Z
                      </span>
                      <span>
                        ({ataRecord.altitudeAtCrossingFt?.toLocaleString() ?? '---'}{' '}
                        FT • {ataRecord.groundSpeedAtCrossingKt} KT)
                      </span>
                    </div>
                  )}

                  {stepTransition && (
                    <div
                      className={`navlog-step-transition-banner ${
                        stepTransition.type === 'step-climb'
                          ? 'step-climb-banner'
                          : 'step-down-banner'
                      }`}
                    >
                      <div className="step-banner-left">
                        <span className="step-banner-icon">
                          {stepTransition.type === 'step-climb' ? '▲' : '▼'}
                        </span>
                        <span className="step-banner-title">
                          {stepTransition.type === 'step-climb'
                            ? 'STEP-CLIMB'
                            : 'STEP-DOWN'}{' '}
                          (
                          {stepTransition.type === 'step-climb' ? '+' : '-'}
                          {stepTransition.altitudeDeltaFt.toLocaleString()} FT)
                        </span>
                      </div>
                      <div className="step-banner-details">
                        <span className="step-banner-item">
                          <span>Alt:</span>{' '}
                          <strong>
                            {stepTransition.fromAltitudeFt.toLocaleString()} FT ➔{' '}
                            {stepTransition.toAltitudeFt.toLocaleString()} FT
                          </strong>
                        </span>
                        <span className="step-banner-item">
                          <span>ETE:</span>{' '}
                          <strong>
                            {formatTime(stepTransition.timeSeconds)}
                          </strong>
                        </span>
                        <span className="step-banner-item">
                          <span>Dist:</span>{' '}
                          <strong>
                            {stepTransition.distanceNm.toFixed(1)} NM
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {props.navLog?.climbDescent && props.navLog.legs.length > 0 && (
              <div className="navlog-phase-card phase-descent">
                <div className="phase-card-header">
                  <div className="phase-card-title-group">
                    <span className="phase-card-icon">▼</span>
                    <span className="phase-card-title">
                      DESCENT FROM TOP OF DESCENT (TOD)
                    </span>
                  </div>
                  <span className="phase-card-tag">TOD ➔ DEST</span>
                </div>
                <div className="phase-metrics-row">
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Profile</span>
                    <span className="phase-metric-val val-gold">
                      {props.navLog.climbDescent.todAltitudeFt.toLocaleString()}{' '}
                      FT ➔{' '}
                      {((destination?.elevation ?? 0) + 1000).toLocaleString()} FT
                      Pattern
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent Dist</span>
                    <span className="phase-metric-val">
                      {props.navLog.climbDescent.descentDistanceNm.toFixed(1)} NM
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent ETE</span>
                    <span className="phase-metric-val">
                      {formatTime(props.navLog.climbDescent.descentTimeSeconds)}
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent Rate</span>
                    <span className="phase-metric-val val-cyan">
                      -{props.profile.descentRateFpm || 500} FPM
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

              {/* Flight & Fuel Summary */}
              {props.navLog && props.navLog.legs.length > 0 && (
                <div className="navlog-summary-container">
                  <div className="navlog-summary">
                    <div className="summary-item">
                      <div className="summary-label">Total Distance</div>
                      <div className="summary-val">
                        {props.navLog.totalDistance.toFixed(1)} nm
                      </div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Total ETE</div>
                      <div className="summary-val">
                        {formatTime(props.navLog.totalEte)}
                      </div>
                    </div>
                    <div className="summary-item">
                      <div className="summary-label">Total Legs</div>
                      <div className="summary-val">{props.navLog.legs.length}</div>
                    </div>
                    {props.profile.fuelFlow > 0 && (
                      <div className="summary-item">
                        <div className="summary-label">Trip Fuel</div>
                        <div className="summary-val val-fuel">
                          {props.navLog.totalFuel.toFixed(1)} {fuelUnitLabel}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Fuel Policy Breakdown Card */}
          {plannerSection === 'fuel' && (
            <div className="icao-easa-fuel-policy-card">
                <div className="fuel-policy-top-bar">
                  <div className="fuel-policy-title-group">
                    <span className="fuel-policy-icon">⛽</span>
                    <div>
                      <h4 className="fuel-policy-heading">Fuel Calculations</h4>
                      <p className="fuel-policy-subheading">
                        Annex 6 / Part-NCO compliant dispatch calculations &amp;
                        ramp reserves
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div className="fuel-reserve-switch-group">
                      <button
                        type="button"
                        className={`fuel-reserve-btn ${
                          effectiveFuel.reserveMode === 'day' ? 'active' : ''
                        }`}
                        onClick={() => handleReserveModeToggle('day')}
                      >
                        VFR Day (30m)
                      </button>
                      <button
                        type="button"
                        className={`fuel-reserve-btn ${
                          effectiveFuel.reserveMode === 'night' ? 'active' : ''
                        }`}
                        onClick={() => handleReserveModeToggle('night')}
                      >
                        VFR Night (45m)
                      </button>
                    </div>
                    {effectiveFuel.isCustomized && (
                      <button
                        type="button"
                        className="fuel-reset-btn"
                        onClick={handleResetFuel}
                      >
                        ↺ Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="fuel-policy-fob-section">
                  <div className="fuel-fob-input-box">
                    <label htmlFor="fuel-fob-input" className="fuel-fob-label">
                      Fuel on Board (FOB)
                    </label>
                    <div className="fuel-fob-field">
                      <input
                        id="fuel-fob-input"
                        type="number"
                        step="0.5"
                        min="0"
                        className="fuel-fob-input"
                        value={getFuelDisplayVal('fob', effectiveFuel.fob)}
                        onChange={(e) =>
                          handleFuelEditChange('fob', e.target.value)
                        }
                        onBlur={() => handleFuelEditBlur('fob')}
                      />
                      <span>{fuelUnitLabel}</span>
                    </div>
                  </div>

                  <div className="fuel-margin-box">
                    <span className="fuel-fob-label">Fuel Margin / Extra</span>
                    <div
                      className={`fuel-margin-pill ${
                        fuelMargin >= 0 ? 'margin-positive' : 'margin-negative'
                      }`}
                    >
                      <span>{fuelMargin >= 0 ? '✓' : '⚠️'}</span>
                      <span>
                        {fuelMargin >= 0 ? '+' : ''}
                        {fuelMargin.toFixed(1)} {fuelUnitLabel}
                      </span>
                    </div>
                  </div>

                  <div className="fuel-endurance-badge">
                    <span className="fuel-fob-label">Total Endurance</span>
                    <span className="fuel-endurance-val">
                      {formatTime(fuelEnduranceSec)}
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* Alternate Aerodrome Planning Hub */}
          {plannerSection === 'alternates' && (
            <div className="alternate-planning-hub">
              <div className="alt-hub-header">
                <div className="alt-hub-title-group">
                  <span className="alt-hub-icon">🛬</span>
                  <div>
                    <h3 className="alt-hub-title">
                      ALTERNATE &amp; DIVERSION PLANNING
                    </h3>
                    <p className="alt-hub-subtitle">
                      SOP Form 002 ICAO diversion calculations &amp; Direct-To
                      diversion ready
                    </p>
                  </div>
                </div>
              </div>

              {destination && nearestAlternates.length > 0 && (
                <div className="alt-candidates-bar">
                  <span className="alt-candidates-label">Nearby Aerodromes:</span>
                  <div className="alt-pills-list">
                    {nearestAlternates.map((cand) => {
                      const isSelected =
                        props.alternateAirport?.identifier === cand.identifier;
                      const distNm = Math.round(
                        greatCircleDistance(
                          destination.latitude,
                          destination.longitude,
                          cand.latitude,
                          cand.longitude
                        )
                      );
                      return (
                        <button
                          key={cand.identifier}
                          type="button"
                          className={`alt-pill-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => props.onAlternateAirportChange?.(cand)}
                        >
                          <span className="alt-pill-icao">{cand.identifier}</span>
                          <span className="alt-pill-dist">{distNm} NM</span>
                          {isSelected && <span className="alt-pill-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="alt-controls-grid">
                <div className="alt-input-col">
                  <label className="alt-input-label" htmlFor="custom-alt-input">
                    CUSTOM ALTERNATE (ICAO)
                  </label>
                  <div className="alt-input-group">
                    <input
                      id="custom-alt-input"
                      type="text"
                      className="alt-icao-input"
                      placeholder="e.g. LPCS, LPBJ, LPFR..."
                      maxLength={4}
                      value={customAltIcao}
                      onChange={(e) =>
                        setCustomAltIcao(e.target.value.toUpperCase())
                      }
                    />
                    <button
                      type="button"
                      className="alt-apply-btn"
                      onClick={handleApplyCustomAlt}
                      disabled={!customAltIcao.trim()}
                    >
                      Set Alternate
                    </button>
                  </div>
                </div>

                <div className="alt-input-col">
                  <label className="alt-input-label" htmlFor="alt-alt-input">
                    DIVERT ALTITUDE (FT MSL)
                    {semicircularHint && (
                      <span className="alt-semicircular-tag">
                        {semicircularHint.isEastbound ? 'ODD+500' : 'EVEN+500'}
                      </span>
                    )}
                  </label>
                  <div className="alt-altitude-control">
                    <input
                      id="alt-alt-input"
                      type="number"
                      step={500}
                      min={1000}
                      max={19500}
                      className="alt-altitude-input"
                      value={props.alternateAltitude ?? 3500}
                      onChange={(e) =>
                        props.onAlternateAltitudeChange?.(
                          Math.max(500, Number(e.target.value))
                        )
                      }
                    />
                    <span className="alt-altitude-unit">FT</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Tactical Flight Panel with Moving Map & Live Vertical Profile */}
        <div className="dashboard-right-col">
          {props.navLog && props.navLog.legs.length > 0 && (
            <AirspaceAlertBanner navLog={props.navLog} />
          )}

          <div className="tactical-panel-card">
            <div className="tactical-tab-bar">
              <button
                type="button"
                className={`tactical-tab-btn ${
                  rightPanelTab === 'map' ? 'active' : ''
                }`}
                onClick={() => setRightPanelTab('map')}
              >
                <span className="tactical-tab-icon">🗺️</span>
                <span>
                  {isFlightModeActive
                    ? 'Tactical Moving Map (EFB)'
                    : 'Tactical Map'}
                </span>
              </button>
              {props.navLog && props.navLog.legs.length > 0 && (
                <button
                  type="button"
                  className={`tactical-tab-btn ${
                    rightPanelTab === 'profile' ? 'active' : ''
                  }`}
                  onClick={() => setRightPanelTab('profile')}
                >
                  <span className="tactical-tab-icon">📈</span>
                  <span>Live Vertical Profile</span>
                  <span className="tactical-tab-badge">
                    ({props.navLog.totalDistance.toFixed(0)} NM)
                  </span>
                </button>
              )}
            </div>

            <div className="tactical-tab-content">
              <div style={{ display: rightPanelTab === 'map' ? 'block' : 'none' }}>
                <PlusRouteMap
                  isVisible={rightPanelTab === 'map'}
                  navLog={props.navLog}
                  waypoints={props.resolvedWaypoints}
                  activeLegIndex={effectiveActiveLegIdx}
                  onSelectLeg={props.onSelectLeg}
                  isFullscreen={isMapFullscreen}
                  onToggleFullscreen={setIsMapFullscreen}
                  showAirspaces={showAirspaces}
                  onToggleShowAirspaces={setShowAirspaces}
                  airspaceFilter={airspaceFilter}
                  onAirspaceFilterChange={setAirspaceFilter}
                  showSectorLabels={showSectorLabels}
                  onToggleSectorLabels={setShowSectorLabels}
                  onlyRouteAirspaces={onlyRouteAirspaces}
                  onToggleOnlyRouteAirspaces={setOnlyRouteAirspaces}
                  alternateAirport={props.alternateAirport}
                  isFlightModeActive={isFlightModeActive}
                  ownship={ownship}
                  navSolution={navSolution}
                  breadcrumbs={breadcrumbs}
                  directToState={directToState}
                  onActivateDirectTo={handleActivateDirectTo}
                  isMapClickPlacementMode={isMapClickPlacementMode}
                  onMapPlaceOwnship={handleMapPlaceOwnship}
                  focusHazardRequest={focusHazardRequest}
                />
              </div>

              {rightPanelTab === 'profile' &&
                props.navLog &&
                props.navLog.legs.length > 0 && (
                  <div className="tactical-profile-tab-pane">
                    <PlusAltitudeProfile
                      navLog={props.navLog}
                      activeLegIndex={effectiveActiveLegIdx}
                      onSelectLeg={props.onSelectLeg}
                      showAirspaces={showAirspaces}
                      onToggleShowAirspaces={setShowAirspaces}
                      airspaceFilter={airspaceFilter}
                      onlyRouteAirspaces={onlyRouteAirspaces}
                      isFlightModeActive={isFlightModeActive}
                      ownship={ownship}
                      navSolution={navSolution}
                      terrainResultOverride={terrainProfile}
                    />
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>

      {props.coordPrompt && (
        <CoordPrompt
          identifier={props.coordPrompt.identifier}
          onConfirm={props.onCoordConfirm}
          onCancel={props.onCoordCancel}
        />
      )}
    </div>
  );
};
