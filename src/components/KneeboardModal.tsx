import React, { useState } from 'react';
import { NavLogSummary, AircraftProfile } from '../types';

export interface KneeboardModalProps {
  navLog: NavLogSummary | null;
  profile: AircraftProfile;
  onClose: () => void;
}

const formatMinutesSeconds = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '';
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  return `${totalMins.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
};

export const KneeboardModal: React.FC<KneeboardModalProps> = ({
  navLog,
  profile,
  onClose,
}) => {
  const [taxiFuelInput, setTaxiFuelInput] = useState(
    profile.fuelUnit === 'gph' ? '1.0' : '4.0'
  );
  const [alternateAirport, setAlternateAirport] = useState('');
  const [alternateDist, setAlternateDist] = useState('20');
  const [remarksText, setRemarksText] = useState('');

  const fuelUnitLabel = profile.fuelUnit === 'gph' ? 'gal' : 'l';
  const fuelRate = profile.fuelFlow > 0 ? profile.fuelFlow : 0;

  // ─── SOP Fuel Calculations ───
  const tripFuel = navLog ? navLog.totalFuel : 0;
  const taxiFuel = parseFloat(taxiFuelInput) || 0;
  const contingencyFuel = tripFuel * 0.05; // 5% Contingency
  const holdingFuel = 0.75 * fuelRate; // 45 min holding reserve

  // Alternate Fuel calculation (based on alternate distance & TAS)
  const altDistNum = parseFloat(alternateDist) || 0;
  const altEteHours = profile.tas > 0 && altDistNum > 0 ? altDistNum / profile.tas : 0;
  const alternateFuel = altEteHours * fuelRate;

  const totalFuelRequired =
    tripFuel + alternateFuel + taxiFuel + contingencyFuel + holdingFuel;

  const handlePrint = () => {
    window.print();
  };

  const legs = navLog?.legs || [];
  const minRows = 10;
  const totalRowsCount = Math.max(minRows, legs.length + 1);

  // Cumulative distance & fuel calculations for rows
  let cumulativeDist = 0;
  let cumulativeFuel = 0;

  return (
    <div className="modal-overlay kneeboard-modal-overlay">
      <div className="kneeboard-container">
        {/* On-Screen Action Toolbar (Hidden during print) */}
        <div className="kneeboard-toolbar no-print">
          <div className="toolbar-left">
            <span className="toolbar-title">✈ Standard SOP Form 002 Navigation Log</span>
            <span className="toolbar-sub">
              {profile.aircraftModel?.toUpperCase() || 'AIRCRAFT'} • {profile.tas} KT TAS • {profile.fuelFlow} {profile.fuelUnit.toUpperCase()}
            </span>
          </div>

          <div className="toolbar-inputs">
            <label>
              Taxi Fuel ({fuelUnitLabel}):
              <input
                type="number"
                step="0.5"
                value={taxiFuelInput}
                onChange={(e) => setTaxiFuelInput(e.target.value)}
                style={{ width: '60px' }}
              />
            </label>
            <label>
              Alternate Ident:
              <input
                type="text"
                placeholder="LPPT"
                value={alternateAirport}
                onChange={(e) => setAlternateAirport(e.target.value.toUpperCase())}
                style={{ width: '70px', textTransform: 'uppercase' }}
              />
            </label>
            <label>
              Alt Dist (NM):
              <input
                type="number"
                value={alternateDist}
                onChange={(e) => setAlternateDist(e.target.value)}
                style={{ width: '55px' }}
              />
            </label>
          </div>

          <div className="toolbar-actions">
            <button type="button" className="btn btn-confirm" onClick={handlePrint}>
              🖨️ Print / Save PDF
            </button>
            <button type="button" className="btn btn-cancel" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable Kneeboard Sheet (Form 002 - A4 Landscape) */}
        <div className="kneeboard-sheet" id="kneeboard-print-area">
          {/* Top Main Navigation Log Table */}
          <div className="sop-table-wrapper">
            <div className="sop-table-main-header">NAVIGATION LOG</div>
            <table className="sop-table navlog-table">
              <thead>
                <tr className="sop-subhead-row">
                  <th style={{ width: '5.5%' }}>FROM</th>
                  <th style={{ width: '5.5%' }}>TO</th>
                  <th style={{ width: '4.5%' }}>ALT</th>
                  <th style={{ width: '6%' }}>WIND</th>
                  <th style={{ width: '4%' }}>TAS</th>
                  <th style={{ width: '4.5%' }}>T.TRK</th>
                  <th style={{ width: '4.5%' }}>M.TRK</th>
                  <th style={{ width: '4.5%' }}>T.HDG</th>
                  <th style={{ width: '4.5%' }}>M.HDG</th>
                  <th style={{ width: '5.5%' }}>TO</th>
                  <th style={{ width: '4.5%' }}>ALT</th>
                  <th style={{ width: '4.5%' }}>M.HDG</th>
                  <th style={{ width: '4%' }}>GS</th>
                  <th style={{ width: '4.5%' }}>DIST</th>
                  <th style={{ width: '5%' }}>EET</th>
                  <th style={{ width: '5%' }}>ETA</th>
                  <th className="col-rta" style={{ width: '5%' }}>RTA</th>
                  <th style={{ width: '5%' }}>ATA</th>
                  <th style={{ width: '6%' }}>FUEL ({fuelUnitLabel})</th>
                  <th style={{ width: '6%' }}>FUEL TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalRowsCount }).map((_, idx) => {
                  const leg = legs[idx];
                  if (leg) {
                    cumulativeDist += leg.distance;
                    cumulativeFuel += leg.fuelBurn;
                    const windStr = leg.wind
                      ? `${leg.wind.direction.toString().padStart(3, '0')}/${leg.wind.speed}`
                      : '---';

                    let magTrack = (leg.trueTrack - leg.magneticVariation) % 360;
                    if (magTrack < 0) magTrack += 360;

                    return (
                      <tr key={idx} className="sop-row">
                        <td className="cell-bold cell-from">{leg.from.identifier}</td>
                        <td className="cell-bold cell-to">{leg.to.identifier}</td>
                        <td className="cell-mono">{leg.altitude}</td>
                        <td className="cell-mono">{windStr}</td>
                        <td className="cell-mono">{profile.tas}</td>
                        <td className="cell-mono">{Math.round(leg.trueTrack).toString().padStart(3, '0')}°</td>
                        <td className="cell-mono">{Math.round(magTrack).toString().padStart(3, '0')}°</td>
                        <td className="cell-mono">{Math.round(leg.trueHeading).toString().padStart(3, '0')}°</td>
                        <td className="cell-mono cell-bold">{Math.round(leg.magneticHeading).toString().padStart(3, '0')}°</td>
                        <td className="cell-bold">{leg.to.identifier}</td>
                        <td className="cell-mono">{leg.altitude}</td>
                        <td className="cell-mono cell-bold">{Math.round(leg.magneticHeading).toString().padStart(3, '0')}°</td>
                        <td className="cell-mono cell-bold">{Math.round(leg.groundSpeed)}</td>
                        <td className="cell-mono">{leg.distance.toFixed(1)}</td>
                        <td className="cell-mono">{formatMinutesSeconds(leg.ete)}</td>
                        <td className="cell-write"></td>
                        <td className="cell-write col-rta"></td>
                        <td className="cell-write"></td>
                        <td className="cell-mono">{leg.fuelBurn.toFixed(1)}</td>
                        <td className="cell-mono cell-bold">{cumulativeFuel.toFixed(1)}</td>
                      </tr>
                    );
                  }

                  // Blank rows for in-flight pencil entries
                  return (
                    <tr key={idx} className="sop-row blank-row">
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td className="col-rta"></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Middle Section: Alternate Table + Fuel Required Box */}
          <div className="sop-middle-grid">
            <div className="sop-alternate-box">
              <div className="sop-alternate-header-bar">
                <span className="alt-title">ALTERNATE</span>
                <div className="alt-totals-wrapper">
                  <span className="alt-total-label">TOTAL</span>
                  <span className="alt-fuel-label">FUEL</span>
                </div>
              </div>
              <table className="sop-table alternate-table">
                <thead>
                  <tr className="sop-subhead-row">
                    <th style={{ width: '7%' }}>FROM</th>
                    <th style={{ width: '7%' }}>TO</th>
                    <th style={{ width: '6%' }}>ALT</th>
                    <th style={{ width: '7%' }}>WIND</th>
                    <th style={{ width: '6%' }}>T.TRK</th>
                    <th style={{ width: '6%' }}>M.TRAK</th>
                    <th style={{ width: '5%' }}>TAS</th>
                    <th style={{ width: '6%' }}>T.HDG</th>
                    <th style={{ width: '6%' }}>M.HDG</th>
                    <th style={{ width: '7%' }}>TO</th>
                    <th style={{ width: '6%' }}>ALT</th>
                    <th style={{ width: '6%' }}>M.HDG</th>
                    <th style={{ width: '5%' }}>GS</th>
                    <th style={{ width: '6%' }}>DIST</th>
                    <th style={{ width: '7%' }}>EET</th>
                    <th style={{ width: '7%' }}>FUEL</th>
                  </tr>
                </thead>
                <tbody>
                  {alternateAirport ? (
                    <tr className="sop-row">
                      <td className="cell-bold">{legs[legs.length - 1]?.to.identifier || 'DEST'}</td>
                      <td className="cell-bold">{alternateAirport}</td>
                      <td className="cell-mono">2500</td>
                      <td className="cell-mono">---</td>
                      <td className="cell-mono">---</td>
                      <td className="cell-mono">---</td>
                      <td className="cell-mono">{profile.tas}</td>
                      <td className="cell-mono">---</td>
                      <td className="cell-mono cell-bold">---</td>
                      <td className="cell-bold">{alternateAirport}</td>
                      <td className="cell-mono">2500</td>
                      <td className="cell-mono cell-bold">---</td>
                      <td className="cell-mono cell-bold">{profile.tas}</td>
                      <td className="cell-mono">{altDistNum.toFixed(1)}</td>
                      <td className="cell-mono">{formatMinutesSeconds(altEteHours * 3600)}</td>
                      <td className="cell-mono cell-bold">{alternateFuel.toFixed(1)}</td>
                    </tr>
                  ) : (
                    <tr className="sop-row blank-row">
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  )}
                  <tr className="sop-row blank-row">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Fuel Required SOP Box */}
            <div className="sop-fuel-required-box">
              <table className="fuel-required-table">
                <tbody>
                  <tr>
                    <td className="fuel-label-cell">FUEL REQUIRED</td>
                    <td className="fuel-val-cell">{tripFuel.toFixed(1)} {fuelUnitLabel}</td>
                  </tr>
                  <tr>
                    <td className="fuel-label-cell">ALTERNATE FUEL</td>
                    <td className="fuel-val-cell">{alternateFuel.toFixed(1)} {fuelUnitLabel}</td>
                  </tr>
                  <tr>
                    <td className="fuel-label-cell">TAXI FUEL</td>
                    <td className="fuel-val-cell">{taxiFuel.toFixed(1)} {fuelUnitLabel}</td>
                  </tr>
                  <tr>
                    <td className="fuel-label-cell">5% CONTINGENCY</td>
                    <td className="fuel-val-cell">{contingencyFuel.toFixed(1)} {fuelUnitLabel}</td>
                  </tr>
                  <tr>
                    <td className="fuel-label-cell">45 min. HOLDING</td>
                    <td className="fuel-val-cell">{holdingFuel.toFixed(1)} {fuelUnitLabel}</td>
                  </tr>
                  <tr className="fuel-total-row">
                    <td className="fuel-label-cell fuel-total-header">TOTAL FUEL REQUIRED</td>
                    <td className="fuel-val-cell fuel-total-val">
                      {totalFuelRequired.toFixed(1)} {fuelUnitLabel}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Grid: Remarks & Flight Fuel Management */}
          <div className="sop-bottom-grid">
            {/* Remarks Box */}
            <div className="sop-remarks-box">
              <div className="sop-section-header">REMARKS</div>
              <textarea
                className="sop-remarks-textarea"
                placeholder="ATIS, Transponder Squawk, QNH, Frequencies, Clearance Notes..."
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
              />
            </div>

            {/* In-Flight Fuel Management Table */}
            <div className="sop-fuel-mgmt-box">
              <div className="sop-section-header">FLIGHT FUEL MANAGEMENT</div>
              <table className="sop-table fuel-mgmt-table">
                <thead>
                  <tr className="sop-subhead-row">
                    <th>ELAPSED TIME</th>
                    <th>LH GAUGE</th>
                    <th>RH GAUGE</th>
                    <th>FUEL REMAIN</th>
                    <th>FUEL USED</th>
                    <th>ENDURANCE</th>
                  </tr>
                </thead>
                <tbody>
                  {['00:30', '01:00', '01:30', '02:00', '02:30', '03:00'].map((time, i) => (
                    <tr key={i} className="sop-row">
                      <td className="cell-time">{time}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer SOP Identification */}
          <div className="sop-footer-line">
            STANDARD OPERATING PROCEDURES (SOP&apos;s) - FORM 002 - E1R0 - HT
          </div>
        </div>
      </div>
    </div>
  );
};
