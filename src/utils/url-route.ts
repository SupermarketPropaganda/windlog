import { AircraftProfile, FuelUnit } from '../types';

export interface SharedFlightState {
  route: string;
  profile?: Partial<AircraftProfile>;
}

/**
 * Encodes current flight plan route and aircraft profile into a shareable URL hash.
 */
export function encodeRouteToUrl(route: string, profile: AircraftProfile): string {
  const params = new URLSearchParams();
  if (route.trim()) {
    params.set('route', route.trim());
  }
  if (profile.tas && profile.tas !== 105) {
    params.set('tas', profile.tas.toString());
  }
  if (profile.cruiseAltitude && profile.cruiseAltitude !== 4500) {
    params.set('alt', profile.cruiseAltitude.toString());
  }
  if (profile.fuelFlow !== undefined && profile.fuelFlow !== 8.5) {
    params.set('fuel', profile.fuelFlow.toString());
  }
  if (profile.fuelUnit && profile.fuelUnit !== 'gph') {
    params.set('unit', profile.fuelUnit);
  }
  if (profile.aircraftModel && profile.aircraftModel !== 'c172') {
    params.set('model', profile.aircraftModel);
  }

  const query = params.toString();
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin + window.location.pathname
    : 'https://windlog.app/';
  return query ? `${baseUrl}#${query}` : baseUrl;
}

/**
 * Parses raw hash string into shared flight state.
 */
export function parseRouteUrlHash(rawHash: string): SharedFlightState | null {
  const hash = rawHash.replace(/^#/, '');
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const route = params.get('route');
  if (!route) return null;

  const profile: Partial<AircraftProfile> = {};

  const tas = parseInt(params.get('tas') || '', 10);
  if (!isNaN(tas) && tas > 0) profile.tas = tas;

  const alt = parseInt(params.get('alt') || '', 10);
  if (!isNaN(alt) && alt > 0) profile.cruiseAltitude = alt;

  const fuel = parseFloat(params.get('fuel') || '');
  if (!isNaN(fuel) && fuel >= 0) profile.fuelFlow = fuel;

  const unit = params.get('unit') as FuelUnit;
  if (unit === 'gph' || unit === 'lph') profile.fuelUnit = unit;

  const model = params.get('model');
  if (model) profile.aircraftModel = model;

  return {
    route,
    profile,
  };
}

/**
 * Parses shared flight state from the browser URL hash if present.
 */
export function decodeRouteFromUrl(): SharedFlightState | null {
  if (typeof window === 'undefined') return null;
  return parseRouteUrlHash(window.location.hash);
}

/**
 * Copies shareable route link to clipboard.
 */
export async function copyShareableRouteLink(route: string, profile: AircraftProfile): Promise<boolean> {
  const url = encodeRouteToUrl(route, profile);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', url);
    }
    return true;
  } catch (e) {
    console.error('Failed to copy share link:', e);
    return false;
  }
}
