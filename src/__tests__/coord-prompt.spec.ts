import { describe, it, expect } from 'vitest';
import { parseCoordinates } from '../components/CoordPrompt';

describe('Coordinate Parser: parseCoordinates', () => {
  it('parses comma-separated decimal degrees (DD)', () => {
    const res1 = parseCoordinates('38.725, -9.355');
    expect(res1).not.toBeNull();
    expect(res1?.lat).toBeCloseTo(38.725);
    expect(res1?.lon).toBeCloseTo(-9.355);

    const res2 = parseCoordinates('38.725,-9.355');
    expect(res2).not.toBeNull();
    expect(res2?.lat).toBeCloseTo(38.725);
    expect(res2?.lon).toBeCloseTo(-9.355);

    const res3 = parseCoordinates('-38.725, -9.355');
    expect(res3).not.toBeNull();
    expect(res3?.lat).toBeCloseTo(-38.725);
    expect(res3?.lon).toBeCloseTo(-9.355);

    const res4 = parseCoordinates('0, 0');
    expect(res4).not.toBeNull();
    expect(res4?.lat).toBe(0);
    expect(res4?.lon).toBe(0);
  });

  it('evaluates leading plus signs in DD coordinates (+38.725, -9.355)', () => {
    const resPlus = parseCoordinates('+38.725, -9.355');
    console.log('Result for "+38.725, -9.355":', resPlus);
  });

  it('evaluates space-separated DD coordinates without comma (38.725 -9.355)', () => {
    const resSpace = parseCoordinates('38.725 -9.355');
    console.log('Result for "38.725 -9.355":', resSpace);
  });

  it('parses standard DMS coordinates with leading direction (N38°43\'30" W009°21\'19")', () => {
    const res = parseCoordinates('N38°43\'30" W009°21\'19"');
    expect(res).not.toBeNull();
    expect(res?.lat).toBeCloseTo(38 + 43/60 + 30/3600);
    expect(res?.lon).toBeCloseTo(-(9 + 21/60 + 19/3600));

    const resSouthEast = parseCoordinates('S38°43\'30" E009°21\'19"');
    expect(resSouthEast).not.toBeNull();
    expect(resSouthEast?.lat).toBeCloseTo(-(38 + 43/60 + 30/3600));
    expect(resSouthEast?.lon).toBeCloseTo(9 + 21/60 + 19/3600);
  });

  it('evaluates DMS with trailing direction (38°43\'30"N 009°21\'19"W)', () => {
    const resTrailing = parseCoordinates('38°43\'30"N 009°21\'19"W');
    console.log('Result for trailing direction "38°43\'30\\"N 009°21\'19\\"W":', resTrailing);
  });

  it('evaluates single coordinate (38°43\'30"N)', () => {
    const resSingle = parseCoordinates('38°43\'30"N');
    console.log('Result for single coordinate "38°43\'30\\"N":', resSingle);
    expect(resSingle).toBeNull();
  });

  it('evaluates out of bounds coordinates', () => {
    const latOutOfBounds = parseCoordinates('95.0, -9.355');
    console.log('Result for lat out of bounds "95.0, -9.355":', latOutOfBounds);

    const lonOutOfBounds = parseCoordinates('38.725, 195.0');
    console.log('Result for lon out of bounds "38.725, 195.0":', lonOutOfBounds);

    const dmsOutOfBounds = parseCoordinates('N95°00\'00" W009°00\'00"');
    console.log('Result for DMS lat out of bounds "N95°00\'00\\" W009°00\'00\\"":', dmsOutOfBounds);

    const dmsInvalidMinSec = parseCoordinates('N38°75\'99" W009°85\'99"');
    console.log('Result for DMS invalid min/sec "N38°75\'99\\" W009°85\'99\\"":', dmsInvalidMinSec);
  });

  it('handles invalid / garbage inputs gracefully', () => {
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('   ')).toBeNull();
    expect(parseCoordinates('abc, def')).toBeNull();
    expect(parseCoordinates('38.725')).toBeNull();
    expect(parseCoordinates('NaN, NaN')).toBeNull();
    expect(parseCoordinates('Infinity, -Infinity')).toBeNull();
    expect(parseCoordinates('38.725, ')).toBeNull();
    expect(parseCoordinates(', -9.355')).toBeNull();
  });
});
