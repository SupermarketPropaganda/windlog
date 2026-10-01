import React, { useState, useEffect } from 'react';
import { ActiveView, AircraftProfile, FuelUnit } from '../types';
import { useAuth } from '../context/AuthContext';
import { AIRCRAFT_PRESETS } from './AircraftBar';
import { getStorageItemSync, setStorageItem } from '../data/storage-manager';

export interface AuthPageProps {
  onNavigate: (view: ActiveView) => void;
  profile?: AircraftProfile;
  onProfileChange?: (profile: AircraftProfile) => void;
  initialTab?: 'signin' | 'register' | 'profile';
}

type AuthTab = 'signin' | 'register' | 'forgot' | 'profile' | 'security';

export const AuthPage: React.FC<AuthPageProps> = ({
  onNavigate,
  profile,
  onProfileChange,
  initialTab,
}) => {
  const {
    user,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    resetPasswordWithNew,
    changePassword,
    updateProfile,
    error,
    clearError,
    isLoading,
  } = useAuth();

  // ─── Authentication Credentials State (Preserved for Security Audit Tests) ───
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');

  // ─── Reset Password State ───
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  // ─── UI & Feedback Toggles ───
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Determine initial active tab based on authentication state, prop, or URL hash
  const [activeTab, setActiveTab] = useState<AuthTab>(() => {
    const isRealUser = isAuthenticated && user && !user.id.startsWith('guest_');
    if (isRealUser) return 'profile';

    if (initialTab) return initialTab;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#login' || hash === '#signin') return 'signin';
      if (hash === '#register' || hash === '#signup') return 'register';
      if (hash === '#profile' || hash === '#settings') return 'profile';
    }
    return 'signin';
  });

  // Listen for hash changes if user navigates via URL
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.toLowerCase();
      const isRealUser = isAuthenticated && user && !user.id.startsWith('guest_');
      if (hash === '#login' || hash === '#signin') {
        setActiveTab('signin');
      } else if (hash === '#register' || hash === '#signup') {
        setActiveTab('register');
      } else if (hash === '#profile' || hash === '#settings') {
        setActiveTab('profile');
      } else if (isRealUser) {
        setActiveTab('profile');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [isAuthenticated, user]);

  // If user signs in or out, align the active tab
  useEffect(() => {
    const isRealUser = isAuthenticated && user && !user.id.startsWith('guest_');
    if (isRealUser && (activeTab === 'signin' || activeTab === 'register' || activeTab === 'forgot')) {
      setActiveTab('profile');
    }
  }, [isAuthenticated, user]);

  // ─── Change Password State (Authenticated Pilots) ───
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // ─── Direct Editable Pilot Identity & Station ───
  const [editDisplayName, setEditDisplayName] = useState<string>(() => {
    return user?.displayName || getStorageItemSync<string>('windlog_pilot_name', '') || '';
  });
  const [editLicense, setEditLicense] = useState<string>(() => {
    return user?.pilotLicense || getStorageItemSync<string>('windlog_pilot_license', '') || '';
  });
  const [editHomeBase, setEditHomeBase] = useState<string>(() => {
    return user?.homeBaseAirport || getStorageItemSync<string>('windlog_home_base', '') || '';
  });
  const [editAutoFillHomeBase, setEditAutoFillHomeBase] = useState<boolean>(() => {
    return getStorageItemSync<boolean>('windlog_auto_home_base', false);
  });

  // ─── Direct Editable Flight Planning Defaults ───
  const [editAircraftModel, setEditAircraftModel] = useState<string>(() => {
    return (
      profile?.aircraftModel ||
      getStorageItemSync<any>('windlog_profile', null)?.aircraftModel ||
      'c172'
    );
  });
  const [editCruiseAltitude, setEditCruiseAltitude] = useState<string>(() => {
    const val =
      profile?.cruiseAltitude ??
      getStorageItemSync<any>('windlog_profile', null)?.cruiseAltitude ??
      4500;
    return val.toString();
  });
  const [editTas, setEditTas] = useState<string>(() => {
    const val =
      profile?.tas ?? getStorageItemSync<any>('windlog_profile', null)?.tas ?? 105;
    return val.toString();
  });
  const [editFuelFlow, setEditFuelFlow] = useState<string>(() => {
    const val =
      profile?.fuelFlow ??
      getStorageItemSync<any>('windlog_profile', null)?.fuelFlow ??
      8.5;
    return val.toString();
  });
  const [editFuelUnit, setEditFuelUnit] = useState<FuelUnit>(() => {
    return (
      profile?.fuelUnit ||
      getStorageItemSync<any>('windlog_profile', null)?.fuelUnit ||
      'gph'
    );
  });
  const [editReserveFuelMinutes, setEditReserveFuelMinutes] = useState<number>(() => {
    return getStorageItemSync<number>('windlog_reserve_fuel_mins', 45);
  });

  // ─── Direct Editable Units & Cockpit Preferences ───
  const [editAltimeterUnit, setEditAltimeterUnit] = useState<'hPa' | 'inHg'>(() => {
    return getStorageItemSync<'hPa' | 'inHg'>('windlog_altimeter_unit', 'hPa');
  });

  // Update local states when user changes (e.g. on sign in)
  useEffect(() => {
    if (user && !user.id.startsWith('guest_')) {
      if (user.displayName) setEditDisplayName(user.displayName);
      if (user.pilotLicense) setEditLicense(user.pilotLicense);
      if (user.homeBaseAirport) setEditHomeBase(user.homeBaseAirport);
      if (user.preferences) {
        if (user.preferences.defaultAircraftModel) setEditAircraftModel(user.preferences.defaultAircraftModel);
        if (user.preferences.defaultCruiseAltitude) setEditCruiseAltitude(user.preferences.defaultCruiseAltitude.toString());
        if (user.preferences.defaultTas) setEditTas(user.preferences.defaultTas.toString());
        if (user.preferences.defaultFuelFlow) setEditFuelFlow(user.preferences.defaultFuelFlow.toString());
        if (user.preferences.defaultFuelUnit) setEditFuelUnit(user.preferences.defaultFuelUnit);
        if (user.preferences.altimeterUnit) setEditAltimeterUnit(user.preferences.altimeterUnit);
        if (user.preferences.reserveFuelMinutes) setEditReserveFuelMinutes(user.preferences.reserveFuelMinutes);
        if (user.preferences.autoFillHomeBase !== undefined) setEditAutoFillHomeBase(user.preferences.autoFillHomeBase);
      }
    }
  }, [user]);

  // Handle Aircraft Preset Selection
  const handleSelectAircraftPreset = (presetId: string) => {
    setEditAircraftModel(presetId);
    const preset = AIRCRAFT_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.id !== 'custom') {
      setEditCruiseAltitude(preset.cruiseAltitude.toString());
      setEditTas(preset.tas.toString());
      setEditFuelFlow(preset.fuelFlow.toString());
      setEditFuelUnit(preset.fuelUnit);
    }
  };

  // ─── Save All Preferences & Defaults ───
  const handleSaveAllPreferences = async () => {
    setIsSaving(true);
    setProfileErrorMsg(null);
    setProfileSuccessMsg(null);

    try {
      const sanitizedHomeBase = editHomeBase.trim().toUpperCase();
      const sanitizedLicense = editLicense.trim().toUpperCase();
      const sanitizedDisplayName = editDisplayName.trim();

      const altNum = Math.max(500, Math.min(45000, parseInt(editCruiseAltitude, 10) || 4500));
      const tasNum = Math.max(30, Math.min(500, parseInt(editTas, 10) || 105));
      const flowNum = Math.max(0.5, Math.min(300, parseFloat(editFuelFlow) || 8.5));

      // 1. Persist local storage keys
      setStorageItem('windlog_pilot_name', sanitizedDisplayName);
      setStorageItem('windlog_pilot_license', sanitizedLicense);
      setStorageItem('windlog_home_base', sanitizedHomeBase);
      setStorageItem('windlog_auto_home_base', editAutoFillHomeBase);
      setStorageItem('windlog_altimeter_unit', editAltimeterUnit);
      setStorageItem('windlog_reserve_fuel_mins', editReserveFuelMinutes);

      const updatedProfile: AircraftProfile = {
        aircraftModel: editAircraftModel,
        cruiseAltitude: altNum,
        tas: tasNum,
        fuelFlow: flowNum,
        fuelUnit: editFuelUnit,
      };
      setStorageItem('windlog_profile', updatedProfile);

      // 2. Propagate to App state
      if (onProfileChange) {
        onProfileChange(updatedProfile);
      }

      // 3. Update User profile in auth context if signed in
      if (isAuthenticated && user) {
        await updateProfile({
          displayName: sanitizedDisplayName || user.displayName,
          pilotLicense: sanitizedLicense || undefined,
          homeBaseAirport: sanitizedHomeBase || undefined,
          preferences: {
            homeBaseAirport: sanitizedHomeBase,
            autoFillHomeBase: editAutoFillHomeBase,
            defaultAircraftModel: editAircraftModel,
            defaultCruiseAltitude: altNum,
            defaultTas: tasNum,
            defaultFuelFlow: flowNum,
            defaultFuelUnit: editFuelUnit,
            altimeterUnit: editAltimeterUnit,
            reserveFuelMinutes: editReserveFuelMinutes,
          },
        });
      }

      setProfileSuccessMsg('Pilot profile & flight planning defaults saved successfully.');
      setTimeout(() => setProfileSuccessMsg(null), 3500);
    } catch (err: any) {
      setProfileErrorMsg(err?.message || 'Failed to save preferences.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Change Password Handler (Authenticated) ───
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters.');
      return;
    }

    try {
      await changePassword(oldPassword, newPassword);
      setPasswordChangeSuccess('Password updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => {
        setPasswordChangeSuccess(null);
        setIsChangingPassword(false);
      }, 2500);
    } catch (err: any) {
      setPasswordChangeError(err?.message || 'Failed to change password.');
    }
  };

  // ─── Sign In Submit Handler ───
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProfileErrorMsg(null);
    setIsSubmitting(true);

    try {
      const signedInUser = await signIn(signInEmail, signInPassword);
      const pilotTitle = signedInUser.displayName || signedInUser.email.split('@')[0];
      setProfileSuccessMsg(`Welcome back, Captain ${pilotTitle}! Authentication verified.`);
      setTimeout(() => {
        setProfileSuccessMsg(null);
        onNavigate('navlog');
      }, 1200);
    } catch (err: any) {
      setProfileErrorMsg(err?.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Register Submit Handler ───
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setProfileErrorMsg(null);

    const emailTrim = signUpEmail.trim().toLowerCase();
    if (!emailTrim || !emailTrim.includes('@') || !emailTrim.includes('.')) {
      setProfileErrorMsg('Please provide a valid pilot email address.');
      return;
    }

    if (signUpPassword.length < 6) {
      setProfileErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (signUpPassword !== signUpConfirmPassword) {
      setProfileErrorMsg('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newUser = await signUp({
        email: emailTrim,
        password: signUpPassword,
        displayName: editDisplayName.trim() || emailTrim.split('@')[0],
        pilotLicense: editLicense.trim().toUpperCase() || undefined,
        homeBaseAirport: editHomeBase.trim().toUpperCase() || undefined,
        preferences: {
          homeBaseAirport: editHomeBase.trim().toUpperCase() || undefined,
          autoFillHomeBase: editAutoFillHomeBase,
          defaultAircraftModel: editAircraftModel,
          defaultCruiseAltitude: parseInt(editCruiseAltitude, 10) || 4500,
          defaultTas: parseInt(editTas, 10) || 105,
          defaultFuelFlow: parseFloat(editFuelFlow) || 8.5,
          defaultFuelUnit: editFuelUnit,
          altimeterUnit: editAltimeterUnit,
          reserveFuelMinutes: editReserveFuelMinutes,
        },
      });

      const pilotTitle = newUser.displayName || newUser.email.split('@')[0];
      setProfileSuccessMsg(`Welcome aboard, Captain ${pilotTitle}! Cloud Pilot Account created.`);
      setTimeout(() => {
        setProfileSuccessMsg(null);
        onNavigate('navlog');
      }, 1200);
    } catch (err: any) {
      setProfileErrorMsg(err?.message || 'Failed to create account. Please check details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Reset Password Submit Handler ───
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setResetFeedback(null);
    setProfileErrorMsg(null);

    const emailTrim = forgotEmail.trim().toLowerCase();
    if (!emailTrim || !emailTrim.includes('@')) {
      setProfileErrorMsg('Please enter a valid pilot email address.');
      return;
    }

    if (resetNewPassword.length < 6) {
      setProfileErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setProfileErrorMsg('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resetPasswordWithNew(emailTrim, resetNewPassword);
      setResetFeedback(res.message);
      setSignInEmail(emailTrim);
      setTimeout(() => {
        setActiveTab('signin');
        setResetFeedback(null);
      }, 2000);
    } catch (err: any) {
      setProfileErrorMsg(err?.message || 'Password reset request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRealPilotUser = Boolean(isAuthenticated && user && !user.id.startsWith('guest_'));
  const displayName = editDisplayName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Pilot');
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'P';

  return (
    <div className="profile-view-container">
      {/* Toast Feedback Banner */}
      {profileSuccessMsg && (
        <div className="toast-notification">✓ {profileSuccessMsg}</div>
      )}

      {/* Mode Switcher Navigation Bar */}
      <div className="auth-mode-selector-bar">
        {!isRealPilotUser ? (
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${activeTab === 'signin' ? 'active' : ''}`}
              onClick={() => {
                clearError();
                setProfileErrorMsg(null);
                setActiveTab('signin');
              }}
            >
              <span className="auth-tab-icon">🔑</span> Sign In
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => {
                clearError();
                setProfileErrorMsg(null);
                setActiveTab('register');
              }}
            >
              <span className="auth-tab-icon">📝</span> Create Pilot Account
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => {
                clearError();
                setProfileErrorMsg(null);
                setActiveTab('profile');
              }}
            >
              <span className="auth-tab-icon">⚙️</span> Cockpit Defaults
            </button>
            {activeTab === 'forgot' && (
              <button type="button" className="auth-mode-tab active">
                <span className="auth-tab-icon">🔄</span> Reset Password
              </button>
            )}
          </div>
        ) : (
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-mode-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <span className="auth-tab-icon">⚙️</span> Cockpit Preferences &amp; Defaults
            </button>
            <button
              type="button"
              className={`auth-mode-tab ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <span className="auth-tab-icon">☁️</span> Account &amp; Security
            </button>
          </div>
        )}
      </div>

      {/* Error & Feedback Banners */}
      {(profileErrorMsg || error) && (
        <div className="auth-feedback-banner error">
          <span>⚠️ {profileErrorMsg || error}</span>
          <button
            type="button"
            className="banner-close-btn"
            onClick={() => {
              setProfileErrorMsg(null);
              clearError();
            }}
          >
            ✕
          </button>
        </div>
      )}

      {resetFeedback && (
        <div className="auth-feedback-banner success">
          <span>✓ {resetFeedback}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. FOCUSED SIGN IN VIEW
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'signin' && (
        <div className="auth-focused-card-wrapper">
          <div className="auth-focused-card">
            <div className="auth-card-top-brand">
              <div className="auth-airplane-logo">✈</div>
              <h2 className="auth-title">Pilot Sign In</h2>
              <p className="auth-subtitle">
                Access your cloud flight routes, aircraft profiles, and navigation logs
              </p>
            </div>

            <form onSubmit={handleSignInSubmit} className="auth-focused-form">
              <div className="profile-field">
                <label className="profile-label">Pilot Email</label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">✉️</span>
                  <input
                    type="email"
                    className="profile-input auth-styled-input"
                    placeholder="pilot@cockpit.aero"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="profile-field">
                <div className="profile-field-header">
                  <label className="profile-label">Password</label>
                  <button
                    type="button"
                    className="auth-sub-link"
                    onClick={() => {
                      clearError();
                      setProfileErrorMsg(null);
                      setForgotEmail(signInEmail);
                      setActiveTab('forgot');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="auth-input-container">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="profile-input auth-styled-input"
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈 Hide' : '👁️ Show'}
                  </button>
                </div>
              </div>

              <div className="auth-remember-row">
                <label className="auth-remember-label">
                  <input
                    type="checkbox"
                    className="profile-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Keep me signed in on this flight deck</span>
                </label>
              </div>

              <button
                type="submit"
                className="profile-save-btn full auth-btn-lg"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? 'Authenticating Pilot...' : 'Sign In to Cockpit ✈'}
              </button>

              <div className="auth-card-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="auth-guest-option-btn"
                onClick={() => {
                  onNavigate('navlog');
                }}
              >
                Continue as Guest Pilot ➔
              </button>

              <div className="auth-footer-prompt">
                <span>New to WindLog?</span>{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => {
                    clearError();
                    setProfileErrorMsg(null);
                    setActiveTab('register');
                  }}
                >
                  Create a Cloud Pilot Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. FOCUSED CREATE PILOT ACCOUNT (REGISTER) VIEW
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'register' && (
        <div className="auth-focused-card-wrapper">
          <div className="auth-focused-card wide">
            <div className="auth-card-top-brand">
              <div className="auth-airplane-logo register">✈</div>
              <h2 className="auth-title">Create Cloud Pilot Profile</h2>
              <p className="auth-subtitle">
                Register to sync your flight plans, aircraft defaults, and custom waypoints
              </p>
            </div>

            <form onSubmit={handleSignUpSubmit} className="auth-focused-form">
              <div className="profile-input-row">
                <div className="profile-field">
                  <label className="profile-label">Pilot Email *</label>
                  <div className="auth-input-container">
                    <span className="auth-input-icon">✉️</span>
                    <input
                      type="email"
                      className="profile-input auth-styled-input"
                      placeholder="pilot@cockpit.aero"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      required
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-label">Callsign / Pilot Name *</label>
                  <div className="auth-input-container">
                    <span className="auth-input-icon">👤</span>
                    <input
                      type="text"
                      className="profile-input auth-styled-input"
                      placeholder="e.g. Capt. Maverick or N172SP"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="profile-input-row">
                <div className="profile-field">
                  <label className="profile-label">Pilot License / Rating (optional)</label>
                  <input
                    type="text"
                    className="profile-input"
                    placeholder="e.g. PPL(A), CPL-IR, ATPL"
                    value={editLicense}
                    onChange={(e) => setEditLicense(e.target.value)}
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-label">Home Base Airport (ICAO, optional)</label>
                  <div className="profile-input-with-badge">
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="e.g. LPCS"
                      value={editHomeBase}
                      onChange={(e) => setEditHomeBase(e.target.value.toUpperCase())}
                      maxLength={4}
                    />
                    <span className="profile-input-badge">ICAO</span>
                  </div>
                </div>
              </div>

              <div className="profile-input-row">
                <div className="profile-field">
                  <label className="profile-label">Password * (min 6 chars)</label>
                  <div className="auth-input-container">
                    <span className="auth-input-icon">🔒</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="profile-input auth-styled-input"
                      placeholder="••••••••"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-label">Confirm Password *</label>
                  <div className="auth-input-container">
                    <span className="auth-input-icon">🔒</span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="profile-input auth-styled-input"
                      placeholder="••••••••"
                      value={signUpConfirmPassword}
                      onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Matching Feedback */}
              {signUpConfirmPassword.length > 0 && (
                <div className="auth-password-match-indicator">
                  {signUpPassword === signUpConfirmPassword ? (
                    <span className="match-ok">✓ Passwords match</span>
                  ) : (
                    <span className="match-fail">✕ Passwords do not match</span>
                  )}
                </div>
              )}

              <div className="auth-sync-benefit-card">
                <div className="benefit-icon">☁️</div>
                <div className="benefit-text">
                  <strong>Automatic Cloud Sync:</strong> Any routes and custom waypoints you've created will be
                  automatically linked to your new account.
                </div>
              </div>

              <button
                type="submit"
                className="profile-save-btn full auth-btn-lg"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? 'Registering Pilot Account...' : 'Register Pilot Account & Sync Flights ☁'}
              </button>

              <div className="auth-footer-prompt">
                <span>Already have a pilot account?</span>{' '}
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => {
                    clearError();
                    setProfileErrorMsg(null);
                    setActiveTab('signin');
                  }}
                >
                  Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. FORGOT / RESET PASSWORD VIEW
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'forgot' && (
        <div className="auth-focused-card-wrapper">
          <div className="auth-focused-card">
            <div className="auth-card-top-brand">
              <div className="auth-airplane-logo forgot">🔄</div>
              <h2 className="auth-title">Reset Pilot Password</h2>
              <p className="auth-subtitle">
                Set a new password for your pilot credentials to regain access to your cockpit
              </p>
            </div>

            <form onSubmit={handleResetSubmit} className="auth-focused-form">
              <div className="profile-field">
                <label className="profile-label">Registered Pilot Email</label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">✉️</span>
                  <input
                    type="email"
                    className="profile-input auth-styled-input"
                    placeholder="pilot@cockpit.aero"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="profile-field">
                <label className="profile-label">New Password (min 6 chars)</label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="profile-input auth-styled-input"
                    placeholder="••••••••"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="profile-field">
                <label className="profile-label">Confirm New Password</label>
                <div className="auth-input-container">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="profile-input auth-styled-input"
                    placeholder="••••••••"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="profile-save-btn full auth-btn-lg"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? 'Updating Password...' : 'Reset Password & Proceed to Sign In'}
              </button>

              <div className="auth-footer-prompt">
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => {
                    clearError();
                    setProfileErrorMsg(null);
                    setActiveTab('signin');
                  }}
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. COCKPIT PREFERENCES & FLIGHT DEFAULTS VIEW
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <>
          {/* Top Pilot Profile Header Card */}
          <div className="profile-header-card">
            <div className="profile-header-left">
              <div className="profile-avatar-circle" title="Pilot Avatar">
                {initials}
              </div>
              <div className="profile-header-meta">
                <div className="profile-name-row">
                  <h1 className="profile-name-title">{displayName}</h1>
                  <span className={`profile-status-badge ${isRealPilotUser ? 'cloud' : 'guest'}`}>
                    {isRealPilotUser ? '☁ Cloud Synced' : '💾 Local Guest Pilot'}
                  </span>
                </div>
                <div className="profile-pills-row">
                  <span className="profile-pill">
                    🪪 {editLicense.trim() ? editLicense.trim().toUpperCase() : 'No License Set'}
                  </span>
                  <span className="profile-pill">
                    📍 Base: {editHomeBase.trim() ? editHomeBase.trim().toUpperCase() : 'None'}
                  </span>
                  <span className="profile-pill">
                    ✈ {AIRCRAFT_PRESETS.find((p) => p.id === editAircraftModel)?.name || 'Custom Aircraft'}
                  </span>
                </div>
              </div>
            </div>

            <div className="profile-header-actions">
              <button
                type="button"
                className="profile-save-btn"
                onClick={handleSaveAllPreferences}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : '💾 Save Preferences'}
              </button>

              {isRealPilotUser ? (
                <button
                  type="button"
                  className="profile-signout-btn"
                  onClick={async () => {
                    await signOut();
                    setActiveTab('signin');
                  }}
                >
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={() => setActiveTab('signin')}
                >
                  Sign In / Register
                </button>
              )}
            </div>
          </div>

          {/* Spacious 4-Card Dashboard Grid */}
          <div className="profile-grid">
            {/* Card 1: Pilot Identity & Station */}
            <div className="profile-card">
              <div className="profile-card-header">
                <span className="profile-card-icon">👤</span>
                <div>
                  <h2 className="profile-card-title">Pilot Identity &amp; Station</h2>
                  <p className="profile-card-subtitle">
                    Callsign, flight license, ratings, and home base airport
                  </p>
                </div>
              </div>

              <div className="profile-form-body">
                <div className="profile-field">
                  <label className="profile-label">Callsign / Display Name</label>
                  <input
                    type="text"
                    className="profile-input"
                    placeholder="e.g. Capt. Maverick or N172SP"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                  />
                </div>

                <div className="profile-input-row">
                  <div className="profile-field">
                    <label className="profile-label">Pilot License / Rating</label>
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="e.g. PPL(A), CPL-IR, ATPL"
                      value={editLicense}
                      onChange={(e) => setEditLicense(e.target.value)}
                    />
                  </div>

                  <div className="profile-field">
                    <label className="profile-label">Home Base Airport (ICAO)</label>
                    <div className="profile-input-with-badge">
                      <input
                        type="text"
                        className="profile-input"
                        placeholder="e.g. LPCS"
                        value={editHomeBase}
                        onChange={(e) => setEditHomeBase(e.target.value.toUpperCase())}
                        maxLength={4}
                      />
                      <span className="profile-input-badge">ICAO</span>
                    </div>
                  </div>
                </div>

                <div className="profile-checkbox-card">
                  <label className="profile-checkbox-label">
                    <input
                      type="checkbox"
                      className="profile-checkbox"
                      checked={editAutoFillHomeBase}
                      onChange={(e) => setEditAutoFillHomeBase(e.target.checked)}
                    />
                    <div className="profile-checkbox-content">
                      <span className="profile-checkbox-title">
                        Auto-fill Home Base as departure in Flight Planner
                      </span>
                      <span className="profile-checkbox-desc">
                        When opening a blank flight plan or clearing the route, automatically populates{' '}
                        {editHomeBase ? `"${editHomeBase.toUpperCase()}"` : 'your home base'} as departure.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Card 2: Flight Planning Defaults */}
            <div className="profile-card">
              <div className="profile-card-header">
                <span className="profile-card-icon">✈️</span>
                <div>
                  <h2 className="profile-card-title">Flight Planning Defaults</h2>
                  <p className="profile-card-subtitle">
                    Default aircraft performance, cruise altitude, TAS, and fuel burn
                  </p>
                </div>
              </div>

              <div className="profile-form-body">
                <div className="profile-field">
                  <label className="profile-label">Default Aircraft Preset</label>
                  <select
                    className="profile-select"
                    value={editAircraftModel}
                    onChange={(e) => handleSelectAircraftPreset(e.target.value)}
                  >
                    <optgroup label="Standard Aircraft Presets">
                      {AIRCRAFT_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} ({preset.tas} KT • {preset.fuelFlow} {preset.fuelUnit.toUpperCase()})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="profile-input-row">
                  <div className="profile-field">
                    <label className="profile-label">Default Cruise Altitude</label>
                    <div className="profile-input-with-badge">
                      <input
                        type="number"
                        step="500"
                        min="500"
                        max="45000"
                        className="profile-input"
                        value={editCruiseAltitude}
                        onChange={(e) => setEditCruiseAltitude(e.target.value)}
                      />
                      <span className="profile-input-badge">FT MSL</span>
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-label">Default True Airspeed (TAS)</label>
                    <div className="profile-input-with-badge">
                      <input
                        type="number"
                        step="1"
                        min="30"
                        max="500"
                        className="profile-input"
                        value={editTas}
                        onChange={(e) => setEditTas(e.target.value)}
                      />
                      <span className="profile-input-badge">KT</span>
                    </div>
                  </div>
                </div>

                <div className="profile-input-row">
                  <div className="profile-field">
                    <label className="profile-label">Default Fuel Burn Rate</label>
                    <div className="profile-input-with-badge">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="300"
                        className="profile-input"
                        value={editFuelFlow}
                        onChange={(e) => setEditFuelFlow(e.target.value)}
                      />
                      <span className="profile-input-badge">
                        {editFuelUnit === 'gph' ? 'GPH' : 'L/h'}
                      </span>
                    </div>
                  </div>

                  <div className="profile-field">
                    <label className="profile-label">Fuel Consumption Unit</label>
                    <div className="profile-segmented-control">
                      <button
                        type="button"
                        className={`profile-segment-btn ${editFuelUnit === 'gph' ? 'active' : ''}`}
                        onClick={() => setEditFuelUnit('gph')}
                      >
                        US Gallons (GPH)
                      </button>
                      <button
                        type="button"
                        className={`profile-segment-btn ${editFuelUnit === 'lph' ? 'active' : ''}`}
                        onClick={() => setEditFuelUnit('lph')}
                      >
                        Liters (L/h)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-label">VFR Reserve Fuel Policy</label>
                  <div className="profile-segmented-control triple">
                    <button
                      type="button"
                      className={`profile-segment-btn ${editReserveFuelMinutes === 30 ? 'active' : ''}`}
                      onClick={() => setEditReserveFuelMinutes(30)}
                      title="FAA 14 CFR § 91.151 / EASA Part-NCO.OP.125 minimum"
                    >
                      30 min (Day VFR)
                    </button>
                    <button
                      type="button"
                      className={`profile-segment-btn ${editReserveFuelMinutes === 45 ? 'active' : ''}`}
                      onClick={() => setEditReserveFuelMinutes(45)}
                      title="Standard Night VFR / Cross-Country Reserve"
                    >
                      45 min (Night / Standard)
                    </button>
                    <button
                      type="button"
                      className={`profile-segment-btn ${editReserveFuelMinutes === 60 ? 'active' : ''}`}
                      onClick={() => setEditReserveFuelMinutes(60)}
                      title="Conservative Safety Margin / IFR Alternate"
                    >
                      60 min (Conservative)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Units of Measurement & Cockpit Preferences */}
            <div className="profile-card">
              <div className="profile-card-header">
                <span className="profile-card-icon">🧭</span>
                <div>
                  <h2 className="profile-card-title">Units &amp; Cockpit Preferences</h2>
                  <p className="profile-card-subtitle">
                    Aeronautical measurement standards across the Flight Planning Suite
                  </p>
                </div>
              </div>

              <div className="profile-form-body">
                <div className="profile-field">
                  <label className="profile-label">Altimeter Setting (QNH Pressure Unit)</label>
                  <div className="profile-segmented-control">
                    <button
                      type="button"
                      className={`profile-segment-btn ${editAltimeterUnit === 'hPa' ? 'active' : ''}`}
                      onClick={() => setEditAltimeterUnit('hPa')}
                    >
                      Hectopascals (hPa / mb)
                    </button>
                    <button
                      type="button"
                      className={`profile-segment-btn ${editAltimeterUnit === 'inHg' ? 'active' : ''}`}
                      onClick={() => setEditAltimeterUnit('inHg')}
                    >
                      Inches of Mercury (inHg)
                    </button>
                  </div>
                  <span className="profile-field-hint">
                    Standard European / ICAO (1013 hPa) vs US Aviation (29.92 inHg).
                  </span>
                </div>

                <div className="profile-field">
                  <label className="profile-label">Distance &amp; Airspeed Standard</label>
                  <div className="profile-fixed-badge-row">
                    <span className="profile-fixed-badge">
                      ⚓ Nautical Miles (NM) &amp; Knots (kt)
                    </span>
                    <span className="profile-field-hint">
                      ICAO Annex 5 mandatory worldwide aeronautical standard.
                    </span>
                  </div>
                </div>

                <div className="profile-field">
                  <label className="profile-label">Altitude Standard</label>
                  <div className="profile-fixed-badge-row">
                    <span className="profile-fixed-badge">
                      ⛰️ Feet MSL (ft)
                    </span>
                    <span className="profile-field-hint">
                      Barometric pressure altitude referenced to Mean Sea Level.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Pilot Account & Cloud Sync */}
            <div className="profile-card">
              <div className="profile-card-header">
                <span className="profile-card-icon">☁️</span>
                <div>
                  <h2 className="profile-card-title">Pilot Account &amp; Cloud Sync</h2>
                  <p className="profile-card-subtitle">
                    Cross-device route sync, cloud backups, and security credentials
                  </p>
                </div>
              </div>

              <div className="profile-form-body">
                {isRealPilotUser && user ? (
                  <div className="profile-authenticated-info">
                    <div className="profile-info-row">
                      <span className="profile-info-label">Account Email:</span>
                      <span className="profile-info-value">
                        {user.email} <span className="profile-verified-tag">✓ Verified</span>
                      </span>
                    </div>

                    <div className="profile-info-row">
                      <span className="profile-info-label">Member Since:</span>
                      <span className="profile-info-value">
                        {new Date(user.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    {!isChangingPassword ? (
                      <div className="profile-account-actions">
                        <button
                          type="button"
                          className="profile-btn-secondary"
                          onClick={() => setIsChangingPassword(true)}
                        >
                          🔑 Change Password
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleChangePasswordSubmit} className="profile-password-form">
                        <h4 className="profile-subheading">Update Account Password</h4>
                        {passwordChangeError && (
                          <div className="auth-feedback-banner error">{passwordChangeError}</div>
                        )}
                        {passwordChangeSuccess && (
                          <div className="auth-feedback-banner success">{passwordChangeSuccess}</div>
                        )}

                        <div className="profile-field">
                          <label className="profile-label">Current Password</label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="profile-input"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                          />
                        </div>

                        <div className="profile-field">
                          <label className="profile-label">New Password (min 6 chars)</label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="profile-input"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            placeholder="••••••••"
                          />
                        </div>

                        <div className="profile-field">
                          <label className="profile-label">Confirm New Password</label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            className="profile-input"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            required
                            minLength={6}
                            placeholder="••••••••"
                          />
                        </div>

                        <div className="profile-btn-row">
                          <button type="submit" className="profile-save-btn">
                            Update Password
                          </button>
                          <button
                            type="button"
                            className="profile-btn-secondary"
                            onClick={() => {
                              setIsChangingPassword(false);
                              setPasswordChangeError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="profile-guest-card">
                    <div className="profile-guest-notice">
                      <div className="profile-guest-icon">🛡️</div>
                      <div>
                        <h4 className="profile-guest-title">Local Guest Pilot Mode</h4>
                        <p className="profile-guest-desc">
                          Your preferences and saved flights are securely stored directly in your browser.
                          Sign in or register to sync your flights across multiple cockpits and devices.
                        </p>
                      </div>
                    </div>

                    <div className="profile-btn-row">
                      <button
                        type="button"
                        className="profile-save-btn full"
                        onClick={() => setActiveTab('signin')}
                      >
                        Sign In with Existing Account ➔
                      </button>
                    </div>

                    <button
                      type="button"
                      className="profile-btn-secondary full"
                      onClick={() => setActiveTab('register')}
                    >
                      Create Free Cloud Pilot Account
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. ACCOUNT & SECURITY VIEW (AUTHENTICATED)
          ───────────────────────────────────────────────────────────── */}
      {activeTab === 'security' && isRealPilotUser && user && (
        <div className="auth-focused-card-wrapper">
          <div className="auth-focused-card wide">
            <div className="auth-card-top-brand">
              <div className="auth-airplane-logo">☁️</div>
              <h2 className="auth-title">Account &amp; Security</h2>
              <p className="auth-subtitle">
                Manage your credentials, pilot security, and cloud sync status
              </p>
            </div>

            <div className="profile-authenticated-info">
              <div className="profile-info-row">
                <span className="profile-info-label">Pilot Callsign / Display Name:</span>
                <span className="profile-info-value">{user.displayName || 'Pilot'}</span>
              </div>

              <div className="profile-info-row">
                <span className="profile-info-label">Verified Email Address:</span>
                <span className="profile-info-value">
                  {user.email} <span className="profile-verified-tag">✓ Verified</span>
                </span>
              </div>

              <div className="profile-info-row">
                <span className="profile-info-label">Member Since:</span>
                <span className="profile-info-value">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="profile-info-label">Last Flight Deck Login:</span>
                <span className="profile-info-value">
                  {new Date(user.lastLoginAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>

              {/* Password Change Form */}
              <div className="auth-password-change-box">
                <h3 className="profile-subheading">Change Account Password</h3>
                {passwordChangeError && (
                  <div className="auth-feedback-banner error">{passwordChangeError}</div>
                )}
                {passwordChangeSuccess && (
                  <div className="auth-feedback-banner success">{passwordChangeSuccess}</div>
                )}

                <form onSubmit={handleChangePasswordSubmit} className="profile-password-form">
                  <div className="profile-field">
                    <label className="profile-label">Current Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="profile-input"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="profile-input-row">
                    <div className="profile-field">
                      <label className="profile-label">New Password (min 6 chars)</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="profile-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="••••••••"
                      />
                    </div>

                    <div className="profile-field">
                      <label className="profile-label">Confirm New Password</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="profile-input"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="profile-btn-row">
                    <button type="submit" className="profile-save-btn">
                      Update Account Password
                    </button>
                  </div>
                </form>
              </div>

              <div className="auth-danger-zone">
                <button
                  type="button"
                  className="profile-signout-btn full"
                  onClick={async () => {
                    await signOut();
                    setActiveTab('signin');
                  }}
                >
                  Sign Out of Flight Deck
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
