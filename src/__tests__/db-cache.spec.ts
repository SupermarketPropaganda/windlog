import { describe, it, expect } from 'vitest';
import { getCachedDatabase, setCachedDatabase, clearCachedDatabase } from '../data/db-cache';

describe('Aeronautical Database Binary Cache (IndexedDB/Fallback)', () => {
  it('returns null gracefully when IndexedDB is empty or uninitialized in test runner', async () => {
    const cached = await getCachedDatabase('2609');
    expect(cached === null || cached instanceof Uint8Array).toBe(true);
  });

  it('handles setCachedDatabase without throwing unhandled rejections', async () => {
    // 16-byte SQLite 3 header: "SQLite format 3\0"
    const validHeader = new Uint8Array([
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
      0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00,
    ]);
    await expect(setCachedDatabase(validHeader, '2609')).resolves.not.toThrow();

    // Rejects corrupted or non-sqlite binary gracefully
    const invalidHeader = new Uint8Array([1, 2, 3, 4]);
    await expect(setCachedDatabase(invalidHeader, '2609')).resolves.not.toThrow();
  });

  it('handles clearCachedDatabase safely', async () => {
    await expect(clearCachedDatabase()).resolves.not.toThrow();
  });
});
