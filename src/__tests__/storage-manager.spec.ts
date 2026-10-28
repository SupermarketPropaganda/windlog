import { describe, it, expect, beforeEach } from 'vitest';
import {
  setStorageItem,
  getStorageItemSync,
  getStorageItem,
  removeStorageItem,
  exportAllUserData,
  importUserData,
} from '../data/storage-manager';

describe('Local-First Storage Manager', () => {
  beforeEach(async () => {
    await removeStorageItem('test_key');
    await removeStorageItem('test_profile');
  });

  it('stores and retrieves items synchronously via memory cache', async () => {
    await setStorageItem('test_key', { cruiseAlt: 5500, tas: 110 });
    const val = getStorageItemSync<any>('test_key', null);
    expect(val).toEqual({ cruiseAlt: 5500, tas: 110 });

    const asyncVal = await getStorageItem<any>('test_key', null);
    expect(asyncVal).toEqual({ cruiseAlt: 5500, tas: 110 });
  });

  it('returns default value when key does not exist', () => {
    const val = getStorageItemSync<string>('non_existent_key_xyz', 'fallback');
    expect(val).toBe('fallback');
  });

  it('removes stored items cleanly', async () => {
    await setStorageItem('test_to_remove', 'hello');
    expect(getStorageItemSync('test_to_remove', null)).toBe('hello');
    await removeStorageItem('test_to_remove');
    expect(getStorageItemSync('test_to_remove', 'deleted')).toBe('deleted');
  });

  it('exports all user data as structured JSON backup', async () => {
    await setStorageItem('gustlog_route', 'LPCS COIMB LPCS');
    await setStorageItem('gustlog_profile', { aircraftModel: 'c172', tas: 105 });

    const json = await exportAllUserData();
    const parsed = JSON.parse(json);

    expect(parsed.app).toBe('GustLog');
    expect(parsed.data).toBeDefined();
    expect(parsed.data.gustlog_route).toBe('LPCS COIMB LPCS');
    expect(parsed.data.gustlog_profile.aircraftModel).toBe('c172');
  });

  it('imports valid user data from JSON backup', async () => {
    const backupJson = JSON.stringify({
      app: 'GustLog',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        gustlog_route: 'LPPT LPFR LPPT',
        gustlog_custom_wpts: {
          CUSTOM1: { identifier: 'CUSTOM1', latitude: 38.5, longitude: -9.1 },
        },
      },
    });

    const result = await importUserData(backupJson);
    expect(result.success).toBe(true);
    expect(result.importedKeys).toContain('gustlog_route');
    expect(result.importedKeys).toContain('gustlog_custom_wpts');

    expect(getStorageItemSync('gustlog_route', '')).toBe('LPPT LPFR LPPT');
  });

  it('rejects malformed JSON during import', async () => {
    const result = await importUserData('invalid json string {[');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
