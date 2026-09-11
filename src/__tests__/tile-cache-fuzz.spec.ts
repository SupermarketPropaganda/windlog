import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  latLonToTile,
  getTilesForBounds,
  getTilesForRouteCorridor,
  formatTileKey,
  getCachedTileBlob,
  setCachedTileBlob,
  getTileStorageStats,
  clearTileCache,
  downloadTilePack,
  resetTileDB,
  TileCoord,
  TileDownloadProgress,
} from '../data/tile-cache';

// High-fidelity In-Memory IndexedDB Mock for Fuzz Testing
function createInMemoryIDB() {
  const storeData = new Map<string, any>();
  let isClosed = false;

  const mockIDB = {
    open: vi.fn().mockImplementation((_dbName: string, _version: number) => {
      const req: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      setTimeout(() => {
        if (isClosed) {
          req.error = new Error('Database closed');
          if (req.onerror) req.onerror({ target: req });
          return;
        }

        const mockDb: any = {
          objectStoreNames: {
            contains: (name: string) => name === 'tiles',
          },
          createObjectStore: vi.fn(),
          close: () => {
            isClosed = true;
            if (mockDb.onclose) mockDb.onclose();
          },
          onclose: null,
          transaction: (_storeNames: string[], _mode: string) => {
            const tx: any = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              error: null,
              abort: () => {
                if (tx.onabort) tx.onabort({ target: tx });
              },
              objectStore: (_sName: string) => ({
                get: (key: string) => {
                  const getReq: any = { result: undefined, error: null, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    getReq.result = storeData.get(key);
                    if (getReq.onsuccess) getReq.onsuccess({ target: getReq });
                  }, 0);
                  return getReq;
                },
                put: (value: any) => {
                  const putReq: any = { result: value?.key, error: null, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    storeData.set(value.key, value);
                    if (putReq.onsuccess) putReq.onsuccess({ target: putReq });
                    if (tx.oncomplete) tx.oncomplete({ target: tx });
                  }, 0);
                  return putReq;
                },
                clear: () => {
                  const clearReq: any = { result: undefined, error: null, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    storeData.clear();
                    if (clearReq.onsuccess) clearReq.onsuccess({ target: clearReq });
                    if (tx.oncomplete) tx.oncomplete({ target: tx });
                  }, 0);
                  return clearReq;
                },
                openCursor: () => {
                  const cursorReq: any = { result: null, error: null, onsuccess: null, onerror: null };
                  const entries = Array.from(storeData.entries());
                  let index = 0;

                  function advance() {
                    if (index < entries.length) {
                      const [k, v] = entries[index++];
                      cursorReq.result = {
                        key: k,
                        value: v,
                        continue: () => setTimeout(advance, 0),
                      };
                    } else {
                      cursorReq.result = null;
                    }
                    if (cursorReq.onsuccess) cursorReq.onsuccess({ target: cursorReq });
                  }

                  setTimeout(advance, 0);
                  return cursorReq;
                },
              }),
            };
            return tx;
          },
        };

        req.result = mockDb;
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
        if (req.onsuccess) req.onsuccess({ target: req });
      }, 0);

      return req;
    }),
  };

  return { mockIDB, storeData };
}

describe('Offline Tile Storage & Cache Fuzzer (Stress & Resilience Audit)', () => {
  let idbMock: ReturnType<typeof createInMemoryIDB>;

  beforeEach(() => {
    resetTileDB();
    idbMock = createInMemoryIDB();
    vi.stubGlobal('indexedDB', idbMock.mockIDB);
  });

  afterEach(() => {
    resetTileDB();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. Slippy Map Tile Coordinate Math Fuzzing
  // ─────────────────────────────────────────────────────────────
  describe('1. Slippy Map Tile Coordinate Math', () => {
    describe('a. Zoom levels 0 to 22 (boundary check, overflow, bit-shift limits)', () => {
      it('handles Zoom 0 boundary correctly: all points map to (0, 0)', () => {
        const testCoords = [
          [0, 0],
          [45, 45],
          [-45, -45],
          [85.05, 179.9],
          [-85.05, -179.9],
        ];

        for (const [lat, lon] of testCoords) {
          const tile = latLonToTile(lat, lon, 0);
          expect(tile.x).toBe(0);
          expect(tile.y).toBe(0);
        }
      });

      it('safely computes tile coordinates for every integer zoom from 0 to 22 without 32-bit overflow', () => {
        for (let z = 0; z <= 22; z++) {
          const n = Math.pow(2, z);
          const tileCenter = latLonToTile(0, 0, z);

          expect(Number.isInteger(tileCenter.x)).toBe(true);
          expect(Number.isInteger(tileCenter.y)).toBe(true);
          expect(tileCenter.x).toBeGreaterThanOrEqual(0);
          expect(tileCenter.x).toBeLessThan(n);
          expect(tileCenter.y).toBeGreaterThanOrEqual(0);
          expect(tileCenter.y).toBeLessThan(n);

          // Prime meridian & equator at zoom z
          const expectedCenter = Math.floor(n / 2);
          expect(tileCenter.x).toBe(expectedCenter);
          expect(tileCenter.y).toBe(expectedCenter);
        }
      });

      it('verifies Zoom 22 upper bound (Math.pow(2, 22) = 4,194,304)', () => {
        const z = 22;
        const maxIndex = Math.pow(2, 22) - 1; // 4,194,303

        // Southeast corner near pole and antimeridian
        const seTile = latLonToTile(-85.05112878, 179.999999, z);
        expect(seTile.x).toBe(maxIndex);
        expect(seTile.y).toBe(maxIndex);

        // Northwest corner near pole and antimeridian
        const nwTile = latLonToTile(85.05112878, -180, z);
        expect(nwTile.x).toBe(0);
        expect(nwTile.y).toBe(0);

        // Coordinates must never exceed maxIndex or be negative
        expect(seTile.x).toBeLessThanOrEqual(maxIndex);
        expect(seTile.y).toBeLessThanOrEqual(maxIndex);
        expect(seTile.x).toBeGreaterThanOrEqual(0);
        expect(seTile.y).toBeGreaterThanOrEqual(0);
      });

      it('fuzzes 150 random (lat, lon, zoom) tuples across full range [0, 22]', () => {
        for (let i = 0; i < 150; i++) {
          const lat = (Math.random() * 180) - 90;
          const lon = (Math.random() * 360) - 180;
          const zoom = Math.floor(Math.random() * 23); // 0 to 22
          const n = Math.pow(2, zoom);

          const tile = latLonToTile(lat, lon, zoom);

          expect(Number.isInteger(tile.x)).toBe(true);
          expect(Number.isInteger(tile.y)).toBe(true);
          expect(Number.isFinite(tile.x)).toBe(true);
          expect(Number.isFinite(tile.y)).toBe(true);
          expect(tile.x).toBeGreaterThanOrEqual(0);
          expect(tile.x).toBeLessThan(n);
          expect(tile.y).toBeGreaterThanOrEqual(0);
          expect(tile.y).toBeLessThan(n);
        }
      });
    });

    describe('b. Pole Singularities & Mathematical Limits', () => {
      const MERCATOR_MAX_LAT = 85.05112878;

      it('handles exact Web Mercator positive singularity lat = 85.05112878 without off-by-one tile error', () => {
        for (const z of [0, 5, 10, 15, 20, 22]) {
          const tile = latLonToTile(MERCATOR_MAX_LAT, 0, z);
          expect(Number.isFinite(tile.y)).toBe(true);
          expect(tile.y).toBe(0);
        }
      });

      it('handles exact Web Mercator negative singularity lat = -85.05112878 without off-by-one tile error', () => {
        for (const z of [0, 5, 10, 15, 20, 22]) {
          const n = Math.pow(2, z);
          const tile = latLonToTile(-MERCATOR_MAX_LAT, 0, z);
          expect(Number.isFinite(tile.y)).toBe(true);
          expect(tile.y).toBe(n - 1);
        }
      });

      it('handles North Pole lat = 90 and extreme lat > 90 (e.g. 95, 180, 1000) clamping to y = 0', () => {
        const extremeNorthLats = [90, 90.0001, 95, 180, 999.9];
        for (const lat of extremeNorthLats) {
          const tile = latLonToTile(lat, 0, 8);
          expect(Number.isFinite(tile.y)).toBe(true);
          expect(tile.y).toBe(0);
        }
      });

      it('handles South Pole lat = -90 and extreme lat < -90 (e.g. -95, -180, -1000) clamping to y = n - 1', () => {
        const z = 8;
        const maxTileIndex = Math.pow(2, z) - 1;
        const extremeSouthLats = [-90, -90.0001, -95, -180, -999.9];
        for (const lat of extremeSouthLats) {
          const tile = latLonToTile(lat, 0, z);
          expect(Number.isFinite(tile.y)).toBe(true);
          expect(tile.y).toBe(maxTileIndex);
        }
      });

      it('handles NaN and non-finite latitude gracefully without crashing or returning NaN', () => {
        const tileNaN = latLonToTile(NaN, 0, 5);
        expect(Number.isFinite(tileNaN.x)).toBe(true);
        expect(Number.isFinite(tileNaN.y)).toBe(true);

        const tileInf = latLonToTile(Infinity, 0, 5);
        expect(Number.isFinite(tileInf.x)).toBe(true);
        expect(Number.isFinite(tileInf.y)).toBe(true);
      });
    });

    describe('c. Longitude Wrapping & Anti-Meridian Math', () => {
      it('maps lon = -180 to tile x = 0 across all zooms', () => {
        for (let z = 0; z <= 12; z++) {
          const tile = latLonToTile(0, -180, z);
          expect(tile.x).toBe(0);
        }
      });

      it('maps lon = 180 to tile x = n - 1 (easternmost tile) across all zooms', () => {
        for (let z = 0; z <= 12; z++) {
          const n = Math.pow(2, z);
          const tile = latLonToTile(0, 180, z);
          expect(tile.x).toBe(n - 1);
        }
      });

      it('correctly normalizes lon = 360 and lon = -360 to Greenwich prime meridian (lon = 0)', () => {
        for (let z = 1; z <= 10; z++) {
          const expectedX = Math.floor(Math.pow(2, z) / 2);
          const tile360 = latLonToTile(0, 360, z);
          const tileNeg360 = latLonToTile(0, -360, z);
          const tile0 = latLonToTile(0, 0, z);

          expect(tile0.x).toBe(expectedX);
          expect(tile360.x).toBe(expectedX);
          expect(tileNeg360.x).toBe(expectedX);
        }
      });

      it('wraps extreme longitudes (lon = 540, -540, 720, 10000) to valid [0, n - 1] tiles', () => {
        const extremeLons = [540, -540, 720, -720, 1080, 3600, -3600, 100000];
        const z = 8;
        const n = Math.pow(2, z);

        for (const lon of extremeLons) {
          const tile = latLonToTile(0, lon, z);
          expect(Number.isInteger(tile.x)).toBe(true);
          expect(tile.x).toBeGreaterThanOrEqual(0);
          expect(tile.x).toBeLessThan(n);
        }
      });

      it('handles lon = 190 wrapping to lon = -170', () => {
        const z = 6;
        const tile190 = latLonToTile(0, 190, z);
        const tileNeg170 = latLonToTile(0, -170, z);
        expect(tile190.x).toBe(tileNeg170.x);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Bounding Box & Route Corridor Enumeration
  // ─────────────────────────────────────────────────────────────
  describe('2. Bounding Box & Route Corridor Enumeration', () => {
    describe('a. Inverted Bounds & Anti-Meridian Crossing', () => {
      it('handles inverted latitude bounds (north < south) by auto-normalizing', () => {
        const normal = getTilesForBounds(40.0, 38.0, -8.0, -9.0, 6, 6);
        const inverted = getTilesForBounds(38.0, 40.0, -8.0, -9.0, 6, 6);

        expect(inverted.length).toBeGreaterThan(0);
        expect(inverted.length).toBe(normal.length);

        const normalKeys = new Set(normal.map((t) => `${t.z}_${t.x}_${t.y}`));
        for (const t of inverted) {
          expect(normalKeys.has(`${t.z}_${t.x}_${t.y}`)).toBe(true);
        }
      });

      it('handles inverted longitude bounds within same hemisphere (east < west)', () => {
        // e.g. west = -8.0, east = -9.0 (inverted) vs west = -9.0, east = -8.0 (normal)
        const normal = getTilesForBounds(39.0, 38.0, -8.0, -9.0, 7, 7);
        const inverted = getTilesForBounds(39.0, 38.0, -9.0, -8.0, 7, 7);

        expect(inverted.length).toBe(normal.length);
        const normalKeys = new Set(normal.map((t) => `${t.z}_${t.x}_${t.y}`));
        for (const t of inverted) {
          expect(normalKeys.has(`${t.z}_${t.x}_${t.y}`)).toBe(true);
        }
      });

      it('handles Anti-Meridian crossing (west = 175°E, east = -175°W) covering 10° rather than 350° of world', () => {
        const z = 6; // n = 64
        const tiles = getTilesForBounds(10, -10, -175, 175, z, z);

        expect(tiles.length).toBeGreaterThan(0);

        // At zoom 6 (64 tiles wide), 10° of longitude should be ~2-3 columns, NOT ~62 columns!
        const uniqueX = new Set(tiles.map((t) => t.x));
        expect(uniqueX.size).toBeLessThan(10);

        // Tiles must span the antimeridian: some near 63 (east edge) and some near 0 (west edge)
        const hasEasternEdge = tiles.some((t) => t.x >= 60);
        const hasWesternEdge = tiles.some((t) => t.x <= 3);
        const hasPrimeMeridian = tiles.some((t) => t.x >= 30 && t.x <= 34);

        expect(hasEasternEdge).toBe(true);
        expect(hasWesternEdge).toBe(true);
        // It must NOT include Prime Meridian tiles (lon = 0)
        expect(hasPrimeMeridian).toBe(false);
      });
    });

    describe('b. Giant Bounding Boxes & Memory Safeguards', () => {
      it('accurately enumerates the entire world bounding box for zoom 0 to 5 without duplicates', () => {
        const start = performance.now();
        const tiles = getTilesForBounds(85.05112878, -85.05112878, 180, -180, 0, 5);
        const durationMs = performance.now() - start;

        // Sum of 2^(2*z) for z = 0..5 = 1 + 4 + 16 + 64 + 256 + 1024 = 1365 tiles
        expect(tiles.length).toBe(1365);

        // Zero duplicate tiles
        const keys = tiles.map((t) => `${t.z}_${t.x}_${t.y}`);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(1365);

        // Must complete fast (< 150ms) with minimal memory overhead
        expect(durationMs).toBeLessThan(150);
      });

      it('prevents memory exhaustion or infinite loop when minZoom > maxZoom', () => {
        // Inverted zoom range should either normalize or return safe array
        const tiles = getTilesForBounds(40, 38, -8, -9, 8, 6);
        expect(Array.isArray(tiles)).toBe(true);
        expect(tiles.length).toBeGreaterThan(0);
      });
    });

    describe('c. Route Corridor Enumeration: Single-Point vs 100-Waypoint Zig-Zag', () => {
      it('handles single-point route corridor gracefully', () => {
        const singleWp = [{ latitude: 38.725, longitude: -9.355 }]; // Cascais
        const tiles = getTilesForRouteCorridor(singleWp, 20, 6, 8);

        expect(tiles.length).toBeGreaterThan(0);
        // All tiles should be around Cascais area
        for (const t of tiles) {
          expect(t.z).toBeGreaterThanOrEqual(6);
          expect(t.z).toBeLessThanOrEqual(8);
        }
      });

      it('handles 100-waypoint zig-zag route across coordinates without duplicate tiles', () => {
        const waypoints: Array<{ latitude: number; longitude: number }> = [];
        // Generate 100 zig-zag points across Portugal and Spain
        for (let i = 0; i < 100; i++) {
          waypoints.push({
            latitude: 37.0 + (i % 5) * 1.0 + (Math.sin(i) * 0.2),
            longitude: -9.5 + (i % 4) * 0.8 + (Math.cos(i) * 0.2),
          });
        }

        const tiles = getTilesForRouteCorridor(waypoints, 15, 6, 8);
        expect(tiles.length).toBeGreaterThan(0);

        // Zero duplicates
        const keys = tiles.map((t) => `${t.z}_${t.x}_${t.y}`);
        const uniqueKeys = new Set(keys);
        expect(keys.length).toBe(uniqueKeys.size);
      });

      it('returns empty array for empty waypoints list', () => {
        expect(getTilesForRouteCorridor([])).toEqual([]);
      });

      it('safely handles non-finite or corrupted waypoint coordinates', () => {
        const badWaypoints = [
          { latitude: NaN, longitude: -9.0 },
          { latitude: 38.7, longitude: Infinity },
          { latitude: 38.7, longitude: -9.1 }, // One valid waypoint
        ];

        const tiles = getTilesForRouteCorridor(badWaypoints, 20, 6, 7);
        expect(Array.isArray(tiles)).toBe(true);
        expect(tiles.length).toBeGreaterThan(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Tile Download Pack Concurrency & Error Resilience
  // ─────────────────────────────────────────────────────────────
  describe('3. Tile Download Pack Concurrency & Error Resilience', () => {
    describe('a. Rapid AbortSignal Triggering', () => {
      it('aborts immediately before start without running workers or hanging', async () => {
        const controller = new AbortController();
        controller.abort(); // Pre-aborted

        const tiles: TileCoord[] = [
          { z: 5, x: 10, y: 10 },
          { z: 5, x: 10, y: 11 },
        ];

        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        await expect(
          downloadTilePack(tiles, 'test_layer', 'https://tile.test/{z}/{x}/{y}.png', undefined, controller.signal)
        ).rejects.toThrow(/cancelled|abort/i);

        expect(mockFetch).not.toHaveBeenCalled();
      });

      it('aborts rapidly after 1ms without hanging or leaking promises', async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 1);

        const tiles: TileCoord[] = Array.from({ length: 10 }, (_, i) => ({
          z: 5,
          x: 10 + i,
          y: 10,
        }));

        await expect(
          downloadTilePack(tiles, 'test_layer', 'https://tile.test/{z}/{x}/{y}.png', undefined, controller.signal)
        ).rejects.toThrow(/cancelled|abort/i);
      });

      it('aborts rapidly during in-flight downloads without unhandled promise rejections', async () => {
        const controller = new AbortController();

        // 20 tiles to ensure multiple concurrent workers are active
        const tiles: TileCoord[] = Array.from({ length: 20 }, (_, i) => ({
          z: 8,
          x: 100 + i,
          y: 100,
        }));

        let fetchCallCount = 0;
        vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
          fetchCallCount++;
          if (fetchCallCount >= 2) {
            // Trigger abort while downloads are actively in-flight
            setTimeout(() => controller.abort(), 0);
          }

          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve(new Response(new Blob(['tile-data'], { type: 'image/png' }), { status: 200 }));
            }, 50);

            opts?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        }));

        await expect(
          downloadTilePack(tiles, 'test_layer', 'https://tile.test/{z}/{x}/{y}.png', undefined, controller.signal)
        ).rejects.toThrow(/cancelled|abort/i);

        expect(fetchCallCount).toBeGreaterThan(0);
      });
    });

    describe('b. Simulated 404, 500, and Network Dropouts', () => {
      it('accurately tallies completed and failed counts under network errors', async () => {
        const tiles: TileCoord[] = [
          { z: 7, x: 10, y: 1 }, // 200 OK
          { z: 7, x: 10, y: 2 }, // 404 Not Found
          { z: 7, x: 10, y: 3 }, // 500 Server Error
          { z: 7, x: 10, y: 4 }, // Network Dropout (TypeError)
          { z: 7, x: 10, y: 5 }, // 200 OK
        ];

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
          if (url.includes('/7/10/1')) {
            return Promise.resolve(new Response(new Blob(['tile-1-ok'], { type: 'image/png' }), { status: 200 }));
          }
          if (url.includes('/7/10/2')) {
            return Promise.resolve(new Response('Not Found', { status: 404 }));
          }
          if (url.includes('/7/10/3')) {
            return Promise.resolve(new Response('Internal Error', { status: 500 }));
          }
          if (url.includes('/7/10/4')) {
            return Promise.reject(new TypeError('Failed to fetch (network dropout)'));
          }
          if (url.includes('/7/10/5')) {
            return Promise.resolve(new Response(new Blob(['tile-5-ok'], { type: 'image/png' }), { status: 200 }));
          }
          return Promise.reject(new Error('Unexpected URL'));
        }));

        const progressUpdates: TileDownloadProgress[] = [];
        const result = await downloadTilePack(
          tiles,
          'mixed_layer',
          'https://tile.test/{z}/{x}/{y}.png',
          (p) => progressUpdates.push({ ...p })
        );

        expect(result.downloaded).toBe(2);
        expect(result.failed).toBe(3);
        expect(result.downloaded + result.failed).toBe(5);

        // Progress updates must report 100% at finish
        expect(progressUpdates.length).toBeGreaterThan(0);
        const lastProgress = progressUpdates[progressUpdates.length - 1];
        expect(lastProgress.total).toBe(5);
        expect(lastProgress.completed).toBe(2);
        expect(lastProgress.failed).toBe(3);
        expect(lastProgress.percent).toBe(100);
      });
    });

    describe('c. Corrupted Blobs (0-byte Blob & Invalid MIME Types)', () => {
      it('rejects 0-byte blobs and marks them as failed rather than caching empty tiles', async () => {
        const tiles: TileCoord[] = [
          { z: 6, x: 20, y: 1 }, // Valid 100-byte tile
          { z: 6, x: 20, y: 2 }, // Corrupted 0-byte tile
        ];

        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
          if (url.includes('/6/20/1')) {
            return Promise.resolve(new Response(new Blob(['valid-tile-data'], { type: 'image/png' }), { status: 200 }));
          }
          if (url.includes('/6/20/2')) {
            return Promise.resolve(new Response(new Blob([], { type: 'image/png' }), { status: 200 })); // 0-byte blob!
          }
          return Promise.reject(new Error('URL mismatch'));
        }));

        const result = await downloadTilePack(
          tiles,
          'corrupt_check',
          'https://tile.test/{z}/{x}/{y}.png'
        );

        expect(result.downloaded).toBe(1);
        expect(result.failed).toBe(1);

        // Verify the 0-byte blob was NOT saved to IndexedDB
        const cachedEmpty = await getCachedTileBlob('corrupt_check', 6, 20, 2);
        expect(cachedEmpty).toBeNull();

        // Verify valid tile WAS cached
        const cachedValid = await getCachedTileBlob('corrupt_check', 6, 20, 1);
        expect(cachedValid).not.toBeNull();
        expect(cachedValid?.size).toBeGreaterThan(0);
      });

      it('rejects captive portal HTML error page responses (text/html)', async () => {
        const tiles: TileCoord[] = [
          { z: 6, x: 30, y: 1 }, // Captive portal login HTML returned with 200 OK
        ];

        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
          return Promise.resolve(
            new Response(new Blob(['<html><body>Please log in to Airport Wi-Fi</body></html>'], { type: 'text/html' }), {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            })
          );
        }));

        const result = await downloadTilePack(
          tiles,
          'captive_portal',
          'https://tile.test/{z}/{x}/{y}.png'
        );

        expect(result.downloaded).toBe(0);
        expect(result.failed).toBe(1);

        const cached = await getCachedTileBlob('captive_portal', 6, 30, 1);
        expect(cached).toBeNull();
      });
    });

    describe('d. Concurrent Writes to the Same Tile Key in IndexedDB', () => {
      it('handles 30 concurrent writes to the same tile key without race conditions', async () => {
        const layer = 'concurrent_test';
        const z = 7, x = 15, y = 20;

        const writePromises = Array.from({ length: 30 }, (_, i) => {
          const blob = new Blob([`tile-payload-version-${i}`], { type: 'image/png' });
          return setCachedTileBlob(layer, z, x, y, blob);
        });

        // All concurrent writes must resolve cleanly
        await expect(Promise.all(writePromises)).resolves.not.toThrow();

        // The final tile in cache must be a valid, readable blob
        const readBlob = await getCachedTileBlob(layer, z, x, y);
        expect(readBlob).not.toBeNull();
        expect(readBlob?.size).toBeGreaterThan(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Storage Quota, Stats & Cache Clearance Fuzzing
  // ─────────────────────────────────────────────────────────────
  describe('4. Storage Quota & Stats Fuzzing', () => {
    it('accurately calculates stats for empty vs populated store', async () => {
      // 1. Initial empty state
      const initialStats = await getTileStorageStats();
      expect(initialStats.tileCount).toBe(0);
      expect(initialStats.totalSizeBytes).toBe(0);

      // 2. Insert 10 tiles of 500 bytes each
      const tileSize = 500;
      const dummyData = new Uint8Array(tileSize);

      for (let i = 0; i < 10; i++) {
        const blob = new Blob([dummyData], { type: 'image/png' });
        await setCachedTileBlob('stats_layer', 5, i, 0, blob);
      }

      const populatedStats = await getTileStorageStats();
      expect(populatedStats.tileCount).toBe(10);
      expect(populatedStats.totalSizeBytes).toBe(10 * tileSize);
    });

    it('handles clearTileCache called repeatedly and concurrently', async () => {
      // Seed store with some data
      const blob = new Blob(['seed-tile-data'], { type: 'image/png' });
      await setCachedTileBlob('clear_layer', 5, 1, 1, blob);
      await setCachedTileBlob('clear_layer', 5, 1, 2, blob);

      const beforeClear = await getTileStorageStats();
      expect(beforeClear.tileCount).toBe(2);

      // Trigger 10 concurrent clear operations
      const clearPromises = Array.from({ length: 10 }, () => clearTileCache());
      await expect(Promise.all(clearPromises)).resolves.not.toThrow();

      const afterClear = await getTileStorageStats();
      expect(afterClear.tileCount).toBe(0);
      expect(afterClear.totalSizeBytes).toBe(0);

      // Verify store is still functional for new writes
      await setCachedTileBlob('clear_layer', 5, 1, 1, blob);
      const postClearCheck = await getTileStorageStats();
      expect(postClearCheck.tileCount).toBe(1);
    });

    it('formats tile keys consistently without collisions across layers or zoom', () => {
      const k1 = formatTileKey('vfr', 6, 12, 34);
      const k2 = formatTileKey('vfr_dark', 6, 12, 34);
      const k3 = formatTileKey('vfr', 16, 12, 34);

      expect(k1).toBe('vfr_6_12_34');
      expect(k2).toBe('vfr_dark_6_12_34');
      expect(k3).toBe('vfr_16_12_34');
      expect(k1).not.toBe(k2);
      expect(k1).not.toBe(k3);
    });
  });
});
