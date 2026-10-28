import { describe, it, expect } from 'vitest';
import { computeTrafficCircuitPattern } from '../engine/circuit-pattern';

describe('VFR Traffic Circuit / Pattern Engine (FAA/ICAO Standards)', () => {
  it('generates standard left-hand traffic pattern geometry for LPCS RWY 35', () => {
    // LPCS (Cascais): Lat ~38.7255, Lon ~-9.3552, Elev 325 FT, RWY 35 (heading 347°)
    const pattern = computeTrafficCircuitPattern(
      38.7255,
      -9.3552,
      347,
      '35',
      325,
      'LEFT',
      1700,
      1000
    );

    expect(pattern.runwayDesignator).toBe('35');
    expect(pattern.runwayHeadingMag).toBe(347);
    expect(pattern.patternDirection).toBe('LEFT');
    // Pattern Altitude: 325 + 1000 = 1325 FT MSL
    expect(pattern.patternAltMslFt).toBe(1325);
    expect(pattern.patternAltAglFt).toBe(1000);

    // Downwind heading should be reciprocal of 347 -> 167°
    expect(pattern.downwindHeadingMag).toBe(167);
    // Base heading for left turn: 167 - 90 = 77°
    expect(pattern.baseHeadingMag).toBe(77);
    // Final heading: 347°
    expect(pattern.finalHeadingMag).toBe(347);

    // Circuit coordinates must form a closed loop (at least 5 points, first equals last)
    expect(pattern.circuitCoordinates.length).toBeGreaterThanOrEqual(6);
    const firstCoord = pattern.circuitCoordinates[0];
    const lastCoord = pattern.circuitCoordinates[pattern.circuitCoordinates.length - 1];
    expect(firstCoord[0]).toBeCloseTo(lastCoord[0], 5);
    expect(firstCoord[1]).toBeCloseTo(lastCoord[1], 5);

    // 45° Downwind Entry vector has 2 coordinates [start, midfield]
    expect(pattern.entryVectorCoordinates.length).toBe(2);
    expect(pattern.entryVectorCoordinates[1][0]).toBeCloseTo(pattern.downwindMidpoint[0], 5);
    expect(pattern.entryVectorCoordinates[1][1]).toBeCloseTo(pattern.downwindMidpoint[1], 5);
  });

  it('correctly adapts geometry for right-hand pattern direction', () => {
    const pattern = computeTrafficCircuitPattern(
      38.7255,
      -9.3552,
      347,
      '35',
      325,
      'RIGHT',
      1700,
      1000
    );

    expect(pattern.patternDirection).toBe('RIGHT');
    // For right-hand turn: base heading is 167 + 90 = 257°
    expect(pattern.baseHeadingMag).toBe(257);
  });
});
