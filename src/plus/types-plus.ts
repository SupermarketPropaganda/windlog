import { ActiveView, Waypoint } from '../types';

export type PlusActiveView = ActiveView | 'inflight';
export type GpsSignalQuality = 'HIGH' | 'MARGINAL' | 'DEGRADED' | 'LOST';
export type TelemetrySourceMode = 'gps' | 'manual-test';
export type FlightPhase = 'PREFLIGHT' | 'TAXI' | 'AIRBORNE' | 'LANDED';

export interface OwnshipTelemetry {
  timestamp: number;               // epoch ms
  latitude: number;                // decimal degrees
  longitude: number;               // decimal degrees
  rawGpsAltitudeFt: number | null; // raw WGS84 / geoid altitude in feet
  altimeterOffsetFt: number;       // pilot-calibrated QNH barometric offset in feet
  altitudeMslFt: number | null;    // calibrated altitude (rawGpsAltitudeFt + altimeterOffsetFt)
  groundSpeedKt: number;           // knots
  trueTrackDeg: number;            // 0-360 degrees true
  magneticTrackDeg: number;        // 0-360 degrees magnetic (WMM2025)
   magneticVariationDeg: number;   // degrees (+E / -W)
  verticalSpeedFpm: number;        // feet per minute (EMA smoothed)
  horizontalAccuracyM: number;     // meters
  verticalAccuracyM: number | null;// meters
  gpsQuality: GpsSignalQuality;
  source: TelemetrySourceMode;
  flightPhase: FlightPhase;
}

export interface BreadcrumbPoint {
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  trackDeg: number;
  timestamp: number;
}

export interface DirectToState {
  targetWaypoint: Waypoint;
  originLat: number;
  originLon: number;
  originAltFt: number;
  activatedAt: number;
  targetWaypointRouteIndex: number | null; // index in resolvedWaypoints if part of route
}

export interface TrackVectorPoint {
  minutesAhead: number;
  distanceNm: number;
  latitude: number;
  longitude: number;
  predictedAltFt: number;
}

export interface NextPointTelemetry {
  waypointIndex: number;
  waypoint: Waypoint;
  role: 'ACTIVE_NEXT' | 'UPCOMING';
  distanceFromOwnshipNm: number;
  legDistanceNm: number;
  bearingTrueDeg: number;
  bearingMagDeg: number;
  eteSeconds: number;
  etaTimestamp: number | null;
  plannedAltitudeFt: number;
  requiredVsFpm: number | null;
  isDirectToTarget?: boolean;
}

export interface AltitudeCaptureArc {
  distanceAheadNm: number;
  timeToCaptureSec: number;
  targetAltitudeFt: number;
  centerLat: number;
  centerLon: number;
  arcCoords: [number, number][];
}

export type LookAheadAlertCategory = 'AIRSPACE' | 'TERRAIN' | 'GPS_INTEGRITY';
export type LookAheadAlertSeverity = 'CRITICAL' | 'WARNING' | 'CAUTION';

export interface LookAheadAlert {
  id: string;
  category: LookAheadAlertCategory;
  severity: LookAheadAlertSeverity;
  title: string;
  detail: string;
  distanceAheadNm?: number;
  timeToImpactSec?: number;
  frequency?: string;
  verticalLimits?: string;
  clearanceFt?: number;
  airspaceId?: string;
  hazardCoordinate?: [number, number];
}

export interface LegRuntimeRecord {
  legIndex: number;
  toIdentifier: string;
  ataTimestamp: number;
  altitudeAtCrossingFt: number | null;
  groundSpeedAtCrossingKt: number;
}

export interface InFlightNavSolution {
  activeLegIndex: number;
  isDirectToActive: boolean;
  directToTarget: Waypoint | null;

  // Course & Cross-Track Metrics
  crossTrackErrorNm: number;       // < 0 Left of course, > 0 Right of course
  alongTrackDistanceNm: number;    // NM along active leg
  cumulativeRouteDistNm: number;   // NM from departure along route (for 2D Altitude Profile)
  desiredTrackTrueDeg: number;
  desiredTrackMagDeg: number;
  courseDeviationDeg: number;      // difference between track and bearing to next
  closestPointOnCourse: [number, number] | null; // Perpendicular projection of PPOS onto active leg
  interceptHeadingMagDeg: number | null;         // Recommended 45° course-intercept magnetic heading when off-track

  // Active Next Waypoint Metrics
  nextWaypoint: Waypoint | null;
  distanceToNextNm: number;
  bearingToNextTrueDeg: number;
  bearingToNextMagDeg: number;
  eteToNextSec: number;
  etaNextTimestamp: number | null;

  // Destination Totals from Present Position
  distanceToDestNm: number;
  eteToDestSec: number;
  etaDestTimestamp: number | null;
  estimatedFuelRemainingAtDest: number | null;

  // Altitude & Vertical Navigation (VNAV)
  targetAltitudeFt: number;
  altitudeDeltaFt: number;         // currentAlt - targetAlt
  requiredVsNextFpm: number | null;// FPM needed to reach targetAltFt at nextWaypoint
  estimatedTerrainElevFt: number;
  estimatedAglFt: number | null;

  // Map Projections (Track Vector, Green Banana, Glide Advisor Ring, Next Points)
  trackVectorEndCoord: [number, number];
  trackVectorPoints: TrackVectorPoint[];
  altitudeCaptureArc: AltitudeCaptureArc | null;
  glideRangePolygon: [number, number][];
  avgGlideDistanceNm: number;
  nextPoints: NextPointTelemetry[];

  // Auto-Sequencing Trigger
  shouldSequenceNextLeg: boolean;

  // Visual Look-Ahead Hazard Alerts
  lookAheadAlerts: LookAheadAlert[];
}
