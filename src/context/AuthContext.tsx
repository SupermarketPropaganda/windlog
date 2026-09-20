import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, AuthSession, AuthCredentials } from '../types/auth';
import { authService } from '../services/auth-service';

export interface AuthContextType {
  session: AuthSession;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (credentials: AuthCredentials) => Promise<User>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateProfile: (updates: Partial<User>) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession>(() => authService.getCurrentSession());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((updatedSession) => {
      setSession(updatedSession);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await authService.signIn(email, password);
      return user;
    } catch (err: any) {
      const msg = err?.message || 'Failed to sign in. Please check your credentials.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (credentials: AuthCredentials): Promise<User> => {
    setIsLoading(true);
    setError(null);
    try {
      const user = await authService.signUp(credentials);
      return user;
    } catch (err: any) {
      const msg = err?.message || 'Failed to register account.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await authService.signOut();
    } catch (err: any) {
      setError(err?.message || 'Error signing out.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<{ success: boolean; message: string }> => {
      setError(null);
      try {
        return await authService.resetPassword(email);
      } catch (err: any) {
        const msg = err?.message || 'Failed to request password reset.';
        setError(msg);
        throw err;
      }
    },
    []
  );

  const updateProfile = useCallback(async (updates: Partial<User>): Promise<User> => {
    setError(null);
    try {
      return await authService.updateProfile(updates);
    } catch (err: any) {
      const msg = err?.message || 'Failed to update pilot profile.';
      setError(msg);
      throw err;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session.user,
        isAuthenticated: session.isAuthenticated,
        isLoading,
        error,
        clearError,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
