import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fetchOpenMeteoWinds, fetchWindsAloft } from '../data/winds-aloft';
import {
  LocalAuthProviderAdapter,
  authService,
  safeStorage,
} from '../services/auth-service';
import { Wind } from '../types';

describe('QA Stress Test & Security Audit Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    safeStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Flight Departure Time Weather Fetching with Edge-Case Timestamps
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Weather Forecast Edge-Case Timestamps', () => {
    // Generate 14-day synthetic hourly dataset
    const baseDate = new Date('2026-09-24T00:00:00.000Z');
    const mockHourlyTimes: string[] = [];
    const mockSpeeds850: number[] = [];
    const mockDirs850: number[] = [];

    // 14 days * 24 hours = 336 hours
    for (let i = 0; i < 336; i++) {
      const d = new Date(baseDate.getTime() + i * 3600 * 1000);
      const iso = d.toISOString().substring(0, 16);
      mockHourlyTimes.push(iso);
      mockSpeeds850.push(20 + (i % 30)); // 20 - 49 km/h
      mockDirs850.push((180 + i * 2) % 360);
    }

    const mockResponse = {
      hourly: {
        time: mockHourlyTimes,
        wind_speed_950hPa: mockSpeeds850,
        wind_direction_950hPa: mockDirs850,
        wind_speed_900hPa: mockSpeeds850,
        wind_direction_900hPa: mockDirs850,
        wind_speed_850hPa: mockSpeeds850,
        wind_direction_850hPa: mockDirs850,
        wind_speed_700hPa: mockSpeeds850,
        wind_direction_700hPa: mockDirs850,
        wind_speed_500hPa: mockSpeeds850,
        wind_direction_500hPa: mockDirs850,
        wind_speed_400hPa: mockSpeeds850,
        wind_direction_400hPa: mockDirs850,
        wind_speed_300hPa: mockSpeeds850,
        wind_direction_300hPa: mockDirs850,
      },
    };

    const setupMockFetch = () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('api.open-meteo.com')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockResponse,
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
        });
      });
    };

    it('handles Leap Day (Feb 29) timestamps safely without NaN or crash', async () => {
      setupMockFetch();

      const leapDates = [
        '2028-02-29T12:00:00.000Z', // Valid future leap day
        '2024-02-29T23:59:59.000Z', // Past leap day
        '2028-02-29T00:00:00.000Z', // Leap day midnight
        new Date('2028-02-29T15:30:00.000Z'), // Date object
      ];

      for (const target of leapDates) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, target);
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
        expect(wind?.speed).toBeGreaterThanOrEqual(0);
        expect(wind?.direction).toBeGreaterThanOrEqual(0);
        expect(wind?.direction).toBeLessThanOrEqual(360);
      }
    });

    it('handles Year Rollovers cleanly (Dec 31 -> Jan 1)', async () => {
      setupMockFetch();

      const rolloverDates = [
        '2026-12-31T23:59:59.000Z',
        '2027-01-01T00:00:00.000Z',
        '1999-12-31T23:59:59.000Z', // Y2K
        '2000-01-01T00:00:00.000Z',
        '2038-01-19T03:14:07.000Z', // Y2038 32-bit boundary
      ];

      for (const target of rolloverDates) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, target);
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
      }
    });

    it('handles Daylight Saving Time (DST) spring-forward and fall-back shifts', async () => {
      setupMockFetch();

      const dstDates = [
        // European DST spring transition (March 29, 2026)
        '2026-03-29T01:00:00.000Z',
        '2026-03-29T02:00:00.000Z',
        '2026-03-29T03:00:00.000Z',
        // European DST autumn transition (October 25, 2026)
        '2026-10-25T01:00:00.000Z',
        '2026-10-25T02:00:00.000Z',
        '2026-10-25T03:00:00.000Z',
        // US DST transitions (March 8 & November 1, 2026)
        '2026-03-08T07:00:00.000Z',
        '2026-11-01T06:00:00.000Z',
      ];

      for (const target of dstDates) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, target);
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
      }
    });

    it('handles negative Unix epoch timestamps gracefully without underflow', async () => {
      setupMockFetch();

      const negativeEpochDates = [
        new Date(-1000), // 1969-12-31 23:59:59
        new Date(-86400000), // 1969-12-30
        new Date(-1000000000000), // 1938
        '1969-12-31T23:00:00.000Z',
      ];

      for (const target of negativeEpochDates) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, target);
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
        // Clamps to earliest available forecast entry
        expect(wind?.speed).toBe(Math.round(mockSpeeds850[0] / 1.852));
      }
    });

    it('clamps gracefully for departure dates beyond 14 days', async () => {
      setupMockFetch();

      const farFutureDates = [
        '2026-10-15T12:00:00.000Z', // ~21 days out
        '2026-11-01T00:00:00.000Z', // ~38 days out
        '2027-09-24T12:00:00.000Z', // 1 year out
        '2036-09-24T12:00:00.000Z', // 10 years out
      ];

      for (const target of farFutureDates) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, target);
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
        // Clamps to latest available forecast entry (last element)
        const lastIdx = mockSpeeds850.length - 1;
        expect(wind?.speed).toBe(Math.round(mockSpeeds850[lastIdx] / 1.852));
      }
    });

    it('falls back safely to current time on malformed date strings, XSS, and injection attempts', async () => {
      setupMockFetch();

      const hostileDateInputs = [
        'invalid-date-string',
        '2026-13-45T99:99:99',
        '',
        'NaN',
        'undefined',
        'null',
        'null-string',
        "'; DROP TABLE flight_plans; --",
        '<script>alert("XSS")</script>',
        'A'.repeat(10000), // Buffer overflow / ReDoS payload
      ];

      for (const hostile of hostileDateInputs) {
        const wind = await fetchOpenMeteoWinds(38.7, -9.1, 5000, hostile);
        // Must never throw and must return valid finite wind
        expect(wind).not.toBeNull();
        expect(Number.isFinite(wind?.speed)).toBe(true);
        expect(Number.isFinite(wind?.direction)).toBe(true);
      }
    });

    it('correctly reconciles timezone shifts (UTC vs local / non-zero offsets)', async () => {
      setupMockFetch();

      // UTC 2026-09-24T14:00 is index 14
      // +04:00 2026-09-24T18:00 is the EXACT SAME instant in time
      const dateUtcStr = '2026-09-24T14:00:00.000Z';
      const dateOffsetStr = '2026-09-24T18:00:00+04:00';
      const dateFarWestStr = '2026-09-24T02:00:00-12:00'; // 14:00 UTC

      const windUtc = await fetchOpenMeteoWinds(38.7, -9.1, 5000, dateUtcStr);
      const windOffset = await fetchOpenMeteoWinds(38.7, -9.1, 5000, dateOffsetStr);
      const windFarWest = await fetchOpenMeteoWinds(38.7, -9.1, 5000, dateFarWestStr);

      expect(windUtc).not.toBeNull();
      expect(windOffset).not.toBeNull();
      expect(windFarWest).not.toBeNull();

      // All represent 14:00 UTC, so they must return the exact same wind values
      expect(windOffset?.speed).toBe(windUtc?.speed);
      expect(windOffset?.direction).toBe(windUtc?.direction);
      expect(windFarWest?.speed).toBe(windUtc?.speed);
      expect(windFarWest?.direction).toBe(windUtc?.direction);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Rapid Date-Time Switching & Cache Isolation Stress Test
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Rapid Date-Time Switching & Cache Isolation', () => {
    it('isolates cache per scheduled hour and invalidates properly without cross-contamination', async () => {
      let networkCallCount = 0;
      const hourlyResponses = new Map<string, { speed: number; direction: number }>();

      // Generate distinct mock wind data for 50 distinct scheduled hours
      const baseDate = new Date('2026-09-25T00:00:00.000Z');
      const testHours: string[] = [];

      for (let i = 0; i < 50; i++) {
        const d = new Date(baseDate.getTime() + i * 3600 * 1000);
        const iso = d.toISOString();
        testHours.push(iso);
        hourlyResponses.set(iso.substring(0, 13), {
          speed: 10 + (i % 25), // 10 - 34 kt
          direction: (180 + i * 7) % 360,
        });
      }

      global.fetch = vi.fn().mockImplementation((_url: string) => {
        networkCallCount++;
        // Generate response matching requested hours
        const times: string[] = [];
        const speeds: number[] = [];
        const dirs: number[] = [];

        for (const [hourPrefix, data] of hourlyResponses.entries()) {
          times.push(`${hourPrefix}:00`);
          speeds.push(Math.round(data.speed * 1.852)); // km/h
          dirs.push(data.direction);
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({
            hourly: {
              time: times,
              wind_speed_850hPa: speeds,
              wind_direction_850hPa: dirs,
            },
          }),
        });
      });

      // Implement simulated cache matching App.tsx architecture
      const windCache = new Map<string, Wind | null>();
      const getCachedWind = async (lat: number, lon: number, alt: number, timeStr: string | null) => {
        const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}_${alt}_${timeStr || 'live'}`;
        if (windCache.has(cacheKey)) {
          return windCache.get(cacheKey) || null;
        }
        const wind = await fetchWindsAloft(lat, lon, alt, timeStr);
        windCache.set(cacheKey, wind);
        return wind;
      };

      const startTime = performance.now();

      // Step A: Prime "Live / Now" weather
      const liveWind1 = await getCachedWind(38.7, -9.1, 5000, null);
      expect(liveWind1).not.toBeNull();
      const initialCalls = networkCallCount;
      expect(initialCalls).toBeGreaterThan(0);

      // Step B: Rapidly alternate between 50 different scheduled hours and Live
      for (let i = 0; i < testHours.length; i++) {
        const scheduledTime = testHours[i];

        // Fetch scheduled hour
        const scheduledWind = await getCachedWind(38.7, -9.1, 5000, scheduledTime);
        expect(scheduledWind).not.toBeNull();

        // Verify correct distinct values for this hour
        const expected = hourlyResponses.get(scheduledTime.substring(0, 13))!;
        expect(scheduledWind?.direction).toBe(expected.direction);
        expect(scheduledWind?.speed).toBe(expected.speed);

        // Fetch Live again: must hit cache and return original live wind, untouched
        const liveWindAgain = await getCachedWind(38.7, -9.1, 5000, null);
        expect(liveWindAgain).toEqual(liveWind1);
      }

      // Step C: Switch back through all 50 hours again - MUST 100% HIT CACHE (0 network calls)
      const networkCallsBeforeReplay = networkCallCount;
      for (let i = 0; i < testHours.length; i++) {
        const scheduledWindReplay = await getCachedWind(38.7, -9.1, 5000, testHours[i]);
        const expected = hourlyResponses.get(testHours[i].substring(0, 13))!;
        expect(scheduledWindReplay?.direction).toBe(expected.direction);
        expect(scheduledWindReplay?.speed).toBe(expected.speed);
      }

      const replayCalls = networkCallCount - networkCallsBeforeReplay;
      expect(replayCalls).toBe(0); // 100% cache hit rate!

      const durationMs = performance.now() - startTime;
      console.log(`\n[PERF BENCHMARK] Rapid 50-hour date switching: 151 total lookups in ${durationMs.toFixed(2)}ms`);
      console.log(`[PERF BENCHMARK] Replay cache hit rate: 100% (0 network calls on 50 cached replays)`);

      expect(durationMs).toBeLessThan(2000); // Must be lightning fast
    });

    it('handles concurrent bursts of 50 simultaneous scheduled hour queries cleanly', async () => {
      const baseDate = new Date('2026-09-27T00:00:00.000Z');
      const burstHours: string[] = [];
      const times: string[] = [];
      const speeds: number[] = [];
      const dirs: number[] = [];

      for (let i = 0; i < 50; i++) {
        const d = new Date(baseDate.getTime() + i * 3600 * 1000);
        burstHours.push(d.toISOString());
        times.push(d.toISOString().substring(0, 16));
        speeds.push(25);
        dirs.push(270);
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          hourly: {
            time: times,
            wind_speed_850hPa: speeds,
            wind_direction_850hPa: dirs,
          },
        }),
      });

      const burstStartTime = performance.now();
      const results = await Promise.all(
        burstHours.map((hour) => fetchWindsAloft(38.7, -9.1, 5000, hour))
      );
      const burstDurationMs = performance.now() - burstStartTime;

      expect(results).toHaveLength(50);
      results.forEach((w) => {
        expect(w).not.toBeNull();
        expect(w?.direction).toBe(270);
      });

      console.log(`[PERF BENCHMARK] Concurrent burst: 50 simultaneous scheduled queries in ${burstDurationMs.toFixed(2)}ms`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Security Audit & Public Safety Verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Security & Public Safety Audit', () => {
    it('scans all src/ code to verify 0 hardcoded personal credentials or references to "diogo"', () => {
      const srcDir = path.resolve(__dirname, '..');
      const filesToScan: string[] = [];

      function walkDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Skip node_modules or dist if nested
            if (entry.name !== 'node_modules' && entry.name !== 'dist') {
              walkDir(fullPath);
            }
          } else if (
            entry.name.endsWith('.ts') ||
            entry.name.endsWith('.tsx') ||
            entry.name.endsWith('.js') ||
            entry.name.endsWith('.css')
          ) {
            // Exclude this test file itself from self-scanning
            if (!entry.name.includes('weather-security-stress')) {
              filesToScan.push(fullPath);
            }
          }
        }
      }

      walkDir(srcDir);
      expect(filesToScan.length).toBeGreaterThan(20);

      const forbiddenTerms = [
        'diogo',
        'pilot_diogo_master',
        'DEFAULT_PILOT_RECORD',
        'diogo@windlog.aero',
      ];

      const violations: { file: string; term: string; line: number; text: string }[] = [];

      for (const file of filesToScan) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          for (const term of forbiddenTerms) {
            // Case-insensitive check
            if (lineText.toLowerCase().includes(term.toLowerCase())) {
              violations.push({
                file: path.relative(srcDir, file),
                term,
                line: i + 1,
                text: lineText.trim(),
              });
            }
          }
        }
      }

      if (violations.length > 0) {
        console.error('Security audit found forbidden terms:', violations);
      }
      expect(violations).toHaveLength(0);
    });

    it('verifies that unauthenticated visitors have blank inputs and zero prefilled credentials', () => {
      const authPagePath = path.resolve(__dirname, '../components/AuthPage.tsx');
      const authPageCode = fs.readFileSync(authPagePath, 'utf-8');

      // Check useState initialization for credentials
      expect(authPageCode).toMatch(/const\s+\[signInEmail,\s*setSignInEmail\]\s*=\s*useState\(''\)/);
      expect(authPageCode).toMatch(/const\s+\[signInPassword,\s*setSignInPassword\]\s*=\s*useState\(''\)/);
      expect(authPageCode).toMatch(/const\s+\[signUpEmail,\s*setSignUpEmail\]\s*=\s*useState\(''\)/);
      expect(authPageCode).toMatch(/const\s+\[signUpPassword,\s*setSignUpPassword\]\s*=\s*useState\(''\)/);
      expect(authPageCode).toMatch(/const\s+\[forgotEmail,\s*setForgotEmail\]\s*=\s*useState\(''\)/);

      // Verify no default accounts are automatically populated in safeStorage on startup
      safeStorage.clear();
      const adapter = new LocalAuthProviderAdapter();
      expect(adapter).toBeDefined();
      // Inspect storage directly: must be empty
      expect(safeStorage.getItem('windlog_auth_users')).toBeNull();
    });

    it('verifies password reset prevents account/user enumeration attacks', async () => {
      const adapter = new LocalAuthProviderAdapter();

      // Register a pilot
      await adapter.signUp({
        email: 'registered.pilot@cockpit.aero',
        password: 'ValidPassword123!',
      });

      // Request 1: Existing registered user
      const existingUserResult = await adapter.resetPassword('registered.pilot@cockpit.aero');

      // Request 2: Non-existent unregistered user
      const nonExistentUserResult = await adapter.resetPassword('unknown.attacker@nowhere.com');

      // Request 3: Malformed email
      const malformedResult = await adapter.resetPassword('random-text-probe');

      // Both must succeed and return the EXACT same response message to prevent email enumeration
      expect(existingUserResult.success).toBe(true);
      expect(nonExistentUserResult.success).toBe(true);
      expect(malformedResult.success).toBe(true);

      expect(existingUserResult.message).toBe(nonExistentUserResult.message);
      expect(existingUserResult.message).toBe(malformedResult.message);
      expect(existingUserResult.message).toContain('If an account exists with this email');
      expect(existingUserResult.message).not.toContain('registered.pilot@cockpit.aero'); // Never leak email in response
    });

    it('verifies guest pilot sessions (signInAsGuest()) generate secure cryptographically isolated IDs', async () => {
      const NUM_GUEST_SESSIONS = 500;
      const guestIds = new Set<string>();
      const sessionTokens = new Set<string>();
      const guestEmails = new Set<string>();

      const startBench = performance.now();

      for (let i = 0; i < NUM_GUEST_SESSIONS; i++) {
        const guestUser = await authService.signInAsGuest();
        const session = authService.getCurrentSession();

        expect(guestUser.id).toBeDefined();
        expect(guestUser.id.startsWith('guest_')).toBe(true);
        expect(session.token).toBeDefined();
        expect(session.isAuthenticated).toBe(true);

        // Verify ID structure has timestamp and high-entropy hex
        // guest_<timestamp>_<16+ hex chars>
        const parts = guestUser.id.split('_');
        expect(parts.length).toBeGreaterThanOrEqual(3);
        const entropyPart = parts[2];
        expect(entropyPart.length).toBeGreaterThanOrEqual(16);

        // Verify collision resistance
        guestIds.add(guestUser.id);
        sessionTokens.add(session.token!);
        guestEmails.add(guestUser.email);
      }

      const benchDuration = performance.now() - startBench;
      const opsPerSec = (NUM_GUEST_SESSIONS / (benchDuration / 1000)).toFixed(0);

      console.log(`\n[PERF BENCHMARK] Generated ${NUM_GUEST_SESSIONS} secure guest sessions in ${benchDuration.toFixed(2)}ms (${opsPerSec} ops/sec)`);
      console.log(`[SECURITY AUDIT] Unique Guest IDs: ${guestIds.size} / ${NUM_GUEST_SESSIONS}`);
      console.log(`[SECURITY AUDIT] Unique Session Tokens: ${sessionTokens.size} / ${NUM_GUEST_SESSIONS}`);
      console.log(`[SECURITY AUDIT] Unique Scoped Emails: ${guestEmails.size} / ${NUM_GUEST_SESSIONS}`);

      // Cryptographic isolation: 0 collisions across 500 generated sessions
      expect(guestIds.size).toBe(NUM_GUEST_SESSIONS);
      expect(sessionTokens.size).toBe(NUM_GUEST_SESSIONS);
      expect(guestEmails.size).toBe(NUM_GUEST_SESSIONS);
    });

    it('verifies guest pilots cannot modify or access other pilot accounts', async () => {
      const adapter = new LocalAuthProviderAdapter();

      // Register real pilot
      const pilotA = await adapter.signUp({
        email: 'alpha.captain@sky.aero',
        password: 'AlphaSecretPassword123',
        displayName: 'Captain Alpha',
      });

      // Sign in as guest
      const guestUser = await authService.signInAsGuest();
      expect(guestUser.id).not.toBe(pilotA.id);

      // Attempt profile update as guest: only modifies guest profile
      const updatedGuest = await authService.updateProfile({
        displayName: 'Guest Pilot Altered',
      });
      expect(updatedGuest.displayName).toBe('Guest Pilot Altered');

      // Verify pilotA was not mutated in database
      const reAuthPilotA = await adapter.signIn('alpha.captain@sky.aero', 'AlphaSecretPassword123');
      expect(reAuthPilotA.displayName).toBe('Captain Alpha');
    });
  });
});
