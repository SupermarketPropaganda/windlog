import { Wind } from '../types';

interface Station {
  id: string;
  lat: number;
  lon: number;
}

/** US winds aloft reporting stations with coordinates */
const US_STATIONS: Station[] = [
  { id: 'BOS', lat: 42.3656, lon: -71.0096 },
  { id: 'JFK', lat: 40.6413, lon: -73.7781 },
  { id: 'DCA', lat: 38.8521, lon: -77.0377 },
  { id: 'MIA', lat: 25.7959, lon: -80.2870 },
  { id: 'ORD', lat: 41.9742, lon: -87.9073 },
  { id: 'DFW', lat: 32.8998, lon: -97.0403 },
  { id: 'DEN', lat: 39.8561, lon: -104.6737 },
  { id: 'SLC', lat: 40.7899, lon: -111.9791 },
  { id: 'SFO', lat: 37.6213, lon: -122.3790 },
  { id: 'SEA', lat: 47.4502, lon: -122.3088 },
  { id: 'LAX', lat: 33.9416, lon: -118.4085 },
  { id: 'ATL', lat: 33.6407, lon: -84.4277 },
];

/** Simple distance in km between two lat/lon points */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Find the nearest US winds aloft station to a given lat/lon */
function findNearestStation(lat: number, lon: number): Station {
  let nearest = US_STATIONS[0];
  let minDist = getDistance(lat, lon, nearest.lat, nearest.lon);
  for (let i = 1; i < US_STATIONS.length; i++) {
    const d = getDistance(lat, lon, US_STATIONS[i].lat, US_STATIONS[i].lon);
    if (d < minDist) {
      nearest = US_STATIONS[i];
      minDist = d;
    }
  }
  return nearest;
}

/**
 * Parse a NOAA wind group (DDff or DDff±TT format).
 * DD = direction in tens of degrees, ff = speed in knots.
 * If DD > 50, subtract 50 for direction and add 100 to speed.
 * 9900 = light and variable.
 */
function parseNoaaWindGroup(group: string): Wind | null {
  if (!group || group.trim().length === 0) return null;
  const val = group.trim().split(/[+-]/)[0]; // strip temperature suffix

  if (val === '9900') return { direction: 0, speed: 0 };

  if (val.length >= 4) {
    const dd = parseInt(val.substring(0, 2), 10);
    const ff = parseInt(val.substring(2, 4), 10);
    if (isNaN(dd) || isNaN(ff)) return null;

    let direction = dd * 10;
    let speed = ff;
    if (dd > 50) {
      direction = (dd - 50) * 10;
      speed = ff + 100;
    }
    return { direction, speed };
  }
  return null;
}

/**
 * Interpolates wind between two altitude levels handling 360° circular direction wraps.
 */
function interpolateWind(
  alt: number,
  lowerAlt: number,
  lowerWind: Wind,
  upperAlt: number,
  upperWind: Wind
): Wind {
  if (lowerAlt === upperAlt) return lowerWind;
  const ratio = Math.max(0, Math.min(1, (alt - lowerAlt) / (upperAlt - lowerAlt)));

  let d1 = lowerWind.direction;
  let d2 = upperWind.direction;
  if (Math.abs(d2 - d1) > 180) {
    if (d1 < d2) d1 += 360;
    else d2 += 360;
  }
  let interpDir = Math.round(d1 + ratio * (d2 - d1));
  if (interpDir >= 360) interpDir -= 360;
  if (interpDir < 0) interpDir += 360;

  const interpSpeed = Math.round(lowerWind.speed + ratio * (upperWind.speed - lowerWind.speed));

  return { direction: interpDir, speed: Math.max(0, interpSpeed) };
}

/**
 * Fetches winds aloft data from NOAA for US locations.
 */
export async function fetchNoaaWinds(
  latitude: number,
  longitude: number,
  altitudeFeet: number
): Promise<Wind | null> {
  const nearest = findNearestStation(latitude, longitude);

  try {
    const response = await fetch(
      'https://aviationweather.gov/api/data/windtemp?region=us&level=low&fcst=06'
    );
    if (!response.ok) return null;

    const text = await response.text();
    const lines = text.split('\n');

    let headerLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('3000') && lines[i].includes('6000')) {
        headerLineIndex = i;
        break;
      }
    }
    if (headerLineIndex === -1) return null;

    const header = lines[headerLineIndex];
    const levels = [3000, 6000, 9000, 12000, 18000, 24000];
    const columnIndices = levels.map((level) => header.indexOf(level.toString()));

    let stationLine = '';
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith(nearest.id)) {
        stationLine = lines[i];
        break;
      }
    }
    if (!stationLine) return null;

    const windsAtLevels: { level: number; wind: Wind }[] = [];
    for (let i = 0; i < levels.length; i++) {
      const idx = columnIndices[i];
      if (idx !== -1) {
        const group = stationLine
          .substring(Math.max(4, idx - 2), idx + 8)
          .trim()
          .split(/\s+/)[0];
        const parsed = parseNoaaWindGroup(group);
        if (parsed) {
          windsAtLevels.push({ level: levels[i], wind: parsed });
        }
      }
    }

    if (windsAtLevels.length === 0) return null;
    if (altitudeFeet <= windsAtLevels[0].level) return windsAtLevels[0].wind;
    if (altitudeFeet >= windsAtLevels[windsAtLevels.length - 1].level)
      return windsAtLevels[windsAtLevels.length - 1].wind;

    for (let i = 0; i < windsAtLevels.length - 1; i++) {
      const lower = windsAtLevels[i];
      const upper = windsAtLevels[i + 1];
      if (altitudeFeet >= lower.level && altitudeFeet <= upper.level) {
        return interpolateWind(altitudeFeet, lower.level, lower.wind, upper.level, upper.wind);
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching NOAA winds:', error);
    return null;
  }
}

/**
 * Standard ISA pressure level to approximate altitude in feet MSL.
 */
const PRESSURE_LEVELS = [
  { hPa: 950, altFt: 1500 },
  { hPa: 900, altFt: 3000 },
  { hPa: 850, altFt: 5000 },
  { hPa: 700, altFt: 10000 },
  { hPa: 500, altFt: 18000 },
  { hPa: 400, altFt: 24000 },
  { hPa: 300, altFt: 30000 },
];

/**
 * Fetches winds aloft data from Open-Meteo for global locations (ECMWF & GFS models).
 * Interpolates wind direction and speed continuously for the exact requested cruising altitude.
 */
export async function fetchOpenMeteoWinds(
  latitude: number,
  longitude: number,
  altitudeFeet: number
): Promise<Wind | null> {
  const speedVars = PRESSURE_LEVELS.map((p) => `wind_speed_${p.hPa}hPa`).join(',');
  const dirVars = PRESSURE_LEVELS.map((p) => `wind_direction_${p.hPa}hPa`).join(',');

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&hourly=${speedVars},${dirVars}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.hourly || !data.hourly.time) return null;

    // Find current forecast index
    const now = new Date();
    const currentHourStr = now.toISOString().substring(0, 14) + '00';
    let index = data.hourly.time.findIndex((t: string) => t >= currentHourStr);
    if (index === -1) index = 0;

    const windsAtLevels: { level: number; wind: Wind }[] = [];

    for (const p of PRESSURE_LEVELS) {
      const sKey = `wind_speed_${p.hPa}hPa`;
      const dKey = `wind_direction_${p.hPa}hPa`;

      const speedKmh = data.hourly[sKey]?.[index];
      const direction = data.hourly[dKey]?.[index];

      if (speedKmh != null && direction != null) {
        windsAtLevels.push({
          level: p.altFt,
          wind: {
            direction: Math.round(direction),
            speed: Math.round(speedKmh / 1.852), // km/h to knots
          },
        });
      }
    }

    if (windsAtLevels.length === 0) return null;

    // Clamp or interpolate
    if (altitudeFeet <= windsAtLevels[0].level) return windsAtLevels[0].wind;
    if (altitudeFeet >= windsAtLevels[windsAtLevels.length - 1].level)
      return windsAtLevels[windsAtLevels.length - 1].wind;

    for (let i = 0; i < windsAtLevels.length - 1; i++) {
      const lower = windsAtLevels[i];
      const upper = windsAtLevels[i + 1];
      if (altitudeFeet >= lower.level && altitudeFeet <= upper.level) {
        return interpolateWind(altitudeFeet, lower.level, lower.wind, upper.level, upper.wind);
      }
    }

    return windsAtLevels[0].wind;
  } catch (error) {
    console.error('Error fetching Open-Meteo winds:', error);
    return null;
  }
}

/**
 * Fetches winds aloft, using NOAA for US locations and Open-Meteo globally.
 */
export async function fetchWindsAloft(
  latitude: number,
  longitude: number,
  altitudeFeet: number
): Promise<Wind | null> {
  const isUS = latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66;

  if (isUS) {
    const noaaWinds = await fetchNoaaWinds(latitude, longitude, altitudeFeet);
    if (noaaWinds) return noaaWinds;
  }

  return fetchOpenMeteoWinds(latitude, longitude, altitudeFeet);
}

/**
 * Parses manual wind input in the format "270/15" (direction/speed).
 */
export function parseManualWind(input: string): Wind | null {
  const match = input.trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
  if (!match) return null;

  const direction = parseInt(match[1], 10);
  const speed = parseInt(match[2], 10);

  if (isNaN(direction) || isNaN(speed)) return null;
  if (direction < 0 || direction > 360 || speed < 0) return null;

  return { direction, speed };
}
