import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setStorageItem,
  getStorageItemSync,
  getStorageItem,
  removeStorageItem,
  exportAllUserData,
  importUserData,
} from '../data/storage-manager';
import {
  getCachedDatabase,
  setCachedDatabase,
  clearCachedDatabase,
} from '../data/db-cache';

// Helper to create valid SQLite header (16 bytes: "SQLite format 3\0")
function createValidSqliteHeader(): Uint8Array {
  const header = new Uint8Array(16);
  const magic = 'SQLite format 3\0';
  for (let i = 0; i < magic.length; i++) {
    header[i] = magic.charCodeAt(i);
  }
  return header;
}

// In-memory IndexedDB mock builder
function setupMockIndexedDB(options?: {
  failOnOpen?: boolean;
  abortOnTransaction?: boolean;
  errorOnPut?: boolean;
  initialStore?: Map<string, any>;
}) {
  const storeData = options?.initialStore || new Map<string, any>();

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
        if (options?.failOnOpen) {
          req.error = new Error('Simulated IndexedDB open failure');
          if (req.onerror) req.onerror({ target: req });
          return;
        }

        const mockDb: any = {
          objectStoreNames: {
            contains: () => true,
          },
          createObjectStore: () => {},
          transaction: (_sName: string, _mode: string) => {
            const tx: any = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              error: null,
              abort: () => {
                if (tx.onabort) tx.onabort({ target: tx });
              },
              objectStore: () => ({
                get: (key: string) => {
                  const getReq: any = { result: undefined, error: null, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    getReq.result = storeData.get(key);
                    if (getReq.onsuccess) getReq.onsuccess({ target: getReq });
                  }, 1);
                  return getReq;
                },
                put: (value: any, key?: string) => {
                  const actualKey = key !== undefined ? key : value?.key;
                  const putReq: any = { result: actualKey, error: null, onsuccess: null, onerror: null };
                  if (options?.errorOnPut) {
                    setTimeout(() => {
                      putReq.error = new Error('Simulated QuotaExceededError in IndexedDB');
                      if (putReq.onerror) putReq.onerror({ target: putReq });
                      if (tx.onerror) tx.onerror({ target: tx });
                    }, 1);
                    return putReq;
                  }

                  storeData.set(actualKey, value);
                  setTimeout(() => {
                    if (putReq.onsuccess) putReq.onsuccess({ target: putReq });
                    if (options?.abortOnTransaction) {
                      if (tx.onabort) tx.onabort({ target: tx });
                    } else {
                      if (tx.oncomplete) tx.oncomplete({ target: tx });
                    }
                  }, 1);
                  return putReq;
                },
                delete: (key: string) => {
                  storeData.delete(key);
                  setTimeout(() => {
                    if (options?.abortOnTransaction) {
                      if (tx.onabort) tx.onabort({ target: tx });
                    } else {
                      if (tx.oncomplete) tx.oncomplete({ target: tx });
                    }
                  }, 1);
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
                        continue: () => setTimeout(advance, 1),
                      };
                    } else {
                      cursorReq.result = null;
                    }
                    if (cursorReq.onsuccess) cursorReq.onsuccess({ target: cursorReq });
                  }

                  setTimeout(advance, 1);
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
      }, 1);

      return req;
    }),
  };

  return { mockIDB, storeData };
}

describe('StorageManager & DBCache Security Fuzzing & Audit', () => {
  // -------------------------------------------------------------
  // 1. Prototype Pollution Tests
  // -------------------------------------------------------------
  describe('1. Prototype Pollution Resistance', () => {
    afterEach(() => {
      delete (Object.prototype as any).polluted;
      delete (Object.prototype as any).isAdmin;
      delete (Object.prototype as any).role;
      delete (Object.prototype as any).injected;
    });

    it('tests __proto__ as storage key in setStorageItem and getStorageItem', async () => {
      const payload = { isAdmin: true, role: 'superuser' };
      await setStorageItem('__proto__', payload);

      // Verify Object.prototype was NOT polluted
      expect((Object.prototype as any).isAdmin).toBeUndefined();
      expect((Object.prototype as any).role).toBeUndefined();

      const retrieved = getStorageItemSync<any>('__proto__', null);
      expect(retrieved).toBeNull();
      expect(({} as any).isAdmin).toBeUndefined();

      await removeStorageItem('__proto__');
    });

    it('tests constructor and prototype as storage keys in setStorageItem', async () => {
      await setStorageItem('constructor', { malicious: true });
      await setStorageItem('prototype', { malicious: true });

      expect(({} as any).malicious).toBeUndefined();
      expect(Object.prototype.constructor).toBe(Object);

      await removeStorageItem('constructor');
      await removeStorageItem('prototype');
    });

    it('tests exportAllUserData resistance when __proto__ is in memory cache', async () => {
      await setStorageItem('__proto__', { polluted: 'yes' });
      
      const exportedJson = await exportAllUserData();
      const parsed = JSON.parse(exportedJson);

      // Check if Object.prototype got polluted during export
      expect((Object.prototype as any).polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();

      // Check whether backup.data.__proto__ had prototype changed
      console.log('[Fuzz Test] Exported backup.data prototype:', Object.getPrototypeOf(parsed.data));

      await removeStorageItem('__proto__');
    });

    it('tests importUserData with __proto__, constructor, and prototype payloads', async () => {
      const maliciousPayload = JSON.stringify({
        app: 'WindLog',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
          '__proto__': { polluted: 'yes', isAdmin: true },
          'constructor': { prototype: { role: 'admin' } },
          'prototype': { injected: true },
          'normal_key': 'normal_value',
        },
      });

      const result = await importUserData(maliciousPayload);
      expect(result.success).toBe(true);

      expect((Object.prototype as any).polluted).toBeUndefined();
      expect((Object.prototype as any).isAdmin).toBeUndefined();
      expect((Object.prototype as any).role).toBeUndefined();
      expect((Object.prototype as any).injected).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();

      await removeStorageItem('__proto__');
      await removeStorageItem('constructor');
      await removeStorageItem('prototype');
      await removeStorageItem('normal_key');
    });
  });

  // -------------------------------------------------------------
  // 2. Corrupted JSON Backups in importUserData
  // -------------------------------------------------------------
  describe('2. Corrupted JSON Backups in importUserData', () => {
    it('rejects non-JSON strings, undefined, null, and primitives', async () => {
      const invalidInputs = [
        '',
        '   ',
        '{ invalid json: true',
        'undefined',
        'null',
        '12345',
        'true',
        'false',
        '"just a raw string"',
      ];

      for (const input of invalidInputs) {
        const result = await importUserData(input);
        expect(result.success).toBe(false);
      }
    });

    it('handles missing data object or invalid data types (array, primitive, string)', async () => {
      // Missing data
      const missingData = JSON.stringify({ app: 'WindLog', schemaVersion: 1 });
      const res1 = await importUserData(missingData);
      expect(res1.success).toBe(false);

      // data is null
      const nullData = JSON.stringify({ app: 'WindLog', data: null });
      const res2 = await importUserData(nullData);
      expect(res2.success).toBe(false);

      // data is a primitive number
      const numData = JSON.stringify({ app: 'WindLog', data: 42 });
      const res3 = await importUserData(numData);
      console.log('[Fuzz Test] importUserData with number data:', res3);

      // data is a string
      const strData = JSON.stringify({ app: 'WindLog', data: 'malicious_string' });
      const res4 = await importUserData(strData);
      console.log('[Fuzz Test] importUserData with string data:', res4);

      // data is an array
      const arrData = JSON.stringify({ app: 'WindLog', data: ['val1', 'val2'] });
      const res5 = await importUserData(arrData);
      console.log('[Fuzz Test] importUserData with array data:', res5);
    });

    it('fuzzes massive JSON payloads (10MB+ payload)', async () => {
      const largeString = 'X'.repeat(10 * 1024 * 1024); // 10MB
      const massivePayload = JSON.stringify({
        app: 'WindLog',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
          windlog_large_test: largeString,
        },
      });

      const startTime = Date.now();
      const result = await importUserData(massivePayload);
      const duration = Date.now() - startTime;
      console.log(`[Fuzz Test] 10MB payload import took ${duration}ms, result:`, result.success);

      expect(typeof result.success).toBe('boolean');
      await removeStorageItem('windlog_large_test');
    });

    it('tests malformed aircraft profile structures', async () => {
      const malformedProfiles = [
        null,
        'not a profile object',
        12345,
        [],
        { aircraftModel: null, cruiseAltitude: 'not a number', tas: -999 },
        { aircraftModel: 1234, fuelFlow: 'NaN' },
      ];

      for (let i = 0; i < malformedProfiles.length; i++) {
        const payload = JSON.stringify({
          app: 'WindLog',
          schemaVersion: 1,
          data: {
            windlog_profile: malformedProfiles[i],
          },
        });

        const result = await importUserData(payload);
        expect(result.success).toBe(true);

        const stored = getStorageItemSync('windlog_profile', null);
        expect(stored).toEqual(malformedProfiles[i]);
      }

      await removeStorageItem('windlog_profile');
    });
  });

  // -------------------------------------------------------------
  // 3. Concurrent Reads and Writes
  // -------------------------------------------------------------
  describe('3. Concurrent Reads and Writes', () => {
    it('handles 100 parallel setStorageItem calls on different keys', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        setStorageItem(`concurrent_diff_${i}`, { index: i, timestamp: Date.now() })
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();

      for (let i = 0; i < 100; i++) {
        const val = getStorageItemSync<any>(`concurrent_diff_${i}`, null);
        expect(val).not.toBeNull();
        expect(val.index).toBe(i);
        await removeStorageItem(`concurrent_diff_${i}`);
      }
    });

    it('handles 100 parallel setStorageItem calls on the same key', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        setStorageItem('concurrent_same_key', i)
      );

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const val = getStorageItemSync<number>('concurrent_same_key', -1);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(100);

      await removeStorageItem('concurrent_same_key');
    });

    it('handles reading while writing concurrently', async () => {
      let readCount = 0;
      const writePromises = Array.from({ length: 50 }, async (_, i) => {
        await setStorageItem('rw_key', `value_${i}`);
        const syncVal = getStorageItemSync('rw_key', null);
        expect(syncVal).toBeDefined();
        const asyncVal = await getStorageItem('rw_key', null);
        expect(asyncVal).toBeDefined();
        readCount++;
      });

      await expect(Promise.all(writePromises)).resolves.not.toThrow();
      expect(readCount).toBe(50);

      await removeStorageItem('rw_key');
    });
  });

  // -------------------------------------------------------------
  // 4. Storage Limits and Failure Handling
  // -------------------------------------------------------------
  describe('4. Storage Limits and Failure Handling', () => {
    it('simulates localStorage QuotaExceededError without throwing unhandled exceptions', async () => {
      const originalLocalStorage = globalThis.localStorage;
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn().mockImplementation(() => {
          const err = new Error('QuotaExceededError');
          err.name = 'QuotaExceededError';
          throw err;
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        configurable: true,
        writable: true,
      });

      try {
        await expect(setStorageItem('quota_test_key', { data: 'some_val' })).resolves.not.toThrow();
        const val = getStorageItemSync('quota_test_key', null);
        expect(val).toEqual({ data: 'some_val' });
      } finally {
        if (originalLocalStorage) {
          Object.defineProperty(globalThis, 'localStorage', {
            value: originalLocalStorage,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).localStorage;
        }
        await removeStorageItem('quota_test_key');
      }
    });

    it('audits localStorage string type mutation bug on reload', () => {
      // Test when string values that look like JSON are stored in localStorage
      const originalLocalStorage = globalThis.localStorage;
      const localStore = new Map<string, string>();
      const mockLocalStorage = {
        getItem: (k: string) => localStore.get(k) || null,
        setItem: (k: string, v: string) => { localStore.set(k, v); },
        removeItem: (k: string) => { localStore.delete(k); },
        clear: () => localStore.clear(),
        length: 0,
        key: () => null,
      };

      Object.defineProperty(globalThis, 'localStorage', {
        value: mockLocalStorage,
        configurable: true,
        writable: true,
      });

      try {
        // String that looks like a number
        const numberStr = "12345";
        // String that looks like a boolean
        const boolStr = "true";
        // String that looks like an array
        const arrStr = "[1, 2, 3]";

        // Manually simulate what setStorageItem did:
        // const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        mockLocalStorage.setItem('num_str', numberStr);
        mockLocalStorage.setItem('bool_str', boolStr);
        mockLocalStorage.setItem('arr_str', arrStr);

        // Now test getStorageItemSync fallback (reading from localStorage)
        // In getStorageItemSync:
        // const parsed = JSON.parse(raw);
        const parsedNum = JSON.parse(mockLocalStorage.getItem('num_str')!);
        const parsedBool = JSON.parse(mockLocalStorage.getItem('bool_str')!);
        const parsedArr = JSON.parse(mockLocalStorage.getItem('arr_str')!);

        console.log('[Fuzz Test] Type mutation inspection:', {
          originalNumStrType: typeof numberStr,
          parsedNumType: typeof parsedNum,
          originalBoolStrType: typeof boolStr,
          parsedBoolType: typeof parsedBool,
          originalArrStrType: typeof arrStr,
          parsedArrIsArray: Array.isArray(parsedArr),
        });

        expect(typeof parsedNum).toBe('number'); // MUTATED from string to number!
        expect(typeof parsedBool).toBe('boolean'); // MUTATED from string to boolean!
        expect(Array.isArray(parsedArr)).toBe(true); // MUTATED from string to Array!
      } finally {
        if (originalLocalStorage) {
          Object.defineProperty(globalThis, 'localStorage', {
            value: originalLocalStorage,
            configurable: true,
            writable: true,
          });
        } else {
          delete (globalThis as any).localStorage;
        }
      }
    });

    it('tests when indexedDB is undefined', async () => {
      const origIDB = (globalThis as any).indexedDB;
      delete (globalThis as any).indexedDB;

      try {
        await expect(setStorageItem('idb_undef_key', 'hello')).resolves.not.toThrow();
        const val = await getStorageItem('idb_undef_key', null);
        expect(val).toBe('hello');
      } finally {
        if (origIDB) (globalThis as any).indexedDB = origIDB;
        await removeStorageItem('idb_undef_key');
      }
    });

    it('tests when indexedDB throws an error on open()', async () => {
      const { mockIDB } = setupMockIndexedDB({ failOnOpen: true });
      (globalThis as any).indexedDB = mockIDB;

      try {
        // setStorageItem should catch the error and not throw unhandled exception
        await expect(setStorageItem('idb_fail_open', 'test_data')).resolves.not.toThrow();
        const val = getStorageItemSync('idb_fail_open', null);
        expect(val).toBe('test_data');
      } finally {
        delete (globalThis as any).indexedDB;
        await removeStorageItem('idb_fail_open');
      }
    });

    it('tests when IndexedDB transaction is aborted (tx.onabort vs tx.onerror)', async () => {
      // Test if setStorageItem hangs when tx is aborted without oncomplete
      const { mockIDB } = setupMockIndexedDB({ abortOnTransaction: true });
      (globalThis as any).indexedDB = mockIDB;

      try {
        let timedOut = false;
        const setPromise = setStorageItem('tx_abort_key', 'abort_val');
        
        // Use Promise.race with a timeout to detect whether setStorageItem hangs
        const timeoutPromise = new Promise((resolve) => setTimeout(() => {
          timedOut = true;
          resolve('TIMED_OUT');
        }, 150));

        const result = await Promise.race([setPromise, timeoutPromise]);
        console.log('[Fuzz Test] Transaction abort result:', result);
        // If timedOut is true, it PROVES the unhandled tx.onabort bug where the promise hangs indefinitely!
        if (timedOut) {
          console.warn('[VULNERABILITY CONFIRMED] setStorageItem hangs indefinitely on transaction abort because tx.onabort is not handled!');
        }
      } finally {
        delete (globalThis as any).indexedDB;
        await removeStorageItem('tx_abort_key');
      }
    });
  });

  // -------------------------------------------------------------
  // 5. DBCache Tests
  // -------------------------------------------------------------
  describe('5. DBCache Stress & Edge Case Testing', () => {
    it('tests getCachedDatabase with invalid or non-matching version strings in mocked IndexedDB', async () => {
      const { mockIDB, storeData } = setupMockIndexedDB();
      (globalThis as any).indexedDB = mockIDB;

      try {
        const validHeader = createValidSqliteHeader();
        await setCachedDatabase(validHeader, '2609');

        // Matching version
        const cachedValid = await getCachedDatabase('2609');
        expect(cachedValid).toEqual(validHeader);

        // Non-matching version
        const cachedMismatch = await getCachedDatabase('9999_wrong_version');
        expect(cachedMismatch).toBeNull();

        // Check if obsolete version was evicted or left in IndexedDB
        const stillInStore = storeData.get('waypoints_sqlite');
        console.log('[Fuzz Test] Obsolete version evicted from store?', stillInStore === undefined);
      } finally {
        delete (globalThis as any).indexedDB;
      }
    });

    it('tests corrupted Uint8Array data (truncated headers, 0-byte arrays)', async () => {
      const { mockIDB } = setupMockIndexedDB();
      (globalThis as any).indexedDB = mockIDB;

      try {
        // 0-byte array
        const zeroByte = new Uint8Array(0);
        await setCachedDatabase(zeroByte, '2609');
        const retrievedZero = await getCachedDatabase('2609');
        console.log('[Fuzz Test] getCachedDatabase returned 0-byte array:', retrievedZero?.length === 0);

        // Truncated header
        const truncated = new Uint8Array([0x53, 0x51, 0x4c, 0x69]);
        await setCachedDatabase(truncated, '2609');
        const retrievedTruncated = await getCachedDatabase('2609');
        console.log('[Fuzz Test] getCachedDatabase returned truncated header without SQLite validation:', retrievedTruncated?.length === 4);

        // Non-SQLite text (HTML 404 response cached)
        const htmlText = new TextEncoder().encode('<!DOCTYPE html><html>404 Not Found</html>');
        await setCachedDatabase(htmlText, '2609');
        const retrievedHtml = await getCachedDatabase('2609');
        console.log('[Fuzz Test] getCachedDatabase returned HTML page as SQLite DB:', retrievedHtml !== null);
      } finally {
        delete (globalThis as any).indexedDB;
      }
    });

    it('tests clearCachedDatabase when store is empty or database is locked / transaction aborted', async () => {
      const { mockIDB } = setupMockIndexedDB({ abortOnTransaction: true });
      (globalThis as any).indexedDB = mockIDB;

      try {
        let timedOut = false;
        const clearPromise = clearCachedDatabase();
        const timeoutPromise = new Promise((resolve) => setTimeout(() => {
          timedOut = true;
          resolve('TIMED_OUT');
        }, 150));

        const result = await Promise.race([clearPromise, timeoutPromise]);
        console.log('[Fuzz Test] clearCachedDatabase transaction abort result:', result);
        if (timedOut) {
          console.warn('[VULNERABILITY CONFIRMED] clearCachedDatabase hangs indefinitely when transaction is aborted!');
        }
      } finally {
        delete (globalThis as any).indexedDB;
      }
    });
  });
});
