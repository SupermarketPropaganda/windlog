import { SavedFlight, Waypoint, AircraftProfile } from '../types';
import { getStorageItemSync, setStorageItem } from './storage-manager';

const STORAGE_SAVED_FLIGHTS_KEY = 'windlog_saved_flights';

let flightCounter = 0;

/**
 * Generates an intuitive title for a flight based on departure and destination waypoints.
 */
export function generateFlightTitle(routeInput: string, waypoints?: Waypoint[]): string {
  if (waypoints && waypoints.length >= 2) {
    const origin = (waypoints[0]?.identifier || 'DEP').toUpperCase();
    const dest = (waypoints[waypoints.length - 1]?.identifier || 'ARR').toUpperCase();
    return `${origin} ➔ ${dest}`;
  }

  const str = typeof routeInput === 'string' ? routeInput : '';
  const parts = str.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const origin = (parts[0].split('/')[0].split('@')[0] || 'DEP').toUpperCase();
    const dest = (parts[parts.length - 1].split('/')[0].split('@')[0] || 'ARR').toUpperCase();
    return `${origin} ➔ ${dest}`;
  }

  if (parts.length === 1) {
    const origin = (parts[0].split('/')[0].split('@')[0] || 'DEP').toUpperCase();
    return `Flight from ${origin}`;
  }

  const dateStr = new Date().toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `VFR Flight (${dateStr})`;
}

/**
 * Loads all saved flights synchronously from storage cache.
 * Filters by userId if provided. Resilient against corrupted array entries.
 */
export function getSavedFlightsSync(userId?: string): SavedFlight[] {
  const all = getStorageItemSync<SavedFlight[]>(STORAGE_SAVED_FLIGHTS_KEY, []);
  if (!Array.isArray(all)) return [];
  const valid = all.filter((f): f is SavedFlight => Boolean(f && typeof f === 'object' && typeof (f as any).id === 'string'));
  if (userId) {
    return valid.filter((f) => !f.userId || f.userId === userId);
  }
  return valid;
}

/**
 * Saves or updates a flight record in persistent storage.
 */
export async function saveFlightRecord(
  flightData: {
    id?: string;
    name?: string;
    routeInput: string;
    departureTime: string | null;
    profile: AircraftProfile;
    legAltitudeOverrides: Record<number, number>;
    summary?: {
      totalDistance: number;
      totalEte: number;
      totalFuel: number;
      legsCount: number;
    };
    userId?: string;
  }
): Promise<SavedFlight> {
  const current = getSavedFlightsSync();
  const now = new Date().toISOString();

  let targetId = flightData.id;
  if (!targetId) {
    targetId = `flt_${Date.now()}_${++flightCounter}_${Math.random().toString(36).substring(2, 7)}`;
  }

  const existingIndex = current.findIndex((f) => f && f.id === targetId);

  const rawRoute = typeof flightData.routeInput === 'string' ? flightData.routeInput : '';
  const name =
    flightData.name?.trim() ||
    (existingIndex >= 0 ? current[existingIndex].name : generateFlightTitle(rawRoute));

  const savedFlight: SavedFlight = {
    id: targetId,
    name,
    routeInput: rawRoute.trim(),
    departureTime: flightData.departureTime || null,
    profile: flightData.profile || {
      cruiseAltitude: 3500,
      tas: 110,
      fuelFlow: 8.5,
      fuelUnit: 'gph',
    },
    legAltitudeOverrides: flightData.legAltitudeOverrides || {},
    summary: flightData.summary,
    createdAt: existingIndex >= 0 ? current[existingIndex].createdAt : now,
    updatedAt: now,
    userId: flightData.userId,
  };

  let updatedList: SavedFlight[];
  if (existingIndex >= 0) {
    updatedList = [...current];
    updatedList[existingIndex] = savedFlight;
  } else {
    // Put newest flight first
    updatedList = [savedFlight, ...current];
  }

  await setStorageItem(STORAGE_SAVED_FLIGHTS_KEY, updatedList);
  return savedFlight;
}

/**
 * Deletes a saved flight by ID.
 */
export async function deleteSavedFlight(id: string): Promise<boolean> {
  const current = getSavedFlightsSync();
  const filtered = current.filter((f) => f && f.id !== id);
  if (filtered.length === current.length) return false;

  await setStorageItem(STORAGE_SAVED_FLIGHTS_KEY, filtered);
  return true;
}

/**
 * Deletes all saved flights (useful for test reset or user library purge).
 */
export async function clearAllSavedFlights(): Promise<void> {
  await setStorageItem(STORAGE_SAVED_FLIGHTS_KEY, []);
}

/**
 * Retrieves a single saved flight by ID.
 */
export function getSavedFlightById(id: string): SavedFlight | null {
  const current = getSavedFlightsSync();
  return current.find((f) => f && f.id === id) || null;
}
