import { User, AuthSession, AuthCredentials, AuthProviderAdapter } from '../types/auth';
import { migrateGuestFlightsToUser } from '../data/saved-flights';
import { setStorageItem } from '../data/storage-manager';

const STORAGE_USERS_KEY = 'windlog_auth_users';
const STORAGE_SESSION_KEY = 'windlog_auth_session';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredUserRecord {
  user: User;
  salt: string;
  passwordHash: string;
}

/**
 * Generates a random cryptographic hex salt.
 */
export function generateSalt(length: number = 16): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Hashes password with salt using SHA-256 via Web Crypto API.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}__WINDLOG_SECRET__${password}`);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback simple hash for environments without crypto.subtle
  let hash = 0;
  const str = `${salt}:${password}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const memoryFallbackStore = new Map<string, string>();

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {}
    return memoryFallbackStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {
      throw new Error('Unable to save your account. Please allow browser storage and try again.');
    }
    memoryFallbackStore.set(key, value);
  },
  removeItem: (key: string): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch {}
    memoryFallbackStore.delete(key);
  },
  clear: (): void => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
    } catch {}
    memoryFallbackStore.clear();
  },
};


function getTabSession(): string | null {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_SESSION_KEY) : null; }
  catch { return null; }
}
function clearStoredSession(): void {
  safeStorage.removeItem(STORAGE_SESSION_KEY);
  safeStorage.removeItem('windlog_active_user'); // Obsolete standalone landing session.
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_SESSION_KEY); } catch {}
}

/**
 * Generates a session token.
 */
function generateToken(userId: string): string {
  const rand = generateSalt(16);
  const expiry = Date.now() + SESSION_DURATION_MS;
  return `wlt_${userId}_${expiry}_${rand}`;
}

/**
 * Default Local Auth Provider implementation storing salted password hashes in localStorage. This is a local profile store, not server authentication.
 * Ready to be swapped with Supabase, Firebase, or external API via setAuthProviderAdapter.
 */
export class LocalAuthProviderAdapter implements AuthProviderAdapter {
  private getUsers(): Record<string, StoredUserRecord> {
    try {
      const data = safeStorage.getItem(STORAGE_USERS_KEY);
      const users: Record<string, StoredUserRecord> = data ? JSON.parse(data) : {};
      return users;
    } catch {
      return {};
    }
  }

  private saveUsers(users: Record<string, StoredUserRecord>): void {
    safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  }

  async signUp(credentials: AuthCredentials): Promise<User> {
    const email = credentials.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please provide a valid email address.');
    }
    if (!credentials.password || credentials.password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const users = this.getUsers();
    // Check if email already registered
    const existing = Object.values(users).find(
      (r) => r.user.email.toLowerCase() === email
    );
    if (existing) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }

    const entropy = generateSalt(16);
    const userId = `pilot_${Date.now()}_${entropy}`;
    const salt = generateSalt(16);
    const passwordHash = await hashPassword(credentials.password, salt);

    const newUser: User = {
      id: userId,
      email,
      displayName: credentials.displayName?.trim() || email.split('@')[0],
      pilotLicense: credentials.pilotLicense?.trim().toUpperCase() || undefined,
      homeBaseAirport: credentials.homeBaseAirport?.trim().toUpperCase() || undefined,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      emailVerified: false,
      isAnonymous: false,
      preferences: credentials.preferences,
    };

    users[userId] = {
      user: newUser,
      salt,
      passwordHash,
    };

    // Re-read after hashing so concurrent registration cannot overwrite another account.
    const latest = this.getUsers();
    if (Object.values(latest).some(r => r.user.email.toLowerCase() === email)) {
      throw new Error('An account with this email already exists. Please sign in instead.');
    }
    latest[userId] = users[userId];
    this.saveUsers(latest);
    return newUser;
  }

  async signIn(email: string, password: string): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const users = this.getUsers();
    const record = Object.values(users).find(
      (r) => r.user.email.toLowerCase() === normalizedEmail
    );

    if (!record) {
      throw new Error('Invalid email or password.');
    }

    const expectedHash = await hashPassword(password, record.salt);
    if (expectedHash !== record.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    // Update lastLoginAt
    record.user.lastLoginAt = new Date().toISOString();
    record.user.isAnonymous = false;
    users[record.user.id] = record;
    this.saveUsers(users);

    return record.user;
  }

  async signOut(): Promise<void> {
    // Adapter-specific cleanup if needed
  }

  async resetPassword(_email: string): Promise<{ success: boolean; message: string }> {
    return { success: false, message: 'Email recovery requires a connected account provider. Your account is stored only in this browser.' };
  }
  async resetPasswordWithNew(_email: string, _newPassword: string): Promise<{ success: boolean; message: string }> {
    throw new Error('Email recovery requires a connected account provider. Use Change Password with your current password.');
  }

  async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    if (userId.startsWith('guest_')) {
      throw new Error('Guest profiles cannot be modified in persistent database.');
    }
    const users = this.getUsers();
    const record = users[userId];
    if (!record) throw new Error('User not found.');

    const updatedUser: User = {
      ...record.user,
      ...updates,
      id: userId, // immutable
      email: record.user.email, // email change requires separate flow
    };

    record.user = updatedUser;
    users[userId] = record;
    this.saveUsers(users);

    return updatedUser;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters long.');
    }
    const users = this.getUsers();
    const record = users[userId];
    if (!record) throw new Error('User not found.');

    const currentHash = await hashPassword(oldPassword, record.salt);
    if (currentHash !== record.passwordHash) {
      throw new Error('Current password is incorrect.');
    }

    const newSalt = generateSalt(16);
    record.salt = newSalt;
    record.passwordHash = await hashPassword(newPassword, newSalt);
    users[userId] = record;
    this.saveUsers(users);
  }

  async getCurrentSession(): Promise<AuthSession> {
    try {
      const stored = getTabSession() || safeStorage.getItem(STORAGE_SESSION_KEY);
      if (!stored) {
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      const session = JSON.parse(stored) as AuthSession;
      if (!session.user || !session.token || !session.expiresAt) {
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      // Check expiry
      if (!Number.isFinite(session.expiresAt) || Date.now() >= session.expiresAt) {
        clearStoredSession();
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      // Refresh user details from database
      const users = this.getUsers();
      const freshRecord = users[session.user.id];
      if (!freshRecord && !session.user.isAnonymous) {
        clearStoredSession();
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }
      if (freshRecord) session.user = freshRecord.user;

      return { ...session, isAuthenticated: true };
    } catch {
      return { user: null, token: null, expiresAt: null, isAuthenticated: false };
    }
  }

  async signInWithOAuthUser(profile: { email: string; displayName?: string; provider: string }): Promise<User> {
    const email = profile.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Valid email address required.');
    }
    const users = this.getUsers();
    let record = Object.values(users).find(
      (r) => r.user.email.toLowerCase() === email
    );

    if (!record) {
      const entropy = generateSalt(16);
      const userId = `pilot_${Date.now()}_${entropy}`;
      const salt = generateSalt(16);
      const passwordHash = await hashPassword(`OAUTH_${profile.provider}_${entropy}`, salt);

      const newUser: User = {
        id: userId,
        email,
        displayName: profile.displayName?.trim() || email.split('@')[0],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        emailVerified: true,
        isAnonymous: false,
      };

      record = {
        user: newUser,
        salt,
        passwordHash,
      };
      users[userId] = record;
      this.saveUsers(users);
    } else {
      record.user.lastLoginAt = new Date().toISOString();
      if (profile.displayName && (!record.user.displayName || record.user.displayName === record.user.email.split('@')[0])) {
        record.user.displayName = profile.displayName.trim();
      }
      users[record.user.id] = record;
      this.saveUsers(users);
    }

    return record.user;
  }

  async requestMagicCode(_email: string): Promise<{ code: string; expiresAt: number }> {
    throw new Error('Email access codes require a connected account provider. Please sign in with your password.');
  }
  async signInWithMagicCode(_email: string, _code: string): Promise<User> {
    throw new Error('Email access codes require a connected account provider. Please sign in with your password.');
  }


}

/**
 * AuthService - Central Backstage Authentication Coordinator.
 * Manages active sessions, listeners, and adapter delegation.
 */
class AuthService {
  private adapter: AuthProviderAdapter = new LocalAuthProviderAdapter();
  private currentSession: AuthSession = {
    user: null,
    token: null,
    expiresAt: null,
    isAuthenticated: false,
  };
  private listeners = new Set<(session: AuthSession) => void>();
  private initialized = false;
  private rememberSession = true;

  constructor() {
    this.initSession();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_SESSION_KEY || event.key === STORAGE_USERS_KEY || event.key === null) {
          void this.initSession();
        }
      });
      window.addEventListener('focus', () => { void this.initSession(); });
    }
  }

  async init(): Promise<void> {
    await this.initSession();
  }

  async initSession(): Promise<void> {
    try {
      this.currentSession = await this.adapter.getCurrentSession();
      this.rememberSession = !getTabSession();
    } catch {
      this.currentSession = { user: null, token: null, expiresAt: null, isAuthenticated: false };
    } finally {
      this.initialized = true;
      this.notifyListeners();
    }
  }

  /**
   * Pluggable adapter configuration (e.g. Supabase, Firebase, or Custom REST).
   */
  setAuthProviderAdapter(adapter: AuthProviderAdapter): void {
    this.adapter = adapter;
    this.initSession();
  }

  private saveSession(session: AuthSession): void {
    try {
      if (session.isAuthenticated && session.token) {
        clearStoredSession();
        if (!this.rememberSession && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        } else {
          safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        }
      } else {
        clearStoredSession();
      }
    } catch {
      throw new Error('Unable to save your session. Please allow browser storage and try again.');
    }
    this.currentSession = session;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentSession);
      } catch (e) {
        console.error('Auth listener error:', e);
      }
    }
  }

  async signUp(credentials: AuthCredentials): Promise<User> {
    this.rememberSession = true;
    const user = await this.adapter.signUp(credentials);
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    try {
      await migrateGuestFlightsToUser(user.id);
    } catch (e) {
      console.warn('Flight migration notice:', e);
    }

    return user;
  }

  async signIn(
    emailOrCreds: string | { email: string; password: string },
    maybePassword?: string,
    rememberMe = true
  ): Promise<User> {
    const email = typeof emailOrCreds === 'string' ? emailOrCreds : emailOrCreds.email;
    const password = typeof emailOrCreds === 'string' ? (maybePassword || '') : emailOrCreds.password;
    const user = await this.adapter.signIn(email, password);
    this.rememberSession = rememberMe;
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    try {
      await migrateGuestFlightsToUser(user.id);
    } catch (e) {
      console.warn('Flight migration notice:', e);
    }

    // Restore pilot preferences to local cockpit defaults
    if (user.preferences) {
      try {
        if (user.preferences.homeBaseAirport) {
          setStorageItem('windlog_home_base', user.preferences.homeBaseAirport);
        }
        if (user.preferences.autoFillHomeBase !== undefined) {
          setStorageItem('windlog_auto_home_base', user.preferences.autoFillHomeBase);
        }
        if (user.preferences.altimeterUnit) {
          setStorageItem('windlog_altimeter_unit', user.preferences.altimeterUnit);
        }
        if (user.preferences.reserveFuelMinutes) {
          setStorageItem('windlog_reserve_fuel_mins', user.preferences.reserveFuelMinutes);
        }
        if (user.preferences.defaultAircraftModel) {
          setStorageItem('windlog_profile', {
            aircraftModel: user.preferences.defaultAircraftModel,
            cruiseAltitude: user.preferences.defaultCruiseAltitude || 4500,
            tas: user.preferences.defaultTas || 105,
            fuelFlow: user.preferences.defaultFuelFlow || 8.5,
            fuelUnit: user.preferences.defaultFuelUnit || 'gph',
          });
        }
      } catch (e) {
        console.warn('Preferences restore notice:', e);
      }
    }

    return user;
  }

  async signInAsGuest(): Promise<User> {
    const entropy = generateSalt(16);
    const guestId = `guest_${Date.now()}_${entropy}`;
    const guestUser: User = {
      id: guestId,
      email: `guest_${entropy.substring(0, 8)}@cockpit.local`,
      displayName: 'Guest Pilot',
      pilotLicense: 'VFR Pilot',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      emailVerified: true,
      isAnonymous: true,
    };
    const token = generateToken(guestId);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user: guestUser,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    return guestUser;
  }

  async signOut(): Promise<void> {
    await this.adapter.signOut();
    this.saveSession({
      user: null,
      token: null,
      expiresAt: null,
      isAuthenticated: false,
    });
  }

  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    return this.adapter.resetPassword(email);
  }

  async resetPasswordWithNew(email: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (this.adapter.resetPasswordWithNew) {
      return this.adapter.resetPasswordWithNew(email, newPassword);
    }
    throw new Error('Password reset with new password is not supported by current provider.');
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this.currentSession.user) {
      throw new Error('No pilot is currently signed in.');
    }
    if (this.currentSession.user.id.startsWith('guest_')) {
      throw new Error('Guest accounts do not have a password.');
    }
    await this.adapter.changePassword(this.currentSession.user.id, oldPassword, newPassword);
  }

  async updateProfile(updates: Partial<User>): Promise<User> {
    if (!this.currentSession.user) {
      throw new Error('No pilot is currently signed in.');
    }
    let updated: User;
    if (this.currentSession.user.id.startsWith('guest_')) {
      updated = {
        ...this.currentSession.user,
        ...updates,
        id: this.currentSession.user.id,
        email: this.currentSession.user.email,
      };
    } else {
      updated = await this.adapter.updateProfile(this.currentSession.user.id, updates);
    }
    this.saveSession({
      ...this.currentSession,
      user: updated,
    });
    return updated;
  }

  async signInWithOAuthUser(profile: { email: string; displayName?: string; provider: string }): Promise<User> {
    if (!this.adapter.signInWithOAuthUser) {
      throw new Error('OAuth authentication not supported by current adapter.');
    }
    const user = await this.adapter.signInWithOAuthUser(profile);
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    try {
      await migrateGuestFlightsToUser(user.id);
    } catch (e) {
      console.warn('Flight migration notice:', e);
    }

    return user;
  }

  async requestMagicCode(email: string): Promise<{ code: string; expiresAt: number }> {
    if (!this.adapter.requestMagicCode) {
      throw new Error('Magic codes not supported by current adapter.');
    }
    return this.adapter.requestMagicCode(email);
  }

  async signInWithMagicCode(email: string, code: string): Promise<User> {
    if (!this.adapter.signInWithMagicCode) {
      throw new Error('Magic codes not supported by current adapter.');
    }
    const user = await this.adapter.signInWithMagicCode(email, code);
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    try {
      await migrateGuestFlightsToUser(user.id);
    } catch (e) {
      console.warn('Flight migration notice:', e);
    }

    return user;
  }

  getCurrentSession(): AuthSession {
    return this.currentSession;
  }

  getCurrentUser(): User | null {
    return this.currentSession.user;
  }

  isAuthenticated(): boolean {
    return this.currentSession.isAuthenticated;
  }

  onAuthStateChanged(callback: (session: AuthSession) => void): () => void {
    this.listeners.add(callback);
    if (this.initialized) {
      callback(this.currentSession);
    }
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const authService = new AuthService();
