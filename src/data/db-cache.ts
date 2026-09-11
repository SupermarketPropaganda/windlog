/**
 * Database Cache Manager
 * Provides persistent binary caching for the 9.36MB aeronautical SQLite database
 * using IndexedDB. Eliminates redundant network fetches on app reload,
 * tracks download progress, and validates SQLite binary integrity.
 */

const DB_NAME = 'windlog_db_cache_v1';
const STORE_NAME = 'sqlite_blobs';
const CACHE_KEY = 'waypoints_sqlite';

// SQLite 3 header magic: "SQLite format 3\0"
const SQLITE_HEADER = new Uint8Array([
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00
]);

export function isValidSqliteDatabase(data: any): data is Uint8Array {
  if (!(data instanceof Uint8Array) || data.length < 16) return false;
  for (let i = 0; i < 16; i++) {
    if (data[i] !== SQLITE_HEADER[i]) return false;
  }
  return true;
}

interface CacheEntry {
  key: string;
  data: Uint8Array;
  version: string;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Opens or initializes the IndexedDB database cache instance
 */
function openCacheDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Retrieve cached SQLite database binary from IndexedDB with integrity verification
 * @param requiredVersion Optional version string to validate cache freshness
 */
export async function getCachedDatabase(requiredVersion?: string): Promise<Uint8Array | null> {
  try {
    const db = await openCacheDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);

      request.onsuccess = () => {
        const result = request.result as CacheEntry | undefined;
        if (!result || !result.data) {
          resolve(null);
          return;
        }

        // Evict mismatched version to reclaim ~10MB space
        if (requiredVersion && result.version !== requiredVersion) {
          store.delete(CACHE_KEY);
          resolve(null);
          return;
        }

        // Validate binary SQLite header
        if (!isValidSqliteDatabase(result.data)) {
          console.warn('[DBCache] Corrupted SQLite cache detected. Purging...');
          store.delete(CACHE_KEY);
          resolve(null);
          return;
        }

        resolve(result.data);
      };

      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[DBCache] IndexedDB unavailable or error reading cache:', err);
    return null;
  }
}

/**
 * Save SQLite database binary into IndexedDB for instant future loads
 */
export async function setCachedDatabase(data: Uint8Array, version: string = 'latest'): Promise<void> {
  if (!isValidSqliteDatabase(data)) {
    console.warn('[DBCache] Rejecting invalid SQLite binary persistence.');
    return;
  }

  try {
    const db = await openCacheDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const entry: CacheEntry = {
          key: CACHE_KEY,
          data,
          version,
          cachedAt: Date.now(),
        };

        store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch (err) {
    console.warn('[DBCache] Failed to persist database to IndexedDB:', err);
  }
}

/**
 * Clears the cached SQLite binary from IndexedDB
 */
export async function clearCachedDatabase(): Promise<void> {
  try {
    const db = await openCacheDB();
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(CACHE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Ignore error
  }
}

export type DownloadProgressCallback = (percent: number, loadedBytes: number, totalBytes: number) => void;

/**
 * Fetches the SQLite database with progress tracking and caches it in IndexedDB
 */
export async function fetchAndCacheDatabase(
  url: string,
  version: string = 'latest',
  onProgress?: DownloadProgressCallback
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch database from ${url}: ${response.status} ${response.statusText}`);
  }

  const contentLengthHeader = response.headers.get('Content-Length');
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  let arrayBuffer: ArrayBuffer;

  if (response.body && totalBytes > 0 && typeof ReadableStream !== 'undefined') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.length;
        if (onProgress) {
          const percent = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
          onProgress(percent, loadedBytes, totalBytes);
        }
      }
    }

    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    if (isValidSqliteDatabase(merged)) {
      setCachedDatabase(merged, version).catch(() => {});
    }
    return merged;
  } else {
    arrayBuffer = await response.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    if (onProgress) onProgress(100, uint8.length, uint8.length);

    if (isValidSqliteDatabase(uint8)) {
      setCachedDatabase(uint8, version).catch(() => {});
    }
    return uint8;
  }
}
