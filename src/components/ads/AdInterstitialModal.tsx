import React from 'react';
import { useAdBreak } from '../../context/AdContext';

export const AdInterstitialModal: React.FC = () => {
  const {
    isAdActive,
    currentAd,
    placement,
    title,
    subtitle,
    countdown,
    isFinished,
    closeAdBreak,
    proceedAction,
    openProModal,
  } = useAdBreak();

  if (!isAdActive || !currentAd) {
    return null;
  }

  // Calculate circular SVG progress offset (circumference = 2 * PI * r = 2 * 3.14159 * 34 ≈ 213.6)
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progressRatio = (5 - countdown) / 5;
  const strokeDashoffset = circumference - progressRatio * circumference;

  const isPdf = placement === 'pdf_export';
  const actionButtonText = isPdf
    ? isFinished
      ? '🖨️ Continue to Print / Save PDF ➔'
      : `⏳ Preparing Document (${countdown}s)...`
    : isFinished
      ? '✈️ Continue to Flight Deck ➔'
      : `⏳ Archiving Flight (${countdown}s)...`;

  return (
    <div className="modal-overlay ad-interstitial-overlay">
      <div className="ad-interstitial-card">
        {/* Top Header Rail */}
        <div className="ad-card-top-rail">
          <div className="ad-dispatch-tag">
            <span className="ad-pulse-dot" />
            <span>✈️ PRE-FLIGHT CLEARANCE DISPATCH</span>
          </div>

          <button
            type="button"
            className="ad-close-btn"
            onClick={closeAdBreak}
            title={isFinished ? 'Close' : 'Skip'}
          >
            {isFinished ? '✕' : `${countdown}s`}
          </button>
        </div>

        {/* Milestone Title */}
        <div className="ad-action-header">
          <h2 className="ad-action-title">{title}</h2>
          <p className="ad-action-subtitle">{subtitle}</p>
        </div>

        {/* Circular Countdown Ring */}
        <div className="ad-timer-container">
          <div className="ad-timer-ring-wrapper">
            <svg className="ad-timer-svg" width="90" height="90" viewBox="0 0 90 90">
              <circle
                className="ad-timer-bg-circle"
                cx="45"
                cy="45"
                r={radius}
                strokeWidth="6"
              />
              <circle
                className="ad-timer-progress-circle"
                cx="45"
                cy="45"
                r={radius}
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
              />
            </svg>
            <div className="ad-timer-number-box">
              {isFinished ? (
                <span className="ad-timer-check">✓</span>
              ) : (
                <span className="ad-timer-number">{countdown}</span>
              )}
            </div>
          </div>

          <div className="ad-timer-status-text">
            {isFinished ? (
              <span className="ad-status-ready">Clearance Approved • Ready for Departure</span>
            ) : (
              <span className="ad-status-waiting">
                Compiling flight calculations • Available in {countdown}s
              </span>
            )}
          </div>
        </div>

        {/* Sponsor / Partner Feature Card */}
        <div
          className={`ad-sponsor-card ${currentAd.isProUpsell ? 'pro-highlight' : ''}`}
          style={{ borderColor: currentAd.themeColor }}
        >
          <div className="ad-sponsor-top-row">
            <span
              className="ad-sponsor-badge"
              style={{ color: currentAd.themeColor, backgroundColor: `${currentAd.themeColor}18` }}
            >
              {currentAd.badge}
            </span>
            <span className="ad-sponsor-brand-label">{currentAd.sponsorName}</span>
          </div>

          <div className="ad-sponsor-body">
            <div className="ad-sponsor-icon-wrap" style={{ backgroundColor: `${currentAd.themeColor}22` }}>
              <span className="ad-sponsor-icon">{currentAd.icon}</span>
            </div>

            <div className="ad-sponsor-content">
              <h3 className="ad-sponsor-title">{currentAd.title}</h3>
              <p className="ad-sponsor-tagline">{currentAd.tagline}</p>

              {currentAd.perks && currentAd.perks.length > 0 && (
                <ul className="ad-sponsor-perks">
                  {currentAd.perks.map((perk, i) => (
                    <li key={i} className="ad-perk-item">
                      <span className="ad-perk-check">✓</span> {perk}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="ad-sponsor-actions">
            {currentAd.isProUpsell ? (
              <button
                type="button"
                className="ad-sponsor-cta-btn pro"
                onClick={() => {
                  closeAdBreak();
                  openProModal();
                }}
              >
                {currentAd.ctaText}
              </button>
            ) : currentAd.ctaUrl ? (
              <a
                href={currentAd.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ad-sponsor-cta-btn partner"
              >
                {currentAd.ctaText}
              </a>
            ) : null}
          </div>
        </div>

        {/* Primary Proceed Action Button */}
        <div className="ad-primary-action-wrap">
          <button
            type="button"
            className={`ad-proceed-btn ${isFinished ? 'ready pulse' : 'disabled'}`}
            disabled={!isFinished}
            onClick={proceedAction}
          >
            {actionButtonText}
          </button>
        </div>

        {/* Super Duolingo Upsell Bar */}
        <div className="ad-pro-footer-banner">
          <span className="ad-pro-crown">👑</span>
          <span className="ad-pro-text">
            Tired of waiting? Skip all 5-second countdowns forever with{' '}
            <button
              type="button"
              className="ad-pro-link-btn"
              onClick={() => {
                closeAdBreak();
                openProModal();
              }}
            >
              WindLog Flight Deck Pro
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};
