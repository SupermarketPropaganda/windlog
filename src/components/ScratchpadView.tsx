import React, { useState } from 'react';
import {
  AircraftProfile,
  WindState,
  WindMode,
  Wind,
  RouteToken,
  NavLogSummary,
  Waypoint,
} from '../types';
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

  const hasWaypoints = props.resolvedWaypoints.length > 0;
  const fuelUnitLabel = props.profile.fuelUnit === 'gph' ? 'gal' : 'L';

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
            </div>
          )}

          {/* Detailed Flight Legs & Totals Table (matching _image2_.jpg) */}
          {props.navLog && props.navLog.legs.length > 0 && (
            <div className="navlog-totals-section">
              <div className="totals-header-row">
                <h3 className="totals-section-title">FLIGHT LEGS &amp; TOTALS</h3>
                <button
                  type="button"
                  className="add-phases-btn"
                  title="Include or toggle climb/descent flight phase totals"
                >
                  📈 Add Phases Total
                </button>
              </div>

              <div className="totals-table-wrap">
                <table className="totals-table">
                  <thead>
                    <tr>
                      <th>LEG</th>
                      <th>FROM/TO</th>
                      <th>ALT</th>
                      <th>TC</th>
                      <th>WIND</th>
                      <th>TH</th>
                      <th>VAR</th>
                      <th>MH</th>
                      <th>DIST</th>
                      <th>GS</th>
                      <th>ETE</th>
                      <th>FUEL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.navLog.legs.map((leg, idx) => (
                      <tr
                        key={`table_leg_${leg.id}`}
                        className={`totals-row ${props.activeLegIndex === idx ? 'active-row' : ''}`}
                        onClick={() => props.onSelectLeg(idx)}
                      >
                        <td className="cell-bold">{idx + 1}</td>
                        <td className="cell-ident">{leg.from.identifier} - {leg.to.identifier}</td>
                        <td>{leg.altitude}</td>
                        <td>{Math.round(leg.trueTrack).toString().padStart(3, '0')}°</td>
                        <td>
                          {leg.wind
                            ? `${leg.wind.direction.toString().padStart(3, '0')}°/${leg.wind.speed}kt`
                            : '--'}
                        </td>
                        <td>{Math.round(leg.trueHeading).toString().padStart(3, '0')}°</td>
                        <td>
                          {leg.magneticVariation >= 0
                            ? `+${leg.magneticVariation.toFixed(1)}°`
                            : `${leg.magneticVariation.toFixed(1)}°`}
                        </td>
                        <td className="cell-mh">
                          {Math.round(leg.magneticHeading).toString().padStart(3, '0')}°
                        </td>
                        <td>{leg.distance.toFixed(1)} nm</td>
                        <td>{Math.round(leg.groundSpeed)} kt</td>
                        <td>{formatTime(leg.ete)}</td>
                        <td className="cell-fuel">
                          {leg.fuelBurn.toFixed(1)} {fuelUnitLabel}
                        </td>
                      </tr>
                    ))}
                    <tr className="totals-summary-row">
                      <td colSpan={8} className="cell-total-label">TOTAL</td>
                      <td className="cell-bold">{props.navLog.totalDistance.toFixed(1)} nm</td>
                      <td></td>
                      <td className="cell-bold">{formatTime(props.navLog.totalEte)}</td>
                      <td className="cell-bold cell-fuel">
                        {props.navLog.totalFuel.toFixed(1)} {fuelUnitLabel}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
