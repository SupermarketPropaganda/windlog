import { describe, it, expect } from 'vitest';
import { getAiracCycle, checkDatabaseAiracStatus } from '../engine/airac';

describe('AIRAC Exhaustive Stress Test and Fuzzing Suite', () => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const CYCLE_MS = 28 * MS_PER_DAY;

  /* =========================================================================
   * 1. 2020 to 2040 Continuous Daily Fuzzing (>7,500 days)
   * ========================================================================= */
  describe('Continuous Daily Calculation (2020-01-01 to 2040-12-31)', () => {
    it('verifies 28-day duration, day-of-week, consecutive cycles, and year rollover', () => {
      const startDate = new Date(Date.UTC(2020, 0, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(2040, 11, 31, 23, 59, 59));

      let current = new Date(startDate.getTime());
      let distinctCycles = new Map<string, ReturnType<typeof getAiracCycle>>();
      let daysCount = 0;

      while (current <= endDate) {
        daysCount++;
        const res = getAiracCycle(current);
        distinctCycles.set(res.cycle, res);

        // 1. Duration: Exactly 28 days (2,419,200,000 ms)
        // Expiration is at 23:59:59.000 (or .999), effective is at 00:00:00.000
        const durationMs = res.expirationDate.getTime() - res.effectiveDate.getTime() + 1000;
        expect(durationMs, `Cycle ${res.cycle} duration`).toBe(CYCLE_MS);

        // 2. Effective date: Thursday 00:00:00 UTC
        expect(res.effectiveDate.getUTCDay(), `Cycle ${res.cycle} effective day of week`).toBe(4); // 4 = Thursday
        expect(res.effectiveDate.getUTCHours(), `Cycle ${res.cycle} effective hour`).toBe(0);
        expect(res.effectiveDate.getUTCMinutes(), `Cycle ${res.cycle} effective min`).toBe(0);
        expect(res.effectiveDate.getUTCSeconds(), `Cycle ${res.cycle} effective sec`).toBe(0);

        // 3. Expiration date: Wednesday 23:59:59 UTC
        expect(res.expirationDate.getUTCDay(), `Cycle ${res.cycle} expiration day of week`).toBe(3); // 3 = Wednesday
        expect(res.expirationDate.getUTCHours(), `Cycle ${res.cycle} expiration hour`).toBe(23);
        expect(res.expirationDate.getUTCMinutes(), `Cycle ${res.cycle} expiration min`).toBe(59);
        expect(res.expirationDate.getUTCSeconds(), `Cycle ${res.cycle} expiration sec`).toBe(59);

        // 4. daysRemaining and isCurrent
        expect(res.isCurrent).toBe(true);
        expect(res.daysRemaining).toBeGreaterThanOrEqual(0);
        expect(res.daysRemaining).toBeLessThanOrEqual(28);

        // Advance to next day at 12:00 UTC to avoid DST or edge issues
        current = new Date(current.getTime() + MS_PER_DAY);
      }

      console.log(`Continuous days tested: ${daysCount}`);
      console.log(`Distinct cycles observed: ${distinctCycles.size}`);

      // Now verify consecutive cycles across all distinct cycles encountered
      const cycleList = Array.from(distinctCycles.values()).sort(
        (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime()
      );

      for (let i = 1; i < cycleList.length; i++) {
        const prev = cycleList[i - 1];
        const curr = cycleList[i];

        // Consecutive effective dates exactly 28 days apart
        expect(curr.effectiveDate.getTime() - prev.effectiveDate.getTime()).toBe(CYCLE_MS);

        if (curr.year === prev.year) {
          // Consecutive cycle numbers within year
          expect(curr.cycleNumber).toBe(prev.cycleNumber + 1);
          expect(curr.cycle).toBe(`${String(curr.year).slice(2)}${String(curr.cycleNumber).padStart(2, '0')}`);
        } else if (curr.year === prev.year + 1) {
          // Year rollover: new year prefix, cycle resets to 01
          expect(curr.cycleNumber).toBe(1);
          expect(curr.cycle).toBe(`${String(curr.year).slice(2)}01`);
          // Previous year must have had 13 or 14 cycles
          expect([13, 14]).toContain(prev.cycleNumber);
        } else {
          throw new Error(`Unexpected year step between ${prev.cycle} and ${curr.cycle}`);
        }
      }
    });
  });

  /* =========================================================================
   * 2. Edge-case Dates: Exact Millisecond Boundaries
   * ========================================================================= */
  describe('Millisecond Boundaries', () => {
    it('handles exact boundary 2026-08-26T23:59:59.999Z vs 2026-08-27T00:00:00.000Z', () => {
      const beforeBoundary = new Date('2026-08-26T23:59:59.999Z');
      const atBoundary = new Date('2026-08-27T00:00:00.000Z');

      const cycleBefore = getAiracCycle(beforeBoundary);
      const cycleAt = getAiracCycle(atBoundary);

      console.log('Boundary before (2026-08-26T23:59:59.999Z):', {
        cycle: cycleBefore.cycle,
        effectiveDate: cycleBefore.effectiveDate.toISOString(),
        expirationDate: cycleBefore.expirationDate.toISOString(),
        isCurrent: cycleBefore.isCurrent,
        daysRemaining: cycleBefore.daysRemaining
      });

      console.log('Boundary at (2026-08-27T00:00:00.000Z):', {
        cycle: cycleAt.cycle,
        effectiveDate: cycleAt.effectiveDate.toISOString(),
        expirationDate: cycleAt.expirationDate.toISOString(),
        isCurrent: cycleAt.isCurrent,
        daysRemaining: cycleAt.daysRemaining
      });

      // 2026-08-26T23:59:59.999Z is the final millisecond of cycle 2608
      expect(cycleBefore.cycle).toBe('2608');
      expect(cycleBefore.isCurrent).toBe(true);

      // 2026-08-27T00:00:00.000Z is the first millisecond of cycle 2609
      expect(cycleAt.cycle).toBe('2609');
      expect(cycleAt.isCurrent).toBe(true);
    });

    it('evaluates expiration millisecond boundary 2026-09-23T23:59:59.000Z vs 2026-09-23T23:59:59.999Z', () => {
      const at59sec = new Date('2026-09-23T23:59:59.000Z');
      const at999ms = new Date('2026-09-23T23:59:59.999Z');

      const c59 = getAiracCycle(at59sec);
      const c999 = getAiracCycle(at999ms);

      expect(c59.cycle).toBe('2609');
      expect(c59.isCurrent).toBe(true);
      expect(c999.cycle).toBe('2609');
      expect(c999.isCurrent).toBe(true);
    });
  });

  /* =========================================================================
   * 3. Leap Days (2024-02-29, 2028-02-29)
   * ========================================================================= */
  describe('Leap Days', () => {
    it('correctly calculates cycle for leap day 2024-02-29', () => {
      const leap2024 = new Date(Date.UTC(2024, 1, 29, 12, 0, 0));
      const res = getAiracCycle(leap2024);

      expect(res.year).toBe(2024);
      expect(res.cycle.startsWith('24')).toBe(true);
      expect(res.isCurrent).toBe(true);
      expect(Number.isNaN(res.cycleNumber)).toBe(false);
      expect(res.cycleNumber).toBeGreaterThan(0);
      expect(res.effectiveDate.getTime()).toBeLessThanOrEqual(leap2024.getTime());
      expect(res.expirationDate.getTime()).toBeGreaterThanOrEqual(leap2024.getTime());
    });

    it('correctly calculates cycle for leap day 2028-02-29', () => {
      const leap2028 = new Date(Date.UTC(2028, 1, 29, 12, 0, 0));
      const res = getAiracCycle(leap2028);

      expect(res.year).toBe(2028);
      expect(res.cycle.startsWith('28')).toBe(true);
      expect(res.isCurrent).toBe(true);
      expect(Number.isNaN(res.cycleNumber)).toBe(false);
      expect(res.cycleNumber).toBeGreaterThan(0);
    });
  });

  /* =========================================================================
   * 4. Distant Past (pre-2020) and Distant Future (2099)
   * ========================================================================= */
  describe('Distant Past & Future', () => {
    it('evaluates distant future year 2099', () => {
      const futureDate = new Date(Date.UTC(2099, 5, 15, 12, 0, 0));
      const res = getAiracCycle(futureDate);

      expect(res.year).toBe(2099);
      expect(res.cycle.startsWith('99')).toBe(true);
      expect(res.cycleNumber).toBeGreaterThanOrEqual(1);
      expect(res.cycleNumber).toBeLessThanOrEqual(14);
      expect(res.isCurrent).toBe(true);
      expect(Number.isNaN(res.daysRemaining)).toBe(false);
    });

    it('evaluates distant past pre-2020 (e.g. 2019, 2018, 1998)', () => {
      const pastDates = [
        new Date(Date.UTC(2019, 11, 1, 12, 0, 0)), // Dec 2019
        new Date(Date.UTC(2018, 5, 15, 12, 0, 0)),  // Jun 2018
        new Date(Date.UTC(1998, 0, 1, 12, 0, 0)),   // 1998
      ];

      for (const d of pastDates) {
        const res = getAiracCycle(d);
        console.log(`Pre-2020 date ${d.toISOString()}:`, {
          cycle: res.cycle,
          year: res.year,
          cycleNumber: res.cycleNumber,
          effective: res.effectiveDate.toISOString(),
          expiration: res.expirationDate.toISOString()
        });

        expect(res.year).toBe(res.effectiveDate.getUTCFullYear());
        expect(res.cycleNumber).toBeGreaterThanOrEqual(1);
        expect(res.cycleNumber).toBeLessThanOrEqual(14);
        expect(res.cycle).toBe(`${String(res.year).slice(2)}${String(res.cycleNumber).padStart(2, '0')}`);
        expect(res.isCurrent).toBe(true);
      }
    });
  });

  /* =========================================================================
   * 5. Database Status Evaluation (checkDatabaseAiracStatus)
   * ========================================================================= */
  describe('checkDatabaseAiracStatus Stress & Validation', () => {
    const refDate = new Date(Date.UTC(2026, 8, 11, 12, 0, 0)); // During 2609
    const activeCycle = getAiracCycle(refDate);

    it('evaluates exact match as CURRENT when daysRemaining > 5', () => {
      const report = checkDatabaseAiracStatus(activeCycle.cycle, refDate);
      expect(report.status).toBe('CURRENT');
      expect(report.dbCycleCode).toBe(activeCycle.cycle);
      expect(report.daysRemaining).toBe(activeCycle.daysRemaining);
      expect(report.message).toContain('is current');
    });

    it('evaluates exact match as EXPIRING_SOON when daysRemaining is between 1 and 5', () => {
      // Find a date where daysRemaining is 3
      const expiringDate = new Date(activeCycle.expirationDate.getTime() - 3 * MS_PER_DAY);
      const cycleAtExpiring = getAiracCycle(expiringDate);
      const report = checkDatabaseAiracStatus(cycleAtExpiring.cycle, expiringDate);

      expect(report.status).toBe('EXPIRING_SOON');
      expect(report.daysRemaining).toBeLessThanOrEqual(5);
      expect(report.daysRemaining).toBeGreaterThanOrEqual(1);
      expect(report.message).toContain('expires in');
    });

    it('evaluates older cycle as EXPIRED', () => {
      const report = checkDatabaseAiracStatus('2608', refDate);
      expect(report.status).toBe('EXPIRED');
      expect(report.daysRemaining).toBe(0);
      expect(report.message).toContain('is expired');
    });

    it('evaluates newer cycle as EXPIRED (or not current active)', () => {
      const report = checkDatabaseAiracStatus('2610', refDate);
      expect(report.status).toBe('EXPIRED');
      expect(report.daysRemaining).toBe(0);
    });

    it('handles malformed cycle strings gracefully without crashing', () => {
      const malformed = ['', '   ', '26', '269', 'INVALID', '9999', 'null', 'undefined', '2609 ', ' 2609'];
      for (const str of malformed) {
        const report = checkDatabaseAiracStatus(str, refDate);
        expect(report).toBeDefined();
        if (str.trim().toUpperCase() === activeCycle.cycle) {
          expect(['CURRENT', 'EXPIRING_SOON']).toContain(report.status);
        } else {
          expect(report.status).toBe('EXPIRED');
        }
        expect(typeof report.message).toBe('string');
        expect(Number.isFinite(report.daysRemaining)).toBe(true);
      }
    });
  });
});
