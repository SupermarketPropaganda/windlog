import React, { useState } from 'react';
import { ActiveView, AircraftProfile, FuelUnit } from '../types';
import { useAuth } from '../context/AuthContext';
import { AIRCRAFT_PRESETS } from './AircraftBar';
import { getStorageItemSync, setStorageItem } from '../data/storage-manager';

export interface AuthPageProps {
  onNavigate: (view: ActiveView) => void;
  profile?: AircraftProfile;
  onProfileChange?: (profile: AircraftProfile) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate, profile, onProfileChange }) => {
  const {
    user,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    resetPassword,
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

  // ─── UI & Password Toggles ───
  const [showPassword, setShowPassword] = useState(false);
  const [guestAuthTab, setGuestAuthTab] = useState<'register' | 'signin' | 'forgot'>('register');
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // ─── Direct Editable Flight Planning Defaults (Point 1) ───
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

  // Handle Preset Selection
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

  // Save All Preferences & Defaults
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

  // Change Password Handler
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

  // Sign In Submit
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await signIn(signInEmail, signInPassword);
      setProfileSuccessMsg('Signed in to pilot account successfully.');
      setTimeout(() => {
        setProfileSuccessMsg(null);
        onNavigate('navlog');
      }, 1500);
    } catch {
      // Handled by context
    }
  };

  // Register Submit
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (signUpPassword !== signUpConfirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    try {
      await signUp({
        email: signUpEmail,
        password: signUpPassword,
        displayName: editDisplayName || undefined,
        pilotLicense: editLicense || undefined,
        homeBaseAirport: editHomeBase || undefined,
      });
      setProfileSuccessMsg('Cloud Pilot Account created and synced!');
      setTimeout(() => {
        setProfileSuccessMsg(null);
        onNavigate('navlog');
      }, 1500);
    } catch {
      // Handled by context
    }
  };

  // Forgot Password Submit
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await resetPassword(forgotEmail);
      setResetFeedback(res.message);
    } catch {
      // Handled by context
    }
  };

  const displayName = editDisplayName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Pilot');
  const initials = displayName
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

      {/* Top Cockpit Profile Header Card */}
      <div className="profile-header-card">
        <div className="profile-header-left">
          <div className="profile-avatar-circle" title="Pilot Avatar">
            {initials}
          </div>
          <div className="profile-header-meta">
            <div className="profile-name-row">
              <h1 className="profile-name-title">{displayName}</h1>
              <span className={`profile-status-badge ${isAuthenticated ? 'cloud' : 'guest'}`}>
                {isAuthenticated ? '☁ Cloud Synced' : '💾 Local Guest Pilot'}
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

          {isAuthenticated && (
            <button
              type="button"
              className="profile-signout-btn"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {profileErrorMsg && (
        <div className="auth-feedback-banner error">{profileErrorMsg}</div>
      )}

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

        {/* Card 2: Flight Planning Defaults (Point 1) */}
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
            {isAuthenticated && user && !user.id.startsWith('guest_') ? (
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
                      Your preferences, custom waypoints, and saved flights are securely stored
                      directly in your browser. Register or sign in to sync flights across all devices.
                    </p>
                  </div>
                </div>

                {/* Sub Tab Switcher for Guest */}
                <div className="profile-guest-tab-bar">
                  <button
                    type="button"
                    className={`profile-guest-tab ${guestAuthTab === 'register' ? 'active' : ''}`}
                    onClick={() => {
                      clearError();
                      setResetFeedback(null);
                      setGuestAuthTab('register');
                    }}
                  >
                    Create Cloud Account
                  </button>
                  <button
                    type="button"
                    className={`profile-guest-tab ${guestAuthTab === 'signin' ? 'active' : ''}`}
                    onClick={() => {
                      clearError();
                      setResetFeedback(null);
                      setGuestAuthTab('signin');
                    }}
                  >
                    Sign In
                  </button>
                  {guestAuthTab === 'forgot' && (
                    <button type="button" className="profile-guest-tab active">
                      Reset Password
                    </button>
                  )}
                </div>

                {error && <div className="auth-feedback-banner error">{error}</div>}
                {resetFeedback && (
                  <div className="auth-feedback-banner success">{resetFeedback}</div>
                )}

                {/* 1. Register Form */}
                {guestAuthTab === 'register' && (
                  <form onSubmit={handleSignUpSubmit} className="profile-auth-form">
                    <div className="profile-field">
                      <label className="profile-label">Pilot Email *</label>
                      <input
                        type="email"
                        className="profile-input"
                        placeholder="pilot@cockpit.aero"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <div className="profile-input-row">
                      <div className="profile-field">
                        <label className="profile-label">Password * (min 6 chars)</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="profile-input"
                          placeholder="••••••••"
                          value={signUpPassword}
                          onChange={(e) => setSignUpPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                        />
                      </div>

                      <div className="profile-field">
                        <label className="profile-label">Confirm Password *</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="profile-input"
                          placeholder="••••••••"
                          value={signUpConfirmPassword}
                          onChange={(e) => setSignUpConfirmPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="profile-save-btn full"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Creating Account...' : 'Create Account & Sync My Flights ☁'}
                    </button>
                  </form>
                )}

                {/* 2. Sign In Form */}
                {guestAuthTab === 'signin' && (
                  <form onSubmit={handleSignInSubmit} className="profile-auth-form">
                    <div className="profile-field">
                      <label className="profile-label">Pilot Email</label>
                      <input
                        type="email"
                        className="profile-input"
                        placeholder="pilot@cockpit.aero"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <div className="profile-field">
                      <div className="profile-field-header">
                        <label className="profile-label">Password</label>
                        <button
                          type="button"
                          className="auth-sub-link"
                          onClick={() => setGuestAuthTab('forgot')}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="auth-password-input-group">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="profile-input"
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
                      className="profile-save-btn full"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Authenticating...' : 'Sign In to Pilot Account'}
                    </button>
                  </form>
                )}

                {/* 3. Forgot Password Form */}
                {guestAuthTab === 'forgot' && (
                  <form onSubmit={handleForgotSubmit} className="profile-auth-form">
                    <p className="profile-field-hint">
                      Enter the email address associated with your pilot account, and we will send instructions to reset your password.
                    </p>

                    <div className="profile-field">
                      <label className="profile-label">Pilot Email</label>
                      <input
                        type="email"
                        className="profile-input"
                        placeholder="pilot@cockpit.aero"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="profile-btn-row">
                      <button
                        type="submit"
                        className="profile-save-btn"
                        disabled={isLoading}
                      >
                        {isLoading ? 'Dispatching...' : 'Request Password Reset'}
                      </button>
                      <button
                        type="button"
                        className="profile-btn-secondary"
                        onClick={() => setGuestAuthTab('signin')}
                      >
                        Back to Sign In
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
