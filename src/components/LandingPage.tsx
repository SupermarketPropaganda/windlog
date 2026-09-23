import React from 'react';
import { ActiveView } from '../types';
import { useAuth } from '../context/AuthContext';

export interface LandingPageProps {
  onNavigate: (view: ActiveView) => void;
}

/**
 * Minimalist Landing Page
 * Designed cleanly with the brand name in the center and primary authentication / entry action,
 * providing a focused foundation for the user to style and expand later.
 */
export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="landing-page-root">
      <div className="landing-center-box">
        <div className="landing-brand-emblem">✈</div>
        <h1 className="landing-brand-title">WindLog</h1>
        <div className="landing-brand-tagline">Cockpit Suite</div>

        <div className="landing-actions-wrapper">
          {!isAuthenticated ? (
            <div className="landing-unauth-actions">
              <button
                type="button"
                className="landing-primary-btn"
                onClick={() => onNavigate('auth')}
              >
                Sign In / Sign Up
              </button>
              <button
                type="button"
                className="landing-secondary-btn"
                onClick={() => onNavigate('auth')}
              >
                Explore as Guest
              </button>
            </div>
          ) : (
            <div className="landing-authenticated-group">
              <div className="landing-welcome-pill">
                Logged in as <strong>{user?.displayName || user?.email}</strong>
              </div>
              <button
                type="button"
                className="landing-primary-btn"
                onClick={() => onNavigate('navlog')}
              >
                Launch Flight Planner
              </button>
              <button
                type="button"
                className="landing-secondary-btn"
                onClick={() => onNavigate('auth')}
              >
                Pilot Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
