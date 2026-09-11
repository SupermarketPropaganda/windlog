/**
 * ICAO 28-Day AIRAC Cycle Engine
 * Accurately computes AIRAC cycle identifiers, effective dates, and expiration intervals
 * according to ICAO Doc 8126 / Annex 15 standards.
 */

export interface AiracCycle {
  cycle: string;            // e.g. "2609"
  year: number;             // e.g. 2026
  cycleNumber: number;      // e.g. 9
  effectiveDate: Date;      // Start of 28-day cycle (00:00:00 UTC)
  expirationDate: Date;     // End of 28-day cycle (23:59:59 UTC)
  daysRemaining: number;    // Days left until expiration
  isCurrent: boolean;       // Whether target date is within effective window
}

export type AiracStatus = 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED';

export interface AiracStatusReport {
  status: AiracStatus;
  currentCycle: AiracCycle;
  dbCycleCode: string;
  message: string;
  daysRemaining: number;
}

// ICAO Epoch Anchor: Cycle 2001 effective January 23, 2020 00:00:00 UTC
const EPOCH_DATE = new Date(Date.UTC(2020, 0, 23, 0, 0, 0));
const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Returns the AIRAC cycle information for a given date
 * @param date Reference date (defaults to current UTC time)
 */
export function getAiracCycle(date: Date = new Date()): AiracCycle {
  const targetUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds()
  );

  const diffMs = targetUtc - EPOCH_DATE.getTime();
  const cycleIndex = Math.floor(diffMs / CYCLE_MS);

  const effectiveMs = EPOCH_DATE.getTime() + cycleIndex * CYCLE_MS;
  const expirationMs = effectiveMs + CYCLE_MS - 1000;

  const effectiveDate = new Date(effectiveMs);
  const expirationDate = new Date(expirationMs);

  // Compute cycle number within the effective year
  const effYear = effectiveDate.getUTCFullYear();
  
  // Calculate first cycle of this effective year
  // Find cycle that begins on or after Jan 1 of effYear, or includes Jan 1
  let testMs = EPOCH_DATE.getTime();
  while (new Date(testMs).getUTCFullYear() < effYear) {
    testMs += CYCLE_MS;
  }
  // If the previous cycle ended in effYear and covered Jan 1, check first Thursday
  const firstCycleOfYearMs = testMs;
  const cycleInYearIndex = Math.floor((effectiveMs - firstCycleOfYearMs) / CYCLE_MS) + 1;

  const yy = String(effYear).slice(2);
  const nn = String(cycleInYearIndex).padStart(2, '0');
  const cycleCode = `${yy}${nn}`;

  const msRemaining = expirationMs - targetUtc;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

  return {
    cycle: cycleCode,
    year: effYear,
    cycleNumber: cycleInYearIndex,
    effectiveDate,
    expirationDate,
    daysRemaining,
    isCurrent: targetUtc >= effectiveMs && targetUtc <= expirationMs,
  };
}

/**
 * Evaluates whether an installed SQLite database cycle is currently valid,
 * expiring soon (<= 5 days), or expired.
 * @param dbCycle The database cycle string (e.g. "2609")
 * @param date Current evaluation date (defaults to now)
 */
export function checkDatabaseAiracStatus(dbCycle: string, date: Date = new Date()): AiracStatusReport {
  const current = getAiracCycle(date);
  const cleanDbCycle = dbCycle.trim().toUpperCase();

  if (cleanDbCycle === current.cycle) {
    if (current.daysRemaining <= 5) {
      return {
        status: 'EXPIRING_SOON',
        currentCycle: current,
        dbCycleCode: cleanDbCycle,
        message: `AIRAC ${cleanDbCycle} expires in ${current.daysRemaining} day${current.daysRemaining === 1 ? '' : 's'} (${current.expirationDate.toISOString().slice(0, 10)})`,
        daysRemaining: current.daysRemaining,
      };
    }

    return {
      status: 'CURRENT',
      currentCycle: current,
      dbCycleCode: cleanDbCycle,
      message: `AIRAC ${cleanDbCycle} is current (${current.daysRemaining} days remaining)`,
      daysRemaining: current.daysRemaining,
    };
  }

  // If DB cycle is different from current cycle
  return {
    status: 'EXPIRED',
    currentCycle: current,
    dbCycleCode: cleanDbCycle,
    message: `Aeronautical database (AIRAC ${cleanDbCycle}) is expired. Current active cycle is AIRAC ${current.cycle}. Update recommended.`,
    daysRemaining: 0,
  };
}
