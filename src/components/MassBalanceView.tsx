import React, { useState, useMemo } from 'react';
import {
  MassBalanceProfile,
  NavLogSummary,
} from '../types';
import {
  MASS_BALANCE_PRESETS,
  loadSavedCustomProfiles,
  saveCustomProfile,
  deleteCustomProfile,
} from '../data/mass-balance-presets';
import { computeWeightAndBalance } from '../engine/mass-balance';

export interface MassBalanceViewProps {
  navLogSummary: NavLogSummary | null;
  onBackToNavLog: () => void;
}

export const MassBalanceView: React.FC<MassBalanceViewProps> = ({
  navLogSummary,
  onBackToNavLog,
}) => {
  // Available presets + saved custom profiles
  const [customProfiles, setCustomProfiles] = useState<MassBalanceProfile[]>(loadSavedCustomProfiles);
  const allProfiles = useMemo(() => {
    return [...MASS_BALANCE_PRESETS, ...customProfiles];
  }, [customProfiles]);

  const [selectedProfileId, setSelectedProfileId] = useState<string>('c172');
  const activePreset = useMemo(() => {
    return allProfiles.find((p) => p.id === selectedProfileId) || MASS_BALANCE_PRESETS[0];
  }, [allProfiles, selectedProfileId]);

  // Working copy of profile for real-time adjustments
  const [profile, setProfile] = useState<MassBalanceProfile>(() => {
    return JSON.parse(JSON.stringify(activePreset));
  });

  // Custom profile creator modal
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [customNameInput, setCustomNameInput] = useState('');

  // Trip fuel from NavLog if available
  const [tripFuelInput, setTripFuelInput] = useState<string>(() => {
    if (navLogSummary && navLogSummary.totalFuel > 0) {
      return navLogSummary.totalFuel.toFixed(1);
    }
    return '12.0';
  });

  // When selected preset changes, reset working copy
  const handleSelectPreset = (id: string) => {
    setSelectedProfileId(id);
    const target = allProfiles.find((p) => p.id === id) || MASS_BALANCE_PRESETS[0];
    setProfile(JSON.parse(JSON.stringify(target)));
  };

  // Station weight change handler
  const handleStationWeightChange = (stationId: string, weight: number) => {
    setProfile((prev) => ({
      ...prev,
      stations: prev.stations.map((s) =>
        s.id === stationId ? { ...s, weight: Math.max(0, weight) } : s
      ),
    }));
  };

  // Fuel volume change handler
  const handleFuelVolumeChange = (volume: number) => {
    setProfile((prev) => ({
      ...prev,
      fuelStation: {
        ...prev.fuelStation,
        takeoffFuelVolume: Math.max(0, volume),
      },
    }));
  };

  // Quick fuel set (Empty, 75%, Full)
  const setQuickFuel = (fraction: number) => {
    const max =
      profile.fuelStation.fuelUnit === 'gal'
        ? profile.fuelStation.capacityGallons || 50
        : profile.fuelStation.capacityLiters || 100;
    handleFuelVolumeChange(Math.round(max * fraction));
  };

  // Sync trip fuel from NavLog
  const handleSyncTripFuel = () => {
    if (navLogSummary && navLogSummary.totalFuel > 0) {
      setTripFuelInput(navLogSummary.totalFuel.toFixed(1));
    }
  };

  // Save as custom profile
  const handleSaveAsCustom = () => {
    const name = customNameInput.trim() || `${profile.name} (Custom)`;
    const newId = `custom_${Date.now()}`;
    const newCustomProfile: MassBalanceProfile = {
      ...profile,
      id: newId,
      name,
      isCustom: true,
    };
    saveCustomProfile(newCustomProfile);
    setCustomProfiles(loadSavedCustomProfiles());
    setSelectedProfileId(newId);
    setProfile(newCustomProfile);
    setIsEditingCustom(false);
    setCustomNameInput('');
  };

  // Delete custom profile
  const handleDeleteCustom = (id: string) => {
    deleteCustomProfile(id);
    const remaining = loadSavedCustomProfiles();
    setCustomProfiles(remaining);
    setSelectedProfileId('c172');
    setProfile(JSON.parse(JSON.stringify(MASS_BALANCE_PRESETS[0])));
  };

  // Run M&B calculation
  const tripFuelVal = parseFloat(tripFuelInput) || 0;
  const result = useMemo(() => {
    return computeWeightAndBalance(profile, tripFuelVal);
  }, [profile, tripFuelVal]);

  // ─── SVG CG Envelope Geometry Calculations ───
  const envelopePoints = profile.envelope.normal;
  const { minArm, maxArm, minWeight, maxWeight } = useMemo(() => {
    let minA = profile.emptyArm;
    let maxA = profile.emptyArm;
    let minW = profile.emptyWeight * 0.85;
    let maxW = profile.maxTakeoffWeight * 1.1;

    for (const pt of envelopePoints) {
      if (pt.arm < minA) minA = pt.arm;
      if (pt.arm > maxA) maxA = pt.arm;
      if (pt.weight < minW) minW = pt.weight;
      if (pt.weight > maxW) maxW = pt.weight;
    }

    // Include calculated points in bounds
    const arms = [result.zeroFuelCG, result.takeoffCG, result.landingCG];
    for (const a of arms) {
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }

    const armPadding = (maxA - minA) * 0.15 || 2;
    const weightPadding = (maxW - minW) * 0.1 || 100;

    return {
      minArm: minA - armPadding,
      maxArm: maxA + armPadding,
      minWeight: Math.max(0, minW - weightPadding),
      maxWeight: maxW + weightPadding,
    };
  }, [profile, envelopePoints, result]);

  // SVG Coordinate mapping (width: 500, height: 320, padding: 45)
  const svgWidth = 520;
  const svgHeight = 320;
  const padLeft = 55;
  const padRight = 25;
  const padTop = 25;
  const padBottom = 45;

  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const mapX = (arm: number) => {
    return padLeft + ((arm - minArm) / (maxArm - minArm)) * plotW;
  };

  const mapY = (weight: number) => {
    return padTop + (1 - (weight - minWeight) / (maxWeight - minWeight)) * plotH;
  };

  const envelopeSvgPath = useMemo(() => {
    if (envelopePoints.length < 3) return '';
    return envelopePoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.arm).toFixed(1)},${mapY(pt.weight).toFixed(1)}`).join(' ') + ' Z';
  }, [envelopePoints, minArm, maxArm, minWeight, maxWeight]);

  const utilitySvgPath = useMemo(() => {
    if (!profile.envelope.utility || profile.envelope.utility.length < 3) return '';
    return profile.envelope.utility.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.arm).toFixed(1)},${mapY(pt.weight).toFixed(1)}`).join(' ') + ' Z';
  }, [profile.envelope.utility, minArm, maxArm, minWeight, maxWeight]);

  const maxFuelCap =
    profile.fuelStation.fuelUnit === 'gal'
      ? profile.fuelStation.capacityGallons || 50
      : profile.fuelStation.capacityLiters || 100;

  const isAllSafe =
    result.isTOWInEnvelope &&
    result.isLWInEnvelope &&
    result.isZFWInEnvelope &&
    !result.isOverweightTOW &&
    !result.isOverweightLW;

  return (
    <div className="mb-view-container">
      {/* Top Header & Preset Bar */}
      <div className="mb-header-card">
        <div className="mb-header-left">
          <button
            type="button"
            className="btn btn-cancel mb-back-btn"
            onClick={onBackToNavLog}
          >
            ← Back to Flight Plan
          </button>
          <div>
            <h1 className="mb-title">⚖️ Mass &amp; Balance (Weight &amp; Balance)</h1>
            <div className="mb-subtitle">
              CG Envelope &amp; Loading Analysis for {profile.name}
            </div>
          </div>
        </div>

        <div className="mb-header-controls">
          <label className="mb-preset-select-label">
            Aircraft Model:
            <select
              className="mb-preset-select"
              value={selectedProfileId}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              <optgroup label="Factory Presets">
                {MASS_BALANCE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.weightUnit})
                  </option>
                ))}
              </optgroup>
              {customProfiles.length > 0 && (
                <optgroup label="Custom Aircraft">
                  {customProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      ★ {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-cancel"
            onClick={() => setIsEditingCustom(true)}
          >
            💾 Save As Custom
          </button>

          {profile.isCustom && (
            <button
              type="button"
              className="btn btn-cancel"
              style={{ color: '#ef4444', borderColor: '#ef4444' }}
              onClick={() => handleDeleteCustom(profile.id)}
            >
              🗑️ Delete
            </button>
          )}
        </div>
      </div>

      {/* Safety Status Banner */}
      <div
        className={`mb-status-banner ${
          isAllSafe ? 'status-safe' : 'status-alert'
        }`}
      >
        <div className="status-banner-left">
          <span className="status-banner-icon">{isAllSafe ? '✓' : '⚠️'}</span>
          <div>
            <div className="status-banner-title">
              {isAllSafe
                ? 'SAFE — WEIGHT & CG WITHIN LEGAL ENVELOPE'
                : 'ALERT — FLIGHT OUT OF LIMITS / OVERWEIGHT'}
            </div>
            <div className="status-banner-desc">
              Takeoff Weight: <strong>{result.takeoffWeight} {profile.weightUnit}</strong> (Margin:{' '}
              <span style={{ color: result.weightMargin >= 0 ? '#4ade80' : '#ef4444' }}>
                {result.weightMargin >= 0 ? '+' : ''}{result.weightMargin} {profile.weightUnit}
              </span>
              ) • Takeoff CG:{' '}
              <strong>
                {result.takeoffCG} {profile.armUnit}
              </strong>
            </div>
          </div>
        </div>

        {result.warnings.length > 0 && (
          <div className="status-banner-warnings">
            {result.warnings.map((w, i) => (
              <div key={i} className="warning-pill">
                ⚠️ {w}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Two-Column Layout */}
      <div className="mb-grid-layout">
        {/* Left Column: Loading Stations */}
        <div className="mb-stations-col">
          {/* Basic Empty Weight Card */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">1. Basic Empty Weight (BEW)</span>
              <span className="mb-badge">Aircraft POH</span>
            </div>
            <div className="mb-bew-grid">
              <div className="mb-input-group">
                <label>Empty Weight ({profile.weightUnit})</label>
                <input
                  type="number"
                  value={profile.emptyWeight}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      emptyWeight: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="mb-input-group">
                <label>Empty Arm ({profile.armUnit})</label>
                <input
                  type="number"
                  step="0.1"
                  value={profile.emptyArm}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...prev,
                      emptyArm: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="mb-input-group">
                <label>Empty Moment</label>
                <div className="mb-static-val">
                  {(profile.emptyWeight * profile.emptyArm).toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Payload Stations */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">2. Payload &amp; Passengers</span>
              <span className="mb-badge">Loading</span>
            </div>

            <div className="mb-stations-list">
              {profile.stations.map((st) => (
                <div key={st.id} className="station-row">
                  <div className="station-info">
                    <div className="station-name">{st.name}</div>
                    <div className="station-arm">Arm: {st.arm} {profile.armUnit}</div>
                  </div>

                  <div className="station-inputs">
                    <input
                      type="range"
                      min="0"
                      max={st.maxWeight ? st.maxWeight * 1.1 : 400}
                      step="5"
                      value={st.weight || 0}
                      onChange={(e) =>
                        handleStationWeightChange(st.id, parseFloat(e.target.value) || 0)
                      }
                      className="station-slider"
                    />
                    <div className="station-num-input-wrap">
                      <input
                        type="number"
                        min="0"
                        value={st.weight || 0}
                        onChange={(e) =>
                          handleStationWeightChange(st.id, parseFloat(e.target.value) || 0)
                        }
                        className="station-num-input"
                      />
                      <span className="station-unit">{profile.weightUnit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fuel Station */}
          <div className="mb-card">
            <div className="mb-card-header">
              <span className="mb-card-title">3. Usable Fuel Loading</span>
              <span className="mb-badge">
                {profile.fuelStation.fuelType.toUpperCase()} • Arm: {profile.fuelStation.arm} {profile.armUnit}
              </span>
            </div>

            <div className="fuel-station-content">
              <div className="fuel-slider-row">
                <div className="fuel-slider-wrap">
                  <input
                    type="range"
                    min="0"
                    max={maxFuelCap}
                    step="1"
                    value={profile.fuelStation.takeoffFuelVolume}
                    onChange={(e) =>
                      handleFuelVolumeChange(parseFloat(e.target.value) || 0)
                    }
                    className="station-slider"
                  />
                  <div className="fuel-quick-btns">
                    <button type="button" onClick={() => setQuickFuel(0)}>
                      Empty (0)
                    </button>
                    <button type="button" onClick={() => setQuickFuel(0.5)}>
                      Half (50%)
                    </button>
                    <button type="button" onClick={() => setQuickFuel(0.75)}>
                      Tabs (75%)
                    </button>
                    <button type="button" onClick={() => setQuickFuel(1)}>
                      Full (100%)
                    </button>
                  </div>
                </div>

                <div className="fuel-num-wrap">
                  <input
                    type="number"
                    min="0"
                    max={maxFuelCap}
                    value={profile.fuelStation.takeoffFuelVolume}
                    onChange={(e) =>
                      handleFuelVolumeChange(parseFloat(e.target.value) || 0)
                    }
                    className="station-num-input"
                  />
                  <span className="station-unit">{profile.fuelStation.fuelUnit}</span>
                </div>
              </div>

              {/* Trip Fuel Sync */}
              <div className="trip-fuel-sync-row">
                <div className="trip-fuel-desc">
                  Estimated Trip Fuel Burn ({profile.fuelStation.fuelUnit}):
                </div>
                <div className="trip-fuel-controls">
                  <input
                    type="number"
                    step="0.5"
                    value={tripFuelInput}
                    onChange={(e) => setTripFuelInput(e.target.value)}
                    style={{ width: '70px' }}
                  />
                  {navLogSummary && navLogSummary.totalFuel > 0 && (
                    <button
                      type="button"
                      className="btn btn-cancel btn-sm"
                      onClick={handleSyncTripFuel}
                      title="Sync with current NavLog trip fuel calculation"
                    >
                      🔄 Sync Flight Plan ({navLogSummary.totalFuel.toFixed(1)} {profile.fuelStation.fuelUnit})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Calculations & 2D SVG CG Envelope */}
        <div className="mb-envelope-col">
          {/* Summary Weights Grid */}
          <div className="mb-summary-tiles">
            {/* Zero Fuel Weight */}
            <div className="mb-tile">
              <div className="mb-tile-label">Zero Fuel Weight (ZFW)</div>
              <div className="mb-tile-weight">
                {result.zeroFuelWeight} <span className="mb-tile-unit">{profile.weightUnit}</span>
              </div>
              <div className="mb-tile-cg">
                CG: <strong>{result.zeroFuelCG}</strong> {profile.armUnit}
              </div>
              <div
                className={`mb-tile-status ${
                  result.isZFWInEnvelope ? 'status-ok' : 'status-bad'
                }`}
              >
                {result.isZFWInEnvelope ? 'In Limits ✓' : 'Out of Limits ⚠️'}
              </div>
            </div>

            {/* Takeoff Weight */}
            <div className="mb-tile highlight-tile">
              <div className="mb-tile-label">Takeoff Weight (TOW)</div>
              <div className="mb-tile-weight">
                {result.takeoffWeight} <span className="mb-tile-unit">{profile.weightUnit}</span>
              </div>
              <div className="mb-tile-cg">
                CG: <strong>{result.takeoffCG}</strong> {profile.armUnit}
              </div>
              <div
                className={`mb-tile-status ${
                  result.isTOWInEnvelope && !result.isOverweightTOW
                    ? 'status-ok'
                    : 'status-bad'
                }`}
              >
                {result.isTOWInEnvelope && !result.isOverweightTOW
                  ? 'Safe ✓'
                  : 'Exceeded ⚠️'}
              </div>
            </div>

            {/* Landing Weight */}
            <div className="mb-tile">
              <div className="mb-tile-label">Landing Weight (LW)</div>
              <div className="mb-tile-weight">
                {result.landingWeight} <span className="mb-tile-unit">{profile.weightUnit}</span>
              </div>
              <div className="mb-tile-cg">
                CG: <strong>{result.landingCG}</strong> {profile.armUnit}
              </div>
              <div
                className={`mb-tile-status ${
                  result.isLWInEnvelope && !result.isOverweightLW
                    ? 'status-ok'
                    : 'status-bad'
                }`}
              >
                {result.isLWInEnvelope && !result.isOverweightLW
                  ? 'In Limits ✓'
                  : 'Exceeded ⚠️'}
              </div>
            </div>
          </div>

          {/* 2D Interactive CG Envelope Graph */}
          <div className="mb-card mb-envelope-card">
            <div className="mb-card-header">
              <span className="mb-card-title">Center of Gravity (CG) Envelope</span>
              <div className="envelope-legend">
                <span className="legend-item">
                  <span className="legend-box box-normal"></span> Normal
                </span>
                {profile.envelope.utility && (
                  <span className="legend-item">
                    <span className="legend-box box-utility"></span> Utility
                  </span>
                )}
                <span className="legend-item">
                  <span className="legend-dot dot-tow"></span> TOW
                </span>
                <span className="legend-item">
                  <span className="legend-dot dot-lw"></span> LW
                </span>
                <span className="legend-item">
                  <span className="legend-dot dot-zfw"></span> ZFW
                </span>
              </div>
            </div>

            <div className="envelope-svg-wrapper">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="envelope-svg"
              >
                {/* Background Grid */}
                {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
                  const yVal = minWeight + frac * (maxWeight - minWeight);
                  const yPos = mapY(yVal);
                  return (
                    <g key={`gy-${idx}`}>
                      <line
                        x1={padLeft}
                        y1={yPos}
                        x2={svgWidth - padRight}
                        y2={yPos}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padLeft - 6}
                        y={yPos + 4}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {Math.round(yVal)}
                      </text>
                    </g>
                  );
                })}

                {[0.2, 0.4, 0.6, 0.8].map((frac, idx) => {
                  const xVal = minArm + frac * (maxArm - minArm);
                  const xPos = mapX(xVal);
                  return (
                    <g key={`gx-${idx}`}>
                      <line
                        x1={xPos}
                        y1={padTop}
                        x2={xPos}
                        y2={svgHeight - padBottom}
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={xPos}
                        y={svgHeight - padBottom + 15}
                        fill="#64748b"
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {xVal.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Normal Envelope Polygon */}
                {envelopeSvgPath && (
                  <path
                    d={envelopeSvgPath}
                    fill="rgba(37, 99, 235, 0.12)"
                    stroke="#2563eb"
                    strokeWidth="2"
                  />
                )}

                {/* Utility Envelope Polygon (if applicable) */}
                {utilitySvgPath && (
                  <path
                    d={utilitySvgPath}
                    fill="rgba(245, 158, 11, 0.08)"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                )}

                {/* Vector line from TOW to LW to ZFW */}
                <line
                  x1={mapX(result.takeoffCG)}
                  y1={mapY(result.takeoffWeight)}
                  x2={mapX(result.landingCG)}
                  y2={mapY(result.landingWeight)}
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                <line
                  x1={mapX(result.landingCG)}
                  y1={mapY(result.landingWeight)}
                  x2={mapX(result.zeroFuelCG)}
                  y2={mapY(result.zeroFuelWeight)}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                />

                {/* Zero Fuel Weight Point */}
                <circle
                  cx={mapX(result.zeroFuelCG)}
                  cy={mapY(result.zeroFuelWeight)}
                  r="5"
                  fill="#94a3b8"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={mapX(result.zeroFuelCG) + 8}
                  y={mapY(result.zeroFuelWeight) + 4}
                  fill="#cbd5e1"
                  fontSize="10"
                  fontWeight="bold"
                >
                  ZFW
                </text>

                {/* Landing Weight Point */}
                <circle
                  cx={mapX(result.landingCG)}
                  cy={mapY(result.landingWeight)}
                  r="6"
                  fill="#eab308"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={mapX(result.landingCG) + 8}
                  y={mapY(result.landingWeight) + 4}
                  fill="#fde047"
                  fontSize="10"
                  fontWeight="bold"
                >
                  LW
                </text>

                {/* Takeoff Weight Point */}
                <circle
                  cx={mapX(result.takeoffCG)}
                  cy={mapY(result.takeoffWeight)}
                  r="7"
                  fill="#22c55e"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={mapX(result.takeoffCG) + 10}
                  y={mapY(result.takeoffWeight) + 4}
                  fill="#4ade80"
                  fontSize="11"
                  fontWeight="bold"
                >
                  TOW
                </text>

                {/* Axis Labels */}
                <text
                  x={svgWidth / 2}
                  y={svgHeight - 10}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  Center of Gravity Arm ({profile.armUnit})
                </text>

                <text
                  x={-(svgHeight / 2)}
                  y={18}
                  fill="#94a3b8"
                  fontSize="10"
                  textAnchor="middle"
                  fontWeight="600"
                  transform="rotate(-90)"
                >
                  Weight ({profile.weightUnit})
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Save Custom Profile Modal */}
      {isEditingCustom && (
        <div className="modal-overlay">
          <div className="custom-mb-modal">
            <h2 className="modal-title">Save Custom Aircraft Profile</h2>
            <p className="modal-subtitle">
              Save your current weights, arms, and stations for future flight planning.
            </p>

            <div className="mb-input-group" style={{ margin: '1rem 0' }}>
              <label>Profile Name:</label>
              <input
                type="text"
                placeholder="e.g. My Cessna 172 (CS-AXA)"
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-cancel"
                onClick={() => setIsEditingCustom(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-confirm"
                onClick={handleSaveAsCustom}
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
