import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchMetarReport,
  fetchOpenMeteoSurface,
  fetchAirportSurfaceWeather,
  clearSurfaceWeatherCache,
} from '../engine/surface-weather';

describe('Surface Weather & METAR Engine', () => {
  beforeEach(() => {
    clearSurfaceWeatherCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly parses official NOAA AviationWeather METAR JSON response', async () => {
    const mockMetarData = [
      {
        icaoId: 'LPCS',
        receiptTime: '2026-09-06T20:04:44.867Z',
        obsTime: 1788724800,
        reportTime: '2026-09-06T20:00:00.000Z',
        temp: 23,
        dewp: 16,
        wdir: 360,
        wspd: 16,
        wgst: 24,
        altim: 1021,
        rawOb: 'METAR LPCS 062000Z 36016G24KT CAVOK 23/16 Q1021',
        fltCat: 'VFR',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMetarData,
    }) as any;

    const report = await fetchMetarReport('LPCS');
    expect(report).not.toBeNull();
    expect(report!.stationId).toBe('LPCS');
    expect(report!.windDirection).toBe(360);
    expect(report!.windSpeed).toBe(16);
    expect(report!.gustSpeed).toBe(24);
    expect(report!.temperature).toBe(23);
    expect(report!.altimeterQnh).toBe(1021);
    expect(report!.rawMetar).toBe('METAR LPCS 062000Z 36016G24KT CAVOK 23/16 Q1021');
    expect(report!.flightCategory).toBe('VFR');
    expect(report!.source).toBe('METAR (NOAA AWC)');
  });

  it('correctly parses Open-Meteo 10m surface forecast', async () => {
    const mockOpenMeteoData = {
      current: {
        time: '2026-09-06T20:00',
        wind_speed_10m: 12.4,
        wind_direction_10m: 320,
        wind_gusts_10m: 18.2,
        temperature_2m: 21.5,
        surface_pressure: 1018.2,
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockOpenMeteoData,
    }) as any;

    const report = await fetchOpenMeteoSurface(38.725, -9.355, 'LPCS');
    expect(report).not.toBeNull();
    expect(report!.windDirection).toBe(320);
    expect(report!.windSpeed).toBe(12);
    expect(report!.gustSpeed).toBe(18);
    expect(report!.temperature).toBe(22);
    expect(report!.altimeterQnh).toBe(1018);
    expect(report!.source).toBe('Open-Meteo Surface (10m)');
  });

  it('falls back to Open-Meteo if METAR returns 404 or empty data', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('aviationweather.gov')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          current: {
            wind_speed_10m: 9.8,
            wind_direction_10m: 140,
            temperature_2m: 19,
          },
        }),
      });
    }) as any;

    const report = await fetchAirportSurfaceWeather('LPCO', 40.158, -8.471);
    expect(report).not.toBeNull();
    expect(report!.windDirection).toBe(140);
    expect(report!.windSpeed).toBe(10);
    expect(report!.source).toBe('Open-Meteo Surface (10m)');
  });
});
