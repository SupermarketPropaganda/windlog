/**
 * Local-First Durable Storage Manager
 * 
 * Replaces vulnerable 5MB synchronous localStorage with an asynchronous,
 * high-capacity IndexedDB store. Automatically requests durable persistence
 * via navigator.storage.persist() to protect against Safari ITP 7-day eviction,
 * auto-migrates existing localStorage data, and provides JSON backup/restore.
 */

const DB_NAME = 'windlog_user_data_v1';
const STORE_NAME = 'key_value_store';

// In-memory synchronous cache to allow synchronous access when needed
const memoryCache = new Map<string, any>();
let isInitialized = false;

function openUserDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initializes the storage subsystem, requests browser durable persistence,
 * populates the in-memory cache, and migrates legacy localStorage keys.
 */
export async function initStorage(): Promise<void> {
  if (isInitialized) return;

  // 1. Request durable storage from browser to prevent eviction (Safari ITP / Chrome quota)
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      if (isPersisted) {
        console.log('[StorageManager] Persistent storage granted by browser.');
      } else {
        console.log('[StorageManager] Storage persistence default/best-effort.');
      }
    } catch (e) {
      console.warn('[StorageManager] navigator.storage.persist() check failed:', e);
    }
  }

  // 2. Populate memoryCache from IndexedDB
  try {
    const db = await openUserDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          memoryCache.set(cursor.key as string, cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('[StorageManager] Could not read from IndexedDB, falling back to localStorage:', err);
  }

  // 3. Migrate legacy localStorage keys into IndexedDB if not already present
  if (typeof localStorage !== 'undefined') {
    try {
      const legacyKeys = [
        'windlog_profile',
        'windlog_custom_wpts',
        'windlog_custom_mb_presets',
        'windlog_route',
        'windlog_wind_mode',
        'windlog_manual_wind',
        'windlog_sidebar_open',
        'windlog_legal_version_accepted',
        'windlog_legal_timestamp',
        'windlog_osm_vrp_cache',
      ];

      for (const key of legacyKeys) {
        const stored = localStorage.getItem(key);
        if (stored !== null && !memoryCache.has(key)) {
          try {
            const parsed = JSON.parse(stored);
            memoryCache.set(key, parsed);
            await setStorageItem(key, parsed);
          } catch {
            memoryCache.set(key, stored);
            await setStorageItem(key, stored);
          }
        }
      }
    } catch (e) {
      console.warn('[StorageManager] LocalStorage migration skipped:', e);
    }
  }

  isInitialized = true;
}

/**
 * Synchronous read from memory cache with optional fallback to localStorage
 */
export function getStorageItemSync<T>(key: string, defaultValue: T): T {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }

  // Fallback check in localStorage
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed as T;
      } catch {
        memoryCache.set(key, raw);
        return raw as unknown as T;
      }
    }
  }

  return defaultValue;
}

/**
 * Asynchronous read from IndexedDB
 */
export async function getStorageItem<T>(key: string, defaultValue: T): Promise<T> {
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }

  try {
    const db = await openUserDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result !== undefined) {
          memoryCache.set(key, request.result);
          resolve(request.result as T);
        } else {
          // Check localStorage as secondary fallback
          const localVal = getStorageItemSync(key, defaultValue);
          resolve(localVal);
        }
      };
      request.onerror = () => resolve(getStorageItemSync(key, defaultValue));
    });
  } catch {
    return getStorageItemSync(key, defaultValue);
  }
}

/**
 * Stores an item durably in IndexedDB and mirrors in memoryCache and localStorage
 */
export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  memoryCache.set(key, value);

  // Mirror to localStorage for instant synchronous retrieval
  if (typeof localStorage !== 'undefined') {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch {
      // Ignore quota exceeded errors in localStorage
    }
  }

  // Persist to IndexedDB
  try {
    const db = await openUserDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn(`[StorageManager] Failed to persist key ${key} to IndexedDB:`, err);
  }
}

/**
 * Removes an item from IndexedDB, memoryCache, and localStorage
 */
export async function removeStorageItem(key: string): Promise<void> {
  memoryCache.delete(key);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }

  try {
    const db = await openUserDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/**
 * Exports all user data as a formatted JSON string for backup and cross-device transfer
 */
export async function exportAllUserData(): Promise<string> {
  await initStorage();
  const backup: Record<string, any> = {
    app: 'WindLog',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {},
  };

  memoryCache.forEach((value, key) => {
    backup.data[key] = value;
  });

  return JSON.stringify(backup, null, 2);
}

/**
 * Restores user data from an exported JSON string
 */
export async function importUserData(jsonString: string): Promise<{ success: boolean; importedKeys: string[]; error?: string }> {
  try {
    const backup = JSON.parse(jsonString);
    if (!backup || typeof backup !== 'object' || !backup.data) {
      return { success: false, importedKeys: [], error: 'Invalid backup file format' };
    }

    const importedKeys: string[] = [];
    for (const [key, value] of Object.entries(backup.data)) {
      await setStorageItem(key, value);
      importedKeys.push(key);
    }

    return { success: true, importedKeys };
  } catch (err: any) {
    return { success: false, importedKeys: [], error: err.message || 'Failed to parse JSON backup' };
  }
}
