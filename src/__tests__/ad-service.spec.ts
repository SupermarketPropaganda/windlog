import { describe, it, expect, beforeEach } from 'vitest';
import { adService, AVIATION_ADS_CATALOG, AD_COOLDOWN_MS } from '../services/ad-service';
import { safeStorage } from '../services/auth-service';

// Provide standard localStorage shim if environment is Node without window.localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const memoryStore = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, String(value));
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
    clear: () => {
      memoryStore.clear();
    },
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    length: 0,
  } as Storage;
}

describe('Duolingo-Style Ad Service and Flight Deck Pro Subsystem', () => {
  beforeEach(() => {
    safeStorage.clear();
    localStorage.clear();
    adService.resetAdState();
    adService.setPro(false);
  });

  describe('1. Pro Pilot Immunity & Bypass', () => {
    it('always bypasses all ads when pilot is Pro', () => {
      adService.setPro(true);
      expect(adService.isPro()).toBe(true);

      // Should return false for both PDF export and Save flight
      expect(adService.shouldShowAd('pdf_export')).toBe(false);
      expect(adService.shouldShowAd('save_flight')).toBe(false);
    });

    it('toggles Pro status cleanly between true and false', () => {
      expect(adService.isPro()).toBe(false);
      const active = adService.togglePro();
      expect(active).toBe(true);
      expect(adService.isPro()).toBe(true);

      const inactive = adService.togglePro();
      expect(inactive).toBe(false);
      expect(adService.isPro()).toBe(false);
    });
  });

  describe('2. Initial Grace Period & Cooldown Capping', () => {
    it('allows initial first action grace period before ads appear', () => {
      // First action is free
      const firstAction = adService.shouldShowAd('save_flight');
      expect(firstAction).toBe(false);

      // Second action triggers ad
      const secondAction = adService.shouldShowAd('save_flight');
      expect(secondAction).toBe(true);
    });

    it('enforces cooldown after an ad is recorded', () => {
      // Force an ad to show and record it
      expect(adService.shouldShowAd('pdf_export', true)).toBe(true);
      adService.recordAdShown('pdf_export');

      // Next immediate action within cooldown period must be suppressed
      expect(adService.shouldShowAd('pdf_export')).toBe(false);
      expect(adService.shouldShowAd('save_flight')).toBe(false);

      // Verify cooldown remaining seconds is positive
      const remainingSecs = adService.getCooldownRemainingSeconds();
      expect(remainingSecs).toBeGreaterThan(0);
      expect(remainingSecs).toBeLessThanOrEqual(AD_COOLDOWN_MS / 1000);
    });

    it('allows bypass of cooldown when force flag or test toggle is active', () => {
      adService.recordAdShown('pdf_export');
      expect(adService.shouldShowAd('pdf_export')).toBe(false);

      // Force flag overrides cooldown
      expect(adService.shouldShowAd('pdf_export', true)).toBe(true);

      // Test bypass toggle overrides cooldown
      adService.setCooldownBypassed(true);
      expect(adService.isCooldownBypassed()).toBe(true);
      expect(adService.getCooldownRemainingSeconds()).toBe(0);
      expect(adService.shouldShowAd('pdf_export')).toBe(true);
    });
  });

  describe('3. Aviation Sponsor & WindLog Pro Catalog', () => {
    it('contains valid high-quality aviation sponsors and Pro upsell cards', () => {
      expect(AVIATION_ADS_CATALOG.length).toBeGreaterThanOrEqual(4);

      for (const ad of AVIATION_ADS_CATALOG) {
        expect(ad.id).toBeDefined();
        expect(ad.sponsorName).toBeDefined();
        expect(ad.badge).toBeDefined();
        expect(ad.title).toBeDefined();
        expect(ad.tagline).toBeDefined();
        expect(ad.ctaText).toBeDefined();
        expect(ad.icon).toBeDefined();
        expect(ad.themeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('rotates through ads sequentially and provides Pro upsell when requested', () => {
      const ad1 = adService.getNextAd();
      const ad2 = adService.getNextAd();
      expect(ad1.id).not.toBe(ad2.id);

      const proAd = adService.getNextAd(true);
      expect(proAd.isProUpsell).toBe(true);
      expect(proAd.sponsorName).toContain('WindLog');
    });
  });
});
