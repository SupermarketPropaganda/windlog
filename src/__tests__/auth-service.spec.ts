import { describe, it, expect, beforeEach } from 'vitest';
import {
  LocalAuthProviderAdapter,
  generateSalt,
  hashPassword,
  authService,
  safeStorage,
} from '../services/auth-service';

describe('Backstage Authentication Service & Provider', () => {
  beforeEach(() => {
    safeStorage.clear();
  });

  it('generates cryptographic random salts', () => {
    const salt1 = generateSalt(16);
    const salt2 = generateSalt(16);
    expect(salt1).not.toBe(salt2);
    expect(salt1.length).toBeGreaterThanOrEqual(16);
  });

  it('hashes passwords uniquely using salts', async () => {
    const password = 'SuperSecretFlightPassword123!';
    const saltA = 'salt_alpha_123';
    const saltB = 'salt_beta_456';

    const hashA = await hashPassword(password, saltA);
    const hashB = await hashPassword(password, saltB);
    const hashA2 = await hashPassword(password, saltA);

    expect(hashA).toBe(hashA2);
    expect(hashA).not.toBe(hashB);
  });

  it('registers a new pilot user successfully', async () => {
    const adapter = new LocalAuthProviderAdapter();
    const user = await adapter.signUp({
      email: 'maverick@topgun.aero',
      password: 'F14TomcatPassword',
      displayName: 'Pete Mitchell',
      pilotLicense: 'CPL-IR',
      homeBaseAirport: 'KNSI',
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('maverick@topgun.aero');
    expect(user.displayName).toBe('Pete Mitchell');
    expect(user.pilotLicense).toBe('CPL-IR');
    expect(user.homeBaseAirport).toBe('KNSI');
    expect(user.emailVerified).toBe(true);
  });

  it('enforces unique email constraint', async () => {
    const adapter = new LocalAuthProviderAdapter();
    await adapter.signUp({
      email: 'goose@topgun.aero',
      password: 'RIOSecretPassword',
    });

    await expect(
      adapter.signUp({
        email: 'GOOSE@topgun.aero', // Case-insensitive test
        password: 'AnotherPassword',
      })
    ).rejects.toThrow(/already exists/i);
  });

  it('authenticates valid credentials and rejects incorrect password', async () => {
    const adapter = new LocalAuthProviderAdapter();
    await adapter.signUp({
      email: 'rooster@topgun.aero',
      password: 'CorrectHorseBattery123',
    });

    // Valid sign in
    const authenticatedUser = await adapter.signIn('rooster@topgun.aero', 'CorrectHorseBattery123');
    expect(authenticatedUser.email).toBe('rooster@topgun.aero');

    // Invalid password
    await expect(
      adapter.signIn('rooster@topgun.aero', 'WrongPassword123')
    ).rejects.toThrow(/invalid email or password/i);

    // Unregistered user
    await expect(
      adapter.signIn('unknown@pilot.com', 'SomePassword')
    ).rejects.toThrow(/invalid email or password/i);
  });

  it('manages full authService session flow and listeners', async () => {
    let sessionStates: boolean[] = [];
    const unsubscribe = authService.onAuthStateChanged((session) => {
      sessionStates.push(session.isAuthenticated);
    });

    const user = await authService.signUp({
      email: 'viper@topgun.aero',
      password: 'ViperCommander2026',
      displayName: 'Mike Metcalf',
    });

    expect(user.id).toBeDefined();
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getCurrentUser()?.email).toBe('viper@topgun.aero');

    // Update profile
    const updated = await authService.updateProfile({
      pilotLicense: 'ATPL',
      homeBaseAirport: 'LPCS',
    });
    expect(updated.pilotLicense).toBe('ATPL');
    expect(updated.homeBaseAirport).toBe('LPCS');
    expect(authService.getCurrentUser()?.homeBaseAirport).toBe('LPCS');

    // Sign out
    await authService.signOut();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.getCurrentUser()).toBeNull();

    unsubscribe();
  });

  it('handles password reset requests safely', async () => {
    const adapter = new LocalAuthProviderAdapter();
    await adapter.signUp({
      email: 'iceman@topgun.aero',
      password: 'TopGunBestPilot1',
    });

    // Registered user
    const res1 = await adapter.resetPassword('iceman@topgun.aero');
    expect(res1.success).toBe(true);

    // Unregistered user (must return success to prevent email enumeration attacks)
    const res2 = await adapter.resetPassword('nobody@sky.com');
    expect(res2.success).toBe(true);
  });

  it('allows password changes with current password verification', async () => {
    const adapter = new LocalAuthProviderAdapter();
    const user = await adapter.signUp({
      email: 'hondo@topgun.aero',
      password: 'InitialPassword123',
    });

    // Wrong old password
    await expect(
      adapter.changePassword(user.id, 'WrongOldPassword', 'NewBrandPassword456')
    ).rejects.toThrow(/incorrect/i);

    // Correct old password
    await adapter.changePassword(user.id, 'InitialPassword123', 'NewBrandPassword456');

    // Sign in with new password
    const reAuth = await adapter.signIn('hondo@topgun.aero', 'NewBrandPassword456');
    expect(reAuth.id).toBe(user.id);
  });
});
