import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOpenMeteoWinds, fetchWindsAloft } from '../data/winds-aloft';

describe('Flight Departure Time & Wind Aloft Forecast Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries Open-Meteo forecast with forecast_days=14 and matches target hour', async () => {
    // Generate synthetic hourly forecast timestamps for 3 days
    const mockHourlyTimes: string[] = [];
    const mockSpeeds900: number[] = [];
    const mockDirs900: number[] = [];
    const mockSpeeds850: number[] = [];
    const mockDirs850: number[] = [];

    const baseDate = new Date('2026-09-24T00:00:00.000Z');
    for (let i = 0; i < 72; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      const iso = d.toISOString().substring(0, 16); // e.g. "2026-09-24T14:00"
      mockHourlyTimes.push(iso);

      // Vary wind speed and direction by hour so we can verify target hour extraction
      mockSpeeds900.push(20 + (i % 10)); // km/h
      mockDirs900.push((270 + i * 2) % 360);
      mockSpeeds850.push(30 + (i % 10));
      mockDirs850.push((280 + i * 2) % 360);
    }

    const mockResponse = {
      hourly: {
        time: mockHourlyTimes,
        wind_speed_950hPa: mockSpeeds900,
        wind_direction_950hPa: mockDirs900,
        wind_speed_900hPa: mockSpeeds900,
        wind_direction_900hPa: mockDirs900,
        wind_speed_850hPa: mockSpeeds850,
        wind_direction_850hPa: mockDirs850,
        wind_speed_700hPa: mockSpeeds850,
        wind_direction_700hPa: mockDirs850,
        wind_speed_500hPa: mockSpeeds850,
        wind_direction_500hPa: mockDirs850,
        wind_speed_400hPa: mockSpeeds850,
        wind_direction_400hPa: mockDirs850,
        wind_speed_300hPa: mockSpeeds850,
        wind_direction_300hPa: mockDirs850,
      },
    };

    let requestedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        json: async () => mockResponse,
      });
    });

    const targetDate = '2026-09-24T14:00:00.000Z';
    const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, targetDate);

    expect(requestedUrl).toContain('forecast_days=14');
    expect(wind).not.toBeNull();
    expect(wind?.speed).toBeGreaterThan(0);
    expect(wind?.direction).toBeGreaterThanOrEqual(0);
    expect(wind?.direction).toBeLessThanOrEqual(360);
  });

  it('clamps to closest available hourly forecast if target date is outside bounds', async () => {
    const mockHourlyTimes = ['2026-09-24T00:00', '2026-09-24T01:00'];
    const mockResponse = {
      hourly: {
        time: mockHourlyTimes,
        wind_speed_850hPa: [30, 40],
        wind_direction_850hPa: [270, 280],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    // Requesting a date 10 days out when only 2 hours available
    const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, '2026-10-05T12:00:00.000Z');
    expect(wind).not.toBeNull();
    // Clamped to closest index (index 1) -> 40 km/h / 1.852 ≈ 22 kt
    expect(wind?.speed).toBe(Math.round(40 / 1.852));
    expect(wind?.direction).toBe(280);
  });

  it('fetchWindsAloft passes targetDate parameter to Open-Meteo', async () => {
    let calledWithTargetDate = false;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('api.open-meteo.com')) {
        calledWithTargetDate = true;
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          hourly: {
            time: ['2026-09-25T15:00'],
            wind_speed_850hPa: [25],
            wind_direction_850hPa: [310],
          },
        }),
      });
    });

    const wind = await fetchWindsAloft(38.7, -9.1, 5000, '2026-09-25T15:00:00.000Z');
    expect(calledWithTargetDate).toBe(true);
    expect(wind).not.toBeNull();
    expect(wind?.direction).toBe(310);
  });
});
