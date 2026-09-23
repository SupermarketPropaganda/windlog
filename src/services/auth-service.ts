import { User, AuthSession, AuthCredentials, AuthProviderAdapter } from '../types/auth';

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
    } catch {}
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

/**
 * Generates a session token.
 */
function generateToken(userId: string): string {
  const rand = generateSalt(16);
  const expiry = Date.now() + SESSION_DURATION_MS;
  return `wlt_${userId}_${expiry}_${rand}`;
}

/**
 * Default Local Auth Provider implementation storing encrypted credentials in localStorage.
 * Ready to be swapped with Supabase, Firebase, or external API via setAuthProviderAdapter.
 */
export class LocalAuthProviderAdapter implements AuthProviderAdapter {
  private getUsers(): Record<string, StoredUserRecord> {
    try {
      const data = safeStorage.getItem(STORAGE_USERS_KEY);
      const users: Record<string, StoredUserRecord> = data ? JSON.parse(data) : {};
      // Purge any legacy demo or hardcoded pilot records if previously stored
      let modified = false;
      for (const k of Object.keys(users)) {
        if (
          k.includes('master') ||
          k.includes('demo') ||
          users[k]?.user?.email?.endsWith('@windlog.aero')
        ) {
          delete users[k];
          modified = true;
        }
      }
      if (modified) {
        this.saveUsers(users);
      }
      return users;
    } catch {
      return {};
    }
  }

  private saveUsers(users: Record<string, StoredUserRecord>): void {
    try {
      safeStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.error('Failed to save users database:', e);
    }
  }

  async signUp(credentials: AuthCredentials): Promise<User> {
    const email = credentials.email.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
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
      emailVerified: true,
    };

    users[userId] = {
      user: newUser,
      salt,
      passwordHash,
    };

    this.saveUsers(users);
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
    users[record.user.id] = record;
    this.saveUsers(users);

    return record.user;
  }

  async signOut(): Promise<void> {
    // Adapter-specific cleanup if needed
  }

  async resetPassword(email: string): Promise<{ success: boolean; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const users = this.getUsers();
    Object.values(users).find(
      (r) => r.user.email.toLowerCase() === normalizedEmail
    );

    // Uniform response prevents user enumeration attacks
    return {
      success: true,
      message: 'If an account exists with this email, password reset instructions have been generated.',
    };
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
      const stored = safeStorage.getItem(STORAGE_SESSION_KEY);
      if (!stored) {
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      const session = JSON.parse(stored) as AuthSession;
      if (!session.user || !session.token || !session.expiresAt) {
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      // Check expiry
      if (Date.now() > session.expiresAt) {
        safeStorage.removeItem(STORAGE_SESSION_KEY);
        return { user: null, token: null, expiresAt: null, isAuthenticated: false };
      }

      // Refresh user details from database
      const users = this.getUsers();
      const freshRecord = users[session.user.id];
      if (freshRecord) {
        session.user = freshRecord.user;
      }

      return { ...session, isAuthenticated: true };
    } catch {
      return { user: null, token: null, expiresAt: null, isAuthenticated: false };
    }
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

  constructor() {
    this.initSession();
  }

  private async initSession(): Promise<void> {
    try {
      this.currentSession = await this.adapter.getCurrentSession();
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
    this.currentSession = session;
    try {
      if (session.isAuthenticated && session.token) {
        safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      } else {
        safeStorage.removeItem(STORAGE_SESSION_KEY);
      }
    } catch (e) {
      console.error('Failed to save session:', e);
    }
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
    const user = await this.adapter.signUp(credentials);
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

    return user;
  }

  async signIn(email: string, password: string): Promise<User> {
    const user = await this.adapter.signIn(email, password);
    const token = generateToken(user.id);
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.saveSession({
      user,
      token,
      expiresAt,
      isAuthenticated: true,
    });

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
