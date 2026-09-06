import { describe, it, expect } from 'vitest';
import { CURRENT_LEGAL_VERSION, LEGAL_SECTIONS, LEGAL_DOCUMENT_TITLE } from '../data/legal-terms';

describe('Aviation Legal Terms & Safety Disclaimer Integrity', () => {
  it('defines a valid semantic legal document version', () => {
    expect(CURRENT_LEGAL_VERSION).toBe('2026.1-REL');
    expect(LEGAL_DOCUMENT_TITLE).toContain('WINDLOG');
  });

  it('contains all 14 mandatory institutional legal sections plus critical notice', () => {
    expect(LEGAL_SECTIONS.length).toBeGreaterThanOrEqual(15);
    
    // 1. Critical Operational Notice
    const critical = LEGAL_SECTIONS.find((s) => s.id === 'section-critical-notice');
    expect(critical).toBeDefined();
    expect(critical!.isCallout).toBe(true);

    // 2. Section 1: PIC Authority
    const s1 = LEGAL_SECTIONS.find((s) => s.id === 'section-1-pic-authority');
    expect(s1).toBeDefined();
    expect(s1!.content.some((t) => t.includes('14 CFR § 91.3') && t.includes('Part-NCO.GEN.105'))).toBe(true);

    // 3. Section 2: Non-Certified Advisory Status
    const s2 = LEGAL_SECTIONS.find((s) => s.id === 'section-2-non-certified-status');
    expect(s2).toBeDefined();
    expect(s2!.content.some((t) => t.includes('AC 120-76') && t.includes('AMC 20-25'))).toBe(true);

    // 4. Section 3: Airspace Incursion & Terrain
    const s3 = LEGAL_SECTIONS.find((s) => s.id === 'section-3-airspace-terrain');
    expect(s3).toBeDefined();
    expect(s3!.content.some((t) => t.includes('Controlled Flight Into Terrain (CFIT)'))).toBe(true);

    // 5. Section 5: Mass & Balance POH Supremacy
    const s5 = LEGAL_SECTIONS.find((s) => s.id === 'section-5-mass-balance-poh');
    expect(s5).toBeDefined();
    expect(s5!.content.some((t) => t.includes('Pilot\'s Operating Handbook (POH)'))).toBe(true);

    // 6. Section 6: Fuel Reserves
    const s6 = LEGAL_SECTIONS.find((s) => s.id === 'section-6-fuel-reserves');
    expect(s6).toBeDefined();
    expect(s6!.content.some((t) => t.includes('14 CFR § 91.151') && t.includes('Part-NCO.OP.125'))).toBe(true);

    // 7. Section 7: Runway Crosswind & ICAO GRF
    const s7 = LEGAL_SECTIONS.find((s) => s.id === 'section-7-runway-crosswind');
    expect(s7).toBeDefined();
    expect(s7!.content.some((t) => t.includes('Global Reporting Format (GRF)'))).toBe(true);

    // 8. Section 12: UCC Warranty Disclaimers
    const s12 = LEGAL_SECTIONS.find((s) => s.id === 'section-12-ucc-warranty');
    expect(s12).toBeDefined();
    expect(s12!.isUccCaps).toBe(true);
    expect(s12!.content.some((t) => t.includes('MERCHANTABILITY') && t.includes('FITNESS FOR A PARTICULAR PURPOSE'))).toBe(true);

    // 9. Section 13: Liability Cap & UK/EU Savings Clause
    const s13 = LEGAL_SECTIONS.find((s) => s.id === 'section-13-limitation-liability');
    expect(s13).toBeDefined();
    expect(s13!.content.some((t) => t.includes('UK Consumer Rights Act 2015') && t.includes('Directive 93/13/EEC'))).toBe(true);
  });
});
