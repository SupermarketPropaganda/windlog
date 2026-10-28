/**
 * Pilot Digital Logbook Service
 *
 * Persists official flight records (Date, Route, Aircraft, Off/On/Block times, Landings),
 * calculates totals, and provides CSV export conforming to EASA / FAA format.
 */

export interface PilotLogbookEntry {
  id: string;
  date: string;                  // YYYY-MM-DD
  aircraftModel: string;
  tailNumber?: string;
  departureIcao: string;
  destinationIcao: string;
  routeString: string;
  outTimestamp: number | null;   // Off-block
  offTimestamp: number | null;   // Takeoff
  onTimestamp: number | null;    // Touchdown
  inTimestamp: number | null;    // On-block
  flightTimeMinutes: number;     // Airborne time
  blockTimeMinutes: number;      // Chock-to-chock time
  distanceFlownNm: number;
  landingsDay: number;
  landingsNight: number;
  notes?: string;
}

const STORAGE_KEY = 'gustlog_pilot_logbook_v1';
let inMemoryEntries: PilotLogbookEntry[] = [];

export class LogbookService {
  public static getEntries(): PilotLogbookEntry[] {
    if (typeof localStorage === 'undefined') {
      return [...inMemoryEntries];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return inMemoryEntries;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return inMemoryEntries;
    }
  }

  public static saveEntry(entry: Omit<PilotLogbookEntry, 'id'> & { id?: string }): PilotLogbookEntry {
    const entries = this.getEntries();
    const finalEntry: PilotLogbookEntry = {
      ...entry,
      id: entry.id || `flight_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    const existingIdx = entries.findIndex((e) => e.id === finalEntry.id);
    if (existingIdx >= 0) {
      entries[existingIdx] = finalEntry;
    } else {
      entries.unshift(finalEntry);
    }

    inMemoryEntries = [...entries];

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } catch (e) {
        console.warn('Failed to save logbook entry:', e);
      }
    }

    return finalEntry;
  }

  public static deleteEntry(id: string): void {
    const entries = this.getEntries().filter((e) => e.id !== id);
    inMemoryEntries = [...entries];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      } catch {}
    }
  }

  public static clearAll(): void {
    inMemoryEntries = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }

  public static escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  public static exportCsv(): string {
    const entries = this.getEntries();
    const headers = [
      'Date',
      'Aircraft',
      'Tail Number',
      'From',
      'To',
      'Route',
      'Out (UTC)',
      'Off (UTC)',
      'On (UTC)',
      'In (UTC)',
      'Flight Time (Hours)',
      'Block Time (Hours)',
      'Distance (NM)',
      'Day Landings',
      'Night Landings',
      'Notes',
    ];

    const formatUtc = (ts: number | null | undefined) => {
      if (!ts || !Number.isFinite(ts) || ts <= 0) return '';
      try {
        return new Date(ts).toISOString().slice(11, 16);
      } catch {
        return '';
      }
    };

    const rows = entries.map((e) => [
      this.escapeCsvField(e.date),
      `"${(e.aircraftModel || '').replace(/"/g, '""')}"`,
      `"${(e.tailNumber || '').replace(/"/g, '""')}"`,
      this.escapeCsvField(e.departureIcao),
      this.escapeCsvField(e.destinationIcao),
      `"${(e.routeString || '').replace(/"/g, '""')}"`,
      formatUtc(e.outTimestamp),
      formatUtc(e.offTimestamp),
      formatUtc(e.onTimestamp),
      formatUtc(e.inTimestamp),
      (Number.isFinite(e.flightTimeMinutes) ? e.flightTimeMinutes / 60 : 0).toFixed(2),
      (Number.isFinite(e.blockTimeMinutes) ? e.blockTimeMinutes / 60 : 0).toFixed(2),
      (Number.isFinite(e.distanceFlownNm) ? e.distanceFlownNm : 0).toFixed(1),
      Number.isFinite(e.landingsDay) ? e.landingsDay : 0,
      Number.isFinite(e.landingsNight) ? e.landingsNight : 0,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /**
   * RFC-4180 Compliant CSV Parser
   * Parses standard tabular CSV losslessly, handling quotes, commas, newlines within cells, and UTF-8.
   */
  public static parseCsv(csv: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;
    let i = 0;

    while (i < csv.length) {
      const char = csv[i];
      const nextChar = csv[i + 1];

      if (insideQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i += 2;
            continue;
          } else {
            insideQuotes = false;
            i++;
            continue;
          }
        } else {
          currentField += char;
          i++;
          continue;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
          i++;
          continue;
        } else if (char === ',') {
          currentRow.push(currentField);
          currentField = '';
          i++;
          continue;
        } else if (char === '\r') {
          if (nextChar === '\n') {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
            i += 2;
            continue;
          } else {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
            i++;
            continue;
          }
        } else if (char === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i++;
          continue;
        } else {
          currentField += char;
          i++;
          continue;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    return rows;
  }

  public static getMetrics(): {
    totalFlights: number;
    totalFlightHours: number;
    totalBlockHours: number;
    totalDistanceNm: number;
    totalLandings: number;
  } {
    const entries = this.getEntries();
    let flightMin = 0;
    let blockMin = 0;
    let dist = 0;
    let landings = 0;

    for (const e of entries) {
      flightMin += Number.isFinite(e.flightTimeMinutes) ? e.flightTimeMinutes : 0;
      blockMin += Number.isFinite(e.blockTimeMinutes) ? e.blockTimeMinutes : 0;
      dist += Number.isFinite(e.distanceFlownNm) ? e.distanceFlownNm : 0;
      landings += (Number.isFinite(e.landingsDay) ? e.landingsDay : 0) + (Number.isFinite(e.landingsNight) ? e.landingsNight : 0);
    }

    return {
      totalFlights: entries.length,
      totalFlightHours: Math.round((flightMin / 60) * 10) / 10,
      totalBlockHours: Math.round((blockMin / 60) * 10) / 10,
      totalDistanceNm: Math.round(dist * 10) / 10,
      totalLandings: landings,
    };
  }
}
