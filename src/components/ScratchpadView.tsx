import React, { useState, useMemo } from 'react';
import {
  AircraftProfile,
  WindState,
  WindMode,
  Wind,
  RouteToken,
  NavLogSummary,
  Waypoint,
  AlternatePlan,
  FuelCalculationValues,
} from '../types';
import { getAllCandidateAlternates, getAirportWaypoint } from '../data/airport-runways';
import { findNearestCandidateAlternates, getSemicircularOptions } from '../engine/navlog-engine';
import { greatCircleDistance } from '../engine/coordinate-math';
import { AircraftBar } from './AircraftBar';
import { WindPanel } from './WindPanel';
import { NavLogRow } from './NavLogRow';
import { RouteChipsBuilder } from './RouteChipsBuilder';
import { CoordPrompt } from './CoordPrompt';
import { RouteMap, AirspaceFilterType } from './RouteMap';
import { AltitudeProfile } from './AltitudeProfile';
import { AirspaceAlertBanner } from './AirspaceAlertBanner';

export interface ScratchpadViewProps {
  /** The current aircraft profile */
  profile: AircraftProfile;
  onProfileChange: (p: AircraftProfile) => void;

  /** The current wind configuration */
  windState: WindState;
  onWindChange: (w: Wind | null) => void;
  onWindModeChange: (m: WindMode) => void;
  isWindLoading: boolean;

  /** The main route input string */
  routeInput: string;
  onRouteInputChange: (s: string) => void;

  /** The parsed route tokens and their resolution statuses */
  tokens: RouteToken[];
  resolvedWaypoints: Waypoint[];

  /** The compiled navigation log summary */
  navLog: NavLogSummary | null;

  /** The active leg index clicked on map/profile/navlog */
  activeLegIndex: number | null;
  onSelectLeg: (idx: number) => void;
  onLegAltitudeChange: (legIdx: number, newAlt: number) => void;

  /** Route Action Handlers */
  onShareRoute: () => void;
  onOpenKneeboard: () => void;
  onReverseRoute: () => void;
  onClearRoute: () => void;
  onTokenClick: (token: RouteToken) => void;

  /** Custom coordinate resolution modal */
  coordPrompt: { identifier: string } | null;
  onCoordConfirm: (w: Waypoint) => void;
  onCoordCancel: () => void;

  /** Flight Departure Scheduling (Date and Hour) */
  departureTime?: string | null;
  onDepartureTimeChange?: (time: string | null) => void;

  /** Flight Saving Handlers */
  onSaveFlight?: () => void;
  isFlightSaved?: boolean;

  /** Alternate Aerodrome & Diversion Plan */
  alternateAirport?: Waypoint | null;
  onAlternateAirportChange?: (alt: Waypoint | null) => void;
  alternateAltitude?: number;
  onAlternateAltitudeChange?: (alt: number) => void;
  alternatePlan?: AlternatePlan | null;

  /** Fuel Calculations & Overrides */
  fuelCalculations?: FuelCalculationValues;
  onUpdateFuelCalculation?: (updates: Partial<FuelCalculationValues>) => void;
  onResetFuelCalculation?: () => void;

  /** Temporary toast message */
  toastMessage: string | null;
}

const formatTime = (seconds: number): string => {
  const totalMins = Math.floor(seconds / 60);
  const totalSecs = Math.round(seconds % 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m.toString().padStart(2, '0')}:${totalSecs.toString().padStart(2, '0')}`;
};

/**
 * Main application screen composing all subcomponents in an iPad/PC responsive layout.
 */
export const ScratchpadView: React.FC<ScratchpadViewProps> = (props) => {
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'profile'>('map');

  // Unified Airspace Filtering State shared between Tactical Map and Altitude Profile
  const [showAirspaces, setShowAirspaces] = useState<boolean>(true);
  const [airspaceFilter, setAirspaceFilter] = useState<AirspaceFilterType>('ALL');
  const [showSectorLabels, setShowSectorLabels] = useState<boolean>(true);
  const [onlyRouteAirspaces, setOnlyRouteAirspaces] = useState<boolean>(false);

  // Alternate ICAO input state
  const [customAltIcao, setCustomAltIcao] = useState<string>('');

  // Fuel Calculations & Overrides
  const [localReserveMode, setLocalReserveMode] = useState<'day' | 'night'>('day');
  const [fuelEditDrafts, setFuelEditDrafts] = useState<Record<string, string>>({});

  const hasWaypoints = props.resolvedWaypoints.length > 0;
  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';

  const effectiveFuel: FuelCalculationValues = useMemo(() => {
    if (props.fuelCalculations) {
      return props.fuelCalculations;
    }
    const fuelFlow = props.profile.fuelFlow > 0 ? props.profile.fuelFlow : 0;
    const taxi = props.alternatePlan?.taxiFuel ?? (fuelFlow > 0 ? Number(((fuelFlow * 0.4) * 0.25).toFixed(1)) : 0.8);
    const trip = props.navLog ? Number(props.navLog.totalFuel.toFixed(1)) : 0;
    const contingency = props.alternatePlan?.contingencyFuel ?? Number(Math.max(trip * 0.05, (5 / 60) * fuelFlow).toFixed(1));
    const alternate = props.alternatePlan ? Number(props.alternatePlan.fuelBurn.toFixed(1)) : 0;
    const reserveMinutes = localReserveMode === 'day' ? 30 : 45;
    const finalReserve = Number(((reserveMinutes / 60) * fuelFlow).toFixed(1));
    const extra = 0;
    const totalRequired = Number((taxi + trip + contingency + alternate + finalReserve + extra).toFixed(1));
    const fob = totalRequired > 0 ? Number((totalRequired * 1.2).toFixed(1)) : 0;

    return {
      taxiFuel: taxi,
      tripFuel: trip,
      contingencyFuel: contingency,
      alternateFuel: alternate,
      finalReserveFuel: finalReserve,
      extraFuel: extra,
      totalFuelRequired: totalRequired,
      fob,
      reserveMode: localReserveMode,
      isCustomized: false,
    };
  }, [props.fuelCalculations, props.profile.fuelFlow, props.alternatePlan, props.navLog, localReserveMode]);

  const fuelMargin = Number((effectiveFuel.fob - effectiveFuel.totalFuelRequired).toFixed(1));
  const fuelEnduranceSec = props.profile.fuelFlow > 0 && effectiveFuel.fob > 0
    ? (effectiveFuel.fob / props.profile.fuelFlow) * 3600
    : 0;

  const getFuelDisplayVal = (key: keyof FuelCalculationValues, currentVal: number): string => {
    if (fuelEditDrafts[key] !== undefined) {
      return fuelEditDrafts[key];
    }
    return currentVal.toFixed(1);
  };

  const handleFuelEditChange = (key: keyof FuelCalculationValues, rawStr: string) => {
    setFuelEditDrafts((prev) => ({ ...prev, [key]: rawStr }));
    const parsed = parseFloat(rawStr);
    if (!isNaN(parsed) && parsed >= 0) {
      props.onUpdateFuelCalculation?.({ [key]: parsed });
    }
  };

  const handleFuelEditBlur = (key: keyof FuelCalculationValues) => {
    setFuelEditDrafts((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleReserveModeToggle = (mode: 'day' | 'night') => {
    setLocalReserveMode(mode);
    props.onUpdateFuelCalculation?.({ reserveMode: mode });
  };

  const handleResetFuel = () => {
    setFuelEditDrafts({});
    props.onResetFuelCalculation?.();
  };

  const destination = useMemo(() => {
    if (props.resolvedWaypoints.length > 1) {
      return props.resolvedWaypoints[props.resolvedWaypoints.length - 1];
    }
    return null;
  }, [props.resolvedWaypoints]);

  const candidateAirports = useMemo(() => getAllCandidateAlternates(), []);

  const nearestAlternates = useMemo(() => {
    if (!destination) return [];
    return findNearestCandidateAlternates(destination, candidateAirports, 6);
  }, [destination, candidateAirports]);

  const semicircularHint = useMemo(() => {
    if (!props.alternatePlan) return null;
    return getSemicircularOptions(
      props.alternatePlan.magneticTrack,
      props.alternateAltitude ?? 3500
    );
  }, [props.alternatePlan, props.alternateAltitude]);

  const handleApplyCustomAlt = () => {
    const code = customAltIcao.trim().toUpperCase();
    if (!code) return;
    const wp = getAirportWaypoint(code);
    if (wp && props.onAlternateAirportChange) {
      props.onAlternateAirportChange(wp);
      setCustomAltIcao('');
    }
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {props.toastMessage && (
        <div className="toast-notification">
          ✓ {props.toastMessage}
        </div>
      )}

      {/* Top Header: Aircraft Settings & Live Wind */}
      <div className="app-header">
        <AircraftBar profile={props.profile} onChange={props.onProfileChange} />
        <WindPanel
          windState={props.windState}
          onWindChange={props.onWindChange}
          onModeChange={props.onWindModeChange}
          isLoading={props.isWindLoading}
          departureTime={props.departureTime}
          onDepartureTimeChange={props.onDepartureTimeChange}
          navLog={props.navLog}
          profile={props.profile}
        />
      </div>

      {/* Flight Route Scratchpad Input via RouteChipsBuilder */}
      <div className="route-section">
        <RouteChipsBuilder
          routeInput={props.routeInput}
          tokens={props.tokens}
          resolvedWaypoints={props.resolvedWaypoints}
          onRouteInputChange={props.onRouteInputChange}
          onSaveFlight={props.onSaveFlight}
          isFlightSaved={props.isFlightSaved}
          onShareRoute={props.onShareRoute}
          onOpenKneeboard={props.onOpenKneeboard}
          onReverseRoute={props.onReverseRoute}
          onClearRoute={props.onClearRoute}
          onTokenClick={props.onTokenClick}
        />
      </div>

      {/* Responsive Main Layout:
          - Desktop & iPad: 2 Columns (Left: NavLog & Summary, Right: Map & Vertical Profile)
          - Mobile: Single Column (NavLog & Summary, then Map, then Vertical Profile below) */}
      <div className={`flight-dashboard-grid ${hasWaypoints ? 'with-sidebar' : 'single-col'}`}>
        {/* Left Column: NavLog Legs & Summary */}
        <div className="dashboard-left-col">
          <div className="navlog-list">
            {/* Integrated Climb Phase (DEP ➔ TOC) */}
            {props.navLog?.climbDescent && props.navLog.legs.length > 0 && (
              <div className="navlog-phase-card phase-climb">
                <div className="phase-card-header">
                  <div className="phase-card-title-group">
                    <span className="phase-card-icon">▲</span>
                    <span className="phase-card-title">CLIMB TO TOP OF CLIMB (TOC)</span>
                  </div>
                  <span className="phase-card-tag">DEP ➔ TOC</span>
                </div>
                <div className="phase-metrics-row">
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Profile</span>
                    <span className="phase-metric-val val-cyan">
                      {(props.resolvedWaypoints[0]?.elevation ?? 0).toLocaleString()} FT ➔ {props.navLog.climbDescent.tocAltitudeFt.toLocaleString()} FT
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb Dist</span>
                    <span className="phase-metric-val">{props.navLog.climbDescent.climbDistanceNm.toFixed(1)} NM</span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb ETE</span>
                    <span className="phase-metric-val">{formatTime(props.navLog.climbDescent.climbTimeSeconds)}</span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Climb Rate</span>
                    <span className="phase-metric-val val-gold">+{props.profile.climbRateFpm || 700} FPM</span>
                  </div>
                  {props.profile.fuelFlow > 0 && (
                    <div className="phase-metric-box">
                      <span className="phase-metric-label">Fuel Burn</span>
                      <span className="phase-metric-val val-fuel">
                        {props.navLog.climbDescent.climbFuelBurn.toFixed(1)} {fuelUnitLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {props.navLog?.legs.map((leg, idx) => {
              const stepTransition = props.navLog?.climbDescent?.stepTransitions?.find(
                (st) => st.fromLegIndex === idx
              );

              return (
                <React.Fragment key={leg.id}>
                  <NavLogRow
                    leg={leg}
                    legIndex={idx}
                    fuelUnit={props.profile.fuelUnit}
                    isActive={props.activeLegIndex === idx}
                    onSelect={() => props.onSelectLeg(idx)}
                    onAltitudeChange={(newAlt) => props.onLegAltitudeChange(idx, newAlt)}
                  />

                  {/* Step-Climb / Step-Down Transition Indicator */}
                  {stepTransition && (
                    <div
                      className={`navlog-step-transition-banner ${
                        stepTransition.type === 'step-climb' ? 'step-climb-banner' : 'step-down-banner'
                      }`}
                    >
                      <div className="step-banner-left">
                        <span className="step-banner-icon">
                          {stepTransition.type === 'step-climb' ? '▲' : '▼'}
                        </span>
                        <span className="step-banner-title">
                          {stepTransition.type === 'step-climb' ? 'STEP-CLIMB' : 'STEP-DOWN'} (
                          {stepTransition.type === 'step-climb' ? '+' : '-'}
                          {stepTransition.altitudeDeltaFt.toLocaleString()} FT)
                        </span>
                      </div>
                      <div className="step-banner-details">
                        <span className="step-banner-item">
                          <span>Alt:</span>{' '}
                          <strong>
                            {stepTransition.fromAltitudeFt.toLocaleString()} FT ➔{' '}
                            {stepTransition.toAltitudeFt.toLocaleString()} FT
                          </strong>
                        </span>
                        <span className="step-banner-item">
                          <span>ETE:</span> <strong>{formatTime(stepTransition.timeSeconds)}</strong>
                        </span>
                        <span className="step-banner-item">
                          <span>Dist:</span> <strong>{stepTransition.distanceNm.toFixed(1)} NM</strong>
                        </span>
                        {props.profile.fuelFlow > 0 && (
                          <span className="step-banner-item">
                            <span>Fuel:</span>{' '}
                            <strong style={{ color: '#4ade80' }}>
                              {stepTransition.fuelBurn.toFixed(1)} {fuelUnitLabel}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Integrated Descent Phase (TOD ➔ DEST) */}
            {props.navLog?.climbDescent && props.navLog.legs.length > 0 && (
              <div className="navlog-phase-card phase-descent">
                <div className="phase-card-header">
                  <div className="phase-card-title-group">
                    <span className="phase-card-icon">▼</span>
                    <span className="phase-card-title">DESCENT FROM TOP OF DESCENT (TOD)</span>
                  </div>
                  <span className="phase-card-tag">TOD ➔ DEST</span>
                </div>
                <div className="phase-metrics-row">
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Profile</span>
                    <span className="phase-metric-val val-gold">
                      {props.navLog.climbDescent.todAltitudeFt.toLocaleString()} FT ➔{' '}
                      {((destination?.elevation ?? 0) + 1000).toLocaleString()} FT Pattern
                    </span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent Dist</span>
                    <span className="phase-metric-val">{props.navLog.climbDescent.descentDistanceNm.toFixed(1)} NM</span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent ETE</span>
                    <span className="phase-metric-val">{formatTime(props.navLog.climbDescent.descentTimeSeconds)}</span>
                  </div>
                  <div className="phase-metric-box">
                    <span className="phase-metric-label">Descent Rate</span>
                    <span className="phase-metric-val val-cyan">-{props.profile.descentRateFpm || 500} FPM</span>
                  </div>
                  {props.profile.fuelFlow > 0 && (
                    <div className="phase-metric-box">
                      <span className="phase-metric-label">Fuel Burn</span>
                      <span className="phase-metric-val val-fuel">
                        {props.navLog.climbDescent.descentFuelBurn.toFixed(1)} {fuelUnitLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(!props.navLog || props.navLog.legs.length === 0) &&
              props.routeInput.trim().length > 0 && (
                <div className="empty-navlog-hint">
                  Type at least 2 valid waypoints to generate the flight navigation log.
                </div>
              )}
          </div>

          {/* Clean Flight & Fuel Summary */}
          {props.navLog && props.navLog.legs.length > 0 && (
            <div className="navlog-summary-container">
              <div className="navlog-summary">
                <div className="summary-item">
                  <div className="summary-label">Total Distance</div>
                  <div className="summary-val">{props.navLog.totalDistance.toFixed(1)} nm</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Total ETE</div>
                  <div className="summary-val">{formatTime(props.navLog.totalEte)}</div>
                </div>
                <div className="summary-item">
                  <div className="summary-label">Total Legs</div>
                  <div className="summary-val">{props.navLog.legs.length}</div>
                </div>
                {props.profile.fuelFlow > 0 && (
                  <div className="summary-item">
                    <div className="summary-label">Trip Fuel</div>
                    <div className="summary-val val-fuel">
                      {props.navLog.totalFuel.toFixed(1)} {fuelUnitLabel}
                    </div>
                  </div>
                )}
              </div>

              {/* TOC & TOD Flight Telemetry */}
              {props.navLog.climbDescent && (
                <div className="navlog-climb-summary">
                  <div className="climb-summary-chip toc-chip" title="Top of Climb from Departure">
                    <span className="chip-indicator">▲</span>
                    <span className="chip-label">TOC:</span>
                    <span className="chip-val">{props.navLog.climbDescent.climbDistanceNm.toFixed(1)} NM</span>
                    <span className="chip-detail">
                      ({formatTime(props.navLog.climbDescent.climbTimeSeconds)} • {props.navLog.climbDescent.climbFuelBurn.toFixed(1)} {fuelUnitLabel})
                    </span>
                  </div>
                  <div className="climb-summary-chip tod-chip" title="Top of Descent into Destination">
                    <span className="chip-indicator">▼</span>
                    <span className="chip-label">TOD:</span>
                    <span className="chip-val">
                      {(props.navLog.totalDistance - props.navLog.climbDescent.todDistanceNm).toFixed(1)} NM out
                    </span>
                    <span className="chip-detail">
                      ({formatTime(props.navLog.climbDescent.descentTimeSeconds)} • {props.navLog.climbDescent.descentFuelBurn.toFixed(1)} {fuelUnitLabel})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fuel Calculations Breakdown Card */}
          {props.navLog && props.navLog.legs.length > 0 && props.profile.fuelFlow > 0 && (
            <div className="icao-easa-fuel-policy-card">
              <div className="fuel-policy-top-bar">
                <div className="fuel-policy-title-group">
                  <span className="fuel-policy-icon">⛽</span>
                  <div>
                    <h4 className="fuel-policy-heading">Fuel Calculations</h4>
                    <p className="fuel-policy-subheading">
                      Annex 6 / Part-NCO compliant dispatch calculations &amp; ramp reserves
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {effectiveFuel.isCustomized && (
                    <span className="fuel-customized-badge">Customized ✎</span>
                  )}
                  <div className="fuel-reserve-switch-group">
                    <button
                      type="button"
                      className={`fuel-reserve-btn ${effectiveFuel.reserveMode === 'day' ? 'active' : ''}`}
                      onClick={() => handleReserveModeToggle('day')}
                    >
                      VFR Day (30m)
                    </button>
                    <button
                      type="button"
                      className={`fuel-reserve-btn ${effectiveFuel.reserveMode === 'night' ? 'active' : ''}`}
                      onClick={() => handleReserveModeToggle('night')}
                    >
                      VFR Night (45m)
                    </button>
                  </div>
                  {effectiveFuel.isCustomized && (
                    <button
                      type="button"
                      className="fuel-reset-btn"
                      onClick={handleResetFuel}
                      title="Reset all fuel figures back to calculated values"
                    >
                      ↺ Reset to Calculated
                    </button>
                  )}
                </div>
              </div>

              <table className="fuel-policy-table">
                <thead>
                  <tr>
                    <th>Fuel Component</th>
                    <th>Regulation / Policy</th>
                    <th style={{ textAlign: 'right' }}>Quantity ({fuelUnitLabel})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Taxi Allowance</td>
                    <td style={{ color: '#94a3b8' }}>10 min engine start, run-up &amp; taxi</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('taxiFuel', effectiveFuel.taxiFuel)}
                          onChange={(e) => handleFuelEditChange('taxiFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('taxiFuel')}
                          aria-label="Taxi Allowance Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Trip Fuel</td>
                    <td style={{ color: '#94a3b8' }}>Climb, cruise legs &amp; descent</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('tripFuel', effectiveFuel.tripFuel)}
                          onChange={(e) => handleFuelEditChange('tripFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('tripFuel')}
                          aria-label="Trip Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Contingency Fuel</td>
                    <td style={{ color: '#94a3b8' }}>Higher of 5% trip or 5m cruise</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('contingencyFuel', effectiveFuel.contingencyFuel)}
                          onChange={(e) => handleFuelEditChange('contingencyFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('contingencyFuel')}
                          aria-label="Contingency Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Alternate Fuel</td>
                    <td style={{ color: '#94a3b8' }}>
                      {props.alternateAirport ? `Diversion to ${props.alternateAirport.identifier}` : 'No alternate selected (0.0)'}
                    </td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('alternateFuel', effectiveFuel.alternateFuel)}
                          onChange={(e) => handleFuelEditChange('alternateFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('alternateFuel')}
                          aria-label="Alternate Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Final Reserve</td>
                    <td style={{ color: '#94a3b8' }}>{effectiveFuel.reserveMode === 'day' ? 30 : 45} min holding reserve at cruise flow</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('finalReserveFuel', effectiveFuel.finalReserveFuel)}
                          onChange={(e) => handleFuelEditChange('finalReserveFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('finalReserveFuel')}
                          aria-label="Final Reserve Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td>Extra Fuel (Discretionary)</td>
                    <td style={{ color: '#94a3b8' }}>Pilot-in-Command discretionary extra reserve</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input"
                          value={getFuelDisplayVal('extraFuel', effectiveFuel.extraFuel)}
                          onChange={(e) => handleFuelEditChange('extraFuel', e.target.value)}
                          onBlur={() => handleFuelEditBlur('extraFuel')}
                          aria-label="Extra Discretionary Fuel"
                        />
                        <span className="fuel-input-unit">{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                  <tr className="fuel-row-total">
                    <td>MINIMUM REQUIRED RAMP FUEL</td>
                    <td style={{ color: '#2dd4bf' }}>Legal Minimum Departure Fuel</td>
                    <td className="val-policy-cell">
                      <div className="fuel-input-inline-wrap">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          className="fuel-table-edit-input is-total"
                          value={getFuelDisplayVal('totalFuelRequired', effectiveFuel.totalFuelRequired)}
                          onChange={(e) => handleFuelEditChange('totalFuelRequired', e.target.value)}
                          onBlur={() => handleFuelEditBlur('totalFuelRequired')}
                          aria-label="Minimum Required Ramp Fuel"
                        />
                        <span className="fuel-input-unit" style={{ color: '#2dd4bf' }}>{fuelUnitLabel}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="fuel-policy-fob-section">
                <div className="fuel-fob-input-box">
                  <label htmlFor="fuel-fob-input" className="fuel-fob-label">Fuel on Board (FOB)</label>
                  <div className="fuel-fob-field">
                    <input
                      id="fuel-fob-input"
                      type="number"
                      step="0.5"
                      min="0"
                      className="fuel-fob-input"
                      value={getFuelDisplayVal('fob', effectiveFuel.fob)}
                      placeholder={effectiveFuel.fob.toFixed(1)}
                      onChange={(e) => handleFuelEditChange('fob', e.target.value)}
                      onBlur={() => handleFuelEditBlur('fob')}
                    />
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#f8fafc' }}>
                      {fuelUnitLabel}
                    </span>
                  </div>
                </div>

                <div className="fuel-margin-box">
                  <span className="fuel-fob-label">Fuel Margin / Extra</span>
                  <div
                    className={`fuel-margin-pill ${
                      fuelMargin >= 0 ? 'margin-positive' : 'margin-negative'
                    }`}
                  >
                    <span>{fuelMargin >= 0 ? '✓' : '⚠️'}</span>
                    <span>
                      {fuelMargin >= 0 ? '+' : ''}
                      {fuelMargin.toFixed(1)} {fuelUnitLabel}
                    </span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                      ({fuelMargin >= 0 ? 'Excess' : 'DEFICIT'})
                    </span>
                  </div>
                </div>

                <div className="fuel-endurance-badge">
                  <span className="fuel-fob-label">Total Aircraft Endurance</span>
                  <span className="fuel-endurance-val">{formatTime(fuelEnduranceSec)}</span>
                </div>
              </div>

              <div className="fuel-policy-disclaimer">
                ⚠️ Pre-flight preparation only • Not for in-flight navigation • Pilot-in-Command remains solely responsible for verifying weight, balance, and regulatory fuel requirements before engine start.
              </div>
            </div>
          )}

          {/* Alternate Aerodrome & Diversion Planning Hub */}
          {hasWaypoints && destination && (
            <div className="alternate-planning-hub">
              <div className="alt-hub-header">
                <div className="alt-hub-title-group">
                  <span className="alt-hub-icon">🛬</span>
                  <div>
                    <h3 className="alt-hub-title">ALTERNATE &amp; DIVERSION PLANNING</h3>
                    <p className="alt-hub-subtitle">
                      SOP Form 002 ICAO diversion calculations &amp; contingency fuel reserves
                    </p>
                  </div>
                </div>
                {props.alternateAirport && props.onAlternateAirportChange && (
                  <button
                    type="button"
                    className="alt-clear-btn"
                    onClick={() => {
                      props.onAlternateAirportChange?.(null);
                      setCustomAltIcao('');
                    }}
                    title="Remove selected alternate"
                  >
                    ✕ Clear Alternate
                  </button>
                )}
              </div>

              {/* Quick Candidate Suggestion Pills */}
              <div className="alt-candidates-bar">
                <span className="alt-candidates-label">Nearby Aerodromes:</span>
                <div className="alt-pills-list">
                  {nearestAlternates.map((cand) => {
                    const isSelected = props.alternateAirport?.identifier === cand.identifier;
                    const distNm = destination
                      ? Math.round(
                          greatCircleDistance(
                            destination.latitude,
                            destination.longitude,
                            cand.latitude,
                            cand.longitude
                          ) / 1852
                        )
                      : 0;
                    return (
                      <button
                        key={cand.identifier}
                        type="button"
                        className={`alt-pill-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => props.onAlternateAirportChange?.(cand)}
                        title={`${cand.name} (${cand.identifier})`}
                      >
                        <span className="alt-pill-icao">{cand.identifier}</span>
                        <span className="alt-pill-dist">{distNm} NM</span>
                        {isSelected && <span className="alt-pill-check">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Alternate Aerodrome Selector & Diversion Altitude */}
              <div className="alt-controls-grid">
                <div className="alt-input-col">
                  <label className="alt-input-label" htmlFor="custom-alt-input">CUSTOM ALTERNATE (ICAO)</label>
                  <div className="alt-input-group">
                    <input
                      id="custom-alt-input"
                      type="text"
                      className="alt-icao-input"
                      placeholder="e.g. LPCS, LPBJ, LPFR..."
                      maxLength={4}
                      value={customAltIcao}
                      onChange={(e) => setCustomAltIcao(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleApplyCustomAlt();
                      }}
                    />
                    <button
                      type="button"
                      className="alt-apply-btn"
                      onClick={handleApplyCustomAlt}
                      disabled={!customAltIcao.trim()}
                    >
                      Set Alternate
                    </button>
                  </div>
                </div>

                <div className="alt-input-col">
                  <label className="alt-input-label" htmlFor="alt-alt-input">
                    DIVERT ALTITUDE (FT MSL)
                    {semicircularHint && (
                      <span className="alt-semicircular-tag" title={semicircularHint.ruleLabel}>
                        {semicircularHint.isEastbound ? 'ODD+500' : 'EVEN+500'}
                      </span>
                    )}
                  </label>
                  <div className="alt-altitude-control">
                    <input
                      id="alt-alt-input"
                      type="number"
                      step={500}
                      min={1000}
                      max={19500}
                      className="alt-altitude-input"
                      value={props.alternateAltitude ?? 3500}
                      onChange={(e) =>
                        props.onAlternateAltitudeChange?.(Math.max(500, Number(e.target.value)))
                      }
                    />
                    <span className="alt-altitude-unit">FT</span>
                  </div>
                </div>
              </div>

              {/* Telemetry Strip & Fuel Breakdown when an Alternate is Active */}
              {props.alternatePlan && props.alternateAirport ? (
                <div className="alt-active-details">
                  <div className="alt-telemetry-strip">
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">DIVERT LEG</span>
                      <span className="telemetry-val val-route">
                        {destination?.identifier} ➔ {props.alternateAirport.identifier}
                      </span>
                    </div>
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">MAG HEADING</span>
                      <span className="telemetry-val val-gold">
                        {Math.round(props.alternatePlan.magneticHeading).toString().padStart(3, '0')}°
                      </span>
                    </div>
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">DISTANCE</span>
                      <span className="telemetry-val">
                        {props.alternatePlan.distance.toFixed(1)} NM
                      </span>
                    </div>
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">GROUND SPEED</span>
                      <span className="telemetry-val">
                        {Math.round(props.alternatePlan.groundSpeed)} KT
                      </span>
                    </div>
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">ETE</span>
                      <span className="telemetry-val">
                        {formatTime(props.alternatePlan.eetSeconds)}
                      </span>
                    </div>
                    <div className="alt-telemetry-card">
                      <span className="telemetry-label">DIVERT FUEL</span>
                      <span className="telemetry-val val-fuel">
                        {props.alternatePlan.fuelBurn.toFixed(1)} {fuelUnitLabel}
                      </span>
                    </div>
                  </div>

                  {/* SOP Fuel Policy Breakdown Card */}
                  <div className="alt-fuel-policy-card">
                    <div className="alt-fuel-policy-header">
                      <span className="fuel-policy-badge">SOP Form 002 Policy</span>
                      <span className="fuel-policy-title">Required Fuel Breakdown</span>
                    </div>
                    <div className="alt-fuel-policy-grid">
                      <div className="policy-row">
                        <span className="policy-label">Trip Fuel:</span>
                        <span className="policy-val">{props.navLog?.totalFuel.toFixed(1) ?? '0.0'} {fuelUnitLabel}</span>
                      </div>
                      <div className="policy-row">
                        <span className="policy-label">+ 5% Contingency:</span>
                        <span className="policy-val">{props.alternatePlan.contingencyFuel.toFixed(1)} {fuelUnitLabel}</span>
                      </div>
                      <div className="policy-row">
                        <span className="policy-label">+ Alternate Fuel:</span>
                        <span className="policy-val">{props.alternatePlan.fuelBurn.toFixed(1)} {fuelUnitLabel}</span>
                      </div>
                      <div className="policy-row">
                        <span className="policy-label">+ 45m Final Reserve:</span>
                        <span className="policy-val">{props.alternatePlan.finalReserveFuel.toFixed(1)} {fuelUnitLabel}</span>
                      </div>
                      <div className="policy-row">
                        <span className="policy-label">+ Taxi Allowance:</span>
                        <span className="policy-val">{props.alternatePlan.taxiFuel.toFixed(1)} {fuelUnitLabel}</span>
                      </div>
                      <div className="policy-row total-required-row">
                        <span className="policy-label font-bold">TOTAL REQUIRED:</span>
                        <span className="policy-val font-bold val-total-fuel">
                          {props.alternatePlan.totalFuelRequired.toFixed(1)} {fuelUnitLabel}
                        </span>
                      </div>
                    </div>

                    <div className="alt-kneeboard-action">
                      <button
                        type="button"
                        className="alt-kneeboard-btn"
                        onClick={props.onOpenKneeboard}
                      >
                        📋 View SOP Form 002 Kneeboard Alternate Table
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="alt-empty-notice">
                  <span>💡 Select a nearby aerodrome above or enter an ICAO to compute diversion headings, flight time, and legal contingency reserves.</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Column: Tactical Flight Panel with Tabbed Map / Profile View */}
        {hasWaypoints && (
          <div className="dashboard-right-col">
            {props.navLog && props.navLog.legs.length > 0 && (
              <AirspaceAlertBanner navLog={props.navLog} />
            )}

            <div className="tactical-panel-card">
              <div className="tactical-tab-bar">
                <button
                  type="button"
                  className={`tactical-tab-btn ${rightPanelTab === 'map' ? 'active' : ''}`}
                  onClick={() => setRightPanelTab('map')}
                  aria-label="Tactical Map View"
                >
                  <span className="tactical-tab-icon">🗺️</span>
                  <span>Tactical Map</span>
                </button>
                {props.navLog && props.navLog.legs.length > 0 && (
                  <button
                    type="button"
                    className={`tactical-tab-btn ${rightPanelTab === 'profile' ? 'active' : ''}`}
                    onClick={() => setRightPanelTab('profile')}
                    aria-label="Vertical Flight Profile"
                  >
                    <span className="tactical-tab-icon">📈</span>
                    <span>Vertical Profile</span>
                    <span className="tactical-tab-badge">({props.navLog.totalDistance.toFixed(0)} NM)</span>
                  </button>
                )}
              </div>

              <div className="tactical-tab-content">
                <div style={{ display: rightPanelTab === 'map' ? 'block' : 'none' }}>
                  <RouteMap
                    isVisible={rightPanelTab === 'map'}
                    navLog={props.navLog}
                    waypoints={props.resolvedWaypoints}
                    activeLegIndex={props.activeLegIndex}
                    onSelectLeg={props.onSelectLeg}
                    isFullscreen={isMapFullscreen}
                    onToggleFullscreen={setIsMapFullscreen}
                    showAirspaces={showAirspaces}
                    onToggleShowAirspaces={setShowAirspaces}
                    airspaceFilter={airspaceFilter}
                    onAirspaceFilterChange={setAirspaceFilter}
                    showSectorLabels={showSectorLabels}
                    onToggleSectorLabels={setShowSectorLabels}
                    onlyRouteAirspaces={onlyRouteAirspaces}
                    onToggleOnlyRouteAirspaces={setOnlyRouteAirspaces}
                    alternateAirport={props.alternateAirport}
                  />
                </div>

                {rightPanelTab === 'profile' && props.navLog && props.navLog.legs.length > 0 && (
                  <div className="tactical-profile-tab-pane">
                    <AltitudeProfile
                      navLog={props.navLog}
                      activeLegIndex={props.activeLegIndex}
                      onSelectLeg={props.onSelectLeg}
                      showAirspaces={showAirspaces}
                      onToggleShowAirspaces={setShowAirspaces}
                      airspaceFilter={airspaceFilter}
                      onlyRouteAirspaces={onlyRouteAirspaces}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {props.coordPrompt && (
        <CoordPrompt
          identifier={props.coordPrompt.identifier}
          onConfirm={props.onCoordConfirm}
          onCancel={props.onCoordCancel}
        />
      )}
    </div>
  );
};
