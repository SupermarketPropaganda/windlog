import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { adService, AdItem, AdPlacement } from '../services/ad-service';

export interface TriggerAdBreakOptions {
  placement: AdPlacement;
  title?: string;
  subtitle?: string;
  onComplete: () => void | Promise<void>;
  force?: boolean;
}

export interface AdContextType {
  isAdActive: boolean;
  currentAd: AdItem | null;
  placement: AdPlacement | null;
  title: string;
  subtitle: string;
  countdown: number;
  isFinished: boolean;
  isPro: boolean;
  isProModalOpen: boolean;
  triggerAdBreak: (options: TriggerAdBreakOptions) => void;
  closeAdBreak: () => void;
  proceedAction: () => void;
  toggleProStatus: () => void;
  openProModal: () => void;
  closeProModal: () => void;
}

const AdContext = createContext<AdContextType | null>(null);

export const AdProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAdActive, setIsAdActive] = useState(false);
  const [currentAd, setCurrentAd] = useState<AdItem | null>(null);
  const [placement, setPlacement] = useState<AdPlacement | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [isFinished, setIsFinished] = useState(false);
  const [isPro, setIsPro] = useState(() => adService.isPro());
  const [isProModalOpen, setIsProModalOpen] = useState(false);

  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const timerRef = useRef<any>(null);

  // Sync Pro state on mount
  useEffect(() => {
    setIsPro(adService.isPro());
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const proceedAction = useCallback(async () => {
    clearTimer();
    setIsAdActive(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) {
      try {
        await action();
      } catch (e) {
        console.error('Error executing action after ad break:', e);
      }
    }
  }, [clearTimer]);

  const closeAdBreak = useCallback(() => {
    clearTimer();
    setIsAdActive(false);
    pendingActionRef.current = null;
  }, [clearTimer]);

  const triggerAdBreak = useCallback(
    ({ placement: p, title: t, subtitle: s, onComplete, force }: TriggerAdBreakOptions) => {
      // 1. Pro check: Instant 0-second execution
      if (adService.isPro()) {
        onComplete();
        return;
      }

      // 2. Cooldown and Grace check
      if (!adService.shouldShowAd(p, force)) {
        onComplete();
        return;
      }

      // 3. Trigger 5-second countdown interstitial
      clearTimer();
      const ad = adService.getNextAd();
      setCurrentAd(ad);
      setPlacement(p);
      setTitle(t || 'Compiling Flight Dispatch Document...');
      setSubtitle(s || 'Preparing aeronautical data and flight plan for departure.');
      setCountdown(5);
      setIsFinished(false);
      pendingActionRef.current = onComplete;
      setIsAdActive(true);

      // Record ad shown timestamp for cooldown
      adService.recordAdShown(p);

      // Countdown loop
      let currentCount = 5;
      timerRef.current = setInterval(() => {
        currentCount -= 1;
        setCountdown(currentCount);

        if (currentCount <= 0) {
          clearTimer();
          setIsFinished(true);
        }
      }, 1000);
    },
    [clearTimer]
  );

  const toggleProStatus = useCallback(() => {
    const next = adService.togglePro();
    setIsPro(next);
  }, []);

  const openProModal = useCallback(() => {
    setIsProModalOpen(true);
  }, []);

  const closeProModal = useCallback(() => {
    setIsProModalOpen(false);
  }, []);

  return (
    <AdContext.Provider
      value={{
        isAdActive,
        currentAd,
        placement,
        title,
        subtitle,
        countdown,
        isFinished,
        isPro,
        isProModalOpen,
        triggerAdBreak,
        closeAdBreak,
        proceedAction,
        toggleProStatus,
        openProModal,
        closeProModal,
      }}
    >
      {children}
    </AdContext.Provider>
  );
};

export const useAdBreak = (): AdContextType => {
  const context = useContext(AdContext);
  if (!context) {
    throw new Error('useAdBreak must be used within an AdProvider');
  }
  return context;
};
