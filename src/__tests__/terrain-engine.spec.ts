import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateRouteTrackSamples,
  buildTerrainCacheKey,
  generateFallbackTerrainProfile,
  fetchTerrainProfile,
} from '../engine/terrain-engine';
import { Leg, Waypoint } from '../types';

const mockWptA: Waypoint = {
  id: 1,
  identifier: 'LPCS',
  name: 'Cascais Tires',
  type: 'airport',
  latitude: 38.7255,
  longitude: -9.3552,
  elevation: 326,
  country: 'PT',
};

const mockWptB: Waypoint = {
  id: 2,
  identifier: 'LPCO',
  name: 'Coimbra',
  type: 'airport',
  latitude: 40.1586,
  longitude: -8.4697,
  elevation: 574,
  country: 'PT',
};

const mockWptC: Waypoint = {
  id: 3,
  identifier: 'LPPR',
  name: 'Porto Maia',
  type: 'airport',
  latitude: 41.2481,
  longitude: -8.6814,
  elevation: 228,
  country: 'PT',
};

const mockLegs: Leg[] = [
  {
    id: 'leg-1',
    from: mockWptA,
    to: mockWptB,
    distance: 95.2,
    trueTrack: 28,
    magneticVariation: -1.5,
    windCorrectionAngle: 2,
    trueHeading: 30,
    magneticHeading: 31.5,
    groundSpeed: 105,
    ete: 3264,
    altitude: 4500,
    fuelBurn: 7.7,
  },
  {
    id: 'leg-2',
    from: mockWptB,
    to: mockWptC,
    distance: 66.1,
    trueTrack: 349,
    magneticVariation: -1.8,
    windCorrectionAngle: -1,
    trueHeading: 348,
    magneticHeading: 349.8,
    groundSpeed: 110,
    ete: 2163,
    altitude: 3500,
    fuelBurn: 5.1,
  },
];

describe('Terrain Digital Elevation Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a deterministic cache key based on route properties', () => {
    const key1 = buildTerrainCacheKey(mockLegs);
    const key2 = buildTerrainCacheKey(mockLegs);
    expect(key1).toBe(key2);
    expect(key1).toContain('LPCS');
    expect(key1).toContain('LPCO');
    expect(key1).toContain('LPPR');
    expect(key1).toContain('4500');
    expect(key1).toContain('3500');
  });

  it('generates accurate great-circle track sample points across legs', () => {
    const samples = generateRouteTrackSamples(mockLegs, 40);
    expect(samples.length).toBeGreaterThanOrEqual(40);

    // First sample should start at distance 0 with departure coordinates
    expect(samples[0].distNm).toBe(0);
    expect(samples[0].latitude).toBeCloseTo(mockWptA.latitude, 3);
    expect(samples[0].longitude).toBeCloseTo(mockWptA.longitude, 3);
    expect(samples[0].cruiseAltFt).toBe(4500);

    // Last sample should end at total route distance with destination coordinates
    const totalDist = mockLegs[0].distance + mockLegs[1].distance;
    const last = samples[samples.length - 1];
    expect(last.distNm).toBeCloseTo(totalDist, 1);
    expect(last.latitude).toBeCloseTo(mockWptC.latitude, 3);
    expect(last.longitude).toBeCloseTo(mockWptC.longitude, 3);
    expect(last.cruiseAltFt).toBe(3500);

    // Samples should strictly increase in distance
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].distNm).toBeGreaterThanOrEqual(samples[i - 1].distNm);
    }
  });

  it('computes fallback terrain profile with linear waypoint interpolation', () => {
    const trackPoints = generateRouteTrackSamples(mockLegs, 30);
    const result = generateFallbackTerrainProfile(mockLegs, trackPoints);

    expect(result.source).toBe('fallback');
    expect(result.samples.length).toBe(trackPoints.length);
    expect(result.maxTerrainFt).toBeGreaterThanOrEqual(574); // Coimbra elevation is 574 ft
    expect(result.minClearanceFt).toBeGreaterThan(0);
    expect(result.hasWarning).toBe(false); // 4500ft and 3500ft vs 574ft has plenty of clearance (> 500ft)
  });

  it('triggers terrain proximity warning if cruise altitude is within 500 ft of terrain', () => {
    const lowAltLegs: Leg[] = [
      {
        ...mockLegs[0],
        altitude: 700, // Coimbra is 574 ft, so clearance is 126 ft (< 500 ft threshold!)
      },
    ];

    const trackPoints = generateRouteTrackSamples(lowAltLegs, 20);
    const result = generateFallbackTerrainProfile(lowAltLegs, trackPoints);

    expect(result.hasWarning).toBe(true);
    expect(result.minClearanceFt).toBeLessThan(500);
    expect(result.samples.some((s) => s.isWarning)).toBe(true);
  });

  it('fetches elevation from Open-Meteo API and parses correctly', async () => {
    const samplePoints = generateRouteTrackSamples(mockLegs, 60);
    const fakeElevationsMeters = samplePoints.map((_, i) => (i === 10 ? 200 : 100));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: fakeElevationsMeters }),
    });

    const result = await fetchTerrainProfile(mockLegs);
    expect(result.source).toBe('api');
    expect(result.samples.length).toBe(fakeElevationsMeters.length);

    // 200m * 3.28084 ≈ 656 ft
    expect(result.maxTerrainFt).toBe(Math.round(200 * 3.28084));
    expect(result.hasWarning).toBe(false);
  });

  it('handles API error gracefully and reverts to fallback', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    // Different altitude to avoid cache hit from previous test
    const unCachedLegs: Leg[] = [
      {
        ...mockLegs[0],
        altitude: 5500,
      },
    ];

    const result = await fetchTerrainProfile(unCachedLegs);
    expect(result.source).toBe('fallback');
    expect(result.samples.length).toBeGreaterThan(0);
    expect(result.maxTerrainFt).toBeGreaterThan(0);
  });
});
