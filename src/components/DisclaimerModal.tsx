import React, { useState } from 'react';
import {
  CURRENT_LEGAL_VERSION,
  LEGAL_DOCUMENT_TITLE,
  LEGAL_DOCUMENT_SUBTITLE,
  LEGAL_SECTIONS,
} from '../data/legal-terms';

export interface DisclaimerModalProps {
  onAccept: () => void;
  onClose?: () => void;
  isReadOnly?: boolean;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({
  onAccept,
  onClose,
  isReadOnly = false,
}) => {
  const [viewMode, setViewMode] = useState<'summary' | 'full'>('summary');
  const [acknowledgedPic, setAcknowledgedPic] = useState<boolean>(isReadOnly);
  const [acknowledgedTerms, setAcknowledgedTerms] = useState<boolean>(isReadOnly);

  const canProceed = isReadOnly || (acknowledgedPic && acknowledgedTerms);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="disclaimer-modal legal-modal-container">
        {/* Modal Header */}
        <div className="disclaimer-header">
          <div className="disclaimer-header-left">
            <div className="disclaimer-icon">⚠️</div>
            <div>
              <h2 className="disclaimer-title">{LEGAL_DOCUMENT_TITLE}</h2>
              <span className="disclaimer-subtitle">
                {LEGAL_DOCUMENT_SUBTITLE} • <span className="legal-ver-badge">v{CURRENT_LEGAL_VERSION}</span>
              </span>
            </div>
          </div>

          <div className="disclaimer-header-right">
            {onClose && (
              <button
                type="button"
                className="btn btn-cancel btn-sm"
                onClick={onClose}
                title="Close modal"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="legal-view-tabs">
          <button
            type="button"
            className={`legal-tab-btn ${viewMode === 'summary' ? 'active' : ''}`}
            onClick={() => setViewMode('summary')}
          >
            📋 Essential Summary
          </button>
          <button
            type="button"
            className={`legal-tab-btn ${viewMode === 'full' ? 'active' : ''}`}
            onClick={() => setViewMode('full')}
          >
            📜 Complete Master Agreement (14 Sections)
          </button>
          <button
            type="button"
            className="legal-tab-btn legal-print-btn"
            onClick={handlePrint}
            title="Print or Save PDF of Legal Terms"
          >
            🖨️ Print / Save Copy
          </button>
        </div>

        {/* Modal Body */}
        <div className="disclaimer-body legal-modal-body">
          {viewMode === 'summary' ? (
            <div className="legal-summary-view">
              {/* Critical Notice Callout */}
              <div className="disclaimer-callout-danger">
                <strong>CRITICAL AVIATION NOTICE:</strong> WindLog is strictly an auxiliary, non-certified educational, simulation, and situational awareness flight planning tool. It is <u>NOT</u> an FAA/EASA certified navigation system (Non-TSO) and must never replace official pre-flight briefings, certified AFM/POH performance charts, or official meteorological briefings.
              </div>

              <ul className="disclaimer-points">
                <li>
                  <strong>14 CFR § 91.3, EASA SERA.2010 &amp; ICAO Annex 2 (PIC Primacy):</strong> The Pilot-in-Command (PIC) remains solely, personally, and non-delegably responsible for the safe and lawful operation of the aircraft, terrain separation, and airspace compliance.
                </li>
                <li>
                  <strong>POH / AFM Supremacy &amp; Tail-Specific CG Sheets:</strong> All Mass &amp; Balance calculations and preset envelopes (C172, PA-28, P2002, DA40, Rotax 912) are generic approximations. The official Airplane Flight Manual (AFM) and certified Weight and Balance schedule for the specific tail number take absolute precedence.
                </li>
                <li>
                  <strong>Statutory Minimum Fuel Reserves:</strong> Fuel calculations are indicative. The PIC must independently verify usable fuel and ensure full compliance with legal fuel reserve mandates (FAA 14 CFR § 91.151 / EASA Part-NCO.OP.125).
                </li>
                <li>
                  <strong>Runway Crosswind &amp; Surface Contamination (ICAO GRF):</strong> Crosswind calculations assume clean, dry pavement and do not evaluate surface contamination (standing water, slush, ice) or Runway Declared Distances (TORA/LDA).
                </li>
                <li>
                  <strong>Cockpit Environment &amp; Hardware Resilience:</strong> Consumer tablets/phones are prone to thermal shutdown from cockpit solar irradiance, battery depletion, or cache eviction. Mandatory backup navigation instruments and charts must be carried.
                </li>
                <li>
                  <strong>UCC § 2-316 &amp; Limitation of Liability:</strong> Software is provided &ldquo;AS IS&rdquo; with all faults. Liability is capped at $50.00 USD, subject to non-waivable statutory rights under UK Consumer Rights Act 2015 and EU Directive 93/13/EEC.
                </li>
                <li>
                  <strong>Client-Side Local Storage Privacy:</strong> Flight calculations and custom waypoints remain 100% on your device (HTML5 LocalStorage) pursuant to ePrivacy Directive Art. 5(3). No remote tracking or telemetry scripts are used.
                </li>
              </ul>
            </div>
          ) : (
            <div className="legal-full-view">
              {LEGAL_SECTIONS.map((sec) => (
                <div
                  key={sec.id}
                  className={`legal-section-block ${sec.isCallout ? 'is-callout' : ''} ${
                    sec.isUccCaps ? 'is-ucc-caps' : ''
                  }`}
                >
                  <h3 className="legal-section-title">{sec.title}</h3>
                  <div className="legal-section-content">
                    {sec.content.map((paragraph, pIdx) => (
                      <p key={pIdx}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Affirmative Assent Checkboxes (if not read-only) */}
        {!isReadOnly && (
          <div className="disclaimer-checkboxes-card">
            <label className="disclaimer-checkbox-label">
              <input
                type="checkbox"
                checked={acknowledgedPic}
                onChange={(e) => setAcknowledgedPic(e.target.checked)}
                className="disclaimer-checkbox"
              />
              <span className="checkbox-text">
                <strong>1. Pilot-in-Command Confirmation:</strong> I confirm I am the Pilot-in-Command (PIC) and acknowledge sole, non-delegable legal responsibility for all operational flight decisions, terrain clearance, fuel reserves, and official AIS/meteorological verifications (14 CFR § 91.3 / EASA Part-NCO.GEN.105).
              </span>
            </label>

            <label className="disclaimer-checkbox-label">
              <input
                type="checkbox"
                checked={acknowledgedTerms}
                onChange={(e) => setAcknowledgedTerms(e.target.checked)}
                className="disclaimer-checkbox"
              />
              <span className="checkbox-text">
                <strong>2. Terms &amp; Warranty Acceptance:</strong> I have read, understood, and unconditionally agree to the Master Terms of Service (v{CURRENT_LEGAL_VERSION}), AFM Supremacy, UCC &ldquo;AS IS&rdquo; Warranty Disclaimers, and Limitation of Liability.
              </span>
            </label>
          </div>
        )}

        {/* Actions Bar */}
        <div className="disclaimer-actions">
          {!isReadOnly ? (
            <button
              type="button"
              className="btn btn-confirm disclaimer-accept-btn"
              disabled={!canProceed}
              onClick={onAccept}
            >
              {canProceed
                ? 'I Acknowledge, Understand & Agree'
                : 'Please check both boxes above to proceed'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary disclaimer-accept-btn"
              onClick={onClose}
            >
              Close Legal Document
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
