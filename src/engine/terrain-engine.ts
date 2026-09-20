import { Leg } from '../types';
import { intermediatePoint } from './coordinate-math';

export interface TerrainSamplePoint {
  distNm: number;
  latitude: number;
  longitude: number;
  elevationFt: number;
  cruiseAltFt: number;
  clearanceFt: number;
  isWarning: boolean; // Clearance < 500 ft AGL
}

export interface TerrainProfileResult {
  samples: TerrainSamplePoint[];
  maxTerrainFt: number;
  minClearanceFt: number;
  hasWarning: boolean;
  source: 'api' | 'fallback';
}

// In-memory cache for terrain elevation queries
const terrainCache = new Map<string, TerrainProfileResult>();

/**
 * Builds a deterministic cache key for a route based on leg waypoints, distances, and altitudes.
 */
export function buildTerrainCacheKey(legs: Leg[]): string {
  if (!legs || legs.length === 0) return '';
  return legs
    .map(
      (l) =>
        `${l.from.identifier}(${l.from.latitude.toFixed(3)},${l.from.longitude.toFixed(3)})-` +
        `${l.to.identifier}(${l.to.latitude.toFixed(3)},${l.to.longitude.toFixed(3)})-${l.distance.toFixed(1)}@${l.altitude}`
    )
    .join('|');
}

/**
 * Generates sample coordinates along the route legs.
 * Ensures all waypoint vertices and regular intermediate points (every ~1.5 to 2 NM) are sampled.
 */
export function generateRouteTrackSamples(
  legs: Leg[],
  targetTotalSamples: number = 50
): { distNm: number; latitude: number; longitude: number; cruiseAltFt: number }[] {
  if (!legs || legs.length === 0) return [];

  const totalDist = legs.reduce((acc, l) => acc + l.distance, 0);
  if (totalDist <= 0) {
    return [
      {
        distNm: 0,
        latitude: legs[0].from.latitude,
        longitude: legs[0].from.longitude,
        cruiseAltFt: legs[0].altitude,
      },
    ];
  }

  const rawPoints: { distNm: number; latitude: number; longitude: number; cruiseAltFt: number }[] = [];
  let cumulativeDist = 0;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const legDist = leg.distance;
    const legStartDist = cumulativeDist;

    // Number of segments inside this leg proportional to its distance
    const legSamples = Math.max(3, Math.round((legDist / totalDist) * targetTotalSamples));

    for (let s = 0; s < legSamples; s++) {
      const f = s / legSamples;
      const pointCoord = intermediatePoint(
        leg.from.latitude,
        leg.from.longitude,
        leg.to.latitude,
        leg.to.longitude,
        f
      );

      rawPoints.push({
        distNm: legStartDist + f * legDist,
        latitude: Number(pointCoord.latitude.toFixed(4)),
        longitude: Number(pointCoord.longitude.toFixed(4)),
        cruiseAltFt: leg.altitude,
      });
    }

    cumulativeDist += legDist;
  }

  // Add the final waypoint of the last leg
  const lastLeg = legs[legs.length - 1];
  rawPoints.push({
    distNm: totalDist,
    latitude: Number(lastLeg.to.latitude.toFixed(4)),
    longitude: Number(lastLeg.to.longitude.toFixed(4)),
    cruiseAltFt: lastLeg.altitude,
  });

  return rawPoints;
}

/**
 * Fetches terrain elevation profile for given route legs.
 * Uses Open-Meteo DEM API with automatic offline fallback to waypoint elevations.
 */
export async function fetchTerrainProfile(legs: Leg[]): Promise<TerrainProfileResult> {
  if (!legs || legs.length === 0) {
    return {
      samples: [],
      maxTerrainFt: 0,
      minClearanceFt: 0,
      hasWarning: false,
      source: 'fallback',
    };
  }

  const cacheKey = buildTerrainCacheKey(legs);
  if (cacheKey && terrainCache.has(cacheKey)) {
    return terrainCache.get(cacheKey)!;
  }

  const trackPoints = generateRouteTrackSamples(legs, 60);

  // Attempt to fetch from Open-Meteo Elevation API
  try {
    const latList = trackPoints.map((p) => p.latitude.toFixed(4)).join(',');
    const lonList = trackPoints.map((p) => p.longitude.toFixed(4)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${latList}&longitude=${lonList}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Elevation API HTTP ${res.status}`);

    const data = (await res.json()) as { elevation?: number[] };
    if (!data.elevation || !Array.isArray(data.elevation) || data.elevation.length !== trackPoints.length) {
      throw new Error('Invalid elevation payload');
    }

    let maxTerrain = 0;
    let minClearance = Infinity;
    let hasWarning = false;

    const samples: TerrainSamplePoint[] = trackPoints.map((p, idx) => {
      const elevationMeters = data.elevation![idx] ?? 0;
      const elevationFt = Math.max(0, Math.round(elevationMeters * 3.28084));
      const clearanceFt = p.cruiseAltFt - elevationFt;
      const isWarning = clearanceFt < 500;

      if (elevationFt > maxTerrain) maxTerrain = elevationFt;
      if (clearanceFt < minClearance) minClearance = clearanceFt;
      if (isWarning) hasWarning = true;

      return {
        distNm: p.distNm,
        latitude: p.latitude,
        longitude: p.longitude,
        elevationFt,
        cruiseAltFt: p.cruiseAltFt,
        clearanceFt,
        isWarning,
      };
    });

    const result: TerrainProfileResult = {
      samples,
      maxTerrainFt: maxTerrain,
      minClearanceFt: minClearance === Infinity ? 0 : minClearance,
      hasWarning,
      source: 'api',
    };

    if (cacheKey) terrainCache.set(cacheKey, result);
    return result;
  } catch {
    // Graceful offline fallback: interpolate known waypoint elevations
    const fallbackResult = generateFallbackTerrainProfile(legs, trackPoints);
    if (cacheKey) terrainCache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }
}

/**
 * Computes fallback elevation using known airport/waypoint elevations with linear interpolation.
 */
export function generateFallbackTerrainProfile(
  legs: Leg[],
  trackPoints: { distNm: number; latitude: number; longitude: number; cruiseAltFt: number }[]
): TerrainProfileResult {
  let maxTerrain = 0;
  let minClearance = Infinity;
  let hasWarning = false;

  // Map known elevations along legs
  let cumulative = 0;
  const legIntervals = legs.map((leg) => {
    const startDist = cumulative;
    const endDist = cumulative + leg.distance;
    cumulative = endDist;
    const startElev = leg.from.elevation ?? 150;
    const endElev = leg.to.elevation ?? 150;
    return { startDist, endDist, startElev, endElev, altitude: leg.altitude };
  });

  const samples: TerrainSamplePoint[] = trackPoints.map((p) => {
    // Find which leg interval this point falls into
    const interval =
      legIntervals.find((int) => p.distNm >= int.startDist && p.distNm <= int.endDist) ||
      legIntervals[legIntervals.length - 1];

    let interpolatedElev = interval.startElev;
    const legLen = interval.endDist - interval.startDist;
    if (legLen > 0) {
      const f = Math.max(0, Math.min(1, (p.distNm - interval.startDist) / legLen));
      interpolatedElev = Math.round(interval.startElev + f * (interval.endElev - interval.startElev));
    }

    const elevationFt = Math.max(0, interpolatedElev);
    const clearanceFt = p.cruiseAltFt - elevationFt;
    const isWarning = clearanceFt < 500;

    if (elevationFt > maxTerrain) maxTerrain = elevationFt;
    if (clearanceFt < minClearance) minClearance = clearanceFt;
    if (isWarning) hasWarning = true;

    return {
      distNm: p.distNm,
      latitude: p.latitude,
      longitude: p.longitude,
      elevationFt,
      cruiseAltFt: p.cruiseAltFt,
      clearanceFt,
      isWarning,
    };
  });

  return {
    samples,
    maxTerrainFt: maxTerrain,
    minClearanceFt: minClearance === Infinity ? 0 : minClearance,
    hasWarning,
    source: 'fallback',
  };
}
