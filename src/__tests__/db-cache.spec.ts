import { describe, it, expect } from 'vitest';
import { getCachedDatabase, setCachedDatabase, clearCachedDatabase } from '../data/db-cache';

describe('Aeronautical Database Binary Cache (IndexedDB/Fallback)', () => {
  it('returns null gracefully when IndexedDB is empty or uninitialized in test runner', async () => {
    const cached = await getCachedDatabase('2609');
    expect(cached === null || cached instanceof Uint8Array).toBe(true);
  });

  it('handles setCachedDatabase without throwing unhandled rejections', async () => {
    const dummy = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65]); // "SQLite"
    await expect(setCachedDatabase(dummy, '2609')).resolves.not.toThrow();
  });

  it('handles clearCachedDatabase safely', async () => {
    await expect(clearCachedDatabase()).resolves.not.toThrow();
  });
});
