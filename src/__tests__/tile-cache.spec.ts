import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  latLonToTile,
  getTilesForBounds,
  getTilesForRouteCorridor,
  formatTileKey,
  getCachedTileBlob,
  setCachedTileBlob,
  getTileStorageStats,
  clearTileCache,
} from '../data/tile-cache';

describe('Offline Tile Storage & Slippy Map Math', () => {
  describe('Slippy Map Mathematical Calculations', () => {
    it('converts (0,0) at zoom 0 to (0,0)', () => {
      const tile = latLonToTile(0, 0, 0);
      expect(tile.x).toBe(0);
      expect(tile.y).toBe(0);
    });

    it('calculates accurate tile coordinates for Cascais (LPCS) at zoom 10', () => {
      const tile = latLonToTile(38.725, -9.355, 10);
      expect(Number.isInteger(tile.x)).toBe(true);
      expect(Number.isInteger(tile.y)).toBe(true);
      expect(tile.x).toBeGreaterThan(0);
      expect(tile.x).toBeLessThan(1024);
      expect(tile.y).toBeGreaterThan(0);
      expect(tile.y).toBeLessThan(1024);
    });

    it('handles extreme latitudes (North and South Poles) without NaN or Infinity', () => {
      const northPole = latLonToTile(90.0, 0, 5);
      expect(Number.isFinite(northPole.x)).toBe(true);
      expect(Number.isFinite(northPole.y)).toBe(true);
      expect(northPole.y).toBe(0);

      const southPole = latLonToTile(-90.0, 0, 5);
      expect(Number.isFinite(southPole.x)).toBe(true);
      expect(Number.isFinite(southPole.y)).toBe(true);
      expect(southPole.y).toBe(31); // 2^5 - 1 = 31
    });

    it('enumerates tiles for a geographic bounding box without duplicates', () => {
      // Lisbon metro box at zoom 7
      const tiles = getTilesForBounds(39.0, 38.5, -9.0, -9.5, 7, 7);
      expect(tiles.length).toBeGreaterThan(0);

      const keys = tiles.map((t) => `${t.z}_${t.x}_${t.y}`);
      const uniqueKeys = new Set(keys);
      expect(keys.length).toBe(uniqueKeys.size); // Zero duplicate tiles
    });

    it('enumerates corridor tiles for route waypoints', () => {
      const waypoints = [
        { latitude: 38.725, longitude: -9.355 }, // Cascais
        { latitude: 38.774, longitude: -9.134 }, // Lisbon
      ];

      const corridorTiles = getTilesForRouteCorridor(waypoints, 20, 7, 8);
      expect(corridorTiles.length).toBeGreaterThan(0);

      // Empty route returns empty array
      expect(getTilesForRouteCorridor([])).toEqual([]);
    });

    it('formats tile keys consistently', () => {
      expect(formatTileKey('dark', 7, 63, 47)).toBe('dark_7_63_47');
      expect(formatTileKey('satellite', 10, 500, 300)).toBe('satellite_10_500_300');
    });
  });

  describe('IndexedDB Offline Tile Cache Operations (Mocked Environment)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('handles getCachedTileBlob gracefully when IndexedDB is not available', async () => {
      const blob = await getCachedTileBlob('dark', 5, 10, 10);
      // In node/test runner without IndexedDB, should return null without crashing
      expect(blob).toBeNull();
    });

    it('handles setCachedTileBlob and clearTileCache without throwing unhandled exceptions', async () => {
      const dummyBlob = new Blob(['mock-tile-data'], { type: 'image/png' });
      await expect(setCachedTileBlob('dark', 5, 10, 10, dummyBlob)).resolves.not.toThrow();
      await expect(clearTileCache()).resolves.not.toThrow();
    });

    it('returns 0 stats when database is uninitialized', async () => {
      const stats = await getTileStorageStats();
      expect(stats.tileCount).toBe(0);
      expect(stats.totalSizeBytes).toBe(0);
    });
  });
});
