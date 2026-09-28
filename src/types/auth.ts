export interface PilotPreferences {
  homeBaseAirport?: string;
  autoFillHomeBase?: boolean;
  defaultAircraftModel?: string;
  defaultCruiseAltitude?: number;
  defaultTas?: number;
  defaultFuelFlow?: number;
  defaultFuelUnit?: 'gph' | 'lph';
  altimeterUnit?: 'hPa' | 'inHg';
  reserveFuelMinutes?: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  pilotLicense?: string;
  homeBaseAirport?: string;
  avatarUrl?: string;
  createdAt: string;
  lastLoginAt: string;
  emailVerified: boolean;
  preferences?: PilotPreferences;
}

export interface AuthSession {
  user: User | null;
  token: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
}

export interface AuthCredentials {
  email: string;
  password: string;
  displayName?: string;
  pilotLicense?: string;
  homeBaseAirport?: string;
  preferences?: PilotPreferences;
}

export interface AuthState {
  session: AuthSession;
  isLoading: boolean;
  error: string | null;
}

export interface AuthProviderAdapter {
  signUp(credentials: AuthCredentials): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<{ success: boolean; message: string }>;
  updateProfile(userId: string, updates: Partial<User>): Promise<User>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>;
  getCurrentSession(): Promise<AuthSession>;
}

