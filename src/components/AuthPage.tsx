import React, { useState } from 'react';
import { ActiveView } from '../types';
import { useAuth } from '../context/AuthContext';

export interface AuthPageProps {
  onNavigate: (view: ActiveView) => void;
}

type AuthTab = 'signin' | 'signup' | 'forgot';

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, signIn, signInAsGuest, signUp, signOut, resetPassword, updateProfile, error, clearError, isLoading } =
    useAuth();

  const [currentTab, setCurrentTab] = useState<AuthTab>('signin');
  const [showPassword, setShowPassword] = useState(false);

  // Sign In Form State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign Up Form State
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [signUpLicense, setSignUpLicense] = useState('');
  const [signUpHomeBase, setSignUpHomeBase] = useState('');

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  // Profile Edit State (when authenticated)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editLicense, setEditLicense] = useState('');
  const [editHomeBase, setEditHomeBase] = useState('');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  const handleTabSwitch = (tab: AuthTab) => {
    clearError();
    setResetFeedback(null);
    setCurrentTab(tab);
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(signInEmail, signInPassword);
      onNavigate('navlog');
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signUpPassword !== signUpConfirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      await signUp({
        email: signUpEmail,
        password: signUpPassword,
        displayName: signUpDisplayName,
        pilotLicense: signUpLicense,
        homeBaseAirport: signUpHomeBase,
      });
      onNavigate('navlog');
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await resetPassword(forgotEmail);
      setResetFeedback(res.message);
    } catch {
      // Error handled by AuthContext
    }
  };

  const handleStartEditProfile = () => {
    if (!user) return;
    setEditDisplayName(user.displayName);
    setEditLicense(user.pilotLicense || '');
    setEditHomeBase(user.homeBaseAirport || '');
    setIsEditingProfile(true);
    setProfileSuccessMsg(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        displayName: editDisplayName,
        pilotLicense: editLicense ? editLicense.trim().toUpperCase() : undefined,
        homeBaseAirport: editHomeBase ? editHomeBase.trim().toUpperCase() : undefined,
      });
      setIsEditingProfile(false);
      setProfileSuccessMsg('Pilot profile updated successfully.');
      setTimeout(() => setProfileSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err?.message || 'Failed to update profile.');
    }
  };

  // If already authenticated, show the Pilot Account Profile
  if (isAuthenticated && user) {
    const initials = (user.displayName || user.email)
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    return (
      <div className="auth-page-container">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-avatar-circle">{initials}</div>
            <h2 className="auth-card-title">{user.displayName || 'Pilot Profile'}</h2>
            <div className="auth-card-email">{user.email}</div>
          </div>

          {profileSuccessMsg && (
            <div className="auth-feedback-banner success">{profileSuccessMsg}</div>
          )}

          {!isEditingProfile ? (
            <div className="auth-profile-details">
              <div className="auth-detail-row">
                <span className="auth-detail-label">License / Rating:</span>
                <span className="auth-detail-value">{user.pilotLicense || 'Not Specified'}</span>
              </div>
              <div className="auth-detail-row">
                <span className="auth-detail-label">Home Base (ICAO):</span>
                <span className="auth-detail-value">{user.homeBaseAirport || 'Not Specified'}</span>
              </div>
              <div className="auth-detail-row">
                <span className="auth-detail-label">Member Since:</span>
                <span className="auth-detail-value">
                  {new Date(user.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="auth-profile-actions">
                <button
                  type="button"
                  className="auth-primary-btn"
                  onClick={() => onNavigate('navlog')}
                >
                  Launch Flight Planner ✈
                </button>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={handleStartEditProfile}
                >
                  Edit Pilot Profile
                </button>
                <button
                  type="button"
                  className="auth-signout-btn"
                  onClick={async () => {
                    await signOut();
                    setCurrentTab('signin');
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">Callsign / Display Name</label>
                <input
                  type="text"
                  className="auth-input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Pilot License / Rating</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="e.g. PPL(A), CPL-IR, ATPL"
                  value={editLicense}
                  onChange={(e) => setEditLicense(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Home Base Airport (ICAO)</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="e.g. LPCS, LPPT, KJFK"
                  value={editHomeBase}
                  onChange={(e) => setEditHomeBase(e.target.value)}
                  maxLength={4}
                />
              </div>

              <div className="auth-form-buttons">
                <button type="submit" className="auth-primary-btn">
                  Save Changes
                </button>
                <button
                  type="button"
                  className="auth-secondary-btn"
                  onClick={() => setIsEditingProfile(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="auth-card-footer">
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => onNavigate('navlog')}
            >
              ← Back to Flight Planner
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-brand-header">
          <span className="auth-brand-logo">✈</span>
          <h2 className="auth-brand-name">WindLog</h2>
          <span className="auth-brand-tag">Pilot Authentication</span>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-bar">
          <button
            type="button"
            className={`auth-tab ${currentTab === 'signin' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${currentTab === 'signup' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('signup')}
          >
            Sign Up
          </button>
          {currentTab === 'forgot' && (
            <button type="button" className="auth-tab active">
              Reset
            </button>
          )}
        </div>

        {error && <div className="auth-feedback-banner error">{error}</div>}
        {resetFeedback && (
          <div className="auth-feedback-banner success">{resetFeedback}</div>
        )}

        {/* 1. Sign In Form */}
        {currentTab === 'signin' && (
          <form onSubmit={handleSignInSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Pilot Email</label>
              <input
                type="email"
                className="auth-input"
                placeholder="pilot@cockpit.aero"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-label">Password</label>
                <button
                  type="button"
                  className="auth-sub-link"
                  onClick={() => handleTabSwitch('forgot')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="auth-password-input-group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
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
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-primary-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Authenticating...' : 'Sign In to Cockpit'}
            </button>

            <div className="auth-guest-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="auth-guest-btn"
              disabled={isLoading}
              onClick={async () => {
                try {
                  await signInAsGuest();
                  onNavigate('navlog');
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              Continue as Guest Pilot ✈
            </button>
          </form>
        )}

        {/* 2. Sign Up Form */}
        {currentTab === 'signup' && (
          <form onSubmit={handleSignUpSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Pilot Email *</label>
              <input
                type="email"
                className="auth-input"
                placeholder="pilot@cockpit.aero"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Full Name / Callsign</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Capt. Jane Doe"
                value={signUpDisplayName}
                onChange={(e) => setSignUpDisplayName(e.target.value)}
              />
            </div>

            <div className="auth-row-fields">
              <div className="auth-field">
                <label className="auth-label">License (optional)</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="PPL / CPL"
                  value={signUpLicense}
                  onChange={(e) => setSignUpLicense(e.target.value)}
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Home Base (ICAO)</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="LPCS"
                  value={signUpHomeBase}
                  onChange={(e) => setSignUpHomeBase(e.target.value)}
                  maxLength={4}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label">Password * (min 6 chars)</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="••••••••"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirm Password *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="••••••••"
                value={signUpConfirmPassword}
                onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="auth-primary-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Pilot Account'}
            </button>
          </form>
        )}

        {/* 3. Forgot Password Form */}
        {currentTab === 'forgot' && (
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <div className="auth-description-text">
              Enter the email address associated with your pilot account, and we will send instructions to reset your password.
            </div>

            <div className="auth-field">
              <label className="auth-label">Pilot Email</label>
              <input
                type="email"
                className="auth-input"
                placeholder="pilot@cockpit.aero"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-primary-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Dispatching...' : 'Request Password Reset'}
            </button>

            <button
              type="button"
              className="auth-secondary-btn"
              onClick={() => handleTabSwitch('signin')}
            >
              Back to Sign In
            </button>
          </form>
        )}

        <div className="auth-card-footer">
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => onNavigate('landing')}
          >
            ← Back to Landing
          </button>
        </div>
      </div>
    </div>
  );
};
