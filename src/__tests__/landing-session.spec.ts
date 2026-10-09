import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { authService, LocalAuthProviderAdapter, safeStorage } from '../services/auth-service';
import { viewFromHash } from '../utils/app-navigation';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
  };
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('sessionStorage', storage());
  await authService.init();
});
afterEach(() => vi.unstubAllGlobals());

const credentials = { email: 'demo.master@windlog.aero', password: 'FlightPassword123!', displayName: 'Test Pilot' };

describe('Landing and dashboard session handoff', () => {
  it('restores a newly registered account in a fresh page provider without deleting legitimate emails', async () => {
    const user = await authService.signUp(credentials);
    const restored = await new LocalAuthProviderAdapter().getCurrentSession();
    expect(restored.user?.id).toBe(user.id);
    expect(restored.isAuthenticated).toBe(true);
    expect(restored.user?.emailVerified).toBe(false);
  });

  it('keeps an unchecked remember-me session across page navigation, but outside persistent storage', async () => {
    await authService.signUp(credentials);
    await authService.signOut();
    await authService.signIn(credentials.email, credentials.password, false);
    expect(localStorage.getItem('windlog_auth_session')).toBeNull();
    expect(sessionStorage.getItem('windlog_auth_session')).not.toBeNull();
    await authService.init();
    expect(authService.isAuthenticated()).toBe(true);
    await authService.updateProfile({ displayName: 'Updated Pilot' });
    expect(localStorage.getItem('windlog_auth_session')).toBeNull();
    expect((await new LocalAuthProviderAdapter().getCurrentSession()).user?.displayName).toBe('Updated Pilot');
    sessionStorage.clear(); // Closing the tab removes its session.
    expect((await new LocalAuthProviderAdapter().getCurrentSession()).isAuthenticated).toBe(false);
  });

  it('remembers checked sessions and clears both new and legacy landing state on sign-out', async () => {
    await authService.signUp(credentials);
    safeStorage.setItem('windlog_active_user', JSON.stringify({ name: 'Stale pilot' }));
    expect(localStorage.getItem('windlog_auth_session')).not.toBeNull();
    await authService.signOut();
    expect(localStorage.getItem('windlog_auth_session')).toBeNull();
    expect(sessionStorage.getItem('windlog_auth_session')).toBeNull();
    expect(localStorage.getItem('windlog_active_user')).toBeNull();
    expect((await new LocalAuthProviderAdapter().getCurrentSession()).isAuthenticated).toBe(false);
  });

  it.each(['expired', 'missing-user', 'invalid-expiry', 'malformed'])('rejects a %s session', async kind => {
    await authService.signUp(credentials);
    const session = JSON.parse(localStorage.getItem('windlog_auth_session')!);
    if (kind === 'expired') session.expiresAt = Date.now() - 1;
    if (kind === 'missing-user') localStorage.removeItem('windlog_auth_users');
    if (kind === 'invalid-expiry') session.expiresAt = 'forever';
    localStorage.setItem('windlog_auth_session', kind === 'malformed' ? '{broken' : JSON.stringify(session));
    expect((await new LocalAuthProviderAdapter().getCurrentSession()).isAuthenticated).toBe(false);
  });

  it('does not create duplicate accounts when registration is submitted concurrently', async () => {
    const provider = new LocalAuthProviderAdapter();
    const results = await Promise.allSettled([provider.signUp(credentials), provider.signUp(credentials)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(Object.keys(JSON.parse(localStorage.getItem('windlog_auth_users')!))).toHaveLength(1);
  });

  it('reports storage failure instead of pretending registration succeeded', async () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    await expect(authService.signUp(credentials)).rejects.toThrow(/browser storage/i);
    expect(authService.isAuthenticated()).toBe(false);
  });
});

describe('Dashboard navigation', () => {
  it('restores dashboard tools and shared route links on reload', () => {
    expect(viewFromHash('#navlog')).toBe('navlog');
    expect(viewFromHash('#profile')).toBe('auth');
    expect(viewFromHash('#saved-flights')).toBe('saved-flights');
    expect(viewFromHash('#mass-balance')).toBe('mass-balance');
    expect(viewFromHash('#runway-wind')).toBe('runway-wind');
    expect(viewFromHash('#route=LPCS+LPPT&alt=4500')).toBe('navlog');
    expect(viewFromHash('#register')).toBe('landing');
  });
});
