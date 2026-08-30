import { Waypoint } from '../types';

const CACHE_KEY = 'osm_vrp_cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  data: Waypoint | Waypoint[];
  timestamp: number;
}

interface OsmCache {
  [key: string]: CacheEntry;
}

function getCache(): OsmCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    console.warn('Failed to read OSM cache from localStorage', e);
    return {};
  }
}

function saveCache(cache: OsmCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to save OSM cache to localStorage', e);
  }
}

function getFromCache<T>(key: string): T | null {
  const cache = getCache();
  const entry = cache[key];
  if (entry && Date.now() - entry.timestamp < CACHE_EXPIRY_MS) {
    return entry.data as T;
  }
  return null;
}

function setInCache(key: string, data: any): void {
  const cache = getCache();
  cache[key] = {
    data,
    timestamp: Date.now(),
  };
  saveCache(cache);
}

function mapOsmNodeToWaypoint(node: any): Waypoint {
  const identifier = node.tags?.ref || node.tags?.name || `VRP-${node.id}`;
  return {
    id: node.id,
    identifier: identifier.toUpperCase(),
    name: node.tags?.name || identifier,
    type: 'vrp',
    latitude: node.lat,
    longitude: node.lon,
    country: node.tags?.['addr:country'] || '',
    isCustom: false,
  };
}

/**
 * Search for an OSM reporting point by identifier (ref or name) with fast timeout and signal support
 * @param identifier The reference or name to search for
 * @param signal Optional AbortSignal to cancel in-flight request
 * @returns Promise resolving to the matching Waypoint or null
 */
export async function searchOsmReportingPoint(
  identifier: string,
  signal?: AbortSignal
): Promise<Waypoint | null> {
  const clean = identifier.trim().toUpperCase();
  if (!clean || clean.length < 2) return null;

  const cacheKey = `search_${clean}`;
  const cached = getFromCache<Waypoint>(cacheKey);
  if (cached) return cached;

  const query = `
    [out:json][timeout:3];
    (
      node["aeroway"="reporting_point"]["ref"~"^${clean}$",i];
      node["aeroway"="reporting_point"]["name"~"^${clean}$",i];
    );
    out body;
  `.trim();

  // Create internal 2-second timeout controller if no external signal
  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 2000);

  try {
    const combinedSignal = signal || timeoutCtrl.signal;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    if (data.elements && data.elements.length > 0) {
      const waypoint = mapOsmNodeToWaypoint(data.elements[0]);
      setInCache(cacheKey, waypoint);
      return waypoint;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Fetch all VFR reporting points within a bounding box
 */
export async function searchOsmReportingPointsInArea(
  bbox: { south: number; west: number; north: number; east: number },
  signal?: AbortSignal
): Promise<Waypoint[]> {
  const cacheKey = `area_${bbox.south}_${bbox.west}_${bbox.north}_${bbox.east}`;
  const cached = getFromCache<Waypoint[]>(cacheKey);
  if (cached) return cached;

  const query = `
    [out:json][timeout:5];
    node["aeroway"="reporting_point"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    out body;
  `.trim();

  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 3000);

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
      signal: signal || timeoutCtrl.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    if (data.elements) {
      const waypoints = data.elements.map(mapOsmNodeToWaypoint);
      setInCache(cacheKey, waypoints);
      return waypoints;
    }
    return [];
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}
