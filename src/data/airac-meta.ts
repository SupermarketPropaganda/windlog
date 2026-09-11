/**
 * Aeronautical Database Metadata
 * Specifies the AIRAC cycle, revision timestamp, and authority source
 * for the bundled waypoints.sqlite database.
 */

export interface DatabaseMetadata {
  airacCycle: string;
  cycleEffective: string;
  cycleExpiration: string;
  sourceAuthority: string;
  coverage: string;
  schemaVersion: number;
}

export const CURRENT_DATABASE_METADATA: DatabaseMetadata = {
  airacCycle: '2609',
  cycleEffective: '2026-08-27T00:00:00Z',
  cycleExpiration: '2026-09-23T23:59:59Z',
  sourceAuthority: 'NAV Portugal AIS / Eurocontrol / FAA / OpenAIP',
  coverage: 'Portugal (Full VFR/IFR + VRPs), Western Europe & Global Major Aerodromes',
  schemaVersion: 2,
};
