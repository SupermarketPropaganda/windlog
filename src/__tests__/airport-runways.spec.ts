import { describe, it, expect } from 'vitest';
import {
  findAirportRunways,
  generateGenericRunways,
  scoreRunwaysForWind,
} from '../data/airport-runways';

describe('Airport Runway Database & Scoring', () => {
  it('loads major Portuguese airport runway presets with accurate magnetic headings', () => {
    // LPCS (Cascais)
    const lpcs = findAirportRunways('LPCS');
    expect(lpcs).not.toBeNull();
    expect(lpcs!.runways).toHaveLength(2);
    expect(lpcs!.runways[0].designator).toBe('17');
    expect(lpcs!.runways[0].heading).toBe(167);
    expect(lpcs!.runways[1].designator).toBe('35');
    expect(lpcs!.runways[1].heading).toBe(347);

    // LPPT (Lisbon)
    const lppt = findAirportRunways('LPPT');
    expect(lppt).not.toBeNull();
    expect(lppt!.runways.length).toBeGreaterThanOrEqual(4);
    const rwy02 = lppt!.runways.find((r) => r.designator === '02');
    expect(rwy02?.heading).toBe(24);

    // LPFR (Faro)
    const lpfr = findAirportRunways('LPFR');
    expect(lpfr).not.toBeNull();
    const rwy10 = lpfr!.runways.find((r) => r.designator === '10');
    const rwy28 = lpfr!.runways.find((r) => r.designator === '28');
    expect(rwy10?.heading).toBe(97);
    expect(rwy28?.heading).toBe(277);

    // LPPR (Porto)
    const lppr = findAirportRunways('LPPR');
    expect(lppr).not.toBeNull();
    expect(lppr!.runways.some((r) => r.designator === '17')).toBe(true);
    expect(lppr!.runways.some((r) => r.designator === '35')).toBe(true);
  });

  it('handles case-insensitivity and whitespace in findAirportRunways', () => {
    expect(findAirportRunways('lpcs')).not.toBeNull();
    expect(findAirportRunways('  LpPt  ')).not.toBeNull();
    expect(findAirportRunways('UNKNOWN999')).toBeNull();
    expect(findAirportRunways('')).toBeNull();
  });

  it('generates reciprocal runway pairs accurately for generic headings', () => {
    const r1 = generateGenericRunways(170);
    expect(r1).toHaveLength(2);
    expect(r1[0].designator).toBe('17');
    expect(r1[0].heading).toBe(170);
    expect(r1[1].designator).toBe('35');
    expect(r1[1].heading).toBe(350);

    const r2 = generateGenericRunways(90);
    expect(r2[0].designator).toBe('09');
    expect(r2[0].heading).toBe(90);
    expect(r2[1].designator).toBe('27');
    expect(r2[1].heading).toBe(270);

    const r3 = generateGenericRunways(360);
    expect(r3[0].designator).toBe('36');
    expect(r3[1].designator).toBe('18');
  });

  it('scores runways and recommends the best headwind runway correctly', () => {
    const lpcs = findAirportRunways('LPCS')!;
    
    // Wind coming from 350° at 20 knots -> Runway 35 (347°M) should be best (headwind ~20kt), Runway 17 should be tailwind
    const scoredNorth = scoreRunwaysForWind(lpcs.runways, 350, 20);
    const bestNorth = scoredNorth.find((s) => s.isBest);
    expect(bestNorth).toBeDefined();
    expect(bestNorth!.runway.designator).toBe('35');
    expect(bestNorth!.headwind).toBeGreaterThan(15);

    const rwy17North = scoredNorth.find((s) => s.runway.designator === '17');
    expect(rwy17North!.headwind).toBeLessThan(-15); // Tailwind

    // Wind coming from 170° at 15 knots -> Runway 17 (167°M) should be best
    const scoredSouth = scoreRunwaysForWind(lpcs.runways, 170, 15);
    const bestSouth = scoredSouth.find((s) => s.isBest);
    expect(bestSouth).toBeDefined();
    expect(bestSouth!.runway.designator).toBe('17');
    expect(bestSouth!.headwind).toBeGreaterThan(14);
  });

  it('handles zero wind gracefully without erroneous recommendations', () => {
    const lpcs = findAirportRunways('LPCS')!;
    const scored = scoreRunwaysForWind(lpcs.runways, 0, 0);
    expect(scored).toHaveLength(2);
    expect(scored[0].headwind).toBe(0);
    expect(scored[0].crosswind).toBe(0);
    expect(scored.every((s) => !s.isBest)).toBe(true);
  });
});
