export interface CachedTileRecord {
  key: string;
  layer: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
  timestamp: number;
  sizeBytes: number;
}

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface TileDownloadProgress {
  total: number;
  completed: number;
  failed: number;
  percent: number;
  currentTile?: TileCoord;
}

const DB_NAME = 'windlog_tiles_db';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

let tileDbPromise: Promise<IDBDatabase> | null = null;

export function resetTileDB(): void {
  tileDbPromise = null;
}

export function openTileDB(): Promise<IDBDatabase> {
  if (tileDbPromise) return tileDbPromise;

  tileDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      tileDbPromise = null;
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onclose = () => {
          tileDbPromise = null;
        };
        resolve(db);
      };

      request.onerror = (event) => {
        tileDbPromise = null;
        reject((event.target as IDBOpenDBRequest).error);
      };

      request.onblocked = () => {
        console.warn('[TileCache] IndexedDB open blocked');
      };
    } catch (e) {
      tileDbPromise = null;
      reject(e);
    }
  });

  tileDbPromise.catch(() => {
    tileDbPromise = null;
  });

  return tileDbPromise;
}

export function formatTileKey(layer: string, z: number, x: number, y: number): string {
  return `${layer}_${z}_${x}_${y}`;
}

export async function getCachedTileBlob(
  layer: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  try {
    const db = await openTileDB();
    const key = formatTileKey(layer, z, x, y);

    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      tx.onabort = () => resolve(null);
      tx.onerror = () => resolve(null);

      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result as CachedTileRecord | undefined;
        if (record?.blob && record.blob.size > 0) {
          resolve(record.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedTileBlob(
  layer: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<void> {
  // Reject 0-byte or corrupted blobs
  if (!blob || blob.size === 0) return;

  try {
    const db = await openTileDB();
    const key = formatTileKey(layer, z, x, y);
    const record: CachedTileRecord = {
      key,
      layer,
      z,
      x,
      y,
      blob,
      timestamp: Date.now(),
      sizeBytes: blob.size,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Tile cache transaction aborted'));

      const store = tx.objectStore(STORE_NAME);
      store.put(record);
    });
  } catch (e) {
    console.warn('[TileCache] Failed to store tile:', e);
  }
}

export async function getTileStorageStats(): Promise<{ tileCount: number; totalSizeBytes: number }> {
  try {
    const db = await openTileDB();
    return await new Promise((resolve) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      tx.onerror = () => resolve({ tileCount: 0, totalSizeBytes: 0 });
      tx.onabort = () => resolve({ tileCount: 0, totalSizeBytes: 0 });

      const store = tx.objectStore(STORE_NAME);
      let count = 0;
      let totalBytes = 0;

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          count++;
          totalBytes += cursor.value.sizeBytes || 0;
          cursor.continue();
        } else {
          resolve({ tileCount: count, totalSizeBytes: totalBytes });
        }
      };
      cursorReq.onerror = () => resolve({ tileCount: 0, totalSizeBytes: 0 });
    });
  } catch {
    return { tileCount: 0, totalSizeBytes: 0 };
  }
}

export async function clearTileCache(): Promise<void> {
  try {
    const db = await openTileDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));

      const store = tx.objectStore(STORE_NAME);
      store.clear();
    });
  } catch (e) {
    console.warn('[TileCache] Error clearing tile cache:', e);
  }
}

// ─── Mathematical Slippy Map Tile Calculations ───

// ─── Mathematical Slippy Map Tile Calculations ───

export const MAX_MERCATOR_LAT = 85.0511287798066;

/**
 * Converts Latitude/Longitude into standard Web Mercator Slippy Map Tile (X, Y)
 */
export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const z = Math.max(0, Math.min(22, Math.floor(Number.isFinite(zoom) ? zoom : 0)));
  const n = Math.pow(2, z);

  // Handle non-finite or NaN inputs safely
  const validLat = Number.isFinite(lat) ? lat : 0;
  const validLon = Number.isFinite(lon) ? lon : 0;

  // Geographic longitude wrapping to [-180, 180]
  let normLon = validLon;
  if (normLon < -180 || normLon > 180) {
    normLon = (((normLon + 180) % 360 + 360) % 360) - 180;
  }

  // Calculate tile X
  let x: number;
  if (normLon >= 180) {
    x = n - 1;
  } else if (normLon <= -180) {
    x = 0;
  } else {
    x = Math.floor(((normLon + 180) / 360) * n);
  }
  x = Math.max(0, Math.min(n - 1, x));

  // Calculate tile Y:
  // Exact cutoff at MAX_MERCATOR_LAT avoids tangent singularities at poles
  let y: number;
  if (validLat >= MAX_MERCATOR_LAT) {
    y = 0;
  } else if (validLat <= -MAX_MERCATOR_LAT) {
    y = n - 1;
  } else {
    const radLat = (validLat * Math.PI) / 180;
    const mercN = Math.log(Math.tan(radLat) + 1 / Math.cos(radLat));
    y = Math.floor(((1 - mercN / Math.PI) / 2) * n);
    y = Math.max(0, Math.min(n - 1, y));
  }

  return { x, y };
}

/**
 * Enumerates all unique tile coordinates for a geographic bounding box
 */
export function getTilesForBounds(
  north: number,
  south: number,
  east: number,
  west: number,
  minZoom: number,
  maxZoom: number
): TileCoord[] {
  const tiles: TileCoord[] = [];
  const seen = new Set<string>();

  // Normalize latitude: north must be >= south
  const actualNorth = Math.max(north, south);
  const actualSouth = Math.min(north, south);

  // Normalize zoom levels: ensure min <= max and within [0, 22]
  const z1 = Math.max(0, Math.min(22, Math.floor(Math.min(minZoom, maxZoom))));
  const z2 = Math.max(0, Math.min(22, Math.floor(Math.max(minZoom, maxZoom))));

  for (let z = z1; z <= z2; z++) {
    const n = Math.pow(2, z);

    const nw = latLonToTile(actualNorth, west, z);
    const se = latLonToTile(actualSouth, east, z);

    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);

    // Determine X ranges:
    // Handle Anti-Meridian crossing (e.g. west = 175°E, east = -175°W)
    let xRanges: Array<[number, number]>;

    if (west > east) {
      const antimeridianSpan = 360 - (west - east);
      const directSpan = west - east;

      if (antimeridianSpan < directSpan || (west > 0 && east < 0)) {
        // Crossing Anti-Meridian:
        // Range 1: from west to 180° -> [nw.x, n - 1]
        // Range 2: from -180° to east -> [0, se.x]
        xRanges = [
          [nw.x, n - 1],
          [0, se.x],
        ];
      } else {
        // Inverted bounds in same hemisphere (e.g. west = -8, east = -9)
        xRanges = [[Math.min(nw.x, se.x), Math.max(nw.x, se.x)]];
      }
    } else {
      // Normal bounding box
      xRanges = [[Math.min(nw.x, se.x), Math.max(nw.x, se.x)]];
    }

    for (const [startX, endX] of xRanges) {
      for (let x = startX; x <= endX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const k = `${z}_${x}_${y}`;
          if (!seen.has(k)) {
            seen.add(k);
            tiles.push({ z, x, y });
          }
        }
      }
    }
  }

  return tiles;
}

/**
 * Enumerates all tiles covering a flight route corridor with ±corridorNm buffer
 */
export function getTilesForRouteCorridor(
  waypoints: Array<{ latitude: number; longitude: number }>,
  corridorNm: number = 20,
  minZoom: number = 6,
  maxZoom: number = 10
): TileCoord[] {
  if (!waypoints || waypoints.length === 0) return [];

  // Filter out corrupted/non-finite waypoint coordinates
  const validWps = waypoints.filter(
    (wp) => Number.isFinite(wp?.latitude) && Number.isFinite(wp?.longitude)
  );
  if (validWps.length === 0) return [];

  const safeCorridorNm = Math.max(1, corridorNm);
  // 1 degree latitude is approx 60 NM
  const bufferDegLat = safeCorridorNm / 60;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  for (const wp of validWps) {
    if (wp.latitude < minLat) minLat = wp.latitude;
    if (wp.latitude > maxLat) maxLat = wp.latitude;
    if (wp.longitude < minLon) minLon = wp.longitude;
    if (wp.longitude > maxLon) maxLon = wp.longitude;
  }

  const avgLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.1, Math.cos((avgLat * Math.PI) / 180));
  const bufferDegLon = safeCorridorNm / (60 * cosLat);

  const north = Math.min(MAX_MERCATOR_LAT, maxLat + bufferDegLat);
  const south = Math.max(-MAX_MERCATOR_LAT, minLat - bufferDegLat);
  const east = Math.min(180.0, maxLon + bufferDegLon);
  const west = Math.max(-180.0, minLon - bufferDegLon);

  return getTilesForBounds(north, south, east, west, minZoom, maxZoom);
}

/**
 * Downloads a list of tiles concurrently with retry and progress reporting
 */
export async function downloadTilePack(
  tiles: TileCoord[],
  layer: string,
  urlTemplate: string,
  onProgress?: (progress: TileDownloadProgress) => void,
  signal?: AbortSignal
): Promise<{ downloaded: number; failed: number }> {
  if (signal?.aborted) {
    throw new Error('Tile download cancelled by user');
  }

  const total = tiles.length;
  if (total === 0) {
    return { downloaded: 0, failed: 0 };
  }

  let completed = 0;
  let failed = 0;
  let abortError: Error | null = null;

  const subdomains = ['a', 'b', 'c'];
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < total && !signal?.aborted && !abortError) {
      const index = cursor++;
      if (index >= total) break;

      const tile = tiles[index];

      // Check if already in cache with valid non-empty blob
      try {
        const existing = await getCachedTileBlob(layer, tile.z, tile.x, tile.y);
        if (existing && existing.size > 0) {
          completed++;
          onProgress?.({
            total,
            completed,
            failed,
            percent: Math.round(((completed + failed) / total) * 100),
            currentTile: tile,
          });
          continue;
        }
      } catch {
        // Cache read failure, proceed with network download
      }

      if (signal?.aborted || abortError) {
        abortError = new Error('Tile download cancelled by user');
        break;
      }

      const s = subdomains[(tile.x + tile.y) % subdomains.length];
      const url = urlTemplate
        .replace('{z}', String(tile.z))
        .replace('{x}', String(tile.x))
        .replace('{y}', String(tile.y))
        .replace('{s}', s);

      try {
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();

        // Validate blob integrity & MIME type
        if (!blob || blob.size === 0) {
          throw new Error('Received empty or 0-byte tile blob');
        }
        if (blob.type && (blob.type.includes('text/html') || blob.type.includes('application/json'))) {
          throw new Error(`Invalid tile MIME type: ${blob.type}`);
        }

        await setCachedTileBlob(layer, tile.z, tile.x, tile.y, blob);
        completed++;
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('aborted')) {
          abortError = new Error('Tile download cancelled by user');
          break;
        }
        failed++;
      }

      onProgress?.({
        total,
        completed,
        failed,
        percent: Math.round(((completed + failed) / total) * 100),
        currentTile: tile,
      });
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);

  if (abortError || signal?.aborted) {
    throw (abortError || new Error('Tile download cancelled by user'));
  }

  return { downloaded: completed, failed };
}

