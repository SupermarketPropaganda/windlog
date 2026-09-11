import { describe, it, expect } from 'vitest';
import { getAiracCycle, checkDatabaseAiracStatus } from '../engine/airac';

describe('ICAO 28-Day AIRAC Cycle Engine', () => {
  it('correctly calculates the anchor cycle 2001 (Jan 23, 2020)', () => {
    const d = new Date(Date.UTC(2020, 0, 23, 12, 0, 0));
    const cycle = getAiracCycle(d);
    expect(cycle.cycle).toBe('2001');
    expect(cycle.isCurrent).toBe(true);
    expect(cycle.year).toBe(2020);
    expect(cycle.cycleNumber).toBe(1);
  });

  it('correctly advances to cycle 2002 after 28 days (Feb 20, 2020)', () => {
    const d = new Date(Date.UTC(2020, 1, 20, 12, 0, 0));
    const cycle = getAiracCycle(d);
    expect(cycle.cycle).toBe('2002');
    expect(cycle.cycleNumber).toBe(2);
  });

  it('correctly calculates cycle for September 2026 (AIRAC 2609)', () => {
    // 2026-09-11 is within AIRAC 2609 (2026-09-03 to 2026-09-30)
    const d = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));
    const cycle = getAiracCycle(d);
    expect(cycle.cycle).toBe('2609');
    expect(cycle.year).toBe(2026);
    expect(cycle.cycleNumber).toBe(9);
    expect(cycle.isCurrent).toBe(true);
    expect(cycle.daysRemaining).toBeGreaterThan(0);
    expect(cycle.daysRemaining).toBeLessThanOrEqual(28);
  });

  it('evaluates current database status as CURRENT', () => {
    const d = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));
    const report = checkDatabaseAiracStatus('2609', d);
    expect(report.status).toBe('CURRENT');
    expect(report.dbCycleCode).toBe('2609');
    expect(report.daysRemaining).toBeGreaterThan(5);
  });

  it('evaluates status as EXPIRING_SOON when within 5 days of expiration', () => {
    // 2026-09-20 is 4 days before 2026-09-23 expiration of cycle 2609
    const d = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
    const report = checkDatabaseAiracStatus('2609', d);
    expect(report.status).toBe('EXPIRING_SOON');
    expect(report.daysRemaining).toBeLessThanOrEqual(5);
    expect(report.message).toContain('expires in');
  });

  it('evaluates status as EXPIRED for past cycles', () => {
    const d = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));
    const report = checkDatabaseAiracStatus('2608', d);
    expect(report.status).toBe('EXPIRED');
    expect(report.message).toContain('is expired');
  });
});
