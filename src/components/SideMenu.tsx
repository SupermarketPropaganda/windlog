import React from 'react';
import { ActiveView, NavLogSummary, MassBalanceResult, RunwayWindResult } from '../types';

export interface SideMenuProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenKneeboard: () => void;
  navLogSummary: NavLogSummary | null;
  massBalanceResult?: MassBalanceResult | null;
  runwayWindResult?: RunwayWindResult | null;
}

export const SideMenu: React.FC<SideMenuProps> = ({
  activeView,
  onChangeView,
  isOpen,
  onClose,
  onOpenKneeboard,
  navLogSummary,
  massBalanceResult,
  runwayWindResult,
}) => {
  if (!isOpen) return null;

  const handleSelect = (view: ActiveView) => {
    onChangeView(view);
    onClose();
  };

  const handleKneeboard = () => {
    onOpenKneeboard();
    onClose();
  };

  return (
    <div className="sidemenu-overlay" onClick={onClose}>
      <div className="sidemenu-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sidemenu-header">
          <div className="sidemenu-brand">
            <span className="sidemenu-icon">✈</span>
            <div>
              <div className="sidemenu-title">WindLog Cockpit</div>
              <div className="sidemenu-subtitle">VFR Flight Planning Suite</div>
            </div>
          </div>
          <button
            type="button"
            className="sidemenu-close-btn"
            onClick={onClose}
            title="Close Menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation Items */}
        <div className="sidemenu-nav-list">
          {/* 1. NavLog & Route Planner */}
          <button
            type="button"
            className={`sidemenu-item ${activeView === 'navlog' ? 'active' : ''}`}
            onClick={() => handleSelect('navlog')}
          >
            <div className="sidemenu-item-icon">🗺️</div>
            <div className="sidemenu-item-content">
              <div className="sidemenu-item-title">Flight Planner &amp; NavLog</div>
              <div className="sidemenu-item-desc">
                {navLogSummary && navLogSummary.legs.length > 0
                  ? `${navLogSummary.legs.length} legs • ${navLogSummary.totalDistance.toFixed(1)} NM`
                  : 'Scratchpad, Winds Aloft & Tactical Map'}
              </div>
            </div>
            {navLogSummary && navLogSummary.legs.length > 0 && (
              <span className="sidemenu-badge badge-blue">
                {navLogSummary.legs.length}
              </span>
            )}
          </button>

          {/* 2. Mass & Balance */}
          <button
            type="button"
            className={`sidemenu-item ${activeView === 'mass-balance' ? 'active' : ''}`}
            onClick={() => handleSelect('mass-balance')}
          >
            <div className="sidemenu-item-icon">⚖️</div>
            <div className="sidemenu-item-content">
              <div className="sidemenu-item-title">Mass &amp; Balance</div>
              <div className="sidemenu-item-desc">
                {massBalanceResult
                  ? massBalanceResult.isTOWInEnvelope && !massBalanceResult.isOverweightTOW
                    ? `TOW ${massBalanceResult.takeoffWeight} • CG In Envelope ✓`
                    : '⚠️ Limits Exceeded!'
                  : 'Aircraft Presets & 2D CG Envelope'}
              </div>
            </div>
            {massBalanceResult && (
              <span
                className={`sidemenu-badge ${
                  massBalanceResult.isTOWInEnvelope && !massBalanceResult.isOverweightTOW
                    ? 'badge-green'
                    : 'badge-red'
                }`}
              >
                {massBalanceResult.isTOWInEnvelope && !massBalanceResult.isOverweightTOW
                  ? 'SAFE'
                  : 'ALERT'}
              </span>
            )}
          </button>

          {/* 3. Runway Wind & Crosswind */}
          <button
            type="button"
            className={`sidemenu-item ${activeView === 'runway-wind' ? 'active' : ''}`}
            onClick={() => handleSelect('runway-wind')}
          >
            <div className="sidemenu-item-icon">🛫</div>
            <div className="sidemenu-item-content">
              <div className="sidemenu-item-title">Runway Wind &amp; Crosswind</div>
              <div className="sidemenu-item-desc">
                {runwayWindResult
                  ? `RWY ${Math.round(runwayWindResult.runwayHeading / 10).toString().padStart(2, '0')} • HW ${runwayWindResult.headwind >= 0 ? '+' : ''}${runwayWindResult.headwind}kt • XW ${runwayWindResult.crosswind}kt`
                  : 'Headwind/Tailwind & Visual Compass'}
              </div>
            </div>
            {runwayWindResult && (
              <span
                className={`sidemenu-badge ${
                  runwayWindResult.crosswindStatus === 'safe'
                    ? 'badge-green'
                    : runwayWindResult.crosswindStatus === 'caution'
                    ? 'badge-amber'
                    : 'badge-red'
                }`}
              >
                {runwayWindResult.crosswindStatus.toUpperCase()}
              </span>
            )}
          </button>

          {/* 4. SOP Form 002 Kneeboard (PDF) */}
          <button
            type="button"
            className="sidemenu-item"
            onClick={handleKneeboard}
          >
            <div className="sidemenu-item-icon">📄</div>
            <div className="sidemenu-item-content">
              <div className="sidemenu-item-title">SOP Form 002 Kneeboard</div>
              <div className="sidemenu-item-desc">
                Printable Navigation &amp; Fuel Log (PDF)
              </div>
            </div>
            <span className="sidemenu-badge badge-outline">PDF</span>
          </button>
        </div>

        {/* Footer */}
        <div className="sidemenu-footer">
          <div className="sidemenu-version">WindLog v2.1 • WMM2025 • PWA Offline Ready</div>
          <div className="sidemenu-author">Open-Source Aviation Engine</div>
        </div>
      </div>
    </div>
  );
};
