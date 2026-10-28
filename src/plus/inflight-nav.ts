import { Leg, NavLogSummary, Waypoint } from '../types';
import { Airspace, AIRSPACES } from '../data/airspace-data';
import { isPointInPolygon } from '../engine/airspace-engine';
import {
  INDEXED_AIRSPACES,
  isPointInIndexedAirspace,
} from './spatial-airspace-index';
import {
  greatCircleDistance,
  initialBearing,
  toDegrees,
  toRadians,
} from '../engine/coordinate-math';
import { TerrainProfileResult } from '../engine/terrain-engine';
import { magneticDeclination } from '../engine/wmm2025';
import {
  AltitudeCaptureArc,
  BreadcrumbPoint,
  DirectToState,
  InFlightNavSolution,
  LookAheadAlert,
  NextPointTelemetry,
  OwnshipTelemetry,
  TrackVectorPoint,
} from './types-plus';

const EARTH_RADIUS_NM = 3440.065;

/**
 * Projects a geographic coordinate forward along a given true bearing (degrees) and distance (NM).
 */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingTrueDeg: number,
  distanceNm: number
): { latitude: number; longitude: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { latitude: 0, longitude: 0 };
  }
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) {
    return { latitude: lat, longitude: lon };
  }
  const safeBearing = Number.isFinite(bearingTrueDeg) ? bearingTrueDeg : 0;

  const delta = distanceNm / EARTH_RADIUS_NM;
  const theta = toRadians(((safeBearing % 360) + 360) % 360);
  const phi1 = toRadians(lat);
  const lambda1 = toRadians(lon);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));

  const y = Math.sin(theta) * sinDelta * cosPhi1;
  const x = cosDelta - sinPhi1 * sinPhi2;
  const lambda2 = lambda1 + Math.atan2(y, x);

  const normLon = ((((toDegrees(lambda2) + 180) % 360) + 360) % 360) - 180;
  return {
    latitude: toDegrees(phi2),
    longitude: normLon,
  };
}

/**
 * Normalizes any angle into [0, 360).
 */
export function normalizeDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * Computes signed shortest angular difference (target - current) in [-180, +180].
 */
export function signedAngleDiffDeg(currentDeg: number, targetDeg: number): number {
  const diff = normalizeDegrees(targetDeg) - normalizeDegrees(currentDeg);
  if (diff > 180) return diff - 360;
  if (diff < -180) return diff + 360;
  return diff;
}

/**
 * Computes exact spherical Cross-Track Error (XTE) and Along-Track Distance (ATD)
 * relative to a great-circle leg from (lat1, lon1) to (lat2, lon2).
 *
 * Sign convention:
 * - crossTrackErrorNm > 0: Aircraft is RIGHT of course
 * - crossTrackErrorNm < 0: Aircraft is LEFT of course
 */
export function computeCrossTrackAndAlongTrack(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  ownLat: number,
  ownLon: number
): {
  crossTrackErrorNm: number;
  alongTrackDistanceNm: number;
  desiredTrackTrueDeg: number;
} {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2) ||
    !Number.isFinite(ownLat) ||
    !Number.isFinite(ownLon)
  ) {
    return {
      crossTrackErrorNm: 0,
      alongTrackDistanceNm: 0,
      desiredTrackTrueDeg: 0,
    };
  }

  const desiredTrackTrueDeg = initialBearing(lat1, lon1, lat2, lon2);
  const distFromStartNm = greatCircleDistance(lat1, lon1, ownLat, ownLon);

  if (distFromStartNm < 1e-5) {
    return {
      crossTrackErrorNm: 0,
      alongTrackDistanceNm: 0,
      desiredTrackTrueDeg,
    };
  }

  const bearingFromStartTrue = initialBearing(lat1, lon1, ownLat, ownLon);
  const delta13 = distFromStartNm / EARTH_RADIUS_NM;
  const theta13 = toRadians(bearingFromStartTrue);
  const theta12 = toRadians(desiredTrackTrueDeg);

  const sinXtd = Math.sin(delta13) * Math.sin(theta13 - theta12);
  const dXtRad = Math.asin(Math.max(-1, Math.min(1, sinXtd)));
  const crossTrackErrorNm = dXtRad * EARTH_RADIUS_NM;

  const cosXt = Math.cos(dXtRad);
  const cosAtd = cosXt > 1e-9 ? Math.cos(delta13) / cosXt : Math.cos(delta13);
  const dAtRad = Math.acos(Math.max(-1, Math.min(1, cosAtd)));

  // Determine if aircraft is behind the start point (angle > 90 deg)
  const relAngle = Math.abs(signedAngleDiffDeg(desiredTrackTrueDeg, bearingFromStartTrue));
  const signAtd = relAngle > 90 ? -1 : 1;
  const alongTrackDistanceNm = signAtd * dAtRad * EARTH_RADIUS_NM;

  return {
    crossTrackErrorNm,
    alongTrackDistanceNm,
    desiredTrackTrueDeg,
  };
}

/**
 * Generates future Track Vector ticks along the aircraft's current ground track and vertical speed.
 */
export function computeTrackVectorPoints(
  ownLat: number,
  ownLon: number,
  trueTrackDeg: number,
  groundSpeedKt: number,
  currentAltFt: number,
  verticalSpeedFpm: number,
  lookAheadMinutes: number = 5
): TrackVectorPoint[] {
  if (!Number.isFinite(ownLat) || !Number.isFinite(ownLon)) return [];
  const safeTrack = Number.isFinite(trueTrackDeg) ? trueTrackDeg : 0;
  const safeAlt = Number.isFinite(currentAltFt) ? currentAltFt : 0;
  const safeVs = Number.isFinite(verticalSpeedFpm) ? verticalSpeedFpm : 0;
  const effectiveGs = Math.max(0, Number.isFinite(groundSpeedKt) ? groundSpeedKt : 0);
  if (effectiveGs < 5 || lookAheadMinutes <= 0) return [];

  const candidateMinutes = [1, 2, 3, 5, 10].filter((m) => m <= lookAheadMinutes);
  if (!candidateMinutes.includes(lookAheadMinutes) && lookAheadMinutes > 0) {
    candidateMinutes.push(lookAheadMinutes);
    candidateMinutes.sort((a, b) => a - b);
  }

  return candidateMinutes.map((mins) => {
    const distanceNm = (effectiveGs * mins) / 60;
    const coord = destinationPoint(ownLat, ownLon, safeTrack, distanceNm);
    const predictedAltFt = Math.max(-2000, Math.round(safeAlt + safeVs * mins));
    return {
      minutesAhead: mins,
      distanceNm,
      latitude: coord.latitude,
      longitude: coord.longitude,
      predictedAltFt,
    };
  });
}

/**
 * Computes the ForeFlight-style "Green Banana" Altitude Range Capture Arc.
 * Shows the geographic arc along the track vector where the aircraft will reach targetAltitudeFt
 * at its current verticalSpeedFpm and groundSpeedKt.
 */
export function computeAltitudeCaptureArc(
  ownLat: number,
  ownLon: number,
  trueTrackDeg: number,
  groundSpeedKt: number,
  currentAltFt: number | null,
  targetAltitudeFt: number,
  verticalSpeedFpm: number
): AltitudeCaptureArc | null {
  if (currentAltFt === null || !Number.isFinite(currentAltFt)) return null;
  if (
    !Number.isFinite(ownLat) ||
    !Number.isFinite(ownLon) ||
    !Number.isFinite(trueTrackDeg) ||
    !Number.isFinite(groundSpeedKt) ||
    !Number.isFinite(targetAltitudeFt) ||
    !Number.isFinite(verticalSpeedFpm)
  ) {
    return null;
  }
  if (groundSpeedKt < 20) return null;

  const altDiffFt = targetAltitudeFt - currentAltFt;
  if (Math.abs(altDiffFt) < 60) return null; // Already captured target altitude

  // Must be climbing toward a higher altitude or descending toward a lower altitude
  const isClimbingToTarget = altDiffFt > 0 && verticalSpeedFpm >= 75;
  const isDescendingToTarget = altDiffFt < 0 && verticalSpeedFpm <= -75;
  if (!isClimbingToTarget && !isDescendingToTarget) return null;

  const minutesToCapture = altDiffFt / verticalSpeedFpm;
  if (!Number.isFinite(minutesToCapture) || minutesToCapture <= 0.1 || minutesToCapture > 35) return null;

  const distanceAheadNm = (groundSpeedKt * minutesToCapture) / 60;
  if (!Number.isFinite(distanceAheadNm) || distanceAheadNm < 0.25 || distanceAheadNm > 80) return null;

  const center = destinationPoint(ownLat, ownLon, trueTrackDeg, distanceAheadNm);

  // Build a curved banana bracket spanning ±22 degrees around the track vector from ownship
  const arcAngles = [-22, -15, -8, 0, 8, 15, 22];
  const arcCoords: [number, number][] = arcAngles.map((offsetDeg) => {
    // Curve the outer tips slightly inward (0.94 factor at edges) for the classic banana shape
    const curvatureFactor = 1 - 0.06 * Math.pow(offsetDeg / 22, 2);
    const pt = destinationPoint(
      ownLat,
      ownLon,
      trueTrackDeg + offsetDeg,
      distanceAheadNm * curvatureFactor
    );
    return [pt.latitude, pt.longitude];
  });

  return {
    distanceAheadNm,
    timeToCaptureSec: Math.round(minutesToCapture * 60),
    targetAltitudeFt,
    centerLat: center.latitude,
    centerLon: center.longitude,
    arcCoords,
  };
}

/**
 * Determines if the active route leg should automatically sequence to the next leg.
 * Advances when inside the 0.85 NM capture cylinder or crossing the waypoint abeam bisector.
 */
export function checkAutoLegSequencing(
  activeLeg: Leg,
  hasNextLeg: boolean,
  alongTrackDistanceNm: number,
  crossTrackErrorNm: number,
  distanceToNextWaypointNm: number
): boolean {
  if (!hasNextLeg) return false;
  if (!Number.isFinite(distanceToNextWaypointNm)) return false;

  // 1. Inside 0.85 NM capture cylinder of the active leg's TO waypoint
  if (distanceToNextWaypointNm <= 0.85) {
    return true;
  }

  // 2. Passed abeam the waypoint within a 2.5 NM lateral corridor (bounded forward window to prevent triggering 100 NM away)
  if (
    activeLeg.distance > 0.5 &&
    Number.isFinite(alongTrackDistanceNm) &&
    Number.isFinite(crossTrackErrorNm) &&
    alongTrackDistanceNm >= activeLeg.distance &&
    alongTrackDistanceNm <= activeLeg.distance + 4.0 &&
    Math.abs(crossTrackErrorNm) <= 2.5
  ) {
    return true;
  }

  return false;
}

/**
 * Estimates terrain elevation (feet MSL) at a given cumulative distance or coordinate
 * using the cached/fetched TerrainProfileResult or nearest route waypoint elevations.
 */
export function estimateTerrainElevationFt(
  lat: number,
  lon: number,
  cumulativeRouteDistNm: number,
  terrainProfile: TerrainProfileResult | null,
  waypoints: Waypoint[]
): number {
  if (terrainProfile && terrainProfile.samples.length > 0) {
    // Find closest terrain sample by geographic distance first
    let bestSample = terrainProfile.samples[0];
    let minDist = Infinity;
    for (const s of terrainProfile.samples) {
      const d = Math.hypot(s.latitude - lat, s.longitude - lon);
      if (d < minDist) {
        minDist = d;
        bestSample = s;
      }
    }
    // If within ~8 NM of the route sample, use it directly
    if (minDist < 0.14) {
      return bestSample.elevationFt;
    }

    // Fallback to cumulative distance match along route
    let byDist = terrainProfile.samples[0];
    let minRouteDiff = Infinity;
    for (const s of terrainProfile.samples) {
      const diff = Math.abs(s.distNm - cumulativeRouteDistNm);
      if (diff < minRouteDiff) {
        minRouteDiff = diff;
        byDist = s;
      }
    }
    return byDist.elevationFt;
  }

  // Fallback to nearest waypoint elevation if no DEM profile loaded
  if (waypoints.length > 0) {
    let nearestElev = waypoints[0].elevation ?? 0;
    let minWptDist = Infinity;
    for (const wp of waypoints) {
      const d = greatCircleDistance(lat, lon, wp.latitude, wp.longitude);
      if (d < minWptDist) {
        minWptDist = d;
        nearestElev = wp.elevation ?? 0;
      }
    }
    return Number.isFinite(nearestElev) ? nearestElev : 0;
  }

  return 0;
}

/**
 * Evaluates visual-only Look-Ahead Airspace, Terrain, and GPS Integrity alerts
 * based on the aircraft's current 3D state and its 2-to-5 minute projected trajectory.
 */
export function evaluateLookAheadAlerts(
  ownship: OwnshipTelemetry,
  waypoints: Waypoint[],
  cumulativeRouteDistNm: number,
  terrainProfile: TerrainProfileResult | null,
  airspaces: Airspace[] = AIRSPACES,
  lookAheadMinutes: number = 5
): LookAheadAlert[] {
  const alerts: LookAheadAlert[] = [];
  const seenAirspaceIds = new Set<string>();

  // 1. GPS Integrity Watchdog Alert
  if (ownship.source === 'gps') {
    if (ownship.gpsQuality === 'LOST') {
      alerts.push({
        id: 'gps-lost',
        category: 'GPS_INTEGRITY',
        severity: 'CRITICAL',
        title: 'GPS POSITION LOST — NO RECENT FIX',
        detail:
          'Hardware GPS position has not updated recently. Do not rely on moving map ownship position until GNSS lock is restored.',
      });
    } else if (ownship.gpsQuality === 'DEGRADED') {
      alerts.push({
        id: 'gps-degraded',
        category: 'GPS_INTEGRITY',
        severity: 'WARNING',
        title: `LOW GPS ACCURACY (±${Math.round(ownship.horizontalAccuracyM)}m)`,
        detail:
          'Coarse network/Wi-Fi location detected. Pair an external WAAS/Bluetooth GPS or use a cellular-capable tablet with hardware GNSS.',
      });
    }
  }

  const currentAltFt = ownship.altitudeMslFt ?? 0;
  const gsKt = ownship.groundSpeedKt;

  // Check if aircraft is within 2.0 NM of departure or destination airport (suppress nuisance low-altitude terrain warnings during takeoff/landing roll)
  const depWpt = waypoints[0];
  const destWpt = waypoints[waypoints.length - 1];
  const distFromDepNm = depWpt
    ? greatCircleDistance(ownship.latitude, ownship.longitude, depWpt.latitude, depWpt.longitude)
    : Infinity;
  const distFromDestNm = destWpt
    ? greatCircleDistance(ownship.latitude, ownship.longitude, destWpt.latitude, destWpt.longitude)
    : Infinity;
  const isInAirportTrafficVicinity = distFromDepNm < 1.8 || distFromDestNm < 1.8;

  // 2. Present & Look-Ahead Terrain Alert Check
  if (ownship.altitudeMslFt !== null && !isInAirportTrafficVicinity && gsKt >= 25) {
    const currentTerrainFt = estimateTerrainElevationFt(
      ownship.latitude,
      ownship.longitude,
      cumulativeRouteDistNm,
      terrainProfile,
      waypoints
    );
    const currentClearanceFt = Math.round(currentAltFt - currentTerrainFt);

    // Also sample 2 minutes ahead along track
    const dist2MinNm = (gsKt * 2) / 60;
    const coord2Min = destinationPoint(
      ownship.latitude,
      ownship.longitude,
      ownship.trueTrackDeg,
      dist2MinNm
    );
    const alt2MinFt = currentAltFt + ownship.verticalSpeedFpm * 2;
    const terrain2MinFt = estimateTerrainElevationFt(
      coord2Min.latitude,
      coord2Min.longitude,
      cumulativeRouteDistNm + dist2MinNm,
      terrainProfile,
      waypoints
    );
    const clearance2MinFt = Math.round(alt2MinFt - terrain2MinFt);

    const worstClearanceFt = Math.min(currentClearanceFt, clearance2MinFt);
    const isProjectedHazard = clearance2MinFt < currentClearanceFt;

    if (worstClearanceFt < 500) {
      alerts.push({
        id: 'terrain-critical',
        category: 'TERRAIN',
        severity: 'CRITICAL',
        title:
          worstClearanceFt <= 100
            ? 'TERRAIN OBSTACLE WARNING — PULL UP'
            : 'LOW TERRAIN CLEARANCE (< 500 FT AGL)',
        detail: isProjectedHazard
          ? `Projected 2-minute flight path drops to ${worstClearanceFt} ft AGL (Terrain ahead: ${terrain2MinFt.toLocaleString()} ft MSL). Climb immediately.`
          : `Current terrain clearance is ${currentClearanceFt} ft AGL over ${currentTerrainFt.toLocaleString()} ft MSL elevation.`,
        distanceAheadNm: isProjectedHazard ? dist2MinNm : 0,
        timeToImpactSec: isProjectedHazard ? 120 : 0,
        clearanceFt: worstClearanceFt,
        hazardCoordinate: isProjectedHazard
          ? [coord2Min.latitude, coord2Min.longitude]
          : [ownship.latitude, ownship.longitude],
      });
    } else if (worstClearanceFt < 1000) {
      alerts.push({
        id: 'terrain-caution',
        category: 'TERRAIN',
        severity: 'CAUTION',
        title: `TERRAIN PROXIMITY CAUTION (+${worstClearanceFt} FT AGL)`,
        detail: isProjectedHazard
          ? `Rising terrain ahead (${terrain2MinFt.toLocaleString()} ft MSL in ${dist2MinNm.toFixed(1)} NM) reduces vertical buffer below 1,000 ft AGL.`
          : `Cruising ${currentClearanceFt} ft AGL above ${currentTerrainFt.toLocaleString()} ft MSL terrain.`,
        distanceAheadNm: isProjectedHazard ? dist2MinNm : 0,
        clearanceFt: worstClearanceFt,
        hazardCoordinate: isProjectedHazard
          ? [coord2Min.latitude, coord2Min.longitude]
          : [ownship.latitude, ownship.longitude],
      });
    }
  }

  // 3. Present Position & Look-Ahead Airspace Scanner (AABB Spatial Index Accelerated)
  const ownCoord: [number, number] = [ownship.latitude, ownship.longitude];
  const sampleFractionsMin = [0.5, 1, 1.5, 2, 3, 4, 5].filter((m) => m <= lookAheadMinutes);
  const useDefaultSpatialIndex = airspaces === AIRSPACES;

  // Pre-compute forward sample coordinates once per tick instead of per airspace
  let minSampleAlt = currentAltFt;
  let maxSampleAlt = currentAltFt;
  const forwardSamples =
    gsKt >= 15
      ? sampleFractionsMin.map((minsAhead) => {
          const distNm = (gsKt * minsAhead) / 60;
          const projPt = destinationPoint(
            ownship.latitude,
            ownship.longitude,
            ownship.trueTrackDeg,
            distNm
          );
          const projAltFt = currentAltFt + ownship.verticalSpeedFpm * minsAhead;
          if (projAltFt < minSampleAlt) minSampleAlt = projAltFt;
          if (projAltFt > maxSampleAlt) maxSampleAlt = projAltFt;
          return {
            minsAhead,
            distNm,
            projCoord: [projPt.latitude, projPt.longitude] as [number, number],
            projAltFt,
          };
        })
      : [];

  for (let i = 0; i < airspaces.length; i++) {
    const as = airspaces[i];
    if (!as.polygon || as.polygon.length < 3) continue;
    const indexed = useDefaultSpatialIndex ? INDEXED_AIRSPACES[i] : null;

    const isRestrictedOrProhibited = as.type === 'PROHIBITED' || as.type === 'RESTRICTED';
    const limitsStr = `${as.lowerLimitLabel} – ${as.upperLimitLabel}`;

    // 3A. Check if aircraft is vertically in range of present airspace (-500ft buffer to +500ft buffer)
    const canOverlapPposVertically =
      currentAltFt >= as.lowerLimitFt - 500 && currentAltFt <= as.upperLimitFt + 500;

    if (canOverlapPposVertically) {
      const isInsidePpos = indexed
        ? isPointInIndexedAirspace(ownCoord, indexed)
        : isPointInPolygon(ownCoord, as.polygon);

      if (isInsidePpos) {
        if (currentAltFt >= as.lowerLimitFt && currentAltFt <= as.upperLimitFt) {
          seenAirspaceIds.add(as.id);
          alerts.push({
            id: `as-inside-${as.id}`,
            category: 'AIRSPACE',
            severity: isRestrictedOrProhibited ? 'CRITICAL' : 'WARNING',
            title: `ACTIVE AIRSPACE: INSIDE ${as.name}`,
            detail: isRestrictedOrProhibited
              ? `Aircraft is inside ${as.type} sector (${limitsStr}) at ${Math.round(currentAltFt).toLocaleString()} ft MSL. Verify authorization immediately!`
              : `Operating inside Class ${as.classification} ${as.type} (${limitsStr}) at ${Math.round(currentAltFt).toLocaleString()} ft MSL. Two-way comms required.`,
            distanceAheadNm: 0,
            timeToImpactSec: 0,
            frequency: as.frequency,
            verticalLimits: limitsStr,
            airspaceId: as.id,
            hazardCoordinate: ownCoord,
          });
          continue;
        }

        // Check if vertically within 500 ft of floor or ceiling while laterally inside
        const distBelowFloor = as.lowerLimitFt - currentAltFt;
        const distAboveCeiling = currentAltFt - as.upperLimitFt;
        if (
          (distBelowFloor > 0 && distBelowFloor <= 500) ||
          (distAboveCeiling > 0 && distAboveCeiling <= 500)
        ) {
          seenAirspaceIds.add(as.id);
          const bufferFt = Math.round(
            distBelowFloor > 0 ? distBelowFloor : distAboveCeiling
          );
          alerts.push({
            id: `as-buffer-${as.id}`,
            category: 'AIRSPACE',
            severity: 'CAUTION',
            title: `VERTICAL AIRSPACE BUFFER: ${as.name} (${bufferFt} FT)`,
            detail:
              distBelowFloor > 0
                ? `Flying directly beneath ${as.name} floor (${as.lowerLimitLabel}) with ${bufferFt} ft vertical margin.`
                : `Flying directly above ${as.name} ceiling (${as.upperLimitLabel}) with ${bufferFt} ft vertical margin.`,
            distanceAheadNm: 0,
            frequency: as.frequency,
            verticalLimits: limitsStr,
            clearanceFt: bufferFt,
            airspaceId: as.id,
            hazardCoordinate: ownCoord,
          });
          continue;
        }
      }
    }

    // 3B. Look-Ahead Track Vector Projection (when moving >= 15 kt)
    if (forwardSamples.length > 0 && !seenAirspaceIds.has(as.id)) {
      const canPenetrateLookAhead =
        maxSampleAlt >= as.lowerLimitFt - 250 &&
        minSampleAlt <= as.upperLimitFt + 250;

      if (canPenetrateLookAhead) {
        for (let s = 0; s < forwardSamples.length; s++) {
          const sample = forwardSamples[s];
          const willPenetrateVertically =
            sample.projAltFt >= as.lowerLimitFt - 250 &&
            sample.projAltFt <= as.upperLimitFt + 250;

          if (!willPenetrateVertically) continue;

          const isHit = indexed
            ? isPointInIndexedAirspace(sample.projCoord, indexed)
            : isPointInPolygon(sample.projCoord, as.polygon);

          if (isHit) {
            seenAirspaceIds.add(as.id);
            const timeSec = Math.round(sample.minsAhead * 60);
            alerts.push({
              id: `as-lookahead-${as.id}`,
              category: 'AIRSPACE',
              severity: isRestrictedOrProhibited ? 'CRITICAL' : 'WARNING',
              title: `AIRSPACE AHEAD: ${as.name} IN ${sample.distNm.toFixed(1)} NM`,
              detail: `Projected track enters ${as.type} (Class ${as.classification}, ${limitsStr}) in ${Math.floor(timeSec / 60)}m ${(timeSec % 60).toString().padStart(2, '0')}s at ~${Math.round(sample.projAltFt).toLocaleString()} ft MSL.`,
              distanceAheadNm: sample.distNm,
              timeToImpactSec: timeSec,
              frequency: as.frequency,
              verticalLimits: limitsStr,
              airspaceId: as.id,
              hazardCoordinate: sample.projCoord,
            });
          }
          break;
        }
      }
    }
  }

  // Sort alerts: CRITICAL first, then WARNING, then CAUTION
  const severityRank: Record<string, number> = {
    CRITICAL: 0,
    WARNING: 1,
    CAUTION: 2,
  };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return alerts;
}

/**
 * Master In-Flight Navigation & Situational Awareness Solver.
 * Computes live XTE, ATD, Next-Points telemetry, Track Vector, Green Banana,
 * Auto-Leg Sequencing, and Look-Ahead Visual Alerts in < 1ms.
 */
export function computeInFlightNavSolution(params: {
  ownship: OwnshipTelemetry;
  navLog: NavLogSummary | null;
  waypoints: Waypoint[];
  activeLegIndex: number | null;
  directToState: DirectToState | null;
  terrainProfile: TerrainProfileResult | null;
  lookAheadMinutes: number;
  fuelRemainingGalOrL?: number | null;
  fuelFlowPerHour?: number;
}): InFlightNavSolution {
  const {
    ownship,
    navLog,
    waypoints,
    activeLegIndex,
    directToState,
    terrainProfile,
    lookAheadMinutes,
    fuelRemainingGalOrL,
    fuelFlowPerHour = 0,
  } = params;

  const legs = navLog?.legs ?? [];
  const safeLegIdx =
    legs.length > 0
      ? Math.max(0, Math.min(legs.length - 1, activeLegIndex ?? 0))
      : 0;
  const activeLeg: Leg | null = legs[safeLegIdx] ?? null;

  // Determine effective Ground Speed (use live GPS GS if moving >= 20 kt, else planned leg GS for pre-takeoff preview)
  const effectiveGsKt =
    ownship.groundSpeedKt >= 20
      ? ownship.groundSpeedKt
      : activeLeg?.groundSpeed || 100;

  // 1. Determine Active Course Segment (Normal Route Leg vs. Active Direct-To)
  let fromLat = ownship.latitude;
  let fromLon = ownship.longitude;
  let toWaypoint: Waypoint | null = null;
  let targetAltitudeFt = activeLeg?.altitude ?? 3500;

  if (directToState) {
    fromLat = directToState.originLat;
    fromLon = directToState.originLon;
    toWaypoint = directToState.targetWaypoint;
    // If target waypoint corresponds to a leg in the route, use that leg's planned altitude
    if (
      directToState.targetWaypointRouteIndex !== null &&
      directToState.targetWaypointRouteIndex > 0 &&
      legs[directToState.targetWaypointRouteIndex - 1]
    ) {
      targetAltitudeFt = legs[directToState.targetWaypointRouteIndex - 1].altitude;
    }
  } else if (activeLeg) {
    fromLat = activeLeg.from.latitude;
    fromLon = activeLeg.from.longitude;
    toWaypoint = activeLeg.to;
    targetAltitudeFt = activeLeg.altitude;
  } else if (waypoints.length > 0) {
    toWaypoint = waypoints[waypoints.length - 1];
  }

  // 2. Cross-Track Error & Along-Track Distance
  let crossTrackErrorNm = 0;
  let alongTrackDistanceNm = 0;
  let desiredTrackTrueDeg = ownship.trueTrackDeg;

  if (toWaypoint) {
    const xteResult = computeCrossTrackAndAlongTrack(
      fromLat,
      fromLon,
      toWaypoint.latitude,
      toWaypoint.longitude,
      ownship.latitude,
      ownship.longitude
    );
    crossTrackErrorNm = xteResult.crossTrackErrorNm;
    alongTrackDistanceNm = xteResult.alongTrackDistanceNm;
    desiredTrackTrueDeg = xteResult.desiredTrackTrueDeg;
  }

  const magVar =
    ownship.magneticVariationDeg ??
    magneticDeclination(
      ownship.latitude,
      ownship.longitude,
      ownship.altitudeMslFt ?? targetAltitudeFt
    );
  const desiredTrackMagDeg = normalizeDegrees(desiredTrackTrueDeg - magVar);

  // 3. Cumulative Route Distance (for plotting live aircraft on 2D Vertical Profile)
  let cumulativePriorLegsNm = 0;
  for (let i = 0; i < safeLegIdx; i++) {
    cumulativePriorLegsNm += legs[i]?.distance ?? 0;
  }
  const activeLegLenNm = activeLeg?.distance ?? 0;
  const clampedAtd =
    activeLegLenNm > 0
      ? Math.max(0, Math.min(activeLegLenNm, alongTrackDistanceNm))
      : 0;
  const cumulativeRouteDistNm = cumulativePriorLegsNm + clampedAtd;

  // Compute Closest Perpendicular Point on the Active Course Line + Course Intercept Heading when Off-Track
  let closestPointOnCourse: [number, number] | null = null;
  let interceptHeadingMagDeg: number | null = null;
  if (toWaypoint && Math.abs(crossTrackErrorNm) >= 0.2) {
    const courseSpanNm =
      activeLegLenNm > 0
        ? activeLegLenNm
        : greatCircleDistance(fromLat, fromLon, toWaypoint.latitude, toWaypoint.longitude);
    const projDistAlongCourseNm = Math.max(
      0,
      Math.min(courseSpanNm, alongTrackDistanceNm)
    );
    const closestPt = destinationPoint(
      fromLat,
      fromLon,
      desiredTrackTrueDeg,
      projDistAlongCourseNm
    );
    closestPointOnCourse = [closestPt.latitude, closestPt.longitude];

    // Proportional intercept cut angle up to 45° back toward course
    const interceptAngleDeg = Math.min(
      45,
      Math.max(15, Math.round(Math.abs(crossTrackErrorNm) * 25))
    );
    interceptHeadingMagDeg = normalizeDegrees(
      desiredTrackMagDeg + (crossTrackErrorNm > 0 ? -interceptAngleDeg : interceptAngleDeg)
    );
  }

  // 4. Distance, Bearing & ETE to Active Next Waypoint
  const distanceToNextNm = toWaypoint
    ? greatCircleDistance(
        ownship.latitude,
        ownship.longitude,
        toWaypoint.latitude,
        toWaypoint.longitude
      )
    : 0;
  const bearingToNextTrueDeg = toWaypoint
    ? initialBearing(
        ownship.latitude,
        ownship.longitude,
        toWaypoint.latitude,
        toWaypoint.longitude
      )
    : ownship.trueTrackDeg;
  const bearingToNextMagDeg = normalizeDegrees(bearingToNextTrueDeg - magVar);
  const courseDeviationDeg = signedAngleDiffDeg(
    ownship.trueTrackDeg,
    bearingToNextTrueDeg
  );

  const eteToNextSec =
    effectiveGsKt > 5 && Number.isFinite(distanceToNextNm)
      ? (distanceToNextNm / effectiveGsKt) * 3600
      : 0;
  const nowMs =
    Number.isFinite(ownship.timestamp) && ownship.timestamp > 0
      ? ownship.timestamp
      : Date.now();
  const etaNextTimestamp =
    Number.isFinite(eteToNextSec) && eteToNextSec > 0 && eteToNextSec < 86400 * 30
      ? nowMs + Math.round(eteToNextSec * 1000)
      : null;

  // 5. Required Vertical Speed (VSR) to reach targetAltitudeFt at nextWaypoint
  const currentAltFt = ownship.altitudeMslFt ?? targetAltitudeFt;
  const altitudeDeltaFt = currentAltFt - targetAltitudeFt;
  let requiredVsNextFpm: number | null = null;
  if (Number.isFinite(eteToNextSec) && eteToNextSec > 15 && Math.abs(altitudeDeltaFt) >= 30) {
    const minutesToNext = eteToNextSec / 60;
    const rawVsr = (targetAltitudeFt - currentAltFt) / minutesToNext;
    requiredVsNextFpm = Number.isFinite(rawVsr) ? Math.round(rawVsr) : null;
  }

  // 6. Build Next-Points Array (Active Next Waypoint + Upcoming Downstream Waypoints)
  const nextPoints: NextPointTelemetry[] = [];
  let runningDistNm = distanceToNextNm;
  let runningEteSec = eteToNextSec;

  if (toWaypoint) {
    const activeLegSpanNm = directToState
      ? greatCircleDistance(fromLat, fromLon, toWaypoint.latitude, toWaypoint.longitude)
      : activeLeg?.distance ?? distanceToNextNm;

    nextPoints.push({
      waypointIndex: directToState
        ? directToState.targetWaypointRouteIndex ?? safeLegIdx + 1
        : safeLegIdx + 1,
      waypoint: toWaypoint,
      role: 'ACTIVE_NEXT',
      distanceFromOwnshipNm: distanceToNextNm,
      legDistanceNm: activeLegSpanNm,
      bearingTrueDeg: bearingToNextTrueDeg,
      bearingMagDeg: bearingToNextMagDeg,
      eteSeconds: eteToNextSec,
      etaTimestamp: etaNextTimestamp,
      plannedAltitudeFt: targetAltitudeFt,
      requiredVsFpm: requiredVsNextFpm,
      isDirectToTarget: Boolean(directToState),
    });

    // Add downstream route legs after the current target waypoint
    const startDownstreamLegIdx = directToState
      ? directToState.targetWaypointRouteIndex !== null
        ? directToState.targetWaypointRouteIndex
        : legs.length
      : safeLegIdx + 1;

    for (let i = startDownstreamLegIdx; i < legs.length; i++) {
      const downstreamLeg = legs[i];
      if (!downstreamLeg) continue;
      runningDistNm += downstreamLeg.distance;
      const legGs =
        ownship.groundSpeedKt >= 20
          ? ownship.groundSpeedKt
          : downstreamLeg.groundSpeed || effectiveGsKt;
      const legEte =
        legGs > 5 && Number.isFinite(downstreamLeg.distance)
          ? (downstreamLeg.distance / legGs) * 3600
          : 0;
      runningEteSec += legEte;

      const directDistFromOwnship = greatCircleDistance(
        ownship.latitude,
        ownship.longitude,
        downstreamLeg.to.latitude,
        downstreamLeg.to.longitude
      );
      const brgTrue = initialBearing(
        ownship.latitude,
        ownship.longitude,
        downstreamLeg.to.latitude,
        downstreamLeg.to.longitude
      );
      const brgMag = normalizeDegrees(brgTrue - magVar);

      nextPoints.push({
        waypointIndex: i + 1,
        waypoint: downstreamLeg.to,
        role: 'UPCOMING',
        distanceFromOwnshipNm: directDistFromOwnship,
        legDistanceNm: downstreamLeg.distance,
        bearingTrueDeg: brgTrue,
        bearingMagDeg: brgMag,
        eteSeconds: runningEteSec,
        etaTimestamp:
          Number.isFinite(runningEteSec) && runningEteSec > 0 && runningEteSec < 86400 * 30
            ? nowMs + Math.round(runningEteSec * 1000)
            : null,
        plannedAltitudeFt: downstreamLeg.altitude,
        requiredVsFpm:
          runningEteSec > 30
            ? Math.round(
                (downstreamLeg.altitude - currentAltFt) / (runningEteSec / 60)
              )
            : null,
        isDirectToTarget: false,
      });
    }
  }

  const distanceToDestNm = runningDistNm;
  const eteToDestSec = runningEteSec;
  const etaDestTimestamp =
    Number.isFinite(eteToDestSec) && eteToDestSec > 0 && eteToDestSec < 86400 * 30
      ? nowMs + Math.round(eteToDestSec * 1000)
      : null;

  const estimatedFuelRemainingAtDest =
    fuelRemainingGalOrL !== undefined &&
    fuelRemainingGalOrL !== null &&
    fuelFlowPerHour > 0 &&
    Number.isFinite(eteToDestSec)
      ? Math.max(0, fuelRemainingGalOrL - (eteToDestSec / 3600) * fuelFlowPerHour)
      : null;

  // 7. Terrain Elevation & AGL Calculation
  const estimatedTerrainElevFt = estimateTerrainElevationFt(
    ownship.latitude,
    ownship.longitude,
    cumulativeRouteDistNm,
    terrainProfile,
    waypoints
  );
  const estimatedAglFt =
    ownship.altitudeMslFt !== null && Number.isFinite(ownship.altitudeMslFt)
      ? Math.round(ownship.altitudeMslFt - estimatedTerrainElevFt)
      : null;

  // 8. Track Vector & Altitude Capture Arc ("Green Banana")
  const trackVectorPoints = computeTrackVectorPoints(
    ownship.latitude,
    ownship.longitude,
    ownship.trueTrackDeg,
    effectiveGsKt,
    currentAltFt,
    ownship.verticalSpeedFpm,
    lookAheadMinutes
  );

  const vectorEndDistNm = (effectiveGsKt * lookAheadMinutes) / 60;
  const vectorEndPt = destinationPoint(
    ownship.latitude,
    ownship.longitude,
    ownship.trueTrackDeg,
    vectorEndDistNm
  );
  const trackVectorEndCoord: [number, number] = [
    vectorEndPt.latitude,
    vectorEndPt.longitude,
  ];

  const altitudeCaptureArc = computeAltitudeCaptureArc(
    ownship.latitude,
    ownship.longitude,
    ownship.trueTrackDeg,
    effectiveGsKt,
    ownship.altitudeMslFt,
    targetAltitudeFt,
    ownship.verticalSpeedFpm
  );

  // 8B. Wind- and AGL-Adjusted Glide Advisor Range Ring (36-Ray Azimuth Polygon)
  const usableGlideAglFt =
    Number.isFinite(estimatedAglFt) && estimatedAglFt !== null
      ? Math.max(0, estimatedAglFt - 300)
      : Math.max(0, 2500 - 300);
  const baseGlideRatio = 9.2; // Standard single-engine piston best glide L/D (~9.2:1)
  const bestGlideSpeedKt = 68;
  const windFromDeg = Number.isFinite(activeLeg?.wind?.direction)
    ? (activeLeg?.wind?.direction ?? 0)
    : 0;
  const windSpdKt = Number.isFinite(activeLeg?.wind?.speed)
    ? Math.max(0, activeLeg?.wind?.speed ?? 0)
    : 0;
  const glideRangePolygon: [number, number][] = [];
  let sumGlideDistNm = 0;

  if (usableGlideAglFt >= 250) {
    const stillAirGlideNm = (usableGlideAglFt / 6076.115) * baseGlideRatio;
    const windFromRad = toRadians(windFromDeg);
    for (let deg = 0; deg <= 360; deg += 10) {
      const rayRad = toRadians(deg % 360);
      // Tailwind component along this ray (wind is FROM windFromDeg)
      const tailwindKt = -windSpdKt * Math.cos(rayRad - windFromRad);
      const groundSpeedInGlideKt = Math.max(25, bestGlideSpeedKt + tailwindKt);
      const rayDistNm = Math.max(
        0.4,
        stillAirGlideNm * (groundSpeedInGlideKt / bestGlideSpeedKt)
      );
      if (deg < 360) sumGlideDistNm += rayDistNm;
      const pt = destinationPoint(ownship.latitude, ownship.longitude, deg % 360, rayDistNm);
      glideRangePolygon.push([pt.latitude, pt.longitude]);
    }
  }
  const avgGlideDistanceNm =
    glideRangePolygon.length > 0 ? sumGlideDistNm / 36 : 0;

  // 9. Auto-Sequencing Check
  const hasNextLeg = directToState
    ? directToState.targetWaypointRouteIndex !== null &&
      directToState.targetWaypointRouteIndex < legs.length
    : safeLegIdx < legs.length - 1;

  const effectiveLegForSequencing: Leg | null = directToState && toWaypoint
    ? {
        id: 'direct-to-active',
        from: {
          id: -1,
          identifier: 'DCT_ORIGIN',
          name: 'Direct-To Origin',
          type: 'fix' as const,
          country: '',
          latitude: fromLat,
          longitude: fromLon,
          elevation: directToState.originAltFt,
        } as unknown as Waypoint,
        to: toWaypoint,
        altitude: targetAltitudeFt,
        trueTrack: desiredTrackTrueDeg,
        distance: greatCircleDistance(fromLat, fromLon, toWaypoint.latitude, toWaypoint.longitude),
        windCorrectionAngle: 0,
        trueHeading: desiredTrackTrueDeg,
        magneticVariation: magVar,
        magneticHeading: desiredTrackMagDeg,
        groundSpeed: effectiveGsKt,
        ete: eteToNextSec,
        fuelBurn: 0,
      }
    : activeLeg;

  const shouldSequenceNextLeg = effectiveLegForSequencing
    ? checkAutoLegSequencing(
        effectiveLegForSequencing,
        hasNextLeg,
        alongTrackDistanceNm,
        crossTrackErrorNm,
        distanceToNextNm
      )
    : false;

  // 10. Visual Look-Ahead Airspace & Terrain Alerts
  const lookAheadAlerts = evaluateLookAheadAlerts(
    ownship,
    waypoints,
    cumulativeRouteDistNm,
    terrainProfile,
    AIRSPACES,
    lookAheadMinutes
  );

  return {
    activeLegIndex: safeLegIdx,
    isDirectToActive: Boolean(directToState),
    directToTarget: directToState?.targetWaypoint ?? null,
    crossTrackErrorNm,
    alongTrackDistanceNm,
    cumulativeRouteDistNm,
    desiredTrackTrueDeg,
    desiredTrackMagDeg,
    courseDeviationDeg,
    closestPointOnCourse,
    interceptHeadingMagDeg,
    nextWaypoint: toWaypoint,
    distanceToNextNm,
    bearingToNextTrueDeg,
    bearingToNextMagDeg,
    eteToNextSec,
    etaNextTimestamp,
    distanceToDestNm,
    eteToDestSec,
    etaDestTimestamp,
    estimatedFuelRemainingAtDest,
    targetAltitudeFt,
    altitudeDeltaFt,
    requiredVsNextFpm,
    estimatedTerrainElevFt,
    estimatedAglFt,
    trackVectorEndCoord,
    trackVectorPoints,
    altitudeCaptureArc,
    glideRangePolygon,
    avgGlideDistanceNm,
    nextPoints,
    shouldSequenceNextLeg,
    lookAheadAlerts,
  };
}

/**
 * Serializes recorded BreadcrumbPoint[] into a standard GPX 1.1 XML document
 * for post-flight debriefing in ForeFlight, CloudAhoy, or Google Earth.
 */
export function exportBreadcrumbsToGpx(
  breadcrumbs: BreadcrumbPoint[],
  routeName: string = 'GustLog Plus Flight Track'
): string {
  const safeName = routeName.replace(/[<>&'"]/g, '');
  const pointsXml = breadcrumbs
    .map((pt) => {
      const eleMeters = (pt.altitudeFt / 3.28084).toFixed(1);
      const isoTime = new Date(pt.timestamp).toISOString();
      return `      <trkpt lat="${pt.latitude.toFixed(6)}" lon="${pt.longitude.toFixed(6)}">
        <ele>${eleMeters}</ele>
        <time>${isoTime}</time>
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GustLog Plus EFB" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${pointsXml}
    </trkseg>
  </trk>
</gpx>`;
}
