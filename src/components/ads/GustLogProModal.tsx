import React from 'react';
import { useAdBreak } from '../../context/AdContext';

export const GustLogProModal: React.FC = () => {
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
          <h2 className="pro-title">GustLog Flight Deck Pro</h2>
          <p className="pro-subtitle">
            Preview a planning workspace without sponsor countdowns. Free demonstration only.
          </p>
        </div>

        {/* Status indicator */}
        <div className={`pro-status-banner ${isPro ? 'active' : 'inactive'}`}>
          <span className="pro-status-dot" />
          <span>
            {isPro
              ? 'Active Status: PRO PILOT (All 5s Countdowns Bypassed)'
              : 'Current Status: FREE FLIGHT DECK (5s Sponsor Countdowns Active)'}
          </span>
        </div>

        {/* Benefits Comparison Grid */}
        <div className="pro-benefits-grid">
          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">⚡</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Instant 0-Second PDF Exports</h4>
              <p className="pro-benefit-desc">
                Export supplemental A4 kneeboards and navigation logs without sponsor countdowns.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">📂</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Local saved flights</h4>
              <p className="pro-benefit-desc">
                Save flight plans in this browser. Storage capacity is device-dependent; cloud sync is not available.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">🛡️</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">100% Ad-Free Flying</h4>
              <p className="pro-benefit-desc">
                Zero sponsor cards, zero commercial banners. A planning display without sponsor interruptions.
              </p>
            </div>
          </div>

          <div className="pro-benefit-card">
            <div className="pro-benefit-icon">🛰️</div>
            <div className="pro-benefit-content">
              <h4 className="pro-benefit-title">Weather planning information</h4>
              <p className="pro-benefit-desc">
                Use the existing weather tools. Pro does not add radar, priority data or an official weather briefing.
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
            Free demonstration only. No payment, subscription or recurring charge is created. Future paid plans will require separate pricing and purchase terms.
          </p>
        </div>
      </div>
    </div>
  );
};
