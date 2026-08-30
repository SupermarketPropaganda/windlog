import { Waypoint, WaypointType } from '../types';

export class WaypointDB {
  private db: any = null;

  constructor(db: any) {
    this.db = db;
  }

  private mapRowToWaypoint(row: any[]): Waypoint {
    return {
      id: row[0] as number,
      identifier: row[1] as string,
      name: row[2] as string,
      type: row[3] as WaypointType,
      latitude: row[4] as number,
      longitude: row[5] as number,
      elevation: row[6] !== null ? (row[6] as number) : undefined,
      frequency: row[7] !== null ? (row[7] as number) : undefined,
      country: row[8] as string,
      isCustom: false,
    };
  }

  /**
   * Search for waypoints by prefix matching the identifier
   * @param query The prefix to search for
   * @param limit Maximum number of results to return (default 10)
   * @returns Array of matching waypoints
   */
  searchByPrefix(query: string, limit: number = 10): Waypoint[] {
    if (!this.db) return [];
    const cleanQuery = query.toUpperCase().trim();
    if (!cleanQuery || cleanQuery.replace(/[%_]/g, '').length === 0) return [];

    try {
      const stmt = this.db.prepare(
        `SELECT id, identifier, name, type, latitude, longitude, elevation, frequency, country 
         FROM waypoints 
         WHERE identifier LIKE ? 
         ORDER BY (country = 'PT') DESC, (type = 'vrp') DESC, (type = 'airport') DESC
         LIMIT ?`
      );
      stmt.bind([`${cleanQuery}%`, limit]);
      
      const results: Waypoint[] = [];
      while (stmt.step()) {
        results.push(this.mapRowToWaypoint(stmt.get()));
      }
      stmt.free();
      return results;
    } catch (e) {
      console.error('Error searching waypoints:', e);
      return [];
    }
  }

  /**
   * Find a waypoint by identifier or name match
   * Prioritizes exact identifier matches, Portuguese fixes/airports, and VRPs.
   * @param identifier The identifier or town name to search for
   * @returns The matching waypoint, or null if not found
   */
  findByIdentifier(identifier: string): Waypoint | null {
    if (!this.db) return null;
    const cleanQuery = identifier.toUpperCase().trim();
    if (!cleanQuery || cleanQuery.replace(/[%_\s]/g, '').length === 0) return null;

    try {
      const stmt = this.db.prepare(
        `SELECT id, identifier, name, type, latitude, longitude, elevation, frequency, country
         FROM waypoints
         WHERE identifier = ?
            OR UPPER(name) = ?
            OR UPPER(REPLACE(name, ' ', '')) = ?
            OR UPPER(REPLACE(name, '-', '')) = ?
            OR (LENGTH(?) >= 4 AND UPPER(name) LIKE ?)
         ORDER BY 
            (identifier = ?) DESC,
            (country = 'PT') DESC,
            (type = 'vrp') DESC,
            (type = 'airport') DESC
         LIMIT 1`
      );
      stmt.bind([
        cleanQuery,
        cleanQuery,
        cleanQuery,
        cleanQuery,
        cleanQuery,
        `${cleanQuery}%`,
        cleanQuery
      ]);
      
      let result: Waypoint | null = null;
      if (stmt.step()) {
        result = this.mapRowToWaypoint(stmt.get());
      }
      stmt.free();
      return result;
    } catch (e) {
      console.error('Error finding waypoint:', e);
      return null;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Initializes the waypoint database by loading the WASM and fetching the SQLite file
 * @returns Promise resolving to an initialized WaypointDB instance
 */
export async function initWaypointDatabase(): Promise<WaypointDB> {
  try {
    const rawBase = import.meta.env.BASE_URL || './';
    const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    const initFn = typeof (window as any).initSqlJs === 'function'
      ? (window as any).initSqlJs
      : (await import('sql.js')).default;

    const SQL = await initFn({
      locateFile: (file: string) => `${baseUrl}${file}`
    });

    try {
      const response = await fetch(`${baseUrl}waypoints.sqlite`);
      if (!response.ok) {
        throw new Error(`Failed to fetch database from ${baseUrl}waypoints.sqlite: ${response.status} ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buffer));
      return new WaypointDB(db);
    } catch (fetchError) {
      console.warn('Could not fetch waypoints.sqlite, returning empty database instance:', fetchError);
      return new WaypointDB(null);
    }
  } catch (error) {
    console.error('Error initializing sql.js:', error);
    return new WaypointDB(null);
  }
}
