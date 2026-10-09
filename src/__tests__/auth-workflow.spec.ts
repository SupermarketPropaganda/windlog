import { describe, it, expect, beforeEach } from 'vitest';
import { authService, safeStorage } from '../services/auth-service';
import {
  saveFlightRecord,
  getSavedFlightsSync,
} from '../data/saved-flights';
import { getStorageItemSync, removeStorageItem } from '../data/storage-manager';

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

describe('Pilot Authentication and Flight Deck Session Workflow', () => {
  beforeEach(async () => {
    // Clear auth and session storage keys
    safeStorage.clear();
    localStorage.clear();
    await removeStorageItem('windlog_auth_users');
    await removeStorageItem('windlog_auth_session');
    await removeStorageItem('windlog_saved_flights');
    await removeStorageItem('windlog_home_base');
    await removeStorageItem('windlog_profile');
    await removeStorageItem('windlog_auto_home_base');
    await authService.init();
  });

  describe('1. Pilot Registration', () => {
    it('successfully registers a new pilot account with profile details', async () => {
      const user = await authService.signUp({
        email: 'captain.miller@cockpit.org',
        password: 'AviationSafe123!',
        displayName: 'Capt. Miller',
        pilotLicense: 'PT-CPL-98214',
        homeBaseAirport: 'LPCS',
        preferences: {
          defaultAircraftModel: 'c172',
          defaultCruiseAltitude: 6500,
          defaultTas: 115,
          defaultFuelFlow: 8.5,
          defaultFuelUnit: 'gph',
          reserveFuelMinutes: 45,
          homeBaseAirport: 'LPCS',
          autoFillHomeBase: true,
        },
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('captain.miller@cockpit.org');
      expect(user.displayName).toBe('Capt. Miller');
      expect(user.isAnonymous).toBe(false);
      expect(user.pilotLicense).toBe('PT-CPL-98214');
      expect(user.homeBaseAirport).toBe('LPCS');
      expect(user.preferences?.defaultCruiseAltitude).toBe(6500);

      // Verify currentUser is updated
      const current = authService.getCurrentUser();
      expect(current?.id).toBe(user.id);
      expect(current?.email).toBe('captain.miller@cockpit.org');
    });

    it('rejects registration with invalid email or weak password', async () => {
      await expect(
        authService.signUp({
          email: 'invalid-email-format',
          password: 'validpassword123',
        })
      ).rejects.toThrow(/valid email/i);

      await expect(
        authService.signUp({
          email: 'pilot@example.com',
          password: '123', // less than 6 chars
        })
      ).rejects.toThrow(/at least 6 characters/i);
    });

    it('prevents duplicate registration with the same email (case-insensitive)', async () => {
      await authService.signUp({
        email: 'skyking@flightdeck.org',
        password: 'password123',
        displayName: 'Sky King',
      });

      // Attempt duplicate with different casing
      await expect(
        authService.signUp({
          email: 'SKYKING@FLIGHTDECK.ORG',
          password: 'anotherpassword',
          displayName: 'Duplicate King',
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('2. Pilot Sign In and Authentication', () => {
    beforeEach(async () => {
      await authService.signUp({
        email: 'flightdeck@cockpitops.pt',
        password: 'FlightPassword99',
        displayName: 'Capt. Skyline',
        pilotLicense: 'PT-PPL-1002',
        homeBaseAirport: 'LPPT',
        preferences: {
          defaultAircraftModel: 'pa28',
          defaultCruiseAltitude: 4500,
          defaultTas: 110,
          defaultFuelFlow: 9.0,
          defaultFuelUnit: 'gph',
          reserveFuelMinutes: 30,
          homeBaseAirport: 'LPPT',
          autoFillHomeBase: true,
        },
      });
      // Sign out to test sign in
      await authService.signOut();
    });

    it('signs in successfully with valid credentials and updates lastLoginAt', async () => {
      const user = await authService.signIn({
        email: 'flightdeck@cockpitops.pt',
        password: 'FlightPassword99',
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('flightdeck@cockpitops.pt');
      expect(user.isAnonymous).toBe(false);
      expect(user.lastLoginAt).toBeDefined();

      const current = authService.getCurrentUser();
      expect(current?.id).toBe(user.id);
    });

    it('restores stored cockpit flight defaults into storage on sign in', async () => {
      await authService.signIn({
        email: 'flightdeck@cockpitops.pt',
        password: 'FlightPassword99',
      });

      // Verify storage was populated with pilot defaults
      expect(getStorageItemSync('windlog_home_base', '')).toBe('LPPT');
      expect(getStorageItemSync('windlog_auto_home_base', false)).toBe(true);

      const profileStored = getStorageItemSync<any>('windlog_profile', {});
      expect(profileStored.aircraftModel).toBe('pa28');
      expect(profileStored.cruiseAltitude).toBe(4500);
      expect(profileStored.tas).toBe(110);
      expect(profileStored.fuelFlow).toBe(9.0);
    });

    it('rejects sign in with incorrect password', async () => {
      await expect(
        authService.signIn({
          email: 'flightdeck@cockpitops.pt',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(/invalid email or password/i);
    });

    it('rejects sign in for an unknown email', async () => {
      await expect(
        authService.signIn({
          email: 'unknown.pilot@nowhere.com',
          password: 'Password123',
        })
      ).rejects.toThrow(/invalid email or password/i);
    });
  });

  describe('3. Guest Flights Migration', () => {
    it('migrates flight plans created as guest into pilot account upon login/register', async () => {
      // 1. Pilot operates as guest and saves two flights
      await saveFlightRecord({
        name: 'VFR Cascais to Coimbra',
        routeInput: 'LPCS SRA LPCO',
        departureTime: '10:00',
        profile: {
          aircraftModel: 'c172',
          cruiseAltitude: 4500,
          tas: 110,
          fuelFlow: 8.5,
          fuelUnit: 'gph',
        },
        legAltitudeOverrides: {},
        userId: 'guest',
      });

      await saveFlightRecord({
        name: 'Local Training Faro',
        routeInput: 'LPFR ALBUFEIRA LPFR',
        departureTime: '14:30',
        profile: {
          aircraftModel: 'pa28',
          cruiseAltitude: 3500,
          tas: 105,
          fuelFlow: 9.0,
          fuelUnit: 'gph',
        },
        legAltitudeOverrides: {},
      });

      // Verify flights exist as guest
      let allFlights = getSavedFlightsSync();
      expect(allFlights.length).toBe(2);
      expect(allFlights.every((f) => !f.userId || f.userId === 'guest')).toBe(true);

      // 2. Register new pilot
      const pilot = await authService.signUp({
        email: 'migrated.pilot@skypath.org',
        password: 'PilotPassword123',
        displayName: 'Migrated Pilot',
      });

      // 3. Verify flights are now attributed to pilot.id
      allFlights = getSavedFlightsSync();
      expect(allFlights.length).toBe(2);
      expect(allFlights.every((f) => f.userId === pilot.id)).toBe(true);
    });
  });

  describe('4. Password Change and Recovery', () => {
    let pilotId: string;

    beforeEach(async () => {
      const pilot = await authService.signUp({
        email: 'safety.officer@aeroclube.org',
        password: 'InitialPassword1',
        displayName: 'Safety Officer',
      });
      pilotId = pilot.id;
    });

    it('allows authenticated pilot to change their password with current password confirmation', async () => {
      await authService.changePassword('InitialPassword1', 'UpdatedSecurePassword2');

      // Sign out and try old password
      await authService.signOut();
      await expect(
        authService.signIn({
          email: 'safety.officer@aeroclube.org',
          password: 'InitialPassword1',
        })
      ).rejects.toThrow();

      // Sign in with new password succeeds
      const loggedIn = await authService.signIn({
        email: 'safety.officer@aeroclube.org',
        password: 'UpdatedSecurePassword2',
      });
      expect(loggedIn.id).toBe(pilotId);
    });

    it('rejects password change if current password is wrong', async () => {
      await expect(
        authService.changePassword('WrongOldPassword', 'SomeNewPassword1')
      ).rejects.toThrow(/incorrect/i);
    });

    it('does not allow password replacement without proof of account ownership', async () => {
      await authService.signOut();
      await expect(authService.resetPasswordWithNew('safety.officer@aeroclube.org', 'StolenPassword123'))
        .rejects.toThrow(/connected account provider/i);
      const loggedIn = await authService.signIn('safety.officer@aeroclube.org', 'InitialPassword1');
      expect(loggedIn.id).toBe(pilotId);
    });
  });

  describe('5. Sign Out and Session Termination', () => {
    it('signs out pilot and reverts to anonymous guest state cleanly', async () => {
      await authService.signUp({
        email: 'navigator@flightdeck.org',
        password: 'NavPassword123',
      });

      expect(authService.getCurrentUser()?.isAnonymous).toBe(false);
      expect(authService.isAuthenticated()).toBe(true);

      await authService.signOut();

      expect(authService.getCurrentUser()).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);

      // Re-initialize guest mode
      const guest = await authService.signInAsGuest();
      expect(guest.isAnonymous).toBe(true);
      expect(authService.getCurrentUser()?.isAnonymous).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
    });
  });

  describe('6. Federated OAuth Authentication (Google Single Sign-On)', () => {
    it('automatically registers a new pilot upon first OAuth sign-in', async () => {
      const user = await authService.signInWithOAuthUser({
        email: 'pilot.google@gmail.com',
        displayName: 'Google Aviator',
        provider: 'Google',
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('pilot.google@gmail.com');
      expect(user.displayName).toBe('Google Aviator');
      expect(user.isAnonymous).toBe(false);
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getCurrentUser()?.id).toBe(user.id);
    });

    it('authenticates and re-identifies an existing pilot upon subsequent OAuth sign-in', async () => {
      // First sign-in
      const firstLogin = await authService.signInWithOAuthUser({
        email: 'returning.pilot@gmail.com',
        displayName: 'Returning Pilot',
        provider: 'Google',
      });

      await authService.signOut();
      expect(authService.isAuthenticated()).toBe(false);

      // Second sign-in with same email
      const secondLogin = await authService.signInWithOAuthUser({
        email: 'returning.pilot@gmail.com',
        displayName: 'Returning Pilot Updated',
        provider: 'Google',
      });

      expect(secondLogin.id).toBe(firstLogin.id);
      expect(secondLogin.email).toBe('returning.pilot@gmail.com');
      expect(authService.isAuthenticated()).toBe(true);
    });
  });

  describe('7. Email delivery configuration', () => {
    it('does not grant access using a code generated in the same browser', async () => {
      await expect(authService.requestMagicCode('pilot@example.com')).rejects.toThrow(/connected account provider/i);
      await expect(authService.signInWithMagicCode('pilot@example.com', '123-456')).rejects.toThrow(/connected account provider/i);
      expect(authService.isAuthenticated()).toBe(false);
    });
  });
});
