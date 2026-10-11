import { computeNavLog } from '../../engine/navlog-engine';
import { getAirportWaypoint } from '../../data/airport-runways';
import { Waypoint } from '../../types';

export const DEMO_AIRCRAFT = { aircraftModel: 'c172', cruiseAltitude: 3500, tas: 105, fuelFlow: 8.5, fuelUnit: 'gph' as const };
export const DEMO_WIND = { direction: 270, speed: 15 };
export const DEMO_WAYPOINTS = ['LPCS', 'LPSO', 'LPEV'].map(code => getAirportWaypoint(code)!).filter((point): point is Waypoint => Boolean(point));
export const DEMO_NAVLOG = computeNavLog(DEMO_WAYPOINTS, DEMO_AIRCRAFT, DEMO_WIND);
export const DEMO_LEGS = DEMO_NAVLOG.legs;
export const DEMO_TOTALS = DEMO_LEGS.reduce((total, leg) => ({ distance: total.distance + leg.distance, seconds: total.seconds + leg.ete, fuel: total.fuel + leg.fuelBurn }), { distance: 0, seconds: 0, fuel: 0 });
export const degrees = (value: number) => `${String(Math.round((value + 360) % 360) % 360).padStart(3, '0')}°`;
export const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
// Local equirectangular chart: longitude is scaled by latitude, so visual bearings
// match the true headings used to rotate the aircraft. All points use one projection.
export const project = (latitude: number, longitude: number): [number, number] => [95 + (longitude + 9.8) * 275 * Math.cos(39 * Math.PI / 180), 470 - (latitude - 38.25) * 275];
export const DEMO_POINTS = DEMO_WAYPOINTS.map(point => project(point.latitude, point.longitude));
