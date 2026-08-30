import { describe, it, expect } from 'vitest';
import { parseAltitudeString, parseRouteString } from '../utils/route-parser';

describe('Route Parser: parseAltitudeString', () => {
  it('parses standard 4-digit and 3-digit altitudes (ft MSL)', () => {
    expect(parseAltitudeString('4500')).toBe(4500);
    expect(parseAltitudeString('3500')).toBe(3500);
    expect(parseAltitudeString('10000')).toBe(10000);
    expect(parseAltitudeString('500')).toBe(500);
    expect(parseAltitudeString('99999')).toBe(99999);
  });

  it('parses altitudes with FT suffix', () => {
    expect(parseAltitudeString('4500FT')).toBe(4500);
    expect(parseAltitudeString('3500ft')).toBe(3500);
    expect(parseAltitudeString('10000FT')).toBe(10000);
    expect(parseAltitudeString('500FT')).toBe(500);
  });

  it('parses Flight Levels (FLxxx and FLxx)', () => {
    expect(parseAltitudeString('FL045')).toBe(4500);
    expect(parseAltitudeString('fl045')).toBe(4500);
    expect(parseAltitudeString('FL45')).toBe(4500);
    expect(parseAltitudeString('FL100')).toBe(10000);
    expect(parseAltitudeString('FL350')).toBe(35000);
    expect(parseAltitudeString('FL000')).toBe(0);
  });

  it('parses Altitude tags (Axxx and Axx)', () => {
    expect(parseAltitudeString('A045')).toBe(4500);
    expect(parseAltitudeString('A45')).toBe(4500);
    expect(parseAltitudeString('A100')).toBe(10000);
    expect(parseAltitudeString('a035')).toBe(3500);
  });

  it('parses decimal thousands (e.g. 4.5, 4.5K, 4.5THOUSAND)', () => {
    expect(parseAltitudeString('4.5')).toBe(4500);
    expect(parseAltitudeString('4.5K')).toBe(4500);
    expect(parseAltitudeString('3.5k')).toBe(3500);
    expect(parseAltitudeString('10.5K')).toBe(10500);
    expect(parseAltitudeString('0.5K')).toBe(500);
  });

  it('handles edge cases & malformed altitudes', () => {
    // Empty & whitespace
    expect(parseAltitudeString('')).toBeUndefined();
    expect(parseAltitudeString('   ')).toBeUndefined();

    // Out of bounds or non-numeric
    expect(parseAltitudeString('999999')).toBeUndefined(); // > 5 digits
    expect(parseAltitudeString('-500')).toBeUndefined(); // Negative
    expect(parseAltitudeString('0')).toBeUndefined(); // < 3 digits and no dot
    expect(parseAltitudeString('ABC')).toBeUndefined();
    expect(parseAltitudeString('FL')).toBeUndefined();
    expect(parseAltitudeString('FLABC')).toBeUndefined();
    expect(parseAltitudeString('4.5.6')).toBeUndefined();
    expect(parseAltitudeString('NaN')).toBeUndefined();
    expect(parseAltitudeString('Infinity')).toBeUndefined();

    // Standalone integers with K suffix like 4K (lacking dot)
    // Note: Behavior observation - 4K does not contain dot, so test how it behaves
    const res4k = parseAltitudeString('4K');
    console.log('parseAltitudeString("4K"):', res4k);

    // 2-digit integer like 45 without FL/A
    const res45 = parseAltitudeString('45');
    console.log('parseAltitudeString("45"):', res45);
  });
});

describe('Route Parser: parseRouteString', () => {
  it('parses inline slash altitudes: LPCS COIMB/4500 LPCS/3500', () => {
    const res = parseRouteString('LPCS COIMB/4500 LPCS/3500');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
    expect(res[1]).toEqual({ raw: 'COIMB/4500', identifier: 'COIMB', altitudeOverride: 4500 });
    expect(res[2]).toEqual({ raw: 'LPCS/3500', identifier: 'LPCS', altitudeOverride: 3500 });
  });

  it('parses inline flight levels: LPCS/FL045 COIMB/FL035 LPCS', () => {
    const res = parseRouteString('LPCS/FL045 COIMB/FL035 LPCS');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS/FL045', identifier: 'LPCS', altitudeOverride: 4500 });
    expect(res[1]).toEqual({ raw: 'COIMB/FL035', identifier: 'COIMB', altitudeOverride: 3500 });
    expect(res[2]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
  });

  it('parses inline @ altitudes: LPCS@4500 COIMB@3500 LPCS', () => {
    const res = parseRouteString('LPCS@4500 COIMB@3500 LPCS');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS@4500', identifier: 'LPCS', altitudeOverride: 4500 });
    expect(res[1]).toEqual({ raw: 'COIMB@3500', identifier: 'COIMB', altitudeOverride: 3500 });
    expect(res[2]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
  });

  it('parses space-separated standalone FT altitudes: LPCS 4500FT COIMB 3500FT LPCS', () => {
    const res = parseRouteString('LPCS 4500FT COIMB 3500FT LPCS');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: 4500 });
    expect(res[1]).toEqual({ raw: 'COIMB', identifier: 'COIMB', altitudeOverride: 3500 });
    expect(res[2]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
  });

  it('parses space-separated standalone FL altitudes: LPCS FL045 COIMB FL035 LPCS', () => {
    const res = parseRouteString('LPCS FL045 COIMB FL035 LPCS');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: 4500 });
    expect(res[1]).toEqual({ raw: 'COIMB', identifier: 'COIMB', altitudeOverride: 3500 });
    expect(res[2]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
  });

  it('parses space-separated standalone raw 4-digit numbers: LPCS 4500 COIMB 3500 LPCS', () => {
    const res = parseRouteString('LPCS 4500 COIMB 3500 LPCS');
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: 4500 });
    expect(res[1]).toEqual({ raw: 'COIMB', identifier: 'COIMB', altitudeOverride: 3500 });
    expect(res[2]).toEqual({ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined });
  });

  it('evaluates standalone decimal K altitudes: LPCS 4.5K COIMB 3.5K LPCS', () => {
    const res = parseRouteString('LPCS 4.5K COIMB 3.5K LPCS');
    console.log('Result for "LPCS 4.5K COIMB 3.5K LPCS":', JSON.stringify(res));
  });

  it('handles malformed altitudes in inline tokens', () => {
    const res999999 = parseRouteString('LPCS/999999');
    expect(res999999[0].identifier).toBe('LPCS');
    expect(res999999[0].altitudeOverride).toBeUndefined();

    const resNeg = parseRouteString('LPCS/-500');
    expect(resNeg[0].identifier).toBe('LPCS');
    expect(resNeg[0].altitudeOverride).toBeUndefined();

    const resZero = parseRouteString('LPCS/0');
    expect(resZero[0].identifier).toBe('LPCS');
    expect(resZero[0].altitudeOverride).toBeUndefined();

    const resABC = parseRouteString('LPCS/ABC');
    expect(resABC[0].identifier).toBe('LPCS');
    expect(resABC[0].altitudeOverride).toBeUndefined();
  });

  it('handles standalone numbers without leading waypoints: 4500 3500', () => {
    const res = parseRouteString('4500 3500');
    console.log('Result for "4500 3500":', JSON.stringify(res));
    expect(res.length).toBeGreaterThan(0);
  });

  it('handles single waypoint: LPCS', () => {
    const res = parseRouteString('LPCS');
    expect(res).toEqual([{ raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined }]);
  });

  it('handles empty input and whitespace', () => {
    expect(parseRouteString('')).toEqual([]);
    expect(parseRouteString('   ')).toEqual([]);
    expect(parseRouteString('\t\n\r  ')).toEqual([]);
  });

  it('handles multiple irregular spaces: "  LPCS    COIMB   "', () => {
    const res = parseRouteString('  LPCS    COIMB   ');
    expect(res).toEqual([
      { raw: 'LPCS', identifier: 'LPCS', altitudeOverride: undefined },
      { raw: 'COIMB', identifier: 'COIMB', altitudeOverride: undefined },
    ]);
  });

  it('handles circular routes: LPCS COIMB LPPT LPCS', () => {
    const res = parseRouteString('LPCS COIMB LPPT LPCS');
    expect(res).toHaveLength(4);
    expect(res.map(r => r.identifier)).toEqual(['LPCS', 'COIMB', 'LPPT', 'LPCS']);
  });

  it('handles fixes with numbers and dashes: P25AB R24C D28A R40BN S-MIGUEL', () => {
    const res = parseRouteString('P25AB/2000 R24C/3000 D28A R40BN S-MIGUEL');
    expect(res[0]).toEqual({ raw: 'P25AB/2000', identifier: 'P25AB', altitudeOverride: 2000 });
    expect(res[1]).toEqual({ raw: 'R24C/3000', identifier: 'R24C', altitudeOverride: 3000 });
    expect(res[2]).toEqual({ raw: 'D28A', identifier: 'D28A', altitudeOverride: undefined });
    expect(res[3]).toEqual({ raw: 'R40BN', identifier: 'R40BN', altitudeOverride: undefined });
    expect(res[4]).toEqual({ raw: 'S-MIGUEL', identifier: 'S-MIGUEL', altitudeOverride: undefined });
  });

  it('handles trailing slashes or @ symbols without altitude', () => {
    const resSlash = parseRouteString('LPCS/ COIMB');
    const resAt = parseRouteString('LPCS@ COIMB');
    console.log('Result for "LPCS/ COIMB":', JSON.stringify(resSlash));
    console.log('Result for "LPCS@ COIMB":', JSON.stringify(resAt));
  });
});
