import { AIRSPACES, Airspace } from '../data/airspace-data';
import { isPointInPolygon } from '../engine/airspace-engine';
import { destinationPoint } from './inflight-nav';
import { OwnshipTelemetry } from './types-plus';

export interface AirspaceBoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface IndexedAirspace {
  airspace: Airspace;
  bbox: AirspaceBoundingBox;
  parsedRadio: {
    station: string;
    freq: string;
  };
}

export interface ActiveOrUpcomingAirspaceRadio {
  airspace: Airspace;
  role: 'INSIDE' | 'VERTICAL_BUFFER' | 'AHEAD';
  statusLabel: string;
  distanceAheadNm: number;
  timeAheadSec: number;
  frequencyNumber: string;
  frequencyStation: string;
}

export function parseFrequencyString(raw?: string): { station: string; freq: string } {
  if (!raw) return { station: 'Lisboa Info (FIS)', freq: '119.105 MHz' };
  const match = raw.match(/(\d{3}\.\d{3}|\d{3}\.\d{1,2})\s*(MHz)?/i);
  if (match) {
    const freqPart = `${match[1]} MHz`;
    const stationPart = raw
      .replace(match[0], '')
      .replace(/[-–—:]/g, ' ')
      .trim();
    return {
      station: stationPart || 'ATC / Tower',
      freq: freqPart,
    };
  }
  return { station: raw, freq: '119.105 MHz' };
}

function computePolygonBBox(polygon: [number, number][]): AirspaceBoundingBox {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const [lat, lon] = polygon[i];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Pre-computed Axis-Aligned Bounding Box (AABB) spatial index for all airspaces.
 * Rejects ~95% of non-overlapping polygons in O(1) float comparisons before running raycasting.
 */
export const INDEXED_AIRSPACES: readonly IndexedAirspace[] = AIRSPACES.map((airspace) => ({
  airspace,
  bbox: computePolygonBBox(airspace.polygon),
  parsedRadio: parseFrequencyString(airspace.frequency),
}));

/**
 * Fast AABB-culled point-in-polygon check.
 */
export function isPointInIndexedAirspace(
  coord: [number, number],
  indexed: IndexedAirspace
): boolean {
  const [lat, lon] = coord;
  const { bbox, airspace } = indexed;
  if (
    lat < bbox.minLat ||
    lat > bbox.maxLat ||
    lon < bbox.minLon ||
    lon > bbox.maxLon
  ) {
    return false;
  }
  return isPointInPolygon(coord, airspace.polygon);
}

/**
 * Queries all airspaces laterally containing (lat, lon) using the AABB spatial index.
 */
export function queryAirspacesAtCoordinate(
  lat: number,
  lon: number
): IndexedAirspace[] {
  const coord: [number, number] = [lat, lon];
  const matches: IndexedAirspace[] = [];
  for (let i = 0; i < INDEXED_AIRSPACES.length; i++) {
    const item = INDEXED_AIRSPACES[i];
    if (isPointInIndexedAirspace(coord, item)) {
      matches.push(item);
    }
  }
  return matches;
}

/**
 * High-speed 3D Track Vector airspace & frequency scanner using the AABB spatial index.
 */
export function scanTrackVectorAirspaceRadios(
  ownship: OwnshipTelemetry,
  effectiveGsKt: number
): ActiveOrUpcomingAirspaceRadio[] {
  const currentAltFt = ownship.altitudeMslFt ?? 3500;
  const ppos: [number, number] = [ownship.latitude, ownship.longitude];
  const results: ActiveOrUpcomingAirspaceRadio[] = [];
  const seenIds = new Set<string>();

  // Pre-compute forward sample points along Track Vector once per tick
  const forwardMins = [1, 2, 3, 4.5, 6, 8, 10, 12];
  const projectedSamples =
    effectiveGsKt >= 20
      ? forwardMins.map((mins) => {
          const distNm = (effectiveGsKt * mins) / 60;
          const pt = destinationPoint(
            ownship.latitude,
            ownship.longitude,
            ownship.trueTrackDeg,
            distNm
          );
          return {
            mins,
            distNm,
            coord: [pt.latitude, pt.longitude] as [number, number],
            projAltFt: currentAltFt + ownship.verticalSpeedFpm * mins,
          };
        })
      : [];

  for (let i = 0; i < INDEXED_AIRSPACES.length; i++) {
    const indexed = INDEXED_AIRSPACES[i];
    const { airspace: as, parsedRadio } = indexed;

    // 1. Check Present Position (PPOS) with AABB pre-filter
    if (isPointInIndexedAirspace(ppos, indexed)) {
      const insideVert =
        currentAltFt >= as.lowerLimitFt && currentAltFt <= as.upperLimitFt;
      const nearVert =
        !insideVert &&
        currentAltFt >= as.lowerLimitFt - 1000 &&
        currentAltFt <= as.upperLimitFt + 500;

      if (insideVert || nearVert) {
        seenIds.add(as.id);
        results.push({
          airspace: as,
          role: insideVert ? 'INSIDE' : 'VERTICAL_BUFFER',
          statusLabel: insideVert
            ? 'ACTIVE · INSIDE SECTOR'
            : currentAltFt < as.lowerLimitFt
            ? `UNDER FLOOR (${Math.round(as.lowerLimitFt - currentAltFt)} FT BELOW)`
            : `ABOVE CEILING`,
          distanceAheadNm: 0,
          timeAheadSec: 0,
          frequencyNumber: parsedRadio.freq,
          frequencyStation: parsedRadio.station,
        });
        continue;
      }
    }

    // 2. Check Projected Track Vector samples (up to 12 minutes ahead)
    if (projectedSamples.length > 0 && !seenIds.has(as.id)) {
      for (let s = 0; s < projectedSamples.length; s++) {
        const sample = projectedSamples[s];
        if (isPointInIndexedAirspace(sample.coord, indexed)) {
          const willConflictOrPassClose =
            sample.projAltFt >= as.lowerLimitFt - 1000 &&
            sample.projAltFt <= as.upperLimitFt + 500;
          if (willConflictOrPassClose) {
            seenIds.add(as.id);
            results.push({
              airspace: as,
              role: 'AHEAD',
              statusLabel: `ENTERING IN ${sample.distNm.toFixed(1)} NM`,
              distanceAheadNm: sample.distNm,
              timeAheadSec: Math.round(sample.mins * 60),
              frequencyNumber: parsedRadio.freq,
              frequencyStation: parsedRadio.station,
            });
          }
          break;
        }
      }
    }
  }

  const rank: Record<string, number> = {
    INSIDE: 0,
    VERTICAL_BUFFER: 1,
    AHEAD: 2,
  };
  results.sort((a, b) => {
    if (rank[a.role] !== rank[b.role]) return rank[a.role] - rank[b.role];
    return a.distanceAheadNm - b.distanceAheadNm;
  });

  return results;
}
