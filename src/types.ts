// ─── Navigation Views ───

export type ActiveView = 'navlog' | 'mass-balance' | 'runway-wind';

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

// ─── Mass & Balance (Weight & Balance) Types ───

export type WeightUnit = 'kg' | 'lbs';
export type ArmUnit = 'in' | 'm' | 'cm' | 'mm';
export type FuelType = 'avgas' | 'mogas' | 'jetA';

export interface CGEnvelopePoint {
  arm: number;
  weight: number;
}

export interface StationConfig {
  id: string;
  name: string;
  arm: number;
  weight: number;
  maxWeight?: number;
}

export interface FuelStationConfig {
  name: string;
  arm: number;
  fuelType: FuelType;
  capacityGallons?: number;
  capacityLiters?: number;
  takeoffFuelVolume: number; // in gallons or liters depending on display or profile
  fuelUnit: 'gal' | 'l';
}

export interface MassBalanceProfile {
  id: string;
  name: string;
  isCustom?: boolean;
  weightUnit: WeightUnit;
  armUnit: ArmUnit;
  emptyWeight: number;
  emptyArm: number;
  maxTakeoffWeight: number;
  maxLandingWeight?: number;
  stations: StationConfig[];
  fuelStation: FuelStationConfig;
  envelope: {
    normal: CGEnvelopePoint[];
    utility?: CGEnvelopePoint[];
  };
}

export interface MassBalanceResult {
  zeroFuelWeight: number;
  zeroFuelMoment: number;
  zeroFuelCG: number;
  
  takeoffWeight: number;
  takeoffMoment: number;
  takeoffCG: number;
  
  tripFuelWeight: number;
  landingWeight: number;
  landingMoment: number;
  landingCG: number;
  
  isZFWInEnvelope: boolean;
  isTOWInEnvelope: boolean;
  isLWInEnvelope: boolean;
  
  isOverweightTOW: boolean;
  isOverweightLW: boolean;
  
  weightMargin: number; // MTOW - TakeoffWeight (+ margin, - over)
  warnings: string[];
}

// ─── Runway Wind Calculator Types ───

export interface RunwayWindResult {
  runwayHeading: number;         // degrees magnetic (0-360)
  windDirection: number;         // degrees magnetic (0-360)
  windSpeed: number;             // knots
  gustSpeed?: number;            // knots
  
  headwind: number;              // knots (> 0 headwind, < 0 tailwind)
  crosswind: number;             // knots (absolute value)
  crosswindSide: 'left' | 'right' | 'direct';
  
  gustHeadwind?: number;         // knots
  gustCrosswind?: number;        // knots
  
  reciprocalHeading: number;     // degrees magnetic
  reciprocalHeadwind: number;    // knots
  reciprocalCrosswind: number;   // knots
  
  maxDemonstratedCrosswind?: number;
  crosswindStatus: 'safe' | 'caution' | 'exceeded'; // safe <= 70%, caution 70-100%, exceeded > 100%
  angleDifference: number;       // relative angle between runway and wind (-180 to +180)
}

// ─── Airport & Runway Definitions ───

export interface RunwayDefinition {
  designator: string;            // e.g. "17", "35", "02L", "20R"
  heading: number;               // degrees magnetic (e.g. 167)
  lengthMeters?: number;         // runway length in meters
  surface?: string;              // 'ASPHALT' | 'CONCRETE' | 'GRASS' | 'DIRT' | string
  reciprocalDesignator?: string; // e.g. "35"
}

export interface AirportRunwayInfo {
  icao: string;                  // e.g. "LPCS"
  name: string;                  // e.g. "Cascais Airport"
  elevation?: number;            // feet MSL
  runways: RunwayDefinition[];
}

// ─── Surface Weather & METAR ───

export interface SurfaceWeatherReport {
  stationId: string;             // ICAO identifier or coordinate string
  windDirection: number;         // degrees magnetic/true (where wind is coming from)
  windSpeed: number;             // knots
  gustSpeed?: number;            // knots
  temperature?: number;          // °C
  dewpoint?: number;             // °C
  altimeterQnh?: number;         // hPa / inHg
  rawMetar?: string;             // Raw METAR string if available (e.g. "METAR LPCS 062000Z 36016KT...")
  flightCategory?: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  source: 'METAR (NOAA AWC)' | 'Open-Meteo Surface (10m)' | 'Manual';
  observedAt: Date;
  isStale?: boolean;
}

