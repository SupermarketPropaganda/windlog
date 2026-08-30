// ─── Waypoint Types ───

export type WaypointType =
  | 'airport'
  | 'vor'
  | 'vor-dme'
  | 'vortac'
  | 'ndb'
  | 'ndb-dme'
  | 'dme'
  | 'tacan'
  | 'vrp'
  | 'custom';

export interface Waypoint {
  id: number;
  identifier: string;
  name: string;
  type: WaypointType;
  latitude: number;
  longitude: number;
  elevation?: number;   // feet MSL
  frequency?: number;   // kHz (navaids only)
  country: string;
  isCustom?: boolean;
}

// ─── Route Leg ───

export interface Leg {
  id: string;
  from: Waypoint;
  to: Waypoint;
  distance: number;             // nautical miles
  trueTrack: number;            // degrees true
  magneticVariation: number;    // degrees (+ East, − West)
  windCorrectionAngle: number;  // degrees
  trueHeading: number;          // degrees true
  magneticHeading: number;      // degrees magnetic
  groundSpeed: number;          // knots
  ete: number;                  // seconds (Infinity if 0 GS)
  altitude: number;             // cruise altitude in feet MSL for this specific leg
  wind?: Wind | null;           // specific wind aloft used for this leg
  fuelBurn: number;             // fuel consumed for this leg (in profile.fuelUnit)
}

// ─── Aircraft Profile ───

export type FuelUnit = 'gph' | 'lph';

export interface AircraftProfile {
  aircraftModel?: string; // e.g. "Cessna 172", "Piper PA-28", "Custom"
  cruiseAltitude: number; // feet MSL default
  tas: number;            // knots true airspeed
  fuelFlow: number;       // fuel burn rate in fuelUnit (e.g. 8.5 GPH or 32 L/h)
  fuelUnit: FuelUnit;     // 'gph' (Gallons per Hour) or 'lph' (Liters per Hour)
}

// ─── Wind ───

export interface Wind {
  direction: number; // degrees true (where wind is coming FROM)
  speed: number;     // knots
}

export type WindMode = 'auto' | 'manual';

export interface WindState {
  mode: WindMode;
  wind: Wind | null;
  lastUpdated: Date | null;
  source: string | null; // e.g. "Open-Meteo ECMWF" or "NOAA AWC" or "Manual"
}

// ─── Waypoint Resolution ───

export type WaypointStatus = 'resolved' | 'resolving' | 'not-found' | 'custom-pending';

export interface RouteToken {
  raw: string;
  identifier: string;
  altitudeOverride?: number; // e.g. from COIMB/4500 or COIMB@3500
  waypoint: Waypoint | null;
  status: WaypointStatus;
}

// ─── Nav Log Summary ───

export interface NavLogSummary {
  totalDistance: number;         // nautical miles
  totalEte: number;              // seconds
  totalFuel: number;             // total flight fuel burn (in profile.fuelUnit)
  vfrDayReserveFuel: number;     // +30 min legal VFR Day Reserve
  vfrNightReserveFuel: number;   // +45 min legal VFR Night Reserve
  minFuelRequiredDay: number;    // Trip Fuel + 30m reserve
  minFuelRequiredNight: number;  // Trip Fuel + 45m reserve
  legs: Leg[];
}
