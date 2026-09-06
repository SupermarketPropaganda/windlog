import { SurfaceWeatherReport } from '../types';

interface WeatherCacheEntry {
  report: SurfaceWeatherReport;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Fetches real-time official METAR from NOAA AviationWeather API.
 */
export async function fetchMetarReport(icao: string): Promise<SurfaceWeatherReport | null> {
  const cleanIcao = icao.toUpperCase().trim();
  if (!cleanIcao || cleanIcao.length < 3) return null;

  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(cleanIcao)}&format=json`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const ob = data[0];
    if (ob.wdir == null || ob.wspd == null) return null;

    const report: SurfaceWeatherReport = {
      stationId: cleanIcao,
      windDirection: Math.round(ob.wdir),
      windSpeed: Math.round(ob.wspd),
      gustSpeed: ob.wgst != null ? Math.round(ob.wgst) : undefined,
      temperature: ob.temp != null ? Math.round(ob.temp) : undefined,
      dewpoint: ob.dewp != null ? Math.round(ob.dewp) : undefined,
      altimeterQnh: ob.altim != null ? Math.round(ob.altim) : undefined,
      rawMetar: ob.rawOb || undefined,
      flightCategory: ob.fltCat || 'VFR',
      source: 'METAR (NOAA AWC)',
      observedAt: ob.reportTime ? new Date(ob.reportTime) : new Date(),
    };

    return report;
  } catch (error) {
    console.warn(`Error fetching METAR for ${cleanIcao}:`, error);
    return null;
  }
}

/**
 * Fetches high-resolution surface weather (10m AGL) from Open-Meteo for any latitude/longitude.
 */
export async function fetchOpenMeteoSurface(
  lat: number,
  lon: number,
  stationId: string = 'POINT'
): Promise<SurfaceWeatherReport | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,temperature_2m&wind_speed_unit=kn`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.current) return null;

    const cur = data.current;
    const report: SurfaceWeatherReport = {
      stationId,
      windDirection: Math.round(cur.wind_direction_10m ?? 0),
      windSpeed: Math.round(cur.wind_speed_10m ?? 0),
      gustSpeed: cur.wind_gusts_10m != null ? Math.round(cur.wind_gusts_10m) : undefined,
      temperature: cur.temperature_2m != null ? Math.round(cur.temperature_2m) : undefined,
      altimeterQnh: cur.surface_pressure != null ? Math.round(cur.surface_pressure) : undefined,
      rawMetar: undefined,
      flightCategory: 'VFR',
      source: 'Open-Meteo Surface (10m)',
      observedAt: cur.time ? new Date(cur.time) : new Date(),
    };

    return report;
  } catch (error) {
    console.warn(`Error fetching Open-Meteo surface wind for ${lat},${lon}:`, error);
    return null;
  }
}

/**
 * Fetches airport surface wind, trying official NOAA METAR first and falling back to Open-Meteo.
 * Includes short TTL caching.
 */
export async function fetchAirportSurfaceWeather(
  ident: string,
  lat?: number,
  lon?: number,
  forceRefresh: boolean = false
): Promise<SurfaceWeatherReport | null> {
  const cacheKey = `${ident.toUpperCase()}_${lat?.toFixed(3)}_${lon?.toFixed(3)}`;

  if (!forceRefresh) {
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.report;
    }
  }

  // 1. Try METAR for ICAO identifiers (4 letters or US 3-4 letters)
  if (ident && ident.length >= 3 && ident.length <= 4) {
    const metar = await fetchMetarReport(ident);
    if (metar) {
      weatherCache.set(cacheKey, { report: metar, timestamp: Date.now() });
      return metar;
    }
  }

  // 2. Fall back to Open-Meteo at coordinates
  if (lat != null && lon != null) {
    const openMeteo = await fetchOpenMeteoSurface(lat, lon, ident);
    if (openMeteo) {
      weatherCache.set(cacheKey, { report: openMeteo, timestamp: Date.now() });
      return openMeteo;
    }
  }

  return null;
}

/**
 * Clears in-memory weather cache (useful for testing)
 */
export function clearSurfaceWeatherCache(): void {
  weatherCache.clear();
}
