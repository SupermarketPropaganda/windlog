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

  const hasWaypoints = props.resolvedWaypoints.length > 0;
  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';

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
            {props.navLog?.legs.map((leg, idx) => (
              <NavLogRow
                key={leg.id}
                leg={leg}
                legIndex={idx}
                fuelUnit={props.profile.fuelUnit}
                isActive={props.activeLegIndex === idx}
                onSelect={() => props.onSelectLeg(idx)}
                onAltitudeChange={(newAlt) => props.onLegAltitudeChange(idx, newAlt)}
              />
            ))}

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
