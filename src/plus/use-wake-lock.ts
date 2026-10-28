import { useState, useEffect, useCallback, useRef } from 'react';

export class WakeLockManager {
  private sentinel: any = null;
  private isLocked: boolean = false;

  public async acquire(): Promise<boolean> {
    if (!WakeLockManager.isSupported()) {
      this.isLocked = false;
      return false;
    }

    try {
      if (this.sentinel && !this.sentinel.released) {
        this.isLocked = true;
        return true;
      }

      this.sentinel = await (navigator as any).wakeLock.request('screen');
      this.isLocked = true;

      this.sentinel.addEventListener('release', () => {
        this.isLocked = false;
        this.sentinel = null;
      });
      return true;
    } catch {
      this.isLocked = false;
      return false;
    }
  }

  public release(): void {
    if (this.sentinel) {
      try {
        this.sentinel.release();
      } catch {}
      this.sentinel = null;
    }
    this.isLocked = false;
  }

  public getIsLocked(): boolean {
    return this.isLocked;
  }

  public static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      Boolean((navigator as any).wakeLock)
    );
  }
}

export interface UseWakeLockResult {
  isLocked: boolean;
  isSupported: boolean;
  error: string | null;
  requestLock: () => Promise<void>;
  releaseLock: () => void;
}

/**
 * Screen Wake Lock hook to keep mobile / tablet cockpit displays active
 * during in-flight operations without automatic sleep timeouts.
 */
export function useWakeLock(enabled: boolean = true): UseWakeLockResult {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const managerRef = useRef<WakeLockManager>(new WakeLockManager());

  const isSupported = WakeLockManager.isSupported();

  const requestLock = useCallback(async () => {
    if (!isSupported) {
      setError('Screen Wake Lock API not supported on this platform');
      return;
    }

    const success = await managerRef.current.acquire();
    setIsLocked(success);
    if (!success) {
      setError('Could not acquire Screen Wake Lock');
    } else {
      setError(null);
    }
  }, [isSupported]);

  const releaseLock = useCallback(() => {
    managerRef.current.release();
    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseLock();
      return;
    }

    requestLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        requestLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseLock();
    };
  }, [enabled, requestLock, releaseLock]);

  return {
    isLocked,
    isSupported,
    error,
    requestLock,
    releaseLock,
  };
}
