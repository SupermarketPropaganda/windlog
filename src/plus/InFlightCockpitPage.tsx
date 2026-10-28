import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  AircraftProfile,
  NavLogSummary,
  Waypoint,
  AlternatePlan,
  FuelCalculationValues,
} from '../types';
import { getAirportWaypoint } from '../data/airport-runways';
import { greatCircleDistance, initialBearing } from '../engine/coordinate-math';
import {
  fetchTerrainProfile,
  TerrainProfileResult,
} from '../engine/terrain-engine';
import { magneticDeclination } from '../engine/wmm2025';
import { PlusRouteMap, AirspaceFilterType } from './PlusRouteMap';
import { VirtualRadarStrip } from './VirtualRadarStrip';
import { CockpitLegsDock, LegsHudMode } from './cockpit/CockpitLegsDock';
import { CockpitCommsRadar } from './cockpit/CockpitCommsRadar';
import { AtcCommsWindow } from './cockpit/AtcCommsWindow';
import { LogbookModal } from './cockpit/LogbookModal';
import { PreflightPackModal } from './cockpit/PreflightPackModal';
import { LiveRunwayAdvisoryCard } from './cockpit/LiveRunwayAdvisoryCard';
import { computeAirportRunwayAdvisory, AirportRunwayAdvisory, ScoredRunwayWind } from './engine/runway-wind';
import { computeTrafficCircuitPattern, TrafficCircuitGeometry } from './engine/circuit-pattern';
import { TrafficService, TrafficTarget } from './traffic-service';
import { useWakeLock } from './use-wake-lock';
import { FuelMonitor, FuelMonitorState } from './fuel-monitor';
import { FlightRecorder } from './flight-recorder';
import { LogbookService } from './logbook-service';
import {
  computeInFlightNavSolution,
  destinationPoint,
  normalizeDegrees,
} from './inflight-nav';
import { scanTrackVectorAirspaceRadios } from './spatial-airspace-index';
import { FlightTelemetryController } from './telemetry-service';
import {
  BreadcrumbPoint,
  DirectToState,
  LegRuntimeRecord,
  OwnshipTelemetry,
} from './types-plus';

export interface InFlightCockpitPageProps {
  profile: AircraftProfile;
  routeInput: string;
  resolvedWaypoints: Waypoint[];
  navLog: NavLogSummary | null;
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  onLegAltitudeChange: (legIdx: number, newAlt: number) => void;
  onInsertWaypointInLeg?: (legIndex: number, lat: number, lon: number) => void;
  alternateAirport?: Waypoint | null;
  alternatePlan?: AlternatePlan | null;
  fuelCalculations?: FuelCalculationValues;
  onOpenKneeboard: () => void;
  onExitToPlanner: () => void;
  toastMessage: string | null;
  onNotifyToast?: (msg: string) => void;
}

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

const formatUtcClock = (ts: number | null): string => {
  if (!ts || !Number.isFinite(ts)) return '--:--Z';
  try {
    return new Date(ts).toISOString().slice(11, 16) + 'Z';
  } catch {
    return '--:--Z';
  }
};

function formatEteCompactShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const totalMins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h}h${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const InFlightCockpitPage: React.FC<InFlightCockpitPageProps> = (props) => {
  // Cockpit Overlay Visibility & Mode States
  const [legsHudMode, setLegsHudMode] = useState<LegsHudMode>('current-next');
  const [showRadioCard, setShowRadioCard] = useState<boolean>(true);
  const [showSimDrawer, setShowSimDrawer] = useState<boolean>(false);
  const [isRunwayAdvisoryDismissed, setIsRunwayAdvisoryDismissed] = useState<boolean>(false);
  const [isRunwayAdvisoryMinimized, setIsRunwayAdvisoryMinimized] = useState<boolean>(false);
  const [activeCircuitRunway, setActiveCircuitRunway] = useState<string | null>(null);
  const [activeCircuitPattern, setActiveCircuitPattern] = useState<TrafficCircuitGeometry | null>(null);
  const [isPackModalOpen, setIsPackModalOpen] = useState<boolean>(false);
  const [isDctPopoverOpen, setIsDctPopoverOpen] = useState<boolean>(false);
  const [customDctIcao, setCustomDctIcao] = useState<string>('');
  const [isAltCalOpen, setIsAltCalOpen] = useState<boolean>(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Record<string, boolean>>({});

  // ─── Phase 1: ADS-B / FLARM / SafeSky Ingestion State ───
  const [trafficTargets, setTrafficTargets] = useState<TrafficTarget[]>([]);
  const [isTrafficModalOpen, setIsTrafficModalOpen] = useState<boolean>(false);
  const [stratuxWsUrl, setStratuxWsUrl] = useState<string>('ws://192.168.10.1:4000/traffic');
  const [isTrafficSimActive, setIsTrafficSimActive] = useState<boolean>(false);
  const trafficServiceRef = useRef<TrafficService | null>(null);

  // ─── Phase 2: Screen Wake-Lock & Night Cockpit Mode ───
  const { isLocked: isWakeLocked } = useWakeLock(true);
  const [isNightMode, setIsNightMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gustlog_cockpit_night_mode') === 'true';
    } catch {
      return false;
    }
  });

  // ─── Phase 4: SkyDemon Virtual Radar Strip ───
  const [showVirtualRadarStrip, setShowVirtualRadarStrip] = useState<boolean>(true);

  // ─── Phase 5: In-Flight Fuel Monitor & Tank Switch Reminder ───
  const fuelMonitorRef = useRef<FuelMonitor | null>(null);
  const [fuelState, setFuelState] = useState<FuelMonitorState | null>(null);
  const [isFuelModalOpen, setIsFuelModalOpen] = useState<boolean>(false);

  // ─── Phase 6: Automatic Flight Leg Recorder & Pilot Logbook ───
  const flightRecorderRef = useRef<FlightRecorder | null>(null);
  const [isLogbookOpen, setIsLogbookOpen] = useState<boolean>(false);

  // ─── Live ATC Radio Speech-to-Text & Active Frequency Tracker ───
  const [activeCom, setActiveCom] = useState<{ freq: string; station: string }>({
    freq: '120.305 MHz',
    station: 'Cascais Tower',
  });
  const [isAtcCommsWindowOpen, setIsAtcCommsWindowOpen] = useState<boolean>(false);

  // Tap-to-Cycle ForeFlight-style HUD Instrument Cells
  const [spdCellMode, setSpdCellMode] = useState<'gs' | 'tas'>('gs');
  const [trkCellMode, setTrkCellMode] = useState<'mag' | 'true'>('mag');
  const [nextCellMode, setNextCellMode] = useState<'ete' | 'eta'>('ete');
  const [destCellMode, setDestCellMode] = useState<'dist' | 'glide'>('dist');

  // Airspace Map Filter State
  const [showAirspaces, setShowAirspaces] = useState<boolean>(true);
  const [airspaceFilter, setAirspaceFilter] = useState<AirspaceFilterType>('ALL');
  const [showSectorLabels, setShowSectorLabels] = useState<boolean>(true);
  const [onlyRouteAirspaces, setOnlyRouteAirspaces] = useState<boolean>(false);

  // In-Flight Telemetry & Navigation State
  const [lookAheadMinutes, setLookAheadMinutes] = useState<number>(5);
  const [directToState, setDirectToState] = useState<DirectToState | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbPoint[]>(loadStoredBreadcrumbs);
  const [legAtaRecords, setLegAtaRecords] = useState<Record<number, LegRuntimeRecord>>({});
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isSimPlaying, setIsSimPlaying] = useState<boolean>(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(1);
  const [isMapClickPlacementMode, setIsMapClickPlacementMode] = useState<boolean>(false);
  const [focusHazardRequest, setFocusHazardRequest] = useState<{
    lat: number;
    lon: number;
    airspaceId?: string;
    nonce: number;
  } | null>(null);
  const [terrainProfile, setTerrainProfile] = useState<TerrainProfileResult | null>(null);

  const [ownship, setOwnship] = useState<OwnshipTelemetry>(() => {
    const dep = props.resolvedWaypoints[0];
    const nextWp = props.resolvedWaypoints[1];
    const lat = dep?.latitude ?? 38.725;
    const lon = dep?.longitude ?? -9.355;
    const alt = props.navLog?.legs[0]?.altitude ?? props.profile.cruiseAltitude ?? 3500;
    const trk =
      dep && nextWp
        ? Math.round(
            initialBearing(dep.latitude, dep.longitude, nextWp.latitude, nextWp.longitude)
          )
        : 62;
    const magVar = magneticDeclination(lat, lon, alt);
    return {
      timestamp: Date.now(),
      latitude: lat,
      longitude: lon,
      rawGpsAltitudeFt: alt,
      altimeterOffsetFt: 0,
      altitudeMslFt: alt,
      groundSpeedKt: Math.round(props.navLog?.legs[0]?.groundSpeed ?? props.profile.tas ?? 105),
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

  // ─── Night Mode Class Effect ───
  useEffect(() => {
    if (isNightMode) {
      document.body.classList.add('cockpit-night-mode');
      try {
        localStorage.setItem('gustlog_cockpit_night_mode', 'true');
      } catch {}
    } else {
      document.body.classList.remove('cockpit-night-mode');
      try {
        localStorage.setItem('gustlog_cockpit_night_mode', 'false');
      } catch {}
    }
    return () => {
      document.body.classList.remove('cockpit-night-mode');
    };
  }, [isNightMode]);

  // ─── Traffic Service Lifecycle ───
  useEffect(() => {
    const ts = new TrafficService();
    trafficServiceRef.current = ts;
    const unsub = ts.subscribe(setTrafficTargets);
    return () => {
      unsub();
      ts.destroy();
      trafficServiceRef.current = null;
    };
  }, []);

  useEffect(() => {
    trafficServiceRef.current?.setOwnship(
      ownship.latitude,
      ownship.longitude,
      ownship.altitudeMslFt ?? 3500,
      ownship.groundSpeedKt,
      ownship.trueTrackDeg
    );
  }, [ownship]);

  // ─── Fuel Monitor Lifecycle & 1 Hz Burn Calculation ───
  useEffect(() => {
    const fm = new FuelMonitor({
      initialFob: props.fuelCalculations?.fob || 40,
      fuelFlowRate: props.profile.fuelFlow || 8.5,
      fuelUnit: props.profile.fuelUnit || 'gph',
      reservePolicyMinutes: 45,
      tankSwitchIntervalMinutes: 30,
    });
    fuelMonitorRef.current = fm;
    setFuelState(fm.getState());

    const timer = setInterval(() => {
      if (fuelMonitorRef.current) {
        setFuelState(fuelMonitorRef.current.tick(1));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [props.fuelCalculations?.fob, props.profile.fuelFlow, props.profile.fuelUnit]);

  // ─── Flight Recorder & Automated Logbook Logging ───
  useEffect(() => {
    const fr = new FlightRecorder();
    flightRecorderRef.current = fr;
    return () => {
      flightRecorderRef.current = null;
    };
  }, []);

  const prevRecorderPhaseRef = useRef<string>('PREFLIGHT');
  useEffect(() => {
    if (!flightRecorderRef.current) return;
    const recState = flightRecorderRef.current.processTelemetry(ownship);
    if (
      (recState.phase === 'TOUCHDOWN' || recState.phase === 'ON_BLOCK') &&
      prevRecorderPhaseRef.current === 'AIRBORNE'
    ) {
      prevRecorderPhaseRef.current = recState.phase;
      LogbookService.saveEntry({
        date: new Date().toISOString().slice(0, 10),
        aircraftModel: props.profile.aircraftModel || 'C172',
        tailNumber: 'CS-EFA',
        departureIcao: props.resolvedWaypoints[0]?.identifier || 'LPCS',
        destinationIcao:
          props.resolvedWaypoints[props.resolvedWaypoints.length - 1]?.identifier || 'LPEV',
        routeString: props.routeInput,
        outTimestamp: recState.timestamps.out,
        offTimestamp: recState.timestamps.off,
        onTimestamp: recState.timestamps.on,
        inTimestamp: recState.timestamps.in,
        flightTimeMinutes: Math.round(recState.flightDurationSec / 60),
        blockTimeMinutes: Math.round(recState.blockDurationSec / 60),
        distanceFlownNm: recState.distanceFlownNm,
        landingsDay: 1,
        landingsNight: 0,
        notes: `Recorded automatically in GustLog Plus (${recState.distanceFlownNm} NM flown)`,
      });
      props.onNotifyToast?.('Flight logged automatically in Pilot Digital Logbook (Touchdown detected)');
    } else {
      prevRecorderPhaseRef.current = recState.phase;
    }
  }, [
    ownship,
    props.profile.aircraftModel,
    props.resolvedWaypoints,
    props.routeInput,
    props.onNotifyToast,
  ]);

  const seededRouteSigRef = useRef<string>('');
  useEffect(() => {
    if (
      props.resolvedWaypoints.length >= 1 &&
      controllerRef.current &&
      ownship.source === 'manual-test' &&
      !isSimPlaying
    ) {
      const dep = props.resolvedWaypoints[0];
      const second = props.resolvedWaypoints[1];
      const nextSig = `${dep.identifier}:${second?.identifier ?? ''}:${
        props.navLog?.legs[0]?.altitude ?? ''
      }`;
      if (nextSig !== seededRouteSigRef.current) {
        seededRouteSigRef.current = nextSig;
        const leg0Alt =
          props.navLog?.legs[0]?.altitude ?? props.profile.cruiseAltitude ?? 3500;
        const leg0Gs =
          props.navLog?.legs[0]?.groundSpeed ?? props.profile.tas ?? 105;
        const trk = second
          ? initialBearing(
              dep.latitude,
              dep.longitude,
              second.latitude,
              second.longitude
            )
          : ownship.trueTrackDeg;
        controllerRef.current.setManualOwnship({
          latitude: dep.latitude,
          longitude: dep.longitude,
          altitudeMslFt: leg0Alt,
          groundSpeedKt: Math.round(leg0Gs),
          trueTrackDeg: Math.round(trk),
          verticalSpeedFpm: 0,
        });
      }
    }
  }, [
    props.resolvedWaypoints,
    props.navLog,
    props.profile.cruiseAltitude,
    props.profile.tas,
    ownship.source,
    isSimPlaying,
  ]);

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

  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';
  const fobValue = props.fuelCalculations?.fob ?? null;

  const effectiveActiveLegIdx = useMemo(() => {
    const legsLen = props.navLog?.legs.length ?? 0;
    if (legsLen === 0) return 0;
    if (props.activeLegIndex === null || props.activeLegIndex < 0) return 0;
    return Math.min(legsLen - 1, props.activeLegIndex);
  }, [props.activeLegIndex, props.navLog?.legs.length]);

  const navSolution = useMemo(() => {
    return computeInFlightNavSolution({
      ownship,
      navLog: props.navLog,
      waypoints: props.resolvedWaypoints,
      activeLegIndex: effectiveActiveLegIdx,
      directToState,
      terrainProfile,
      lookAheadMinutes,
      fuelRemainingGalOrL: fobValue,
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
    fobValue,
    props.profile.fuelFlow,
  ]);

  // ─── AABB-Accelerated Live Airspace & Radio Comms Stack ───
  const airspaceCommsStack = useMemo(() => {
    const effectiveGs = Math.max(20, ownship.groundSpeedKt);
    return scanTrackVectorAirspaceRadios(ownship, effectiveGs).slice(0, 3);
  }, [
    ownship.latitude,
    ownship.longitude,
    ownship.altitudeMslFt,
    ownship.groundSpeedKt,
    ownship.trueTrackDeg,
    ownship.verticalSpeedFpm,
  ]);

  // Automatic Waypoint Leg Sequencing
  useEffect(() => {
    if (!navSolution.shouldSequenceNextLeg) return;
    const now = Date.now();
    if (now - lastSequencedTimeRef.current < 3500) return;
    lastSequencedTimeRef.current = now;

    const legs = props.navLog?.legs ?? [];
    if (directToState) {
      const targetIdx = directToState.targetWaypointRouteIndex;
      const crossedIdent = directToState.targetWaypoint.identifier;
      setDirectToState(null);
      if (targetIdx !== null && targetIdx < legs.length) {
        props.onSelectLeg(targetIdx);
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
    navSolution.shouldSequenceNextLeg,
    directToState,
    effectiveActiveLegIdx,
    props.navLog?.legs,
    props.onSelectLeg,
    props.onNotifyToast,
    ownship,
  ]);

  const handleStartLiveGps = useCallback(() => {
    setIsSimPlaying(false);
    setIsMapClickPlacementMode(false);
    setShowSimDrawer(false);
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

  // 1-Tap Off-Track Demo Helper so pilot can immediately inspect off-track map visuals
  const handleSimulateOffTrack = useCallback(() => {
    const leg = props.navLog?.legs[effectiveActiveLegIdx];
    if (!leg || !controllerRef.current) return;
    // Place aircraft 35% along the active leg, then offset 1.6 NM to the Right (+90° perpendicular)
    const alongPt = destinationPoint(
      leg.from.latitude,
      leg.from.longitude,
      leg.trueTrack,
      Math.max(4, leg.distance * 0.35)
    );
    const offTrackPt = destinationPoint(
      alongPt.latitude,
      alongPt.longitude,
      normalizeDegrees(leg.trueTrack + 90),
      1.6
    );
    setDirectToState(null);
    const updated = controllerRef.current.setManualOwnship({
      latitude: offTrackPt.latitude,
      longitude: offTrackPt.longitude,
      altitudeMslFt: leg.altitude,
      groundSpeedKt: Math.round(leg.groundSpeed || 105),
      trueTrackDeg: Math.round(leg.trueTrack),
      verticalSpeedFpm: 0,
    });
    appendBreadcrumbIfMoved(updated);
    props.onNotifyToast?.('Simulated 1.6 NM Right of course — observe XTE Drop Line & Intercept Heading!');
  }, [props.navLog?.legs, effectiveActiveLegIdx, appendBreadcrumbIfMoved, props.onNotifyToast]);

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
      setDirectToState({
        targetWaypoint: target,
        originLat: ownship.latitude,
        originLon: ownship.longitude,
        originAltFt: ownship.altitudeMslFt ?? props.profile.cruiseAltitude ?? 3500,
        activatedAt: Date.now(),
        targetWaypointRouteIndex: routeIndex,
      });

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

      setIsDctPopoverOpen(false);
      props.onNotifyToast?.(`⚡ Direct-To (DCT) ${target.identifier} activated!`);
    },
    [ownship, props.profile.cruiseAltitude, props.onNotifyToast]
  );

  const handleCancelDirectTo = useCallback(() => {
    setDirectToState(null);
    props.onNotifyToast?.('Direct-To cancelled — Resumed planned route leg.');
  }, [props.onNotifyToast]);

  const handleCustomDctSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = customDctIcao.trim().toUpperCase();
    if (!code) return;
    const routeIdx = props.resolvedWaypoints.findIndex(
      (w) => w.identifier.toUpperCase() === code
    );
    if (routeIdx >= 0) {
      handleActivateDirectTo(props.resolvedWaypoints[routeIdx], routeIdx);
      setCustomDctIcao('');
      return;
    }
    const airportWp = getAirportWaypoint(code);
    if (airportWp) {
      handleActivateDirectTo(airportWp, null);
      setCustomDctIcao('');
    }
  };

  const handleClearBreadcrumbs = useCallback(() => {
    setBreadcrumbs([]);
    try {
      localStorage.removeItem(BREADCRUMBS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const handleSetAltimeterOffset = useCallback((offsetFt: number) => {
    controllerRef.current?.setAltimeterOffsetFt(offsetFt);
  }, []);

  const handleFocusHazardCoordinate = useCallback(
    (lat: number, lon: number, airspaceId?: string) => {
      setFocusHazardRequest({
        lat,
        lon,
        airspaceId,
        nonce: Date.now(),
      });
    },
    []
  );

  // ─── Destination Aerodrome & Live Runway Wind Advisory Detection ───
  const destAirportWaypoint = useMemo(() => {
    if (directToState) {
      return directToState.targetWaypoint;
    }
    const legsList = props.navLog?.legs;
    if (legsList && legsList.length > 0) {
      return legsList[legsList.length - 1].to;
    }
    const rWaypoints = props.resolvedWaypoints;
    if (rWaypoints && rWaypoints.length > 0) {
      return rWaypoints[rWaypoints.length - 1];
    }
    return null;
  }, [directToState, props.navLog?.legs, props.resolvedWaypoints]);

  const destWind = useMemo(() => {
    const legsList = props.navLog?.legs;
    if (legsList && legsList.length > 0) {
      const lastLeg = legsList[legsList.length - 1];
      if (lastLeg.wind) {
        return {
          directionDeg: lastLeg.wind.direction,
          speedKt: lastLeg.wind.speed,
        };
      }
    }
    return {
      directionDeg: 320,
      speedKt: 12,
    };
  }, [props.navLog?.legs]);

  const isNearDestination = useMemo(() => {
    if (!destAirportWaypoint) return false;
    return navSolution.distanceToDestNm <= 15;
  }, [destAirportWaypoint, navSolution.distanceToDestNm]);

  const runwayAdvisory: AirportRunwayAdvisory | null = useMemo(() => {
    if (!destAirportWaypoint) return null;
    return computeAirportRunwayAdvisory(
      destAirportWaypoint.identifier,
      destWind.directionDeg,
      destWind.speedKt,
      destAirportWaypoint.elevation ?? 0,
      15
    );
  }, [destAirportWaypoint, destWind]);

  const handleToggleCircuitRunway = useCallback(
    (rwy: ScoredRunwayWind) => {
      if (!destAirportWaypoint) return;
      if (activeCircuitRunway === rwy.designator) {
        setActiveCircuitRunway(null);
        setActiveCircuitPattern(null);
        props.onNotifyToast?.(`Visual Traffic Circuit RWY ${rwy.designator} hidden`);
        return;
      }
      const pattern = computeTrafficCircuitPattern(
        destAirportWaypoint.latitude,
        destAirportWaypoint.longitude,
        rwy.headingMag,
        rwy.designator,
        destAirportWaypoint.elevation ?? 0,
        'LEFT',
        rwy.lengthMeters
      );
      pattern.airportIcao = destAirportWaypoint.identifier;
      pattern.airportName = destAirportWaypoint.name;
      setActiveCircuitRunway(rwy.designator);
      setActiveCircuitPattern(pattern);
      props.onNotifyToast?.(
        `Visual Traffic Circuit active: RWY ${rwy.designator} (${pattern.patternAltMslFt} FT MSL)`
      );
    },
    [destAirportWaypoint, activeCircuitRunway, props.onNotifyToast]
  );

  const cdiClampedPercent = Math.max(
    -100,
    Math.min(100, (navSolution.crossTrackErrorNm / 2.0) * 100)
  );

  const legs = props.navLog?.legs ?? [];
  const activeAlerts = navSolution.lookAheadAlerts.filter((a) => !dismissedAlertIds[a.id]);

  return (
    <div className="efb-fullscreen-cockpit">
      {props.toastMessage && (
        <div className="toast-notification">✓ {props.toastMessage}</div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          1. FULL-VIEWPORT MOVING MAP CANVAS (100vw x 100vh)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="efb-map-canvas-layer">
        <PlusRouteMap
          waypoints={props.resolvedWaypoints}
          navLog={props.navLog}
          activeLegIndex={effectiveActiveLegIdx}
          onSelectLeg={props.onSelectLeg}
          onInsertWaypointInLeg={props.onInsertWaypointInLeg}
          alternateAirport={props.alternateAirport}
          showAirspaces={showAirspaces}
          onToggleShowAirspaces={setShowAirspaces}
          airspaceFilter={airspaceFilter}
          onAirspaceFilterChange={setAirspaceFilter}
          showSectorLabels={showSectorLabels}
          onToggleSectorLabels={setShowSectorLabels}
          onlyRouteAirspaces={onlyRouteAirspaces}
          onToggleOnlyRouteAirspaces={setOnlyRouteAirspaces}
          isFlightModeActive={true}
          ownship={ownship}
          navSolution={navSolution}
          breadcrumbs={breadcrumbs}
          directToState={directToState}
          onActivateDirectTo={handleActivateDirectTo}
          isMapClickPlacementMode={isMapClickPlacementMode}
          onMapPlaceOwnship={handleMapPlaceOwnship}
          focusHazardRequest={focusHazardRequest}
          trafficTargets={trafficTargets}
          activeCircuitPattern={activeCircuitPattern}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. TOP FLOATING AVIONICS TELEMETRY & ACTION RIBBON
         ═══════════════════════════════════════════════════════════════════════ */}
      <header className="efb-top-overlay">
        {/* Left: Exit to Planner + Sensor Source + Direct-To */}
        <div className="efb-top-left">
          <button
            type="button"
            className="efb-exit-btn"
            onClick={props.onExitToPlanner}
            title="Return to Flight Planner Dashboard"
          >
            ← Planner
          </button>

          <div className="efb-sensor-pill-group">
            <button
              type="button"
              className={`efb-pill-btn ${ownship.source === 'gps' ? 'active-gps' : ''}`}
              onClick={handleStartLiveGps}
              title="Connect to Live Hardware GPS"
            >
              <span>🛰️ GPS</span>
              {ownship.source === 'gps' && (
                <span className="efb-acc-tag">±{ownship.horizontalAccuracyM}m</span>
              )}
            </button>
            {showSimDrawer && (
              <button
                type="button"
                className="efb-pill-btn active-sim"
                onClick={() => setShowSimDrawer(false)}
                title="Hide Cockpit Flight Simulator Controls"
              >
                🕹️ Sim {isSimPlaying ? `(${simSpeedMultiplier}x)` : ''} ✕
              </button>
            )}
          </div>

          {/* Direct-To (DCT) Button & Popover */}
          <div className="efb-dct-anchor">
            <button
              type="button"
              className={`efb-dct-btn ${directToState ? 'is-active' : ''}`}
              onClick={() => setIsDctPopoverOpen((prev) => !prev)}
            >
              <span>⚡ DCT</span>
              {directToState && (
                <strong>➔ {directToState.targetWaypoint.identifier}</strong>
              )}
            </button>
            {directToState && (
              <button
                type="button"
                className="efb-dct-cancel-btn"
                onClick={handleCancelDirectTo}
                title="Cancel Direct-To and Resume Planned Leg"
              >
                ✕
              </button>
            )}

            {isDctPopoverOpen && (
              <div className="efb-floating-popover">
                <div className="efb-popover-head">
                  <span>⚡ DIRECT-TO (DCT)</span>
                  <button type="button" onClick={() => setIsDctPopoverOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="efb-dct-list">
                  {props.resolvedWaypoints.map((wp, idx) => (
                    <button
                      key={`${wp.identifier}-${idx}`}
                      type="button"
                      className="efb-dct-item"
                      onClick={() => handleActivateDirectTo(wp, idx)}
                    >
                      <strong>{wp.identifier}</strong>
                      <span>{wp.name || wp.type.toUpperCase()}</span>
                      <em>DCT ➔</em>
                    </button>
                  ))}
                  {props.alternateAirport && (
                    <button
                      type="button"
                      className="efb-dct-item is-alt"
                      onClick={() => handleActivateDirectTo(props.alternateAirport!, null)}
                    >
                      <strong>ALT: {props.alternateAirport.identifier}</strong>
                      <span>{props.alternateAirport.name}</span>
                      <em>DIVERT ➔</em>
                    </button>
                  )}
                </div>
                <form onSubmit={handleCustomDctSubmit} className="efb-dct-form">
                  <input
                    type="text"
                    placeholder="Enter ICAO (e.g. LPCS)"
                    value={customDctIcao}
                    maxLength={6}
                    onChange={(e) => setCustomDctIcao(e.target.value.toUpperCase())}
                  />
                  <button type="submit">GO</button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Center: 7-Cell Primary Flight Telemetry Strip (Tap any cell to cycle metrics) */}
        <div className="efb-telemetry-strip">
          {/* GS <-> TAS */}
          <div
            className="efb-t-cell efb-t-cell-clickable"
            onClick={() => setSpdCellMode((m) => (m === 'gs' ? 'tas' : 'gs'))}
            title="Tap to toggle Ground Speed (GS) / Planned TAS"
          >
            <span className="efb-t-label">{spdCellMode === 'gs' ? 'GS' : 'TAS'}</span>
            <span className="efb-t-val val-cyan">
              {spdCellMode === 'gs' ? ownship.groundSpeedKt : props.profile.tas}{' '}
              <small>KT</small>
            </span>
          </div>

          {/* TRK MAG <-> TRK TRUE */}
          <div
            className="efb-t-cell efb-t-cell-clickable"
            onClick={() => setTrkCellMode((m) => (m === 'mag' ? 'true' : 'mag'))}
            title="Tap to toggle Magnetic Track (°M) / True Track (°T)"
          >
            <span className="efb-t-label">TRK</span>
            <span className="efb-t-val val-gold">
              {(trkCellMode === 'mag'
                ? ownship.magneticTrackDeg
                : ownship.trueTrackDeg
              )
                .toString()
                .padStart(3, '0')}
              °<small>{trkCellMode === 'mag' ? 'M' : 'T'}</small>
            </span>
          </div>

          {/* ALTITUDE + BARO CAL */}
          <div
            className="efb-t-cell efb-t-cell-clickable"
            onClick={() => setIsAltCalOpen((p) => !p)}
            title="Click to calibrate GPS altitude to QNH altimeter"
          >
            <span className="efb-t-label">
              ALT{' '}
              <em className="efb-mini-tag">
                {navSolution.estimatedAglFt !== null
                  ? `${navSolution.estimatedAglFt} AGL`
                  : 'MSL'}
              </em>
            </span>
            <span className="efb-t-val">
              {ownship.altitudeMslFt !== null
                ? ownship.altitudeMslFt.toLocaleString()
                : '---'}{' '}
              <small>FT</small>
            </span>
          </div>

          {/* VS / VSR */}
          <div className="efb-t-cell">
            <span className="efb-t-label">
              VS{' '}
              {navSolution.requiredVsNextFpm !== null && (
                <em className="efb-mini-tag">
                  Req{' '}
                  {navSolution.requiredVsNextFpm > 0
                    ? `+${navSolution.requiredVsNextFpm}`
                    : navSolution.requiredVsNextFpm}
                </em>
              )}
            </span>
            <span className="efb-t-val">
              {ownship.verticalSpeedFpm > 0
                ? `+${ownship.verticalSpeedFpm}`
                : ownship.verticalSpeedFpm}{' '}
              <small>FPM</small>
            </span>
          </div>

          {/* XTE + CDI */}
          <div className="efb-t-cell efb-t-cell-cdi">
            <span className="efb-t-label">
              XTE{' '}
              <em>
                {Math.abs(navSolution.crossTrackErrorNm) < 0.05
                  ? 'ON CRS'
                  : `${Math.abs(navSolution.crossTrackErrorNm).toFixed(2)} ${
                      navSolution.crossTrackErrorNm < 0 ? 'L' : 'R'
                    }`}
              </em>
            </span>
            <div className="efb-mini-cdi-bar">
              <div className="efb-mini-cdi-center" />
              <div
                className="efb-mini-cdi-needle"
                style={{ left: `${50 + cdiClampedPercent * 0.44}%` }}
              />
            </div>
          </div>

          {/* NEXT WAYPOINT (Tap to cycle ETE <-> ETA) */}
          <div
            className="efb-t-cell efb-t-cell-clickable"
            onClick={() => setNextCellMode((m) => (m === 'ete' ? 'eta' : 'ete'))}
            title="Tap to toggle Next Fix ETE / UTC ETA"
          >
            <span className="efb-t-label">
              NEXT ·{' '}
              {nextCellMode === 'ete'
                ? formatEteCompactShort(navSolution.eteToNextSec)
                : formatUtcClock(navSolution.etaNextTimestamp)}
            </span>
            <span className="efb-t-val val-emerald">
              {navSolution.nextWaypoint?.identifier || '---'}{' '}
              <small>{navSolution.distanceToNextNm.toFixed(1)} NM</small>
            </span>
          </div>

          {/* DEST & FUEL <-> GLIDE ADVISOR RANGE */}
          <div
            className="efb-t-cell efb-t-cell-clickable"
            onClick={() => setDestCellMode((m) => (m === 'dist' ? 'glide' : 'dist'))}
            title="Tap to toggle Destination Distance & Fuel / Best Glide Range"
          >
            {destCellMode === 'dist' ? (
              <>
                <span className="efb-t-label">
                  DEST · {formatUtcClock(navSolution.etaDestTimestamp)}
                </span>
                <span className="efb-t-val">
                  {navSolution.distanceToDestNm.toFixed(1)} <small>NM</small>
                  {navSolution.estimatedFuelRemainingAtDest !== null && (
                    <small className="efb-fuel-rem">
                      {' '}
                      · {navSolution.estimatedFuelRemainingAtDest.toFixed(1)}
                      {fuelUnitLabel}
                    </small>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="efb-t-label">BEST GLIDE (L/D 9.2)</span>
                <span className="efb-t-val val-emerald">
                  {navSolution.avgGlideDistanceNm.toFixed(1)} <small>NM RNG</small>
                </span>
              </>
            )}
          </div>

          {/* LIVE FUEL FOB & TANK SWITCH REMINDER */}
          <div
            className={`efb-t-cell efb-t-cell-clickable ${
              fuelState?.isSwitchDue ? 'cell-pulse-warning' : ''
            }`}
            onClick={() => setIsFuelModalOpen((p) => !p)}
            title="Fuel on board, live burn rate, and tank selector switch countdown"
          >
            <span className="efb-t-label">
              FUEL · {fuelState?.activeTank || 'LEFT'}{' '}
              {fuelState && (
                <em className="efb-mini-tag">
                  {Math.floor(fuelState.secondsUntilSwitch / 60)}m
                </em>
              )}
            </span>
            <span className="efb-t-val val-gold">
              {fuelState?.currentFob ?? '---'}{' '}
              <small>{fuelUnitLabel}</small>
            </span>
          </div>
        </div>

        {/* Right: Vector Horizon, GPX Trail, Night Mode, Traffic, Radar, Logbook, Profile, Legs, Kneeboard */}
        <div className="efb-top-right">
          {/* Night Cockpit Mode Toggle */}
          <button
            type="button"
            className={`efb-icon-btn ${isNightMode ? 'is-night-active' : ''}`}
            onClick={() => setIsNightMode((p) => !p)}
            title="Toggle Night Cockpit Mode (Aviation Red Wavelength Filter)"
          >
            {isNightMode ? '🌙 Night' : '☀️ Day'}
          </button>

          {/* Screen Wake Lock Indicator */}
          <span
            className={`efb-wake-pill ${isWakeLocked ? 'is-locked' : 'is-off'}`}
            title={
              isWakeLocked
                ? 'Screen Wake Lock active (prevents screen sleep in cockpit)'
                : 'Screen Wake Lock inactive'
            }
          >
            {isWakeLocked ? '🔋 WAKE' : 'OFF'}
          </span>

          {/* ADS-B Traffic Button */}
          <button
            type="button"
            className={`efb-icon-btn ${
              trafficTargets.some((t) => t.isThreat)
                ? 'btn-threat-pulse'
                : isTrafficSimActive
                ? 'active'
                : ''
            }`}
            onClick={() => setIsTrafficModalOpen((p) => !p)}
            title="ADS-B / GDL-90 Live & Simulated Traffic Settings"
          >
            🛰️ Traffic ({trafficTargets.length})
          </button>

          {/* Virtual Radar Toggle */}
          <button
            type="button"
            className={`efb-icon-btn ${showVirtualRadarStrip ? 'active' : ''}`}
            onClick={() => setShowVirtualRadarStrip((p) => !p)}
            title="Toggle Bottom Virtual Radar Strip (SkyDemon style)"
          >
            📡 Radar
          </button>

          {/* Pilot Digital Logbook */}
          <button
            type="button"
            className="efb-icon-btn"
            onClick={() => setIsLogbookOpen(true)}
            title="Open Pilot Digital Logbook (Automatic OOOI Times)"
          >
            📖 Logbook
          </button>

          {/* Pre-Flight Offline Pack & Cockpit Systems Health Monitor */}
          <button
            type="button"
            className={`efb-icon-btn ${isPackModalOpen ? 'active' : ''}`}
            onClick={() => setIsPackModalOpen(true)}
            title="Pre-Flight Offline Pack & Cockpit Systems Health Monitor"
          >
            📦 Pack
          </button>

          {/* Live ATC Speech-to-Text & Active Frequency Tracker */}
          <button
            type="button"
            className={`efb-icon-btn ${isAtcCommsWindowOpen ? 'active' : ''}`}
            onClick={() => setIsAtcCommsWindowOpen((p) => !p)}
            title="Open Live ATC Speech-to-Text & Radio Frequency Tracker Pop-Up"
          >
            🎙️ Comms ({activeCom.freq.replace(' MHz', '')})
          </button>

          {/* Projected Flight Path Track Vector Control (2m, 5m, 10m Ahead of Nose) */}
          <div
            className="efb-vec-control-pill"
            title="Flight Path Track Vector: Projects where the aircraft will be along its ground track in 2, 5, or 10 minutes at current ground speed"
          >
            <span className="efb-vec-label">TRK VEC</span>
            <div className="efb-vec-btn-group">
              <button
                type="button"
                className={`efb-vec-btn ${lookAheadMinutes === 0 ? 'active' : ''}`}
                onClick={() => setLookAheadMinutes(0)}
                title="Turn off Track Vector line on map"
              >
                OFF
              </button>
              {[2, 5, 10].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`efb-vec-btn ${lookAheadMinutes === m ? 'active' : ''}`}
                  onClick={() => setLookAheadMinutes(m)}
                  title={`Project flight path ${m} minutes ahead (${((Math.max(20, ownship.groundSpeedKt) * m) / 60).toFixed(1)} NM at ${Math.round(ownship.groundSpeedKt)} KT)`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`efb-icon-btn ${legsHudMode !== 'hidden' ? 'active' : ''}`}
            onClick={() =>
              setLegsHudMode((prev) =>
                prev === 'hidden' ? 'current-next' : 'hidden'
              )
            }
            title="Show / Hide Side Route Legs HUD"
          >
            🧭 Legs
          </button>

          <button
            type="button"
            className="efb-icon-btn efb-kneeboard-btn"
            onClick={props.onOpenKneeboard}
            title="Open SOP Form 002 Kneeboard"
          >
            📋
          </button>
        </div>
      </header>

      {/* Optional Barometric Altimeter Calibration Popover */}
      {isAltCalOpen && (
        <div className="efb-alt-cal-modal">
          <div className="efb-popover-head">
            <span>⚙ BAROMETRIC ALTIMETER SYNC (QNH OFFSET)</span>
            <button type="button" onClick={() => setIsAltCalOpen(false)}>
              ✕
            </button>
          </div>
          <div className="efb-alt-cal-row">
            <button
              type="button"
              onClick={() => handleSetAltimeterOffset(ownship.altimeterOffsetFt - 50)}
            >
              -50 FT
            </button>
            <strong>
              {ownship.altimeterOffsetFt >= 0
                ? `+${ownship.altimeterOffsetFt}`
                : ownship.altimeterOffsetFt}{' '}
              FT
            </strong>
            <button
              type="button"
              onClick={() => handleSetAltimeterOffset(ownship.altimeterOffsetFt + 50)}
            >
              +50 FT
            </button>
            <button type="button" onClick={() => handleSetAltimeterOffset(0)}>
              Reset
            </button>
          </div>
        </div>
      )}

      {/* ADS-B / GDL-90 Hardware Receiver & Traffic Settings Modal */}
      {isTrafficModalOpen && (
        <div className="efb-alt-cal-modal efb-traffic-modal">
          <div className="efb-popover-head">
            <span>🛰️ ADS-B / GDL-90 HARDWARE INGESTION</span>
            <button type="button" onClick={() => setIsTrafficModalOpen(false)}>
              ✕
            </button>
          </div>
          <div className="efb-traffic-popover-content">
            <p className="efb-popover-desc">
              Connect to Sentry, Stratux, SkyEcho, or SafeSky via GDL-90 stream (WebSocket/UDP).
            </p>
            <div className="efb-traffic-url-row">
              <input
                type="text"
                value={stratuxWsUrl}
                onChange={(e) => setStratuxWsUrl(e.target.value)}
                placeholder="ws://192.168.10.1:4000/traffic"
              />
              <button
                type="button"
                onClick={() => {
                  trafficServiceRef.current?.connectWebSocket(stratuxWsUrl);
                  props.onNotifyToast?.(`Connecting to GDL-90 stream at ${stratuxWsUrl}`);
                }}
              >
                Connect
              </button>
            </div>
            <div className="efb-traffic-sim-row">
              <span>Traffic Simulator:</span>
              <button
                type="button"
                className={`efb-traffic-sim-btn ${isTrafficSimActive ? 'active' : ''}`}
                onClick={() => {
                  const next = !isTrafficSimActive;
                  setIsTrafficSimActive(next);
                  if (next) {
                    trafficServiceRef.current?.startSimulation();
                    props.onNotifyToast?.('Simulating realistic VFR traffic targets (GDL-90 Msg 20)');
                  } else {
                    trafficServiceRef.current?.stopSimulation();
                    props.onNotifyToast?.('Stopped simulated traffic');
                  }
                }}
              >
                {isTrafficSimActive ? '⏸ Stop Simulation' : '▶ Simulate Traffic'}
              </button>
            </div>
            <div className="efb-traffic-status">
              <span>Active Targets Detected: <strong>{trafficTargets.length}</strong></span>
              {trafficTargets.length > 0 && (
                <small className="efb-threat-count">
                  ({trafficTargets.filter((t) => t.isThreat).length} Proximity Alerts)
                </small>
              )}
            </div>
          </div>
        </div>
      )}

      {/* In-Flight Fuel & Tank Switch Manager Modal */}
      {isFuelModalOpen && fuelState && (
        <div className="efb-alt-cal-modal efb-fuel-modal">
          <div className="efb-popover-head">
            <span>⛽ FUEL ON BOARD &amp; TANK SWITCH REMINDER</span>
            <button type="button" onClick={() => setIsFuelModalOpen(false)}>
              ✕
            </button>
          </div>
          <div className="efb-fuel-popover-content">
            <div className="efb-fuel-stat-grid">
              <div className="fuel-stat-tile">
                <small>CURRENT FOB</small>
                <strong>{fuelState.currentFob} {fuelUnitLabel}</strong>
              </div>
              <div className="fuel-stat-tile">
                <small>BURNED</small>
                <strong>{fuelState.fuelBurned} {fuelUnitLabel}</strong>
              </div>
              <div className="fuel-stat-tile">
                <small>TIME TO EMPTY</small>
                <strong>
                  {Math.floor(fuelState.timeToEmptySec / 3600)}h{' '}
                  {Math.round((fuelState.timeToEmptySec % 3600) / 60)}m
                </strong>
              </div>
              <div className="fuel-stat-tile">
                <small>RESERVE (45m)</small>
                <strong>{fuelState.reserveFuelVolume} {fuelUnitLabel}</strong>
              </div>
            </div>
            <div className="efb-fuel-tank-selector">
              <div className="efb-tank-row">
                <span>Active Tank: <strong className="tank-name">{fuelState.activeTank}</strong></span>
                <span>
                  Switch In:{' '}
                  <strong className={fuelState.isSwitchDue ? 'switch-due' : ''}>
                    {Math.floor(fuelState.secondsUntilSwitch / 60)}m {fuelState.secondsUntilSwitch % 60}s
                  </strong>
                </span>
              </div>
              <div className="efb-tank-btn-row">
                <button
                  type="button"
                  className="efb-btn-switch-tank"
                  onClick={() => {
                    fuelMonitorRef.current?.switchTank();
                    setFuelState(fuelMonitorRef.current?.getState() || null);
                    props.onNotifyToast?.(
                      `Fuel tank switched to ${fuelState.activeTank === 'LEFT' ? 'RIGHT' : 'LEFT'} Tank`
                    );
                  }}
                >
                  🔄 Switch to {fuelState.activeTank === 'LEFT' ? 'RIGHT' : 'LEFT'} Tank
                </button>
                <button
                  type="button"
                  className="efb-btn-reset-tank"
                  onClick={() => {
                    fuelMonitorRef.current?.resetTimer();
                    setFuelState(fuelMonitorRef.current?.getState() || null);
                    props.onNotifyToast?.('Fuel tank switch countdown reset to 30 min');
                  }}
                >
                  Reset Timer (30m)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          3. FLOATING COCKPIT SIMULATOR BAR (WHEN TOGGLED)
         ═══════════════════════════════════════════════════════════════════════ */}
      {showSimDrawer && (
        <div className="efb-sim-floating-bar">
          <div className="efb-sim-left">
            <span className="efb-sim-title">🕹️ COCKPIT SIM</span>
            <button
              type="button"
              className={`efb-sim-play ${isSimPlaying ? 'playing' : ''}`}
              onClick={() => handleToggleSimPlay(simSpeedMultiplier)}
            >
              {isSimPlaying ? '⏸ Pause' : '▶ Auto-Fly'}
            </button>
            {[1, 5, 10].map((spd) => (
              <button
                key={spd}
                type="button"
                className={`efb-sim-spd ${simSpeedMultiplier === spd ? 'active' : ''}`}
                onClick={() => handleToggleSimPlay(spd)}
              >
                {spd}x
              </button>
            ))}
            <button
              type="button"
              className={`efb-sim-place ${isMapClickPlacementMode ? 'active' : ''}`}
              onClick={() => setIsMapClickPlacementMode((p) => !p)}
            >
              {isMapClickPlacementMode ? '🎯 Click Map Now...' : '📍 Place on Map'}
            </button>
            <button
              type="button"
              className="efb-sim-spd"
              onClick={handleSimulateOffTrack}
              title="Place aircraft 1.6 NM off-track to test XTE drop line & course intercept"
            >
              ↗ Test Off-Track
            </button>
            {breadcrumbs.length > 0 && (
              <button
                type="button"
                className="efb-sim-spd"
                onClick={handleClearBreadcrumbs}
              >
                Clear Trail
              </button>
            )}
          </div>

          <div className="efb-sim-steppers">
            <div className="efb-stepper-chip">
              <span>ALT</span>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    altitudeMslFt: Math.max(0, (ownship.altitudeMslFt ?? 3500) - 250),
                  })
                }
              >
                −
              </button>
              <strong>{(ownship.altitudeMslFt ?? 3500).toLocaleString()}</strong>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    altitudeMslFt: (ownship.altitudeMslFt ?? 3500) + 250,
                  })
                }
              >
                +
              </button>
            </div>

            <div className="efb-stepper-chip">
              <span>GS</span>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    groundSpeedKt: Math.max(0, ownship.groundSpeedKt - 10),
                  })
                }
              >
                −
              </button>
              <strong>{ownship.groundSpeedKt}kt</strong>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    groundSpeedKt: ownship.groundSpeedKt + 10,
                  })
                }
              >
                +
              </button>
            </div>

            <div className="efb-stepper-chip">
              <span>TRK</span>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    trueTrackDeg: (ownship.trueTrackDeg - 10 + 360) % 360,
                  })
                }
              >
                −10°
              </button>
              <strong>{ownship.trueTrackDeg.toString().padStart(3, '0')}°</strong>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    trueTrackDeg: (ownship.trueTrackDeg + 10) % 360,
                  })
                }
              >
                +10°
              </button>
            </div>

            <div className="efb-stepper-chip">
              <span>VS</span>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    verticalSpeedFpm: ownship.verticalSpeedFpm - 250,
                  })
                }
              >
                −
              </button>
              <strong>
                {ownship.verticalSpeedFpm > 0
                  ? `+${ownship.verticalSpeedFpm}`
                  : ownship.verticalSpeedFpm}
              </strong>
              <button
                type="button"
                onClick={() =>
                  handleAdjustManualOwnship({
                    verticalSpeedFpm: ownship.verticalSpeedFpm + 250,
                  })
                }
              >
                +
              </button>
            </div>

            {navSolution.nextWaypoint && (
              <button
                type="button"
                className="efb-sim-align"
                onClick={() =>
                  handleAdjustManualOwnship({
                    trueTrackDeg: Math.round(navSolution.bearingToNextTrueDeg),
                  })
                }
              >
                🧭 Steer {navSolution.nextWaypoint.identifier}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          4. FLOATING VISUAL-ONLY LOOK-AHEAD ALERTS (TOP-CENTER OVER MAP)
         ═══════════════════════════════════════════════════════════════════════ */}
      {(activeAlerts.length > 0 || fuelState?.isSwitchDue || trafficTargets.some((t) => t.isThreat)) && (
        <div className="efb-floating-alert-stack">
          {/* Active Fuel Selector Valve Switch Alert */}
          {fuelState?.isSwitchDue && (
            <div className="efb-alert-pill sev-warning">
              <span className="efb-alert-badge">⚠️ FUEL TANK</span>
              <div className="efb-alert-copy">
                <strong>CYCLE FUEL SELECTOR VALVE</strong>
                <span>Active tank: {fuelState.activeTank} · Switch recommended</span>
              </div>
              <div className="efb-alert-actions">
                <button
                  type="button"
                  onClick={() => {
                    fuelMonitorRef.current?.switchTank();
                    setFuelState(fuelMonitorRef.current?.getState() || null);
                    props.onNotifyToast?.(
                      `Fuel tank switched to ${fuelState.activeTank === 'LEFT' ? 'RIGHT' : 'LEFT'} Tank`
                    );
                  }}
                >
                  ✓ Switch ({fuelState.activeTank === 'LEFT' ? 'RIGHT' : 'LEFT'})
                </button>
              </div>
            </div>
          )}

          {/* Active ADS-B / FLARM Traffic Threat Proximity Alert */}
          {trafficTargets
            .filter((t) => t.isThreat)
            .slice(0, 1)
            .map((threat) => (
              <div key={threat.icaoAddress} className="efb-alert-pill sev-critical">
                <span className="efb-alert-badge">🚨 TRAFFIC ALERT</span>
                <div className="efb-alert-copy">
                  <strong>{threat.callsign} · {threat.distanceNm.toFixed(1)} NM</strong>
                  <span>
                    Alt {threat.altitudeFt?.toLocaleString()} FT (
                    {threat.relativeAltFt !== null
                      ? `${threat.relativeAltFt >= 0 ? '+' : ''}${threat.relativeAltFt} FT`
                      : ''}
                    ) · Bearing {threat.bearingDeg}°
                  </span>
                </div>
                {threat.timeToCpaSec !== undefined && (
                  <span className="efb-alert-freq">⏱️ CPA {threat.timeToCpaSec}s</span>
                )}
              </div>
            ))}

          {activeAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className={`efb-alert-pill sev-${alert.severity.toLowerCase()}`}
            >
              <span className="efb-alert-badge">
                {alert.severity === 'CRITICAL'
                  ? '🚨 PULL UP / CRITICAL'
                  : alert.severity === 'WARNING'
                  ? '⚠️ WARNING'
                  : '⚡ CAUTION'}
              </span>
              <div className="efb-alert-copy">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
              </div>
              {alert.frequency && (
                <span className="efb-alert-freq">📻 {alert.frequency}</span>
              )}
              <div className="efb-alert-actions">
                {alert.hazardCoordinate && (
                  <button
                    type="button"
                    onClick={() =>
                      handleFocusHazardCoordinate(
                        alert.hazardCoordinate![0],
                        alert.hazardCoordinate![1],
                        alert.airspaceId
                      )
                    }
                  >
                    📍 View
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setDismissedAlertIds((prev) => ({ ...prev, [alert.id]: true }))
                  }
                >
                  ✓ ACK
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {gpsError && ownship.source === 'gps' && (
        <div className="efb-gps-warning-toast">
          <span>⚠️ {gpsError}</span>
          <button type="button" onClick={() => setShowSimDrawer(true)}>
            Switch to Sim
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          5. FLOATING RIGHT-SIDE COCKPIT HUD DOCK (MEMOIZED SUB-COMPONENTS)
         ═══════════════════════════════════════════════════════════════════════ */}
      <aside className="efb-right-hud-dock">
        <CockpitLegsDock
          legsHudMode={legsHudMode}
          onChangeLegsHudMode={setLegsHudMode}
          legs={legs}
          effectiveActiveLegIdx={effectiveActiveLegIdx}
          onSelectLeg={props.onSelectLeg}
          directToState={directToState}
          onCancelDirectTo={handleCancelDirectTo}
          onActivateDirectTo={handleActivateDirectTo}
          navSolution={navSolution}
          legAtaRecords={legAtaRecords}
          fuelUnitLabel={fuelUnitLabel}
        />

        <CockpitCommsRadar
          showRadioCard={showRadioCard}
          onToggleShowRadioCard={setShowRadioCard}
          airspaceCommsStack={airspaceCommsStack}
          onFocusHazardCoordinate={handleFocusHazardCoordinate}
          activeCom={activeCom}
          onActiveComChange={setActiveCom}
        />
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════════
          6. LIVE RUNWAY HEADWIND / CROSSWIND BREAKDOWN & VISUAL TRAFFIC CIRCUIT
         ═══════════════════════════════════════════════════════════════════════ */}
      {isNearDestination && runwayAdvisory && !isRunwayAdvisoryDismissed && (
        <LiveRunwayAdvisoryCard
          advisory={runwayAdvisory}
          distanceToDestNm={navSolution.distanceToDestNm}
          activeCircuitRunway={activeCircuitRunway}
          onToggleCircuitRunway={handleToggleCircuitRunway}
          onClose={() => setIsRunwayAdvisoryDismissed(true)}
          isMinimized={isRunwayAdvisoryMinimized}
          onToggleMinimize={() => setIsRunwayAdvisoryMinimized((p) => !p)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          7. DOCKED SKYDEMON-STYLE BOTTOM VIRTUAL RADAR STRIP
         ═══════════════════════════════════════════════════════════════════════ */}
      {showVirtualRadarStrip && props.navLog && props.navLog.legs.length > 0 && (
        <VirtualRadarStrip
          navLog={props.navLog}
          ownship={ownship}
          navSolution={navSolution}
          terrainProfile={terrainProfile}
          onClose={() => setShowVirtualRadarStrip(false)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          7. PILOT DIGITAL LOGBOOK MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      <LogbookModal isOpen={isLogbookOpen} onClose={() => setIsLogbookOpen(false)} />

      {/* ═══════════════════════════════════════════════════════════════════════
          8. LIVE ATC RADIO SPEECH-TO-TEXT & ACTIVE FREQUENCY TRACKER POP-UP
         ═══════════════════════════════════════════════════════════════════════ */}
      <AtcCommsWindow
        isOpen={isAtcCommsWindowOpen}
        onClose={() => setIsAtcCommsWindowOpen(false)}
        activeCom={activeCom}
        callsign={props.profile.tailNumber || 'CS-DXB'}
        onNotifyToast={props.onNotifyToast}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          9. PRE-FLIGHT OFFLINE PACK & HEALTH MONITOR MODAL
         ═══════════════════════════════════════════════════════════════════════ */}
      <PreflightPackModal
        isOpen={isPackModalOpen}
        onClose={() => setIsPackModalOpen(false)}
        waypoints={props.resolvedWaypoints}
        ownship={ownship}
        isWakeLocked={isWakeLocked}
        onStartLiveGps={handleStartLiveGps}
        onNotifyToast={props.onNotifyToast}
      />
    </div>
  );
};
