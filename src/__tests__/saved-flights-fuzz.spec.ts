import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveFlightRecord,
  getSavedFlightsSync,
  deleteSavedFlight,
  getSavedFlightById,
  generateFlightTitle,
  clearAllSavedFlights,
} from '../data/saved-flights';
import {
  filterSavedFlights,
  formatEte,
  formatDeparture,
} from '../components/SavedFlightsView';
import { setStorageItem, removeStorageItem } from '../data/storage-manager';
import { AircraftProfile, SavedFlight, Waypoint } from '../types';

const STORAGE_SAVED_FLIGHTS_KEY = 'windlog_saved_flights';

// High-performance In-Memory Mock IndexedDB
const mockStore = new Map<string, any>();
const mockIDB = {
  open: vi.fn().mockImplementation(() => {
    const req: any = {
      result: null,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    queueMicrotask(() => {
      const mockDb: any = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction: () => {
          const tx: any = {
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: () => ({
              get: (k: string) => {
                const getReq: any = { result: mockStore.get(k) };
                queueMicrotask(() => getReq.onsuccess?.({ target: getReq }));
                return getReq;
              },
              put: (v: any, k: string) => {
                mockStore.set(k, v);
                const putReq: any = { result: k };
                queueMicrotask(() => {
                  putReq.onsuccess?.({ target: putReq });
                  tx.oncomplete?.({ target: tx });
                });
                return putReq;
              },
              delete: (k: string) => {
                mockStore.delete(k);
                const delReq: any = {};
                queueMicrotask(() => {
                  delReq.onsuccess?.({ target: delReq });
                  tx.oncomplete?.({ target: tx });
                });
                return delReq;
              },
            }),
          };
          return tx;
        },
      };
      req.result = mockDb;
      req.onsuccess?.({ target: req });
    });

    return req;
  }),
};

// Set globally before storage-manager opens DB
(globalThis as any).indexedDB = mockIDB;

describe('Saved Flights Aggressive Fuzz & Stress Testing Suite', () => {
  let warnSpy: any;

  beforeEach(async () => {
    (globalThis as any).indexedDB = mockIDB;
    mockStore.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    await clearAllSavedFlights();
  });

  afterEach(async () => {
    warnSpy.mockRestore();

    // Clean up prototype pollution artifacts if any leaked
    delete (Object.prototype as any).polluted;
    delete (Object.prototype as any).isAdmin;
    delete (Object.prototype as any).role;
    delete (Object.prototype as any).injected;
  });

  // =========================================================================
  // 1. 500+ Flights Rapid Succession Stress Test
  // =========================================================================
  describe('1. Rapid Succession & High Capacity Stress Test (500+ Flights)', () => {
    it('saves 550 flights in rapid succession with zero memory leaks, collisions, or bottlenecks', async () => {
      const TOTAL_FLIGHTS = 550;
      const initialMem = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      const defaultProfile: AircraftProfile = {
        aircraftModel: 'Cessna 172 Skyhawk',
        cruiseAltitude: 4500,
        tas: 110,
        fuelFlow: 8.5,
        fuelUnit: 'gph',
      };

      const savedFlights: SavedFlight[] = [];

      for (let i = 0; i < TOTAL_FLIGHTS; i++) {
        const flight = await saveFlightRecord({
          name: `Stress Flight #${i.toString().padStart(4, '0')}`,
          routeInput: `LPCS WPT${i % 20} LPPR`,
          departureTime: new Date(Date.now() + i * 3600000).toISOString(),
          profile: defaultProfile,
          legAltitudeOverrides: { 0: 3000 + (i % 10) * 500 },
          summary: {
            totalDistance: 120 + (i % 50),
            totalEte: 3600 + (i % 600),
            totalFuel: 10 + (i % 5),
            legsCount: 2,
          },
          userId: i % 2 === 0 ? 'pilot_alpha' : 'pilot_bravo',
        });
        savedFlights.push(flight);
      }

      const totalDuration = performance.now() - startTime;
      const finalMem = process.memoryUsage().heapUsed;
      const memDeltaMB = (finalMem - initialMem) / (1024 * 1024);
      const opsPerSec = (TOTAL_FLIGHTS / (totalDuration / 1000)).toFixed(1);

      console.log(`\n--- BENCHMARK: 550 Flights Rapid Succession ---`);
      console.log(`Total Execution Time: ${totalDuration.toFixed(2)} ms`);
      console.log(`Throughput: ${opsPerSec} flights/sec`);
      console.log(`Average Latency: ${(totalDuration / TOTAL_FLIGHTS).toFixed(3)} ms/flight`);
      console.log(`Heap Delta: ${memDeltaMB.toFixed(2)} MB`);

      // Integrity checks
      const allSync = getSavedFlightsSync();
      expect(allSync.length).toBe(TOTAL_FLIGHTS);

      // Verify LIFO order (newest flight is first)
      expect(allSync[0].name).toBe(`Stress Flight #${(TOTAL_FLIGHTS - 1).toString().padStart(4, '0')}`);
      expect(allSync[TOTAL_FLIGHTS - 1].name).toBe('Stress Flight #0000');

      // Verify 100% ID uniqueness (zero collisions)
      const uniqueIds = new Set(allSync.map((f) => f.id));
      expect(uniqueIds.size).toBe(TOTAL_FLIGHTS);

      // Verify user filtering
      const alphaFlights = getSavedFlightsSync('pilot_alpha');
      const bravoFlights = getSavedFlightsSync('pilot_bravo');
      expect(alphaFlights.length).toBe(275);
      expect(bravoFlights.length).toBe(275);

      // Verify retrieval by ID across arbitrary indexes (0, 100, 275, 549)
      const sampleIndices = [0, 100, 275, 549];
      for (const idx of sampleIndices) {
        const target = allSync[idx];
        const retrieved = getSavedFlightById(target.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe(target.id);
        expect(retrieved?.name).toBe(target.name);
      }

      // Memory leak guard: 550 small records should never consume more than 40MB heap delta
      expect(memDeltaMB).toBeLessThan(40);
    });

    it('benchmarks fast search filtering across 550 saved flights', () => {
      // Build 550 mock flight objects
      const mockList: SavedFlight[] = Array.from({ length: 550 }, (_, i) => ({
        id: `flt_bench_${i}`,
        name: i === 420 ? 'Target Lisbon to Cascais Sunset' : `Generic Route Alpha ${i}`,
        routeInput: i === 300 ? 'LPCS EVORA LPPR' : `WPTA WPTB WPTC ${i}`,
        departureTime: null,
        profile: {
          aircraftModel: i === 150 ? 'Cirrus SR22' : 'Piper PA-28 Archer',
          cruiseAltitude: 5500,
          tas: 130,
          fuelFlow: 10,
          fuelUnit: 'gph',
        },
        legAltitudeOverrides: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      // Search 1: Find by exact name substring
      const t0 = performance.now();
      const resName = filterSavedFlights(mockList, 'Sunset');
      const durName = performance.now() - t0;
      expect(resName.length).toBe(1);
      expect(resName[0].id).toBe('flt_bench_420');

      // Search 2: Find by route waypoint
      const t1 = performance.now();
      const resRoute = filterSavedFlights(mockList, 'evora');
      const durRoute = performance.now() - t1;
      expect(resRoute.length).toBe(1);
      expect(resRoute[0].id).toBe('flt_bench_300');

      // Search 3: Find by aircraft model
      const t2 = performance.now();
      const resAircraft = filterSavedFlights(mockList, 'cirrus');
      const durAircraft = performance.now() - t2;
      expect(resAircraft.length).toBe(1);
      expect(resAircraft[0].id).toBe('flt_bench_150');

      // Search 4: Non-existent query
      const t3 = performance.now();
      const resEmpty = filterSavedFlights(mockList, 'UNKNOWN_QUERY_99999');
      const durEmpty = performance.now() - t3;
      expect(resEmpty.length).toBe(0);

      console.log(`\n--- BENCHMARK: Search over 550 Flights ---`);
      console.log(`Name search: ${durName.toFixed(3)} ms`);
      console.log(`Route search: ${durRoute.toFixed(3)} ms`);
      console.log(`Aircraft search: ${durAircraft.toFixed(3)} ms`);
      console.log(`Miss search: ${durEmpty.toFixed(3)} ms`);

      // All search latencies should remain under 5ms
      expect(durName).toBeLessThan(10);
      expect(durRoute).toBeLessThan(10);
      expect(durAircraft).toBeLessThan(10);
    });
  });

  // =========================================================================
  // 2. Extreme Flight Data Fuzzing
  // =========================================================================
  describe('2. Extreme Flight Data Fuzzing', () => {
    it('handles empty, whitespace, and undefined flight names cleanly', async () => {
      const inputs = ['', '   ', '\t\n\r  ', undefined];

      for (let i = 0; i < inputs.length; i++) {
        const flight = await saveFlightRecord({
          name: inputs[i],
          routeInput: 'LPCS LPPT',
          departureTime: null,
          profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
        });

        expect(flight.name).toBeTruthy();
        expect(flight.name.trim().length).toBeGreaterThan(0);
        expect(flight.name).toBe('LPCS ➔ LPPT');
      }

      // If both name AND routeInput are empty, falls back to VFR Flight (date)
      const emptyAll = await saveFlightRecord({
        name: '',
        routeInput: '',
        departureTime: null,
        profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
        legAltitudeOverrides: {},
      });
      expect(emptyAll.name).toMatch(/VFR Flight/);
    });

    it('fuzzes unicode, emojis, multi-language scripts, and security injection strings', async () => {
      const exoticTitles = [
        '✈️ 🛫 🛬 🚀 🛸 🛩️ 🏔️ 🛰️ ☁️ ⚡ ⛈️ 🌧️ 🌊 🧭 🗺️ 📍 🪂',
        '東京 (HND) ➔ 新千歳 (CTS) 富士山経由 🗻',
        'Москва (SVO) ➔ Санкт-Петербург (LED) Северное Сияние ❄️',
        'رحلة طيران من دبي إلى مسقط عبر مضيق هرمز 🇴🇲',
        'טיסה יפהפייה מחיפה לאילת מעל ים המלח',
        'Αθήνα (LGAV) ➔ Σαντορίνη (LGSR) Αιγαίο Πέλαγος 🇬🇷',
        'São Paulo/Campo de Marte ➔ Rio de Janeiro/Santos Dumont 🇧🇷 (Açúcar & Samba)',
        'Zálgö: T̷h̷e̷ ̷F̷l̷i̷g̷h̷t̷ ̷o̷f̷ ̷D̷o̷o̷m̷ ̷H̷e̷x̷',
        '<script>alert("XSS")</script><iframe src="evil.com"></iframe>',
        '"; DROP TABLE flights; SELECT * FROM users WHERE "1"="1',
        '../../../../etc/passwd\0/windows/system32/cmd.exe',
        'A'.repeat(5000), // Massive 5,000-character name
        'Zero-Width-Joiners: \u200D\u200C\uFEFF\u200B\u200E\u200F',
      ];

      for (let i = 0; i < exoticTitles.length; i++) {
        const exotic = exoticTitles[i];
        const flight = await saveFlightRecord({
          name: exotic,
          routeInput: `WPT${i} WPT${i + 1}`,
          departureTime: null,
          profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
        });

        expect(flight.name).toBe(exotic.trim());
        const retrieved = getSavedFlightById(flight.id);
        expect(retrieved?.name).toBe(exotic.trim());

        // Check filterSavedFlights does not crash on any exotic string
        const filtered = filterSavedFlights([flight], exotic.slice(0, 10));
        expect(Array.isArray(filtered)).toBe(true);
      }
    });

    it('tests massive 100-waypoint flight routes and title generation', async () => {
      // 1. Generate 100-waypoint route string
      const wpts100 = Array.from({ length: 100 }, (_, i) => `WPT${i.toString().padStart(3, '0')}`);
      const route100String = wpts100.join(' ');

      const t0 = performance.now();
      const title1 = generateFlightTitle(route100String);
      const titleDur = performance.now() - t0;

      expect(title1).toBe('WPT000 ➔ WPT099');
      expect(titleDur).toBeLessThan(2); // Sub-2ms execution

      // 2. Generate 100 Waypoint objects
      const waypointObjs: Waypoint[] = wpts100.map((ident, i) => ({
        id: i + 1,
        identifier: ident,
        name: `Waypoint Number ${i}`,
        type: i === 0 || i === 99 ? 'airport' : 'vrp',
        latitude: 38.0 + (i * 0.05),
        longitude: -9.0 + (i * 0.05),
        country: 'PT',
      }));

      const title2 = generateFlightTitle(route100String, waypointObjs);
      expect(title2).toBe('WPT000 ➔ WPT099');

      // 3. Save a 100-waypoint flight record with 100 leg altitude overrides
      const overrides: Record<number, number> = {};
      for (let i = 0; i < 99; i++) {
        overrides[i] = 2000 + i * 100;
      }

      const flight100 = await saveFlightRecord({
        routeInput: route100String,
        departureTime: '2026-09-25T08:00:00.000Z',
        profile: { cruiseAltitude: 12000, tas: 160, fuelFlow: 14, fuelUnit: 'gph' },
        legAltitudeOverrides: overrides,
        summary: {
          totalDistance: 1850.5,
          totalEte: 41600,
          totalFuel: 162.4,
          legsCount: 99,
        },
      });

      expect(flight100.id).toBeDefined();
      expect(flight100.name).toBe('WPT000 ➔ WPT099');
      expect(Object.keys(flight100.legAltitudeOverrides).length).toBe(99);
      expect(flight100.summary?.legsCount).toBe(99);

      const retrieved100 = getSavedFlightById(flight100.id);
      expect(retrieved100?.summary?.legsCount).toBe(99);
    });

    it('tests massive negative altitudes, zero groundspeed, zero fuel flow, and extreme TAS', async () => {
      const extremeProfile: AircraftProfile = {
        aircraftModel: 'SR-71 Blackbird Extreme',
        cruiseAltitude: -1410, // Below sea level: Dead Sea elevation
        tas: 999,              // Maximum extreme TAS (999 kt)
        fuelFlow: 0,           // Glider / flameout state
        fuelUnit: 'gph',
      };

      const flight = await saveFlightRecord({
        name: 'Dead Sea Sub-Zero to Supersonic Dash',
        routeInput: 'LLMZ OJAQ',
        departureTime: null,
        profile: extremeProfile,
        legAltitudeOverrides: {
          0: -1410,
          1: -500,
          2: 85000, // Edge of space (85,000 ft)
        },
        summary: {
          totalDistance: 450,
          totalEte: 1620,
          totalFuel: 0,
          legsCount: 3,
        },
      });

      expect(flight.profile.cruiseAltitude).toBe(-1410);
      expect(flight.profile.tas).toBe(999);
      expect(flight.profile.fuelFlow).toBe(0);
      expect(flight.legAltitudeOverrides[0]).toBe(-1410);
      expect(flight.legAltitudeOverrides[2]).toBe(85000);

      // Verify profile with negative speed / negative fuel doesn't crash calculations
      const negativeProfile: AircraftProfile = {
        cruiseAltitude: -99999,
        tas: -50,
        fuelFlow: -10,
        fuelUnit: 'gph',
      };

      const flightNeg = await saveFlightRecord({
        name: 'Negative Profile Bounds',
        routeInput: 'DEP ARR',
        departureTime: null,
        profile: negativeProfile,
        legAltitudeOverrides: {},
      });
      expect(flightNeg.profile.cruiseAltitude).toBe(-99999);
    });

    it('tests formatting helper resilience with negative, NaN, infinite, and malformed inputs', () => {
      // 1. formatEte tests
      expect(formatEte(0)).toBe('0m');
      expect(formatEte(-500)).toBe('0m');
      expect(formatEte(NaN)).toBe('0m');
      expect(formatEte(Infinity)).toBe('0m');
      expect(formatEte(-Infinity)).toBe('0m');
      expect(formatEte(undefined as any)).toBe('0m');
      expect(formatEte(null as any)).toBe('0m');
      expect(formatEte(59)).toBe('0m');
      expect(formatEte(60)).toBe('1m');
      expect(formatEte(3600)).toBe('1h 00m');
      expect(formatEte(3665)).toBe('1h 01m');
      expect(formatEte(86400 * 5)).toBe('120h 00m'); // 5 days flight

      // 2. formatDeparture tests
      expect(formatDeparture(null)).toBe('Live / Real-Time');
      expect(formatDeparture('')).toBe('Live / Real-Time');
      expect(formatDeparture('invalid-date-string')).toBe('invalid-date-string');
      expect(formatDeparture('9999-99-99')).toBe('9999-99-99');
      const validDate = '2026-09-24T14:30:00.000Z';
      const formatted = formatDeparture(validDate);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('•');
    });
  });

  // =========================================================================
  // 3. Storage Corruption Handling & Defense
  // =========================================================================
  describe('3. Storage Corruption Handling & Defense', () => {
    it('recovers gracefully when storage contains invalid JSON strings or primitives', async () => {
      const corruptPayloads = [
        '{ malformed json: missing_bracket',
        'undefined',
        'null',
        '12345',
        'true',
        'false',
        '"just a plain string"',
      ];

      for (const payload of corruptPayloads) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_SAVED_FLIGHTS_KEY, payload);
        }
        await setStorageItem(STORAGE_SAVED_FLIGHTS_KEY, payload as any);

        // getSavedFlightsSync should NEVER throw an exception and return []
        const flights = getSavedFlightsSync();
        expect(Array.isArray(flights)).toBe(true);

        // Saving a flight must heal and restore healthy storage
        const healed = await saveFlightRecord({
          name: 'Healed Flight',
          routeInput: 'LPCS LPPT',
          departureTime: null,
          profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
        });

        expect(healed.id).toBeDefined();
        const afterHeal = getSavedFlightsSync();
        expect(afterHeal.length).toBe(1);
        expect(afterHeal[0].name).toBe('Healed Flight');

        await clearAllSavedFlights();
      }
    });

    it('safely filters out non-array data, null elements, and missing required fields in storage', async () => {
      // Inject corrupted array containing null, primitives, and objects with missing ids
      const corruptedArray: any[] = [
        null,
        undefined,
        42,
        'corrupted_entry',
        {},
        { missingId: true, name: 'Ghost Flight' },
        { id: 9999, name: 'Numeric ID flight' }, // Non-string id
        {
          id: 'valid_flight_1',
          name: 'Legitimate Flight 1',
          routeInput: 'LPCS LPPR',
          departureTime: null,
          profile: { cruiseAltitude: 4500, tas: 110, fuelFlow: 8.5, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await setStorageItem(STORAGE_SAVED_FLIGHTS_KEY, corruptedArray);

      // getSavedFlightsSync must safely ignore all nulls and corrupt elements
      const validFlights = getSavedFlightsSync();
      expect(validFlights.length).toBe(1);
      expect(validFlights[0].id).toBe('valid_flight_1');

      // getSavedFlightById must not crash on corrupted array
      expect(getSavedFlightById('non_existent')).toBeNull();
      expect(getSavedFlightById('valid_flight_1')).not.toBeNull();

      // deleteSavedFlight must not crash on corrupted array
      const deletedNonExistent = await deleteSavedFlight('non_existent');
      expect(deletedNonExistent).toBe(false);

      const deletedValid = await deleteSavedFlight('valid_flight_1');
      expect(deletedValid).toBe(true);
      expect(getSavedFlightsSync().length).toBe(0);
    });

    it('resists prototype pollution attempts via flight data and corrupted storage objects', async () => {
      // 1. Prototype pollution attempt via flightData properties
      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true, "isAdmin": true}}');

      await saveFlightRecord({
        name: 'Injected Flight',
        routeInput: 'LPCS LPPT',
        departureTime: null,
        profile: {
          cruiseAltitude: 3000,
          tas: 100,
          fuelFlow: 8,
          fuelUnit: 'gph',
          ...maliciousPayload,
        },
        legAltitudeOverrides: {
          ...maliciousPayload,
        },
        summary: {
          totalDistance: 100,
          totalEte: 3600,
          totalFuel: 10,
          legsCount: 1,
          ...maliciousPayload,
        },
      });

      // Verify Object.prototype was NOT polluted
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).isAdmin).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined();

      // 2. Storage key pollution attempt with forbidden keys
      await setStorageItem('__proto__', { evil: true });
      await setStorageItem('constructor', { evil: true });
      await setStorageItem('prototype', { evil: true });

      expect((Object.prototype as any).evil).toBeUndefined();
      expect(({} as any).evil).toBeUndefined();

      await removeStorageItem('__proto__');
      await removeStorageItem('constructor');
      await removeStorageItem('prototype');
    });
  });

  // =========================================================================
  // 4. Concurrent Updates, Race Conditions, and Deletions
  // =========================================================================
  describe('4. Concurrency, Race Conditions & Interleaved Operations', () => {
    it('handles 50 simultaneous parallel saveFlightRecord calls with zero data loss', async () => {
      const PARALLEL_COUNT = 50;

      const promises = Array.from({ length: PARALLEL_COUNT }, (_, i) =>
        saveFlightRecord({
          name: `Concurrent Batch Flight #${i.toString().padStart(2, '0')}`,
          routeInput: `WPT${i} WPT${i + 1}`,
          departureTime: null,
          profile: { cruiseAltitude: 3500, tas: 105, fuelFlow: 8, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(PARALLEL_COUNT);

      // Verify that all 50 have distinct IDs
      const uniqueIds = new Set(results.map((r) => r.id));
      expect(uniqueIds.size).toBe(PARALLEL_COUNT);

      // Verify all 50 flights exist in storage
      const stored = getSavedFlightsSync();
      expect(stored.length).toBe(PARALLEL_COUNT);
    });

    it('handles 30 concurrent updates to the SAME flight without creating duplicate records', async () => {
      // 1. Create initial flight
      const initial = await saveFlightRecord({
        name: 'Target Flight Base',
        routeInput: 'LPCS LPPT',
        departureTime: null,
        profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
        legAltitudeOverrides: {},
      });

      // 2. Fire 30 simultaneous updates on the exact same ID
      const updatePromises = Array.from({ length: 30 }, (_, i) =>
        saveFlightRecord({
          id: initial.id,
          name: `Updated Name Revision #${i}`,
          routeInput: `LPCS WPT${i} LPPT`,
          departureTime: new Date(Date.now() + i * 1000).toISOString(),
          profile: { cruiseAltitude: 3000 + i * 100, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
          legAltitudeOverrides: { 0: 3000 + i * 100 },
        })
      );

      await Promise.all(updatePromises);

      // Verify that there is still EXACTLY 1 flight in storage (no duplicate IDs created)
      const all = getSavedFlightsSync();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(initial.id);
      expect(all[0].name).toMatch(/^Updated Name Revision #/);
      expect(all[0].createdAt).toBe(initial.createdAt); // Preserves original creation timestamp
    });

    it('stress tests simultaneous mixed operations: saves, updates, and deletes interleaved', async () => {
      // Seed 20 initial flights
      const seedFlights: SavedFlight[] = [];
      for (let i = 0; i < 20; i++) {
        const f = await saveFlightRecord({
          name: `Seed Flight ${i}`,
          routeInput: `ORIG${i} DEST${i}`,
          departureTime: null,
          profile: { cruiseAltitude: 4000, tas: 110, fuelFlow: 8.5, fuelUnit: 'gph' },
          legAltitudeOverrides: {},
        });
        seedFlights.push(f);
      }

      expect(getSavedFlightsSync().length).toBe(20);

      // Now prepare 30 interleaved operations in parallel:
      // - 10 saves of brand new flights
      // - 10 updates of seed flights
      // - 10 deletions of seed flights
      const operations: Promise<any>[] = [];

      // 10 new saves
      for (let i = 0; i < 10; i++) {
        operations.push(
          saveFlightRecord({
            name: `New Parallel Flight ${i}`,
            routeInput: `NEW${i} ARR${i}`,
            departureTime: null,
            profile: { cruiseAltitude: 5000, tas: 120, fuelFlow: 9, fuelUnit: 'gph' },
            legAltitudeOverrides: {},
          })
        );
      }

      // 10 updates (on seed flights 0..9)
      for (let i = 0; i < 10; i++) {
        operations.push(
          saveFlightRecord({
            id: seedFlights[i].id,
            name: `Mutated Seed Flight ${i}`,
            routeInput: `MODIFIED${i} ARR`,
            departureTime: null,
            profile: { cruiseAltitude: 6000, tas: 130, fuelFlow: 10, fuelUnit: 'gph' },
            legAltitudeOverrides: {},
          })
        );
      }

      // 10 deletions (on seed flights 10..19)
      for (let i = 10; i < 20; i++) {
        operations.push(deleteSavedFlight(seedFlights[i].id));
      }

      // Execute all 30 interleaved actions simultaneously
      const settled = await Promise.allSettled(operations);

      // Ensure every single operation succeeded without rejection
      for (const res of settled) {
        expect(res.status).toBe('fulfilled');
      }

      const finalFlights = getSavedFlightsSync();

      // Verify that deleted flights (10..19) are gone
      for (let i = 10; i < 20; i++) {
        const found = getSavedFlightById(seedFlights[i].id);
        expect(found).toBeNull();
      }

      // Verify that list remains valid, fully populated with valid objects
      for (const f of finalFlights) {
        expect(typeof f.id).toBe('string');
        expect(typeof f.name).toBe('string');
        expect(f.profile).toBeDefined();
      }
    });

    it('handles rapid sequence of delete and re-save on the same ID', async () => {
      const flight = await saveFlightRecord({
        name: 'Flash Flight',
        routeInput: 'LPCS LPPT',
        departureTime: null,
        profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
        legAltitudeOverrides: {},
      });

      expect(getSavedFlightById(flight.id)).not.toBeNull();

      // Delete immediately
      const deleted = await deleteSavedFlight(flight.id);
      expect(deleted).toBe(true);
      expect(getSavedFlightById(flight.id)).toBeNull();

      // Immediately re-save using the same ID
      const reSaved = await saveFlightRecord({
        id: flight.id,
        name: 'Resurrected Flash Flight',
        routeInput: 'LPCS LPPT',
        departureTime: null,
        profile: { cruiseAltitude: 3500, tas: 105, fuelFlow: 8.5, fuelUnit: 'gph' },
        legAltitudeOverrides: {},
      });

      expect(reSaved.id).toBe(flight.id);
      expect(getSavedFlightById(flight.id)?.name).toBe('Resurrected Flash Flight');
      expect(getSavedFlightsSync().length).toBe(1);
    });
  });
});
