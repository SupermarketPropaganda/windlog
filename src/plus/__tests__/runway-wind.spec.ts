import { describe, it, expect } from 'vitest';
import { computeAirportRunwayAdvisory } from '../engine/runway-wind';

describe('Runway Wind Advisory Engine (AIP Portugal & VFR In-Flight)', () => {
  it('correctly calculates favored runway and wind vectors for LPCS (Cascais) with northwesterly wind (340° / 18 KT)', () => {
    // LPCS has RWY 17 (167°) and RWY 35 (347°)
    const advisory = computeAirportRunwayAdvisory('LPCS', 340, 18, 325, 15);
    expect(advisory).not.toBeNull();
    if (!advisory) return;

    expect(advisory.icao).toBe('LPCS');
    expect(advisory.favoredRunway.designator).toBe('35');
    // For 35 (heading 347°), wind from 340° is 7° off centerline -> strong headwind
    expect(advisory.favoredRunway.headwindKt).toBeGreaterThan(15);
    expect(advisory.favoredRunway.crosswindKt).toBeLessThan(5);
    expect(advisory.favoredRunway.crosswindStatus).toBe('SAFE');

    // RWY 17 should show tailwind
    const rwy17 = advisory.runways.find((r) => r.designator === '17');
    expect(rwy17).toBeDefined();
    expect(rwy17!.tailwindKt).toBeGreaterThan(15);
  });

  it('correctly calculates favored runway for LPPT (Lisbon) with southerly wind (210° / 25 KT)', () => {
    // LPPT has RWY 02/20 (024° / 204°) and 03/21 (032° / 212°)
    const advisory = computeAirportRunwayAdvisory('LPPT', 210, 25, 374, 15);
    expect(advisory).not.toBeNull();
    if (!advisory) return;

    // Favored runway should be 20 or 21 (heading 204° or 212°)
    expect(['20', '21']).toContain(advisory.favoredRunway.designator);
    expect(advisory.favoredRunway.headwindKt).toBeGreaterThan(20);
    expect(advisory.favoredRunway.tailwindKt).toBe(0);
  });

  it('flags crosswind caution and limit exceeded when winds exceed demonstrated limits', () => {
    // LPCS RWY 17/35 with direct 90° crosswind from 077° at 20 KT (limit 15 KT)
    const advisory = computeAirportRunwayAdvisory('LPCS', 77, 20, 325, 15);
    expect(advisory).not.toBeNull();
    if (!advisory) return;

    // Both runways have direct 20 KT crosswind
    advisory.runways.forEach((rwy) => {
      expect(rwy.crosswindKt).toBe(20);
      expect(rwy.crosswindStatus).toBe('LIMIT_EXCEEDED');
    });
  });

  it('handles unknown airports gracefully by generating generic 09/27 runways', () => {
    const advisory = computeAirportRunwayAdvisory('UNKNOWN', 270, 12, 100, 15);
    expect(advisory).not.toBeNull();
    if (!advisory) return;

    expect(advisory.runways.length).toBe(2);
    expect(advisory.favoredRunway.designator).toBe('27');
    expect(advisory.favoredRunway.headwindKt).toBe(12);
    expect(advisory.favoredRunway.crosswindKt).toBe(0);
  });
});
