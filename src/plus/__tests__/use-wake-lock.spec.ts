import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WakeLockManager } from '../use-wake-lock';

describe('WakeLockManager Screen Sleep Prevention Controller', () => {
  let originalWakeLock: any;
  let mockSentinel: any;
  let requestMock: any;

  beforeEach(() => {
    mockSentinel = {
      released: false,
      release: vi.fn().mockImplementation(() => {
        mockSentinel.released = true;
        if (mockSentinel.onrelease) mockSentinel.onrelease();
      }),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'release') mockSentinel.onrelease = handler;
      }),
    };

    requestMock = vi.fn().mockResolvedValue(mockSentinel);

    originalWakeLock = (navigator as any).wakeLock;
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: originalWakeLock,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('detects wakeLock platform support and acquires lock', async () => {
    expect(WakeLockManager.isSupported()).toBe(true);

    const manager = new WakeLockManager();
    const success = await manager.acquire();

    expect(success).toBe(true);
    expect(manager.getIsLocked()).toBe(true);
    expect(requestMock).toHaveBeenCalledWith('screen');

    manager.release();
    expect(manager.getIsLocked()).toBe(false);
    expect(mockSentinel.release).toHaveBeenCalled();
  });

  it('handles platform rejection or missing API gracefully without crashing', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(WakeLockManager.isSupported()).toBe(false);

    const manager = new WakeLockManager();
    const success = await manager.acquire();

    expect(success).toBe(false);
    expect(manager.getIsLocked()).toBe(false);
  });
});
