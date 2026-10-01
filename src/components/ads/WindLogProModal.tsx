import React from 'react';
import { useAdBreak } from '../../context/AdContext';

export const WindLogProModal: React.FC = () => {
  const { isProModalOpen, closeProModal, isPro, toggleProStatus } = useAdBreak();

  if (!isProModalOpen) {
    return null;
  }

  return (
    <div className="modal-overlay pro-modal-overlay">
      <div className="pro-modal-card">
        {/* Top Header */}
        <div className="pro-modal-top-rail">
          <div className="pro-pill-badge">
            <span>⭐ SUPER PILOT SUITE</span>
          </div>

          <button
            type="button"
            className="pro-close-btn"
            onClick={closeProModal}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Hero Title */}
        <div className="pro-hero-section">
          <div className="pro-crown-avatar">👑</div>
          <h2 className="pro-title">WindLog Flight Deck Pro</h2>
          <p className="pro-subtitle">
            Fly without delays. Professional navigation tools built for active VFR and cross-country pilots.
          </p>
        </div>

        {/* Status indicator */}
        <div className={`pro-status-banner ${isPro ? 'active' : 'inactive'}`}>
          <span className="pro-status-dot" />
          <span>
            {isPro
              ? 'Active Status: PRO PILOT (All 5s Countdowns Bypassed)'
              : 'Current Status: FREE FLIGHT DECK (5s Sponsor Clearances Active)'}
          </span>
        </div>

        {/* Benefits Comparison Grid */}
        <div className="pro-benefits-grid">
          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">⚡</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Instant 0-Second PDF Exports</h4>
              <p className="pro-benefit-desc">
                Export A4 SOP Form 002 Kneeboards and NavLogs instantly without any 5-second countdowns.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">📂</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Unlimited Cloud Hangar Slots</h4>
              <p className="pro-benefit-desc">
                Save, categorize, and sync unlimited flight plans across all your cockpit devices.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">🛡️</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">100% Ad-Free Flying</h4>
              <p className="pro-benefit-desc">
                Zero sponsor cards, zero commercial banners. Clean, uninterrupted navigation display.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">🛰️</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Priority Atmospheric Radar</h4>
              <p className="pro-benefit-desc">
                High-frequency GFS and NOAA live wind aloft calculations refreshed before takeoff.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Pilot Toggle Button */}
        <div className="pro-action-box">
          <button
            type="button"
            className={`pro-primary-cta-btn ${isPro ? 'pro-active' : ''}`}
            onClick={() => {
              toggleProStatus();
            }}
          >
            {isPro ? '✓ Pro Pilot Mode Enabled (Click to Revert)' : '👑 Activate Pro Pilot Mode (Free Demo) ➔'}
          </button>

          <p className="pro-disclaimer-text">
            Simulate the full Super Duolingo Pro experience. Toggle anytime to test instant exports vs. 5s sponsor breaks.
          </p>
        </div>
      </div>
    </div>
  );
};
