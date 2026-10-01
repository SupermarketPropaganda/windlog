import { safeStorage } from './auth-service';

export type AdPlacement = 'pdf_export' | 'save_flight' | 'saved_flights_view' | 'weather_refresh';

export interface AdItem {
  id: string;
  isProUpsell: boolean;
  sponsorName: string;
  badge: string;
  title: string;
  tagline: string;
  ctaText: string;
  ctaUrl?: string;
  icon: string;
  themeColor: string;
  accentGradient: string;
  perks?: string[];
}

const STORAGE_PRO_KEY = 'windlog_user_is_pro';
const STORAGE_LAST_AD_KEY = 'windlog_ad_last_shown_time';
const STORAGE_ACTION_COUNT_KEY = 'windlog_ad_action_count';
const STORAGE_TEST_BYPASS_COOLDOWN_KEY = 'windlog_ad_bypass_cooldown';

// Cooldown between interstitial ads (60 seconds for comfortable demo, configurable)
export const AD_COOLDOWN_MS = 60 * 1000;

// Aviation sponsor catalog and Super Duolingo-style WindLog Pro upsell cards
export const AVIATION_ADS_CATALOG: AdItem[] = [
  {
    id: 'windlog_pro_primary',
    isProUpsell: true,
    sponsorName: 'WindLog Flight Deck Pro',
    badge: '👑 SUPER PILOT UPGRADE',
    title: 'Instant 0-Second Downloads Forever',
    tagline:
      'Skip all 5-second countdowns, unlock unlimited cloud hangar slots, offline ICAO navigation data, and 100% ad-free flight planning.',
    ctaText: 'Upgrade to Flight Deck Pro ➔',
    icon: '⚡',
    themeColor: '#f59e0b',
    accentGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.05) 100%)',
    perks: [
      'Instant 0s PDF & Kneeboard exports',
      'Unlimited saved flight hangar slots',
      '100% ad-free cockpit experience',
      'Offline European aeronautical database',
    ],
  },
  {
    id: 'bose_a30',
    isProUpsell: false,
    sponsorName: 'Bose Aviation',
    badge: 'OFFICIAL COCKPIT PARTNER',
    title: 'Bose A30 Aviation Headset',
    tagline:
      'Unmatched active noise cancellation, lightweight contoured ear-cups, and crystal-clear ATC audio for high-altitude cross-country flights.',
    ctaText: 'Discover Bose A30 ↗',
    ctaUrl: 'https://www.bose.com/c/aviation-headsets',
    icon: '🎧',
    themeColor: '#38bdf8',
    accentGradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(2, 132, 199, 0.05) 100%)',
    perks: ['FAA TSO & EASA certified', 'Digital active noise reduction', 'Bluetooth flight deck audio'],
  },
  {
    id: 'garmin_d2_mach1',
    isProUpsell: false,
    sponsorName: 'Garmin Flight Systems',
    badge: 'AVIATOR PRECISION GEAR',
    title: 'Garmin D2™ Mach 1 Pro Aviator',
    tagline:
      'Built for pilots with a bright AMOLED touchscreen, worldwide aeronautical database, HSI needle, barometric altimeter, and direct-to emergency routing.',
    ctaText: 'Explore Aviator Watch ↗',
    ctaUrl: 'https://www.garmin.com/en-US/p/873214',
    icon: '⌚',
    themeColor: '#0ea5e9',
    accentGradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(30, 41, 59, 0.05) 100%)',
    perks: ['Worldwide airport database', 'NEXRAD radar overlay', 'Emergency Direct-To navigation'],
  },
  {
    id: 'windlog_pro_secondary',
    isProUpsell: true,
    sponsorName: 'WindLog Flight Deck Pro',
    badge: '👑 SUPER PILOT UPGRADE',
    title: 'Fly Without Interruptions',
    tagline:
      'Never wait on clearance countdowns. Export high-resolution A4 SOP Form 002 kneeboards in a single instant click with Pro.',
    ctaText: 'Unlock Instant Dispatch ➔',
    icon: '✈️',
    themeColor: '#10b981',
    accentGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(4, 120, 87, 0.05) 100%)',
    perks: ['Zero wait times', 'Priority weather calculations', 'Multi-device cloud logbook sync'],
  },
  {
    id: 'lightspeed_zulu',
    isProUpsell: false,
    sponsorName: 'Lightspeed Aviation',
    badge: 'PILOT COMFORT & ENDURANCE',
    title: 'Lightspeed Zulu 3 Premium ANR',
    tagline:
      'Engineered for long-haul durability with Kevlar-core audio cables, stainless steel headband, and exceptional bass-frequency engine cancellation.',
    ctaText: 'View Lightspeed Zulu ↗',
    ctaUrl: 'https://www.lightspeedaviation.com',
    icon: '🛩️',
    themeColor: '#a855f7',
    accentGradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(126, 34, 206, 0.05) 100%)',
    perks: ['Kevlar core cables', 'Full magnesium earcups', '7-year factory warranty'],
  },
];

class AdService {
  private adRotationIndex = 0;

  /**
   * Checks if current pilot has WindLog Pro subscription.
   * Pro pilots bypass all ads and countdowns completely.
   */
  isPro(): boolean {
    const val = safeStorage.getItem(STORAGE_PRO_KEY);
    return val === 'true';
  }

  /**
   * Toggles or sets Pro status (handy for pilot testing and demo).
   */
  setPro(enabled: boolean): void {
    safeStorage.setItem(STORAGE_PRO_KEY, enabled ? 'true' : 'false');
  }

  togglePro(): boolean {
    const next = !this.isPro();
    this.setPro(next);
    return next;
  }

  /**
   * For easy testing: toggle whether cooldown is ignored
   */
  isCooldownBypassed(): boolean {
    return safeStorage.getItem(STORAGE_TEST_BYPASS_COOLDOWN_KEY) === 'true';
  }

  setCooldownBypassed(bypassed: boolean): void {
    safeStorage.setItem(STORAGE_TEST_BYPASS_COOLDOWN_KEY, bypassed ? 'true' : 'false');
  }

  /**
   * Checks how many seconds remain before next ad can be shown.
   */
  getCooldownRemainingSeconds(): number {
    if (this.isCooldownBypassed()) return 0;
    const lastTimeStr = safeStorage.getItem(STORAGE_LAST_AD_KEY);
    if (!lastTimeStr) return 0;
    const lastTime = parseInt(lastTimeStr, 10);
    if (isNaN(lastTime)) return 0;
    const elapsed = Date.now() - lastTime;
    const remaining = AD_COOLDOWN_MS - elapsed;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /**
   * Determines whether an ad break should be triggered for this action.
   */
  shouldShowAd(_placement: AdPlacement, force: boolean = false): boolean {
    // 1. Pro pilots NEVER see ads
    if (this.isPro()) {
      return false;
    }

    if (force) {
      return true;
    }

    // 2. Initial Grace Period: First action is instant so pilots experience the app
    const actionCountStr = safeStorage.getItem(STORAGE_ACTION_COUNT_KEY);
    const count = actionCountStr ? parseInt(actionCountStr, 10) || 0 : 0;
    safeStorage.setItem(STORAGE_ACTION_COUNT_KEY, (count + 1).toString());

    // Allow 1st action free unless cooldown is bypassed for testing
    if (count === 0 && !this.isCooldownBypassed()) {
      return false;
    }

    // 3. Cooldown check: Prevent spamming ads within COOLDOWN_MS
    if (this.getCooldownRemainingSeconds() > 0) {
      return false;
    }

    return true;
  }

  /**
   * Records that an ad was presented, updating the cooldown timestamp.
   */
  recordAdShown(_placement?: AdPlacement): void {
    safeStorage.setItem(STORAGE_LAST_AD_KEY, Date.now().toString());
  }

  /**
   * Selects an ad item rotating between commercial aviation partners and WindLog Pro upsell.
   */
  getNextAd(preferProUpsell?: boolean): AdItem {
    if (preferProUpsell) {
      const proAd = AVIATION_ADS_CATALOG.find((a) => a.isProUpsell);
      if (proAd) return proAd;
    }

    const ad = AVIATION_ADS_CATALOG[this.adRotationIndex % AVIATION_ADS_CATALOG.length];
    this.adRotationIndex++;
    return ad;
  }

  /**
   * Reset ad counters (useful for unit tests and debug).
   */
  resetAdState(): void {
    safeStorage.removeItem(STORAGE_LAST_AD_KEY);
    safeStorage.removeItem(STORAGE_ACTION_COUNT_KEY);
    this.adRotationIndex = 0;
  }
}

export const adService = new AdService();
