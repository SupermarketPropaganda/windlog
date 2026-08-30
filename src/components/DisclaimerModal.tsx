import React from 'react';

export interface DisclaimerModalProps {
  onAccept: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onAccept }) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="disclaimer-modal">
        <div className="disclaimer-header">
          <div className="disclaimer-icon">⚠️</div>
          <div>
            <h2 className="disclaimer-title">Aviation & Liability Disclaimer</h2>
            <span className="disclaimer-subtitle">Pilot in Command (PIC) Responsibility</span>
          </div>
        </div>

        <div className="disclaimer-body">
          <p>
            <strong>WindLog is an informational flight planning and educational tool.</strong> It is <em>NOT</em> an approved primary navigation system and must not replace official pre-flight briefings, certified aeronautical publications, or official meteorological sources.
          </p>

          <ul className="disclaimer-points">
            <li>
              <strong>Sole PIC Responsibility:</strong> The Pilot-in-Command (PIC) remains solely and exclusively responsible for all aspects of flight planning, airspace compliance, fuel calculations, terrain clearance, weight &amp; balance, and aircraft operation in accordance with ICAO, EASA, FAA, and national civil aviation authority regulations.
            </li>
            <li>
              <strong>No Warranty of Accuracy:</strong> Computed navigation logs, magnetic declination (WMM2025), winds aloft forecasts, fuel burn estimates, and waypoint coordinates are generated for situational awareness and simulation. No guarantee or warranty of completeness, timeliness, or accuracy is provided.
            </li>
            <li>
              <strong>Zero Liability:</strong> Under no circumstances shall the creators, developers, or contributors of WindLog be liable for any direct, indirect, incidental, or consequential damages, airspace violations, operational diversions, or flight incidents resulting from the use or reliance upon this software.
            </li>
          </ul>

          <div className="disclaimer-footer-notice">
            By proceeding, you acknowledge that you are solely responsible for verifying all flight calculations against official AIS publications, AIP charts, and certified aviation instruments prior to flight.
          </div>
        </div>

        <div className="disclaimer-actions">
          <button
            type="button"
            className="btn btn-confirm disclaimer-accept-btn"
            onClick={onAccept}
          >
            I Acknowledge &amp; Agree
          </button>
        </div>
      </div>
    </div>
  );
};
