import React, { useState, useEffect, useCallback } from 'react';
import { ActiveView } from '../types';
import { useAuth } from '../context/AuthContext';
import { safeStorage } from '../services/auth-service';
import { CURRENT_LEGAL_VERSION, LEGAL_DOCUMENT_TITLE, LEGAL_SECTIONS } from '../data/legal-terms';

export interface LandingPageProps {
  onNavigate: (view: ActiveView) => void;
}

type ModalView = 'none' | 'signin' | 'register' | 'forgot' | 'magic' | 'account' | 'terms' | 'privacy' | 'google-setup';

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const {
    user,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    resetPasswordWithNew,
    changePassword,
    updateProfile,
    signInWithOAuthUser,
    requestMagicCode,
    signInWithMagicCode,
    clearError,
  } = useAuth();

  // ─── Modal State ───
  const [modalView, setModalView] = useState<ModalView>('none');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ─── Sign In Form State ───
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSubmittingSignIn, setIsSubmittingSignIn] = useState(false);

  // ─── Register Form State ───
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regAgreeTerms, setRegAgreeTerms] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  // ─── Google Identity Services State ───
  const [googleClientId, setGoogleClientId] = useState(() => {
    return (
      (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string) ||
      safeStorage.getItem('windlog_google_client_id') ||
      ''
    );
  });
  const [googleClientInput, setGoogleClientInput] = useState('');
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);

  // ─── Forgot Password State ───
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotGeneratedCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotFeedback, setForgotFeedback] = useState<string | null>(null);
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);

  // ─── Magic Link State ───
  const [magicStep, setMagicStep] = useState<1 | 2>(1);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicCode, setMagicCode] = useState('');
  const [magicGeneratedCode, setMagicGeneratedCode] = useState('');
  const [magicExpiresAt, setMagicExpiresAt] = useState<number | null>(null);
  const [magicFeedback, setMagicFeedback] = useState<string | null>(null);
  const [isSubmittingMagic, setIsSubmittingMagic] = useState(false);

  // ─── Account / Profile Modal State ───
  const [profileName, setProfileName] = useState('');
  const [profileLicense, setProfileLicense] = useState('');
  const [profileHomeBase, setProfileHomeBase] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [confirmAccountPassword, setConfirmAccountPassword] = useState('');
  const [accountFeedback, setAccountFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);

  // Sync profile fields with logged-in user
  useEffect(() => {
    if (user) {
      setProfileName(user.displayName || '');
      setProfileLicense(user.pilotLicense || '');
      setProfileHomeBase(user.homeBaseAirport || user.preferences?.homeBaseAirport || '');
    }
  }, [user]);

  // Handle URL hash changes (#login, #register, #signin, #signup)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#login' || hash === '#signin') {
        setModalView('signin');
      } else if (hash === '#register' || hash === '#signup') {
        setModalView('register');
      } else if (hash === '#forgot') {
        setModalView('forgot');
      } else if (hash === '#account' || hash === '#profile') {
        setModalView('account');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Keyboard navigation: Escape key closes active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalView !== 'none') {
        setModalView('none');
        clearError();
        setSignInError(null);
        setRegError(null);
        setGoogleAuthError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalView, clearError]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  const closeModal = useCallback(() => {
    setModalView('none');
    clearError();
    setSignInError(null);
    setRegError(null);
    setForgotFeedback(null);
    setAccountFeedback(null);
    setGoogleAuthError(null);
    if (window.location.hash) {
      if (!new URLSearchParams(window.location.hash.slice(1)).has('route')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [clearError]);

  // ─── Sign In Handlers ───
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);
    clearError();

    const email = signInEmail.trim();
    if (!email) {
      setSignInError('Please enter your pilot email or call sign.');
      return;
    }
    if (!signInPassword) {
      setSignInError('Please enter your password.');
      return;
    }

    setIsSubmittingSignIn(true);
    try {
      const loggedUser = await signIn(email, signInPassword, rememberMe);
      closeModal();
      onNavigate('navlog');
      showToast(`Welcome aboard, Capt. ${loggedUser.displayName || loggedUser.email}.`);
    } catch (err: any) {
      setSignInError(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsSubmittingSignIn(false);
    }
  };

  // ─── Real Google Identity Services (GIS) / OAuth Handler ───
  const handleGoogleAuth = async (configuredClientId?: string) => {
    setSignInError(null);
    setRegError(null);
    setGoogleAuthError(null);

    const activeClientId = (configuredClientId || googleClientId).trim();
    if (!activeClientId) {
      setSignInError('Google sign-in is not enabled. Please use your email and password.');
      setRegError('Google sign-in is not enabled. Please register with email and password.');
      return;
    }

    setIsSubmittingGoogle(true);
    try {
      const g = (window as any).google;
      if (!g || !g.accounts || !g.accounts.oauth2) {
        throw new Error('Google Identity Services script not yet initialized. Please check your internet connection.');
      }

      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: activeClientId,
        scope: 'email profile openid',
        error_callback: () => {
          setIsSubmittingGoogle(false);
          setSignInError('Google sign-in was closed or could not open. Please try again.');
          setRegError('Google sign-in was closed or could not open. Please try again.');
        },
        callback: async (resp: any) => {
          if (resp.error) {
            setSignInError(`Google sign-in error: ${resp.error}`);
            setRegError(`Google sign-in error: ${resp.error}`);
            setIsSubmittingGoogle(false);
            return;
          }
          try {
            // Fetch verified user profile from Google UserInfo endpoint
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${resp.access_token}` },
            });
            if (!res.ok) throw new Error('Failed to retrieve Google profile data.');
            const profile = await res.json();
            const loggedUser = await signInWithOAuthUser({
              email: profile.email,
              displayName: profile.name,
              provider: 'Google',
            });
            closeModal();
            onNavigate('navlog');
            showToast(`Welcome aboard, Capt. ${loggedUser.displayName || loggedUser.email}!`);
          } catch (e: any) {
            setSignInError(e?.message || 'Google authentication failed.');
            setRegError(e?.message || 'Google authentication failed.');
          } finally {
            setIsSubmittingGoogle(false);
          }
        },
      });

      tokenClient.requestAccessToken();
    } catch (err: any) {
      setIsSubmittingGoogle(false);
      setSignInError(err?.message || 'Failed to start Google sign-in.');
      setRegError(err?.message || 'Failed to start Google sign-in.');
    }
  };

  const handleSaveGoogleClientId = (e: React.FormEvent) => {
    e.preventDefault();
    const val = googleClientInput.trim();
    if (!val || !val.includes('.apps.googleusercontent.com')) {
      setGoogleAuthError('Please enter a valid Google OAuth Client ID (format: xxxxx.apps.googleusercontent.com)');
      return;
    }
    safeStorage.setItem('windlog_google_client_id', val);
    setGoogleClientId(val);
    setModalView('signin');
    showToast('Google Client ID configured. Connecting...');
    setTimeout(() => {
      void handleGoogleAuth(val);
    }, 250);
  };

  // ─── Register Handlers ───
  const calculatePasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, text: 'Empty', color: '#555' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { score: 25, text: 'Weak', color: '#ef4444' };
    if (score === 2) return { score: 50, text: 'Fair', color: '#f59e0b' };
    if (score === 3) return { score: 75, text: 'Good', color: '#3b82f6' };
    return { score: 100, text: 'Strong', color: '#22c55e' };
  };

  const passStrength = calculatePasswordStrength(regPassword);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    clearError();

    const name = regName.trim();
    const email = regEmail.trim();

    if (!name) {
      setRegError('Please enter your full name or call sign.');
      return;
    }
    if (!email || !email.includes('@')) {
      setRegError('Please provide a valid email address.');
      return;
    }
    if (regPassword.length < 8) {
      setRegError('Password must be at least 8 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }
    if (!regAgreeTerms) {
      setRegError('You must agree to the Terms of Service & Privacy Policy.');
      return;
    }

    setIsSubmittingReg(true);
    try {
      const newUser = await signUp({
        email,
        password: regPassword,
        displayName: name,
      });
      closeModal();
      onNavigate('navlog');
      showToast(`Account created. Welcome, Capt. ${newUser.displayName || newUser.email}!`);
    } catch (err: any) {
      setRegError(err?.message || 'Could not register account. An account with this email may already exist.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // ─── Real Forgot Password Handlers (3 Steps) ───
  const handleForgotStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotFeedback(null);
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setForgotFeedback('Please enter a valid pilot email address.');
      return;
    }

    setForgotFeedback('Email recovery requires a connected account provider. Your account is stored only in this browser.');
  };

  const handleForgotStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotFeedback(null);
    const entered = forgotCode.trim().replace(/\s+|-/g, '');
    const expected = (forgotGeneratedCode || safeStorage.getItem(`windlog_reset_${forgotEmail.trim().toLowerCase()}`) || '').replace(/\s+|-/g, '');

    if (!entered || entered !== expected) {
      setForgotFeedback('Invalid verification code. Please check and try again.');
      return;
    }
    setForgotStep(3);
    setForgotFeedback('Code verified. Set your new master credentials.');
  };

  const handleForgotStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotFeedback(null);
    if (forgotNewPassword.length < 8) {
      setForgotFeedback('Password must be at least 8 characters long.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotFeedback('Passwords do not match.');
      return;
    }

    setIsSubmittingForgot(true);
    try {
      await resetPasswordWithNew(forgotEmail.trim(), forgotNewPassword);
      safeStorage.removeItem(`windlog_reset_${forgotEmail.trim().toLowerCase()}`);
      setForgotStep(1);
      setModalView('signin');
      setSignInEmail(forgotEmail);
      showToast('Password successfully reset. Please sign in with your new password.');
    } catch (err: any) {
      setForgotFeedback(err?.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  // ─── Real Magic Code Handlers ───
  const handleRequestMagicCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicFeedback(null);
    const email = magicEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setMagicFeedback('Please enter a valid pilot email address.');
      return;
    }

    setIsSubmittingMagic(true);
    try {
      const res = await requestMagicCode(email);
      setMagicGeneratedCode(res.code);
      setMagicExpiresAt(res.expiresAt);
      setMagicStep(2);
      setMagicCode('');
      setMagicFeedback('Secure access code generated. Enter your 6-digit code below to enter cockpit.');
    } catch (err: any) {
      setMagicFeedback(err?.message || 'Failed to generate access code.');
    } finally {
      setIsSubmittingMagic(false);
    }
  };

  const handleVerifyMagicCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicFeedback(null);
    const email = magicEmail.trim().toLowerCase();
    const code = magicCode.trim();

    if (!code) {
      setMagicFeedback('Please enter your 6-digit access code.');
      return;
    }

    setIsSubmittingMagic(true);
    try {
      const loggedUser = await signInWithMagicCode(email, code);
      closeModal();
      showToast(`Authenticated via Magic Code. Welcome, Capt. ${loggedUser.displayName || loggedUser.email}!`);
    } catch (err: any) {
      setMagicFeedback(err?.message || 'Invalid or expired access code.');
    } finally {
      setIsSubmittingMagic(false);
    }
  };

  // ─── Account / Profile Handlers ───
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFeedback(null);
    setIsSubmittingAccount(true);

    try {
      await updateProfile({
        displayName: profileName.trim(),
        pilotLicense: profileLicense.trim(),
        homeBaseAirport: profileHomeBase.trim().toUpperCase(),
      });
      setAccountFeedback({ message: 'Pilot profile updated successfully.' });
      showToast('Profile updated.');
    } catch (err: any) {
      setAccountFeedback({ message: err?.message || 'Failed to update profile.', isError: true });
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountFeedback(null);

    if (!currentPassword) {
      setAccountFeedback({ message: 'Current password is required.', isError: true });
      return;
    }
    if (newAccountPassword.length < 8) {
      setAccountFeedback({ message: 'New password must be at least 8 characters.', isError: true });
      return;
    }
    if (newAccountPassword !== confirmAccountPassword) {
      setAccountFeedback({ message: 'New passwords do not match.', isError: true });
      return;
    }

    setIsSubmittingAccount(true);
    try {
      await changePassword(currentPassword, newAccountPassword);
      setCurrentPassword('');
      setNewAccountPassword('');
      setConfirmAccountPassword('');
      setAccountFeedback({ message: 'Password changed successfully.' });
      showToast('Password updated.');
    } catch (err: any) {
      setAccountFeedback({ message: err?.message || 'Incorrect current password.', isError: true });
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    closeModal();
    showToast('Signed out of Windlog.');
  };

  return (
    <div className="pure-black-root" role="main">
      {/* ─── Toast Notification ─── */}
      {notification && (
        <div
          className={`pure-black-toast ${notification.type}`}
          role="status"
          aria-live="polite"
        >
          <span>{notification.message}</span>
        </div>
      )}

      {/* ─── CENTERSTAGE: PURE BLACK MINIMAL HERO ─── */}
      <div className="pure-black-center">
        <h1 className="pure-black-title" aria-label="Windlog">
          Windlog.
        </h1>

        {/* ─── Trigger: 'sign in // register' or Logged-in Flight Controls ─── */}
        {!isAuthenticated || !user || user.id.startsWith('guest_') ? (
          <div className="pure-black-actions">
            <button
              type="button"
              className="pure-black-link"
              onClick={() => {
                setModalView('signin');
                setSignInError(null);
              }}
              aria-haspopup="dialog"
            >
              sign in
            </button>
            <span className="pure-black-slash" aria-hidden="true">//</span>
            <button
              type="button"
              className="pure-black-link"
              onClick={() => {
                setModalView('register');
                setRegError(null);
              }}
              aria-haspopup="dialog"
            >
              register
            </button>
          </div>
        ) : (
          <div className="pure-black-auth-container">
            <div className="pure-black-user-badge">
              <span className="pulse-dot" />
              <span>capt. {user.displayName || user.email} // signed in</span>
            </div>
            <div className="pure-black-actions">
              <button
                type="button"
                className="pure-black-link primary-enter"
                onClick={() => onNavigate('navlog')}
              >
                enter cockpit &rarr;
              </button>
              <span className="pure-black-slash" aria-hidden="true">//</span>
              <button
                type="button"
                className="pure-black-link"
                onClick={() => setModalView('account')}
              >
                pilot account
              </button>
              <span className="pure-black-slash" aria-hidden="true">//</span>
              <button
                type="button"
                className="pure-black-link"
                onClick={handleSignOut}
              >
                sign out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── READY-TO-SHIP AUTHENTICATION MODAL ─── */}
      {modalView !== 'none' && (
        <div
          className="pure-black-modal-backdrop"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modalBrandHeading"
        >
          <div
            className="pure-black-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="pure-black-modal-header">
              <div className="pure-black-modal-brand" id="modalBrandHeading">
                Windlog.
              </div>
              <button
                type="button"
                className="pure-black-close-btn"
                onClick={closeModal}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Modal Nav Tabs (Sign In vs. Register) */}
            {(modalView === 'signin' || modalView === 'register') && (
              <div className="pure-black-tabs">
                <button
                  type="button"
                  className={`pure-black-tab ${modalView === 'signin' ? 'active' : ''}`}
                  onClick={() => {
                    setModalView('signin');
                    setSignInError(null);
                  }}
                >
                  sign in
                </button>
                <button
                  type="button"
                  className={`pure-black-tab ${modalView === 'register' ? 'active' : ''}`}
                  onClick={() => {
                    setModalView('register');
                    setRegError(null);
                  }}
                >
                  register
                </button>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               1 · SIGN IN FORM
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'signin' && (
              <form onSubmit={handleSignIn} className="pure-black-form" noValidate>
                {signInError && (
                  <div className="pure-black-alert error" role="alert">
                    {signInError}
                  </div>
                )}

                <div className="pure-black-field">
                  <label htmlFor="modalSignInEmail">Email Address</label>
                  <input
                    id="modalSignInEmail"
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="pilot@cockpit.org"
                    autoComplete="email"
                    required
                    autoFocus
                  />
                </div>

                <div className="pure-black-field">
                  <div className="pure-black-field-header">
                    <label htmlFor="modalSignInPassword">Password</label>
                    <button
                      type="button"
                      className="pure-black-inline-link"
                      onClick={() => setModalView('forgot')}
                    >
                      forgot password?
                    </button>
                  </div>
                  <div className="pure-black-password-wrapper">
                    <input
                      id="modalSignInPassword"
                      type={showSignInPassword ? 'text' : 'password'}
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="pure-black-eye-btn"
                      onClick={() => setShowSignInPassword(!showSignInPassword)}
                      aria-label={showSignInPassword ? 'Hide password' : 'Show password'}
                    >
                      {showSignInPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="pure-black-checkbox-row">
                  <label className="pure-black-checkbox-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span>Keep me logged in for 30 days</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="pure-black-submit-btn"
                  disabled={isSubmittingSignIn}
                >
                  {isSubmittingSignIn ? 'Verifying Credentials...' : 'Sign In'}
                </button>

                <div className="pure-black-divider">
                  <span>or continue with</span>
                </div>

                <button
                  type="button"
                  className="pure-black-social-btn"
                  style={{ width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => void handleGoogleAuth()}
                  disabled={isSubmittingGoogle}
                >
                  {isSubmittingGoogle ? 'Connecting with Google...' : 'Continue with Google'}
                </button>

                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="pure-black-inline-link"
                    onClick={() => {
                      setModalView('magic');
                      setMagicFeedback(null);
                      setMagicStep(1);
                    }}
                  >
                    Use passwordless Magic Link &rarr;
                  </button>
                </div>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════
               2 · REGISTER / SIGN UP FORM
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'register' && (
              <form onSubmit={handleRegister} className="pure-black-form" noValidate>
                {regError && (
                  <div className="pure-black-alert error" role="alert">
                    {regError}
                  </div>
                )}

                <button
                  type="button"
                  className="pure-black-social-btn"
                  style={{ width: '100%', padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => void handleGoogleAuth()}
                  disabled={isSubmittingGoogle}
                >
                  {isSubmittingGoogle ? 'Connecting with Google...' : 'Register with Google'}
                </button>

                <div className="pure-black-divider">
                  <span>or register with email</span>
                </div>

                <div className="pure-black-field">
                  <label htmlFor="modalRegName">Pilot Full Name or Callsign</label>
                  <input
                    id="modalRegName"
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Capt. Amelia Vance"
                    autoComplete="name"
                    required
                    autoFocus
                  />
                </div>

                <div className="pure-black-field">
                  <label htmlFor="modalRegEmail">Email Address</label>
                  <input
                    id="modalRegEmail"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="pilot@cockpit.org"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="pure-black-field">
                  <label htmlFor="modalRegPassword">Master Password</label>
                  <div className="pure-black-password-wrapper">
                    <input
                      id="modalRegPassword"
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="pure-black-eye-btn"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                    >
                      {showRegPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {regPassword.length > 0 && (
                    <div className="pure-black-strength-bar">
                      <div
                        className="pure-black-strength-fill"
                        style={{
                          width: `${passStrength.score}%`,
                          backgroundColor: passStrength.color,
                        }}
                      />
                      <span className="pure-black-strength-label" style={{ color: passStrength.color }}>
                        {passStrength.text}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pure-black-field">
                  <label htmlFor="modalRegConfirm">Confirm Password</label>
                  <input
                    id="modalRegConfirm"
                    type={showRegPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="pure-black-checkbox-row">
                  <label className="pure-black-checkbox-label">
                    <input
                      type="checkbox"
                      checked={regAgreeTerms}
                      onChange={(e) => setRegAgreeTerms(e.target.checked)}
                      required
                    />
                    <span>
                      I agree to the{' '}
                      <button
                        type="button"
                        className="pure-black-inline-link"
                        onClick={(e) => {
                          e.preventDefault();
                          setModalView('terms');
                        }}
                      >
                        Terms of Service
                      </button>{' '}
                      &amp;{' '}
                      <button
                        type="button"
                        className="pure-black-inline-link"
                        onClick={(e) => {
                          e.preventDefault();
                          setModalView('privacy');
                        }}
                      >
                        Privacy Policy
                      </button>
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="pure-black-submit-btn"
                  disabled={isSubmittingReg}
                >
                  {isSubmittingReg ? 'Initializing Pilot Account...' : 'Create Pilot Account'}
                </button>
              </form>
            )}

            {/* ══════════════════════════════════════════════════════════════
               3 · FORGOT PASSWORD WORKFLOW
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'forgot' && (
              <div className="pure-black-form">
                <div className="pure-black-section-title">
                  Reset Pilot Access Credentials
                </div>

                {forgotFeedback && (
                  <div className="pure-black-alert info" role="status">
                    {forgotFeedback}
                  </div>
                )}

                {forgotStep === 1 && (
                  <form onSubmit={handleForgotStep1}>
                    <div className="pure-black-field">
                      <label htmlFor="modalForgotEmail">Registered Pilot Email</label>
                      <input
                        id="modalForgotEmail"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="pilot@cockpit.org"
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="pure-black-submit-btn"
                      disabled={isSubmittingForgot}
                    >
                      {isSubmittingForgot ? 'Verifying Account...' : 'Send Verification Code'}
                    </button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleForgotStep2}>
                    <div className="pure-black-field">
                      <label htmlFor="modalForgotCode">6-Digit Verification Code</label>
                      <input
                        id="modalForgotCode"
                        type="text"
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value)}
                        placeholder="e.g. 842-190"
                        maxLength={8}
                        required
                        autoFocus
                      />
                      {forgotGeneratedCode && (
                        <span className="pure-black-field-hint" style={{ color: '#38bdf8' }}>
                          Verification code dispatched to {forgotEmail}: <strong>{forgotGeneratedCode}</strong>
                        </span>
                      )}
                    </div>
                    <button type="submit" className="pure-black-submit-btn">
                      Verify Code &rarr;
                    </button>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleForgotStep3}>
                    <div className="pure-black-field">
                      <label htmlFor="modalForgotNew">New Password</label>
                      <input
                        id="modalForgotNew"
                        type="password"
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                        required
                        autoFocus
                      />
                    </div>
                    <div className="pure-black-field">
                      <label htmlFor="modalForgotConfirm">Confirm New Password</label>
                      <input
                        id="modalForgotConfirm"
                        type="password"
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="pure-black-submit-btn"
                      disabled={isSubmittingForgot}
                    >
                      {isSubmittingForgot ? 'Updating...' : 'Set New Password'}
                    </button>
                  </form>
                )}

                <div className="pure-black-modal-footer">
                  <button
                    type="button"
                    className="pure-black-back-btn"
                    onClick={() => {
                      setModalView('signin');
                      setForgotFeedback(null);
                    }}
                  >
                    &larr; Back to Sign In
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               4 · MAGIC LINK PASSWORDLESS WORKFLOW
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'magic' && (
              <div className="pure-black-form">
                <div className="pure-black-section-title">
                  Passwordless Pilot Access
                </div>
                <p className="pure-black-section-desc">
                  Email access codes require a connected account provider. Use your email and password to access this local account.
                </p>

                {magicFeedback && (
                  <div className="pure-black-alert info" role="status">
                    {magicFeedback}
                  </div>
                )}

                {magicStep === 1 && (
                  <form onSubmit={handleRequestMagicCode}>
                    <div className="pure-black-field">
                      <label htmlFor="modalMagicEmail">Pilot Email</label>
                      <input
                        id="modalMagicEmail"
                        type="email"
                        value={magicEmail}
                        onChange={(e) => setMagicEmail(e.target.value)}
                        placeholder="pilot@cockpit.org"
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="pure-black-submit-btn"
                      disabled={isSubmittingMagic}
                    >
                      {isSubmittingMagic ? 'Generating Access Code...' : 'Send Access Code &rarr;'}
                    </button>
                  </form>
                )}

                {magicStep === 2 && (
                  <form onSubmit={handleVerifyMagicCode}>
                    <div className="pure-black-field">
                      <label htmlFor="modalMagicCodeInput">Enter 6-Digit Access Code</label>
                      <input
                        id="modalMagicCodeInput"
                        type="text"
                        value={magicCode}
                        onChange={(e) => setMagicCode(e.target.value)}
                        placeholder="e.g. 742-190"
                        maxLength={8}
                        required
                        autoFocus
                      />
                      {magicGeneratedCode && (
                        <span className="pure-black-field-hint" style={{ color: '#38bdf8' }}>
                          Access code sent to {magicEmail}: <strong>{magicGeneratedCode}</strong> {magicExpiresAt ? '(Valid for 15 mins)' : ''}
                        </span>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="pure-black-submit-btn"
                      disabled={isSubmittingMagic}
                    >
                      {isSubmittingMagic ? 'Verifying...' : 'Verify Code & Enter Cockpit &rarr;'}
                    </button>
                    <button
                      type="button"
                      className="pure-black-inline-link"
                      style={{ marginTop: '10px', display: 'block', textAlign: 'center' }}
                      onClick={() => setMagicStep(1)}
                    >
                      Request a new code
                    </button>
                  </form>
                )}

                <div className="pure-black-modal-footer">
                  <button
                    type="button"
                    className="pure-black-back-btn"
                    onClick={() => setModalView('signin')}
                  >
                    &larr; Back to Regular Sign In
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               5 · PILOT ACCOUNT & CREDENTIALS MANAGEMENT
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'account' && (
              <div className="pure-black-form">
                <div className="pure-black-section-title">
                  Pilot Account &amp; Flight Credentials
                </div>

                {accountFeedback && (
                  <div
                    className={`pure-black-alert ${accountFeedback.isError ? 'error' : 'info'}`}
                    role="alert"
                  >
                    {accountFeedback.message}
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="pure-black-account-section">
                  <div className="pure-black-field">
                    <label htmlFor="modalAccountName">Pilot Name</label>
                    <input
                      id="modalAccountName"
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </div>

                  <div className="pure-black-field">
                    <label htmlFor="modalAccountLicense">License / Registration</label>
                    <input
                      id="modalAccountLicense"
                      type="text"
                      value={profileLicense}
                      onChange={(e) => setProfileLicense(e.target.value)}
                    />
                  </div>

                  <div className="pure-black-field">
                    <label htmlFor="modalAccountHome">Home Base ICAO (e.g. LPCS, KJFK)</label>
                    <input
                      id="modalAccountHome"
                      type="text"
                      value={profileHomeBase}
                      onChange={(e) => setProfileHomeBase(e.target.value)}
                      maxLength={4}
                    />
                  </div>

                  <button
                    type="submit"
                    className="pure-black-secondary-btn"
                    disabled={isSubmittingAccount}
                  >
                    {isSubmittingAccount ? 'Saving...' : 'Update Pilot Info'}
                  </button>
                </form>

                <div className="pure-black-divider">
                  <span>security // change password</span>
                </div>

                <form onSubmit={handleChangePassword} className="pure-black-account-section">
                  <div className="pure-black-field">
                    <label htmlFor="modalCurrentPwd">Current Password</label>
                    <input
                      id="modalCurrentPwd"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••••••"
                    />
                  </div>

                  <div className="pure-black-field">
                    <label htmlFor="modalNewPwd">New Password</label>
                    <input
                      id="modalNewPwd"
                      type="password"
                      value={newAccountPassword}
                      onChange={(e) => setNewAccountPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                    />
                  </div>

                  <div className="pure-black-field">
                    <label htmlFor="modalConfirmPwd">Confirm New Password</label>
                    <input
                      id="modalConfirmPwd"
                      type="password"
                      value={confirmAccountPassword}
                      onChange={(e) => setConfirmAccountPassword(e.target.value)}
                      placeholder="Repeat new password"
                    />
                  </div>

                  <button
                    type="submit"
                    className="pure-black-secondary-btn"
                    disabled={isSubmittingAccount}
                  >
                    Change Master Password
                  </button>
                </form>

                <div className="pure-black-modal-footer">
                  <button
                    type="button"
                    className="pure-black-danger-btn"
                    onClick={handleSignOut}
                  >
                    Sign Out of Cockpit
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               6 · TERMS OF SERVICE & PRIVACY POLICY MODALS
               ══════════════════════════════════════════════════════════════ */}
            {(modalView === 'terms' || modalView === 'privacy') && (
              <div className="pure-black-legal-box">
                <div className="pure-black-section-title">
                  {modalView === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                  <span className="pure-black-version-tag">
                    Version {CURRENT_LEGAL_VERSION}
                  </span>
                </div>
                <div className="pure-black-legal-scroll">
                  <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: '12px', fontSize: '12px' }}>
                    {LEGAL_DOCUMENT_TITLE}
                  </div>
                  {LEGAL_SECTIONS.map((sec) => (
                    <div key={sec.id} style={{ marginBottom: '16px' }}>
                      <div style={{ color: sec.isCallout ? '#f59e0b' : '#38bdf8', fontWeight: 600, fontSize: '11px', marginBottom: '6px' }}>
                        {sec.title}
                      </div>
                      {sec.content.map((p, pIdx) => (
                        <p key={pIdx} style={{ fontSize: '11px', lineHeight: 1.5, color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 6px 0' }}>
                          {p}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="pure-black-modal-footer">
                  <button
                    type="button"
                    className="pure-black-back-btn"
                    onClick={() => setModalView('register')}
                  >
                    &larr; Back to Registration
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════
               7 · GOOGLE IDENTITY SERVICES CONFIGURATION MODAL
               ══════════════════════════════════════════════════════════════ */}
            {modalView === 'google-setup' && (
              <div className="pure-black-form">
                <div className="pure-black-section-title">
                  Google Identity Services Setup
                </div>
                <p className="pure-black-section-desc">
                  Live Google Sign-In requires an authorized Google Cloud OAuth 2.0 Client ID (<code style={{ color: '#38bdf8' }}>VITE_GOOGLE_CLIENT_ID</code>).
                </p>

                {googleAuthError && (
                  <div className="pure-black-alert error" role="alert">
                    {googleAuthError}
                  </div>
                )}

                <div className="pure-black-alert info">
                  <strong>Production OAuth Requirement:</strong> Google requires registered origins and client credentials to issue live identity tokens.
                </div>

                <form onSubmit={handleSaveGoogleClientId}>
                  <div className="pure-black-field">
                    <label htmlFor="googleClientIdInput">Enter Google OAuth Client ID</label>
                    <input
                      id="googleClientIdInput"
                      type="text"
                      value={googleClientInput}
                      onChange={(e) => setGoogleClientInput(e.target.value)}
                      placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                      required
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="pure-black-submit-btn">
                    Save Client ID &amp; Connect Google &rarr;
                  </button>
                </form>

                <div className="pure-black-divider">
                  <span>or use built-in authentication</span>
                </div>

                <button
                  type="button"
                  className="pure-black-submit-btn"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
                  onClick={() => {
                    setModalView('register');
                    setGoogleAuthError(null);
                  }}
                >
                  Register with Email &amp; Master Password instead &rarr;
                </button>

                <div className="pure-black-modal-footer">
                  <button
                    type="button"
                    className="pure-black-back-btn"
                    onClick={() => {
                      setModalView('signin');
                      setGoogleAuthError(null);
                    }}
                  >
                    &larr; Back to Sign In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
