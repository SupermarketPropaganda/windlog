import React from 'react';
import { ActiveView, NavLogSummary, MassBalanceResult, RunwayWindResult } from '../types';
import { useAuth } from '../context/AuthContext';

export interface SideMenuProps {
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  isOpen: boolean;
  onToggle: () => void;
  onOpenKneeboard: () => void;
  onOpenLegal?: () => void;
  airacCycle?: string;
  airacStatus?: 'CURRENT' | 'EXPIRING_SOON' | 'EXPIRED';
  navLogSummary: NavLogSummary | null;
  massBalanceResult?: MassBalanceResult | null;
  runwayWindResult?: RunwayWindResult | null;
}

export const SideMenu: React.FC<SideMenuProps> = ({
  activeView,
  onChangeView,
  isOpen,
  onToggle,
  onOpenKneeboard,
  onOpenLegal,
  airacCycle,
  airacStatus,
  navLogSummary,
  massBalanceResult,
  runwayWindResult,
}) => {
  const { user, signOut } = useAuth();

  const handleSelect = (view: ActiveView) => {
    onChangeView(view);
    // On mobile devices (< 980px), automatically collapse sidebar on selection
    if (window.innerWidth < 980) {
      onToggle();
    }
  };

  const handleKneeboard = () => {
    onOpenKneeboard();
    if (window.innerWidth < 980) {
      onToggle();
    }
  };

  const handleLegal = () => {
    if (onOpenLegal) onOpenLegal();
    if (window.innerWidth < 980) {
      onToggle();
    }
  };

  const handleSignOut = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await signOut();
    onChangeView('landing');
  };

  return (
    <>
      {/* Floating Toggle Button when Sidebar is Collapsed (Gemini Style) */}
      {!isOpen && (
        <button
          type="button"
          className="gemini-sidebar-toggle-btn no-print"
          onClick={onToggle}
          title="Open Sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <path d="M14 9l3 3-3 3" />
          </svg>
        </button>
      )}

      {/* Backdrop overlay for mobile */}
      {isOpen && (
        <div className="gemini-sidebar-backdrop" onClick={onToggle} />
      )}

      {/* Persistent Gemini-Style Sidebar Drawer */}
      <aside className={`gemini-sidebar no-print ${isOpen ? 'open' : 'closed'}`}>
        {/* Header with Title and Collapse Button */}
        <div className="gemini-sidebar-header">
          <div className="gemini-sidebar-brand">
            <span className="gemini-brand-icon">✈</span>
            <div className="gemini-brand-text">
              <span className="gemini-brand-title">WindLog</span>
              <span className="gemini-brand-sub">Cockpit Suite</span>
            </div>
          </div>

          <button
            type="button"
            className="gemini-sidebar-collapse-btn"
            onClick={onToggle}
            title="Collapse Sidebar"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <path d="M16 15l-3-3 3-3" />
            </svg>
          </button>
        </div>

        {/* Authenticated Pilot Card with Sign Out */}
        <div
          className={`gemini-pilot-card ${activeView === 'auth' ? 'active' : ''}`}
          onClick={() => handleSelect('auth')}
          title="View / Edit Pilot Profile"
        >
          <div className="gemini-pilot-avatar">
            {(user?.displayName || user?.email || 'P')[0].toUpperCase()}
          </div>
          <div className="gemini-pilot-meta">
            <div className="gemini-pilot-name">
              {user?.displayName || user?.email}
            </div>
            <div className="gemini-pilot-sub">
              {user?.pilotLicense ? user.pilotLicense : 'PIC'}
            </div>
          </div>
          <button
            type="button"
            className="gemini-pilot-signout-btn"
            onClick={handleSignOut}
            title="Sign Out of Cockpit"
          >
            Sign Out
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="gemini-sidebar-nav">
          <div className="gemini-nav-section-title">FLIGHT TOOLS</div>

          {/* 1. Flight Planner & NavLog */}
          <button
            type="button"
            className={`gemini-nav-item ${activeView === 'navlog' ? 'active' : ''}`}
            onClick={() => handleSelect('navlog')}
          >
            <span className="gemini-nav-icon">🗺️</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">Flight Planner</div>
              <div className="gemini-nav-hint">
                {navLogSummary && navLogSummary.legs.length > 0
                  ? `${navLogSummary.legs.length} legs • ${navLogSummary.totalDistance.toFixed(1)} NM`
                  : 'Scratchpad & Map'}
              </div>
            </div>
            {navLogSummary && navLogSummary.legs.length > 0 && (
              <span className="gemini-nav-badge badge-blue">
                {navLogSummary.legs.length}
              </span>
            )}
          </button>

          {/* 2. Mass & Balance */}
          <button
            type="button"
            className={`gemini-nav-item ${activeView === 'mass-balance' ? 'active' : ''}`}
            onClick={() => handleSelect('mass-balance')}
          >
            <span className="gemini-nav-icon">⚖️</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">Mass &amp; Balance</div>
              <div className="gemini-nav-hint">
                {massBalanceResult
                  ? massBalanceResult.isTOWInEnvelope && !massBalanceResult.isOverweightTOW
                    ? `TOW ${massBalanceResult.takeoffWeight} • Safe`
                    : 'Limits Exceeded!'
                  : 'CG Envelopes & Loading'}
              </div>
            </div>
            {massBalanceResult && (
              <span
                className={`gemini-nav-badge ${
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
            className={`gemini-nav-item ${activeView === 'runway-wind' ? 'active' : ''}`}
            onClick={() => handleSelect('runway-wind')}
          >
            <span className="gemini-nav-icon">🛫</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">Runway Wind</div>
              <div className="gemini-nav-hint">
                {runwayWindResult
                  ? `RWY ${Math.round(runwayWindResult.runwayHeading / 10).toString().padStart(2, '0')} • HW ${runwayWindResult.headwind >= 0 ? '+' : ''}${runwayWindResult.headwind}kt`
                  : 'Crosswind & Compass'}
              </div>
            </div>
            {runwayWindResult && (
              <span
                className={`gemini-nav-badge ${
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

          {/* 4. Pilot Profile & Account */}
          <button
            type="button"
            className={`gemini-nav-item ${activeView === 'auth' ? 'active' : ''}`}
            onClick={() => handleSelect('auth')}
          >
            <span className="gemini-nav-icon">👤</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">Pilot Profile</div>
              <div className="gemini-nav-hint">Credentials &amp; Settings</div>
            </div>
          </button>

          <div className="gemini-nav-section-title" style={{ marginTop: '1rem' }}>
            DOCUMENTS &amp; LOGS
          </div>

          {/* 4. SOP Form 002 Kneeboard (PDF) */}
          <button
            type="button"
            className="gemini-nav-item"
            onClick={handleKneeboard}
          >
            <span className="gemini-nav-icon">📄</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">SOP Form 002</div>
              <div className="gemini-nav-hint">Printable Kneeboard (PDF)</div>
            </div>
            <span className="gemini-nav-badge badge-outline">PDF</span>
          </button>

          {/* 5. Legal & Disclaimer */}
          <button
            type="button"
            className="gemini-nav-item"
            onClick={handleLegal}
          >
            <span className="gemini-nav-icon">⚖️</span>
            <div className="gemini-nav-body">
              <div className="gemini-nav-label">Legal &amp; Terms</div>
              <div className="gemini-nav-hint">PIC Disclaimer &amp; EULA</div>
            </div>
            <span className="gemini-nav-badge badge-outline">v2026.1</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="gemini-sidebar-footer">
          <div className="gemini-footer-status">
            <span className="status-indicator-dot"></span>
            <span>AIRAC {airacCycle || '2609'}</span>
            <span
              style={{
                marginLeft: '0.4rem',
                fontSize: '0.65rem',
                padding: '0.1rem 0.35rem',
                borderRadius: '4px',
                backgroundColor:
                  airacStatus === 'CURRENT'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : airacStatus === 'EXPIRING_SOON'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(239, 68, 68, 0.2)',
                color:
                  airacStatus === 'CURRENT'
                    ? '#10b981'
                    : airacStatus === 'EXPIRING_SOON'
                    ? '#f59e0b'
                    : '#ef4444',
                fontWeight: 600,
              }}
            >
              {airacStatus || 'CURRENT'}
            </span>
          </div>
          <div className="gemini-footer-version">WindLog v2.1 • WMM2025 • OPFS</div>
        </div>
      </aside>
    </>
  );
};
