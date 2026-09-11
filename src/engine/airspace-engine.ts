import { Leg } from '../types';
import { Airspace, AIRSPACES } from '../data/airspace-data';

export type PenetrationStatus = 'PENETRATING' | 'CLIPPING' | 'BELOW' | 'ABOVE';
export type ConflictSeverity = 'CRITICAL' | 'WARNING' | 'CAUTION' | 'INFO';

export interface AirspaceConflict {
  airspace: Airspace;
  legIndex: number;
  legFrom: string;
  legTo: string;
  legAltitudeFt: number;
  status: PenetrationStatus;
  severity: ConflictSeverity;
  verticalClearanceFt: number;
  warningMessage: string;
}

export interface AirspaceConflictReport {
  hasCriticalConflict: boolean;
  hasWarningConflict: boolean;
  conflicts: AirspaceConflict[];
  summaryMessage: string;
}

/**
 * Checks if a polygon is degenerate (fewer than 3 vertices, all points identical,
 * or all vertices collinear along a single straight line).
 */
function isPolygonDegenerate(vs: [number, number][]): boolean {
  if (!vs || vs.length < 3) return true;

  const a = vs[0];
  let b: [number, number] | null = null;
  for (let i = 1; i < vs.length; i++) {
    if (vs[i][0] !== a[0] || vs[i][1] !== a[1]) {
      b = vs[i];
      break;
    }
  }

  // All vertices are identical
  if (!b) return true;

  // Check if all vertices are collinear along line through a and b
  const eps = 1e-9;
  for (let i = 0; i < vs.length; i++) {
    const p = vs[i];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) > eps) {
      return false; // Found a non-collinear vertex, polygon has 2D span
    }
  }

  return true;
}

/**
 * Checks if point p lies collinear and within the bounding box of segment [a, b].
 */
function isPointOnSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  eps = 1e-9
): boolean {
  // Cross product (p - a) x (b - a)
  const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) > eps) return false;

  const minLat = Math.min(a[0], b[0]) - eps;
  const maxLat = Math.max(a[0], b[0]) + eps;
  const minLon = Math.min(a[1], b[1]) - eps;
  const maxLon = Math.max(a[1], b[1]) + eps;

  return p[0] >= minLat && p[0] <= maxLat && p[1] >= minLon && p[1] <= maxLon;
}

/**
 * Standard Ray-Casting algorithm to determine if a point [lat, lon] is inside a polygon.
 * Supports concave polygons, keyhole donut holes, self-intersecting figures,
 * on-boundary/vertex points, polar coordinates, and anti-meridian coordinates.
 */
export function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  if (!vs || vs.length < 3) return false;
  if (!point || isNaN(point[0]) || isNaN(point[1])) return false;

  // Check for degenerate polygon (collinear or < 3 vertices)
  if (isPolygonDegenerate(vs)) return false;

  const lat = point[0];
  const lon = point[1];

  // Polar check: if point is at pole (lat = ±90°), all longitudes represent the same geographic pole
  if (Math.abs(lat) === 90) {
    for (let i = 0; i < vs.length; i++) {
      if (vs[i][0] === lat) return true;
    }
  }

  // Normalize lon for boundary check (±180° equivalence)
  const normLon = (l: number) => (Math.abs(l) === 180 ? 180 : l);
  const pNorm: [number, number] = [lat, normLon(lon)];

  // Check if point lies exactly on any vertex or along any edge
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const pI: [number, number] = [vs[i][0], normLon(vs[i][1])];
    const pJ: [number, number] = [vs[j][0], normLon(vs[j][1])];

    if (isPointOnSegment(pNorm, pI, pJ)) {
      return true;
    }
  }

  // Standard Ray-Casting algorithm (even-odd rule)
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const latI = vs[i][0];
    const lonI = vs[i][1];
    const latJ = vs[j][0];
    const lonJ = vs[j][1];

    const intersect =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * 2D cross product of vector (b - a) and (c - a).
 */
function ccw(a: [number, number], b: [number, number], c: [number, number]): number {
  return (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * Checks if point q lies on segment [p, r] within epsilon tolerance.
 */
function onSegment(
  p: [number, number],
  q: [number, number],
  r: [number, number],
  eps = 1e-9
): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + eps &&
    q[0] >= Math.min(p[0], r[0]) - eps &&
    q[1] <= Math.max(p[1], r[1]) + eps &&
    q[1] >= Math.min(p[1], r[1]) - eps
  );
}

/**
 * Checks if two line segments [p1, p2] and [q1, q2] intersect.
 * Handles general straddle intersections, collinear segments, and touching endpoints.
 */
export function doSegmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): boolean {
  const eps = 1e-9;
  const ccw1 = ccw(p1, q1, q2);
  const ccw2 = ccw(p2, q1, q2);
  const ccw3 = ccw(p1, p2, q1);
  const ccw4 = ccw(p1, p2, q2);

  // General straddle case
  if (
    ((ccw1 > eps && ccw2 < -eps) || (ccw1 < -eps && ccw2 > eps)) &&
    ((ccw3 > eps && ccw4 < -eps) || (ccw3 < -eps && ccw4 > eps))
  ) {
    return true;
  }

  // Collinear or touching cases
  if (Math.abs(ccw1) <= eps && onSegment(q1, p1, q2, eps)) return true;
  if (Math.abs(ccw2) <= eps && onSegment(q1, p2, q2, eps)) return true;
  if (Math.abs(ccw3) <= eps && onSegment(p1, q1, p2, eps)) return true;
  if (Math.abs(ccw4) <= eps && onSegment(p1, q2, p2, eps)) return true;

  return false;
}

/**
 * Internal helper for planar segment vs polygon overlap check with AABB optimization.
 */
function doesSegmentOverlapPolygonSimple(
  start: [number, number],
  end: [number, number],
  poly: [number, number][]
): boolean {
  // AABB pre-check
  let pMinLat = poly[0][0], pMaxLat = poly[0][0];
  let pMinLon = poly[0][1], pMaxLon = poly[0][1];
  for (let i = 1; i < poly.length; i++) {
    const p = poly[i];
    if (p[0] < pMinLat) pMinLat = p[0];
    if (p[0] > pMaxLat) pMaxLat = p[0];
    if (p[1] < pMinLon) pMinLon = p[1];
    if (p[1] > pMaxLon) pMaxLon = p[1];
  }

  const sMinLat = Math.min(start[0], end[0]);
  const sMaxLat = Math.max(start[0], end[0]);
  const sMinLon = Math.min(start[1], end[1]);
  const sMaxLon = Math.max(start[1], end[1]);

  const eps = 1e-9;
  // If polygon doesn't cross the anti-meridian, prune by both lat and lon bounds
  const polyCrossesAntiMeridian = pMaxLon - pMinLon > 180;
  if (sMaxLat < pMinLat - eps || sMinLat > pMaxLat + eps) {
    return false;
  }
  if (!polyCrossesAntiMeridian && (sMaxLon < pMinLon - eps || sMinLon > pMaxLon + eps)) {
    return false;
  }

  // 1. Endpoint inside polygon
  if (isPointInPolygon(start, poly) || isPointInPolygon(end, poly)) {
    return true;
  }

  // 2. Midpoint inside (for cases where segment passes through without vertices inside)
  const mid: [number, number] = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  if (isPointInPolygon(mid, poly)) {
    return true;
  }

  // 3. Edge intersection check
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (doSegmentsIntersect(start, end, poly[i], poly[j])) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a line segment between two coordinates intersects any edge of an airspace polygon
 * or has either endpoint inside. Supports anti-meridian wrap-around.
 */
export function doesSegmentOverlapPolygon(
  start: [number, number],
  end: [number, number],
  poly: [number, number][]
): boolean {
  if (!poly || poly.length < 3) return false;
  if (!start || !end || isNaN(start[0]) || isNaN(start[1]) || isNaN(end[0]) || isNaN(end[1])) {
    return false;
  }

  // If polygon is degenerate (collinear or < 3 vertices), it cannot enclose or overlap any airspace
  if (isPolygonDegenerate(poly)) return false;

  // Check if leg crosses the anti-meridian (|lon1 - lon2| > 180)
  const lonDiff = Math.abs(start[1] - end[1]);
  if (lonDiff > 180) {
    const lon1 = start[1];
    const lon2 = end[1];
    const lon2Adj = lon1 > 0 ? lon2 + 360 : lon2 - 360;
    const splitLon = lon1 > 0 ? 180 : -180;
    const splitLonOpp = lon1 > 0 ? -180 : 180;
    const t = (splitLon - lon1) / (lon2Adj - lon1);
    const splitLat = start[0] + t * (end[0] - start[0]);

    const seg1End: [number, number] = [splitLat, splitLon];
    const seg2Start: [number, number] = [splitLat, splitLonOpp];

    return (
      doesSegmentOverlapPolygonSimple(start, seg1End, poly) ||
      doesSegmentOverlapPolygonSimple(seg2Start, end, poly)
    );
  }

  return doesSegmentOverlapPolygonSimple(start, end, poly);
}

/**
 * Evaluates an individual route leg against an airspace.
 */
export function checkLegAirspaceConflict(
  leg: Leg,
  legIndex: number,
  airspace: Airspace
): AirspaceConflict | null {
  if (!leg || !airspace || !airspace.polygon) return null;
  if (!leg.from || !leg.to) return null;
  if (
    isNaN(leg.from.latitude) ||
    isNaN(leg.from.longitude) ||
    isNaN(leg.to.latitude) ||
    isNaN(leg.to.longitude)
  ) {
    return null;
  }

  const p1: [number, number] = [leg.from.latitude, leg.from.longitude];
  const p2: [number, number] = [leg.to.latitude, leg.to.longitude];

  // Check horizontal overlap
  const overlaps = doesSegmentOverlapPolygon(p1, p2, airspace.polygon);
  if (!overlaps) {
    return null;
  }

  const lower = airspace.lowerLimitFt;
  const upper = airspace.upperLimitFt;

  let status: PenetrationStatus;
  let severity: ConflictSeverity;
  let verticalClearanceFt: number;
  let warningMessage: string;

  const isAltitudeValid = typeof leg.altitude === 'number' && !isNaN(leg.altitude);

  if (!isAltitudeValid) {
    // Altitude is missing, undefined, or NaN
    status = 'PENETRATING';
    verticalClearanceFt = 0;
    if (airspace.type === 'RESTRICTED' || airspace.type === 'PROHIBITED') {
      severity = 'CRITICAL';
      warningMessage = `⚠️ CRITICAL: Leg ${legIndex + 1} (${leg.from.identifier} -> ${leg.to.identifier}) intersects ${airspace.name} (${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}) with unspecified altitude. Unauthorized entry prohibited!`;
    } else if (airspace.type === 'CTR' || airspace.classification === 'C' || airspace.classification === 'D') {
      severity = 'WARNING';
      const freqInfo = airspace.frequency ? ` Contact ${airspace.frequency} prior to entry.` : '';
      warningMessage = `⚠️ Leg ${legIndex + 1} enters ${airspace.name} (Class ${airspace.classification}, ${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}) with unspecified altitude.${freqInfo}`;
    } else {
      severity = 'WARNING';
      const freqInfo = airspace.frequency ? ` Monitor ${airspace.frequency}.` : '';
      warningMessage = `⚠️ Leg ${legIndex + 1} penetrates ${airspace.name} (${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}) with unspecified altitude.${freqInfo}`;
    }

    return {
      airspace,
      legIndex,
      legFrom: leg.from.identifier,
      legTo: leg.to.identifier,
      legAltitudeFt: 0,
      status,
      severity,
      verticalClearanceFt,
      warningMessage,
    };
  }

  const alt = leg.altitude;

  if (alt >= lower && alt <= upper) {
    // Aircraft cruising altitude is INSIDE the vertical bounds of the airspace
    status = 'PENETRATING';
    if (airspace.type === 'RESTRICTED' || airspace.type === 'PROHIBITED') {
      severity = 'CRITICAL';
      warningMessage = `⚠️ CRITICAL: Leg ${legIndex + 1} (${leg.from.identifier} -> ${leg.to.identifier}) PENETRATES ${airspace.name} (${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}). Unauthorized entry prohibited!`;
    } else if (airspace.type === 'CTR' || airspace.classification === 'C' || airspace.classification === 'D') {
      severity = 'WARNING';
      const freqInfo = airspace.frequency ? ` Contact ${airspace.frequency} prior to entry.` : '';
      warningMessage = `⚠️ Leg ${legIndex + 1} enters ${airspace.name} (Class ${airspace.classification}, ${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}) at ${alt} ft MSL.${freqInfo}`;
    } else {
      severity = 'WARNING';
      const freqInfo = airspace.frequency ? ` Monitor ${airspace.frequency}.` : '';
      warningMessage = `⚠️ Leg ${legIndex + 1} penetrates ${airspace.name} (${airspace.lowerLimitLabel} - ${airspace.upperLimitLabel}).${freqInfo}`;
    }
    verticalClearanceFt = 0;
  } else if (alt < lower) {
    // Below lower limit
    verticalClearanceFt = lower - alt;
    if (verticalClearanceFt <= 500) {
      status = 'CLIPPING';
      severity = 'CAUTION';
      warningMessage = `⚡ Leg ${legIndex + 1} clears under ${airspace.name} by only ${verticalClearanceFt} ft (Floor: ${airspace.lowerLimitLabel}). Caution on climb.`;
    } else {
      status = 'BELOW';
      severity = 'INFO';
      warningMessage = `ℹ️ Leg ${legIndex + 1} passes underneath ${airspace.name} (Clearing floor by ${verticalClearanceFt} ft).`;
    }
  } else {
    // Above upper limit
    verticalClearanceFt = alt - upper;
    if (verticalClearanceFt <= 500) {
      status = 'CLIPPING';
      severity = 'CAUTION';
      warningMessage = `⚡ Leg ${legIndex + 1} clears above ${airspace.name} by only ${verticalClearanceFt} ft (Ceiling: ${airspace.upperLimitLabel}). Caution on descent.`;
    } else {
      status = 'ABOVE';
      severity = 'INFO';
      warningMessage = `ℹ️ Leg ${legIndex + 1} cruises over ${airspace.name} (Clearing ceiling by ${verticalClearanceFt} ft).`;
    }
  }

  return {
    airspace,
    legIndex,
    legFrom: leg.from.identifier,
    legTo: leg.to.identifier,
    legAltitudeFt: alt,
    status,
    severity,
    verticalClearanceFt,
    warningMessage,
  };
}

/**
 * Evaluates all legs in a flight plan against the airspace catalog.
 */
export function checkRouteAirspaceConflicts(
  legs: Leg[],
  airspaces: Airspace[] = AIRSPACES
): AirspaceConflictReport {
  if (!legs || legs.length === 0 || !airspaces || airspaces.length === 0) {
    return {
      hasCriticalConflict: false,
      hasWarningConflict: false,
      conflicts: [],
      summaryMessage: !legs || legs.length === 0 ? 'No route legs defined.' : 'No airspaces defined.',
    };
  }

  const conflicts: AirspaceConflict[] = [];

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg) continue;
    for (const airspace of airspaces) {
      const conflict = checkLegAirspaceConflict(leg, i, airspace);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  const hasCriticalConflict = conflicts.some((c) => c.severity === 'CRITICAL');
  const hasWarningConflict = conflicts.some((c) => c.severity === 'WARNING');

  let summaryMessage = 'Route clear of airspace restrictions.';
  if (hasCriticalConflict) {
    summaryMessage = '⚠️ CRITICAL: Route crosses Restricted or Prohibited airspace!';
  } else if (hasWarningConflict) {
    const controlledCount = conflicts.filter((c) => c.status === 'PENETRATING').length;
    summaryMessage = `Controlled airspace penetration: ${controlledCount} active sector${controlledCount === 1 ? '' : 's'}. ATC clearance mandatory.`;
  }

  return {
    hasCriticalConflict,
    hasWarningConflict,
    conflicts,
    summaryMessage,
  };
}

export interface AirspaceVerticalSlice {
  airspace: Airspace;
  legIndex: number;
  startDistNm: number;
  endDistNm: number;
  lowerLimitFt: number;
  upperLimitFt: number;
  status: PenetrationStatus;
  severity: ConflictSeverity;
  legAltitudeFt: number;
  verticalClearanceFt: number;
}

/**
 * Computes parametric intersection fraction t in [0, 1] between segment [p1, p2] and [q1, q2].
 * Returns null if segments are parallel or do not intersect.
 */
function getSegmentIntersectionFraction(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number]
): number | null {
  const rx = p2[0] - p1[0];
  const ry = p2[1] - p1[1];
  const sx = q2[0] - q1[0];
  const sy = q2[1] - q1[1];

  const crossRS = rx * sy - ry * sx;
  if (Math.abs(crossRS) < 1e-9) return null; // parallel or collinear

  const qpX = q1[0] - p1[0];
  const qpY = q1[1] - p1[1];

  const t = (qpX * sy - qpY * sx) / crossRS;
  const u = (qpX * ry - qpY * rx) / crossRS;

  if (t >= -1e-7 && t <= 1 + 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) {
    return Math.max(0, Math.min(1, t));
  }
  return null;
}

/**
 * Computes 2D vertical cross-section slices along the flight plan route.
 * Used by AltitudeProfile to render airspace blocks along the route distance X-axis.
 */
export function computeAirspaceProfileSlices(
  legs: Leg[],
  airspaces: Airspace[] = AIRSPACES
): AirspaceVerticalSlice[] {
  if (!legs || legs.length === 0 || !airspaces || airspaces.length === 0) {
    return [];
  }

  const rawSlices: AirspaceVerticalSlice[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const legDist = leg.distance || 0;
    const legStartDist = cumulativeDist;
    cumulativeDist += legDist;

    if (!leg.from || !leg.to || legDist <= 0) continue;

    const p1: [number, number] = [leg.from.latitude, leg.from.longitude];
    const p2: [number, number] = [leg.to.latitude, leg.to.longitude];

    for (const as of airspaces) {
      const conflict = checkLegAirspaceConflict(leg, i, as);
      if (!conflict) continue;

      const poly = as.polygon;
      if (!poly || poly.length < 3) continue;

      // Find all parametric t fractions where the leg enters or exits the polygon
      const tSet = new Set<number>();
      tSet.add(0);
      tSet.add(1);

      for (let j = 0; j < poly.length - 1; j++) {
        const t = getSegmentIntersectionFraction(p1, p2, poly[j], poly[j + 1]);
        if (t !== null && t > 0.001 && t < 0.999) {
          tSet.add(t);
        }
      }

      const sortedT = Array.from(tSet).sort((a, b) => a - b);

      for (let k = 0; k < sortedT.length - 1; k++) {
        const tA = sortedT[k];
        const tB = sortedT[k + 1];
        if (tB - tA < 0.005) continue; // Skip sub-millimeter segments

        const midT = (tA + tB) / 2;
        const midPoint: [number, number] = [
          p1[0] + midT * (p2[0] - p1[0]),
          p1[1] + midT * (p2[1] - p1[1]),
        ];

        if (isPointInPolygon(midPoint, poly)) {
          rawSlices.push({
            airspace: as,
            legIndex: i,
            startDistNm: Math.round((legStartDist + tA * legDist) * 10) / 10,
            endDistNm: Math.round((legStartDist + tB * legDist) * 10) / 10,
            lowerLimitFt: as.lowerLimitFt,
            upperLimitFt: as.upperLimitFt,
            status: conflict.status,
            severity: conflict.severity,
            legAltitudeFt: leg.altitude,
            verticalClearanceFt: conflict.verticalClearanceFt,
          });
        }
      }
    }
  }

  // Merge contiguous slices of the same airspace on the same leg
  const mergedSlices: AirspaceVerticalSlice[] = [];
  for (const slice of rawSlices) {
    const prev = mergedSlices[mergedSlices.length - 1];
    if (
      prev &&
      prev.airspace.id === slice.airspace.id &&
      prev.legIndex === slice.legIndex &&
      Math.abs(prev.endDistNm - slice.startDistNm) < 0.5
    ) {
      prev.endDistNm = Math.max(prev.endDistNm, slice.endDistNm);
    } else {
      mergedSlices.push({ ...slice });
    }
  }

  return mergedSlices;
}

/**
 * Filters an airspace list to only include sectors relevant to a given target altitude.
 */
export function filterAirspacesByAltitude(
  airspaces: Airspace[],
  targetAltitudeFt: number,
  bufferFt = 1000
): Airspace[] {
  if (targetAltitudeFt <= 0) return airspaces;
  return airspaces.filter((as) => {
    return (
      as.lowerLimitFt <= targetAltitudeFt + bufferFt &&
      as.upperLimitFt >= targetAltitudeFt - bufferFt
    );
  });
}

/**
 * Returns actionable ATC clearance and flight rules advisory for a given airspace.
 */
export function getAirspaceClearanceAdvisory(
  airspace: Airspace,
  legAltitudeFt: number
): {
  actionTitle: string;
  actionDetail: string;
  frequency: string;
  isClearanceRequired: boolean;
} {
  const freq = airspace.frequency || '123.750 MHz (Lisboa Info)';
  const alt = legAltitudeFt || 0;

  if (airspace.type === 'PROHIBITED') {
    return {
      actionTitle: 'PROHIBITED AIRSPACE — RE-ROUTE MANDATORY',
      actionDetail: `Flight inside ${airspace.name} is strictly prohibited at all times. Re-route horizontally around the area.`,
      frequency: freq,
      isClearanceRequired: true,
    };
  }

  if (airspace.type === 'RESTRICTED') {
    return {
      actionTitle: 'RESTRICTED AIRSPACE — VERIFY NOTAM ACTIVATION',
      actionDetail: `Active military firing/artillery in ${airspace.name}. If activated by NOTAM, entry is forbidden. Contact ${freq} to verify status prior to entry.`,
      frequency: freq,
      isClearanceRequired: true,
    };
  }

  if (airspace.type === 'DANGER') {
    return {
      actionTitle: 'DANGER AREA — INTENSE HAZARD ADVISORY',
      actionDetail: `${airspace.remarks || 'Intense parachute/aerobatic activity'}. Extreme visual lookout mandatory. Monitor ${freq}.`,
      frequency: freq,
      isClearanceRequired: false,
    };
  }

  if (airspace.type === 'CTR') {
    return {
      actionTitle: `CLASS ${airspace.classification} CTR CLEARANCE MANDATORY`,
      actionDetail: `Establish two-way radio contact with ${freq} prior to crossing CTR boundary. Maintain designated VFR reporting points and assigned altitude.`,
      frequency: freq,
      isClearanceRequired: true,
    };
  }

  if (airspace.type === 'TMA') {
    const isPenetrating = alt >= airspace.lowerLimitFt && alt <= airspace.upperLimitFt;
    if (isPenetrating) {
      return {
        actionTitle: `CLASS ${airspace.classification} TMA PENETRATION — CLEARANCE REQUIRED`,
        actionDetail: `Cruising at ${alt} ft penetrates ${airspace.name} (Floor: ${airspace.lowerLimitLabel}). Request Class C VFR transit on ${freq}, or cruise below ${airspace.lowerLimitFt} ft.`,
        frequency: freq,
        isClearanceRequired: true,
      };
    } else if (alt < airspace.lowerLimitFt) {
      const buffer = airspace.lowerLimitFt - alt;
      return {
        actionTitle: `FLYING UNDER TMA FLOOR (${buffer} FT BUFFER)`,
        actionDetail: `Operating clear below ${airspace.name} floor (${airspace.lowerLimitLabel}). Monitor ${freq} for regional QNH and traffic advisories.`,
        frequency: freq,
        isClearanceRequired: false,
      };
    } else {
      return {
        actionTitle: `OPERATING ABOVE TMA CEILING`,
        actionDetail: `Operating above ${airspace.name} ceiling (${airspace.upperLimitLabel}). Maintain FL cruise and transponder assignment.`,
        frequency: freq,
        isClearanceRequired: false,
      };
    }
  }

  // ATZ / Uncontrolled
  return {
    actionTitle: 'UNCONTROLLED AERODROME ADVISORY (ATZ)',
    actionDetail: `Broadcast blind intentions (position, altitude, landing/transit) on ${freq} 5 minutes prior to entering the ATZ.`,
    frequency: freq,
    isClearanceRequired: false,
  };
}
