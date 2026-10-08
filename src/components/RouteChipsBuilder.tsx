import React, { useState, useRef, KeyboardEvent } from 'react';
import { RouteToken, Waypoint } from '../types';

export interface RouteChipsBuilderProps {
  routeInput: string;
  tokens: RouteToken[];
  resolvedWaypoints: Waypoint[];
  onRouteInputChange: (newRoute: string) => void;
  onSaveFlight?: () => void;
  isFlightSaved?: boolean;
  onShareRoute: () => void;
  onOpenKneeboard: () => void;
  onReverseRoute: () => void;
  onClearRoute: () => void;
  onTokenClick: (token: RouteToken) => void;
}

export const RouteChipsBuilder: React.FC<RouteChipsBuilderProps> = ({
  routeInput,
  tokens,
  onRouteInputChange,
  onSaveFlight,
  isFlightSaved,
  onShareRoute,
  onOpenKneeboard,
  onReverseRoute,
  onClearRoute,
  onTokenClick,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [insertValue, setInsertValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const insertInputRef = useRef<HTMLInputElement>(null);

  // Sync route input tokens into readable chip labels
  const getChipLabel = (token: RouteToken): string => {
    const ident = token.identifier;
    if (token.waypoint) {
      if (token.waypoint.type === 'airport') {
        const shortName = token.waypoint.name.split(/[\s,-]/)[0] || 'Airfield';
        return `${shortName} (${ident})`;
      }
      return `${ident} (Waypt)`;
    }
    return ident;
  };

  // Remove a specific chip by index
  const handleRemoveChip = (indexToRemove: number) => {
    const parts = routeInput.trim().split(/\s+/).filter(Boolean);
    if (indexToRemove >= 0 && indexToRemove < parts.length) {
      parts.splice(indexToRemove, 1);
      const newRoute = parts.join(' ');
      onRouteInputChange(newRoute);
      if (insertIndex !== null) setInsertIndex(null);
    }
  };

  // Reorder chips left/right
  const handleMoveChip = (fromIdx: number, direction: 'left' | 'right') => {
    const toIdx = direction === 'left' ? fromIdx - 1 : fromIdx + 1;
    const parts = routeInput.trim().split(/\s+/).filter(Boolean);
    if (fromIdx < 0 || fromIdx >= parts.length || toIdx < 0 || toIdx >= parts.length) return;
    const temp = parts[fromIdx];
    parts[fromIdx] = parts[toIdx];
    parts[toIdx] = temp;
    onRouteInputChange(parts.join(' '));
  };

  // Commit inserting a waypoint at a specific position
  const handleCommitInsert = () => {
    if (insertIndex === null) return;
    const trimmed = insertValue.trim().toUpperCase();
    if (trimmed) {
      const parts = routeInput.trim().split(/\s+/).filter(Boolean);
      parts.splice(insertIndex, 0, trimmed);
      onRouteInputChange(parts.join(' '));
    }
    setInsertIndex(null);
    setInsertValue('');
  };

  // Handle adding a token from end input
  const handleCommitInput = () => {
    const trimmed = inputValue.trim().toUpperCase();
    if (!trimmed) return;

    const currentParts = routeInput.trim().split(/\s+/).filter(Boolean);
    currentParts.push(trimmed);
    const newRoute = currentParts.join(' ');
    onRouteInputChange(newRoute);
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      handleCommitInput();
    } else if (e.key === 'Backspace' && !inputValue) {
      // Remove last chip when backspacing on empty input
      const parts = routeInput.trim().split(/\s+/).filter(Boolean);
      if (parts.length > 0) {
        parts.pop();
        onRouteInputChange(parts.join(' '));
      }
    }
  };

  return (
    <div className="route-builder-hub">
      {/* ─── Intelligent Chip Route Entry Bar ─── */}
      <div
        className={`route-chips-container ${isFocused ? 'focused' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="route-chips-list">
          {tokens.map((token, idx) => {
            const isAirport = token.waypoint?.type === 'airport';
            const isInsertingHere = insertIndex === idx;

            return (
              <React.Fragment key={`${token.identifier}_${idx}`}>
                {/* Inline Insert Trigger or Box before this chip */}
                {isInsertingHere ? (
                  <div className="route-chip-insert-box" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={insertInputRef}
                      type="text"
                      className="route-chip-insert-input"
                      placeholder="INSERT WPT..."
                      value={insertValue}
                      onChange={(e) => setInsertValue(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCommitInsert();
                        } else if (e.key === 'Escape') {
                          setInsertIndex(null);
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" className="insert-action-btn ok" onClick={handleCommitInsert}>
                      ✓
                    </button>
                    <button type="button" className="insert-action-btn cancel" onClick={() => setInsertIndex(null)}>
                      ✕
                    </button>
                  </div>
                ) : (
                  idx > 0 && (
                    <button
                      type="button"
                      className="route-chip-insert-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInsertIndex(idx);
                        setInsertValue('');
                      }}
                      title={`Insert waypoint between ${tokens[idx - 1].identifier} and ${token.identifier}`}
                    >
                      +
                    </button>
                  )
                )}

                <div
                  className={`route-chip ${isAirport ? 'airport' : 'waypoint'} ${token.status}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTokenClick(token);
                  }}
                  title={
                    token.waypoint
                      ? `${token.waypoint.name} (${token.waypoint.type.toUpperCase()})`
                      : 'Click to resolve coordinates'
                  }
                >
                  {/* Reorder Buttons (Move Earlier / Later) */}
                  <div className="route-chip-reorder-group" onClick={(e) => e.stopPropagation()}>
                    {idx > 0 && (
                      <button
                        type="button"
                        className="route-chip-move-btn"
                        onClick={() => handleMoveChip(idx, 'left')}
                        title="Move waypoint earlier"
                      >
                        ◀
                      </button>
                    )}
                    {idx < tokens.length - 1 && (
                      <button
                        type="button"
                        className="route-chip-move-btn"
                        onClick={() => handleMoveChip(idx, 'right')}
                        title="Move waypoint later"
                      >
                        ▶
                      </button>
                    )}
                  </div>

                  <span className="route-chip-label">{getChipLabel(token)}</span>
                  {token.altitudeOverride && (
                    <span className="route-chip-alt">/{token.altitudeOverride / 1000}k</span>
                  )}
                  <button
                    type="button"
                    className="route-chip-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveChip(idx);
                    }}
                    title="Remove waypoint"
                  >
                    ✕
                  </button>
                </div>
              </React.Fragment>
            );
          })}

          {/* Inline Typing Field */}
          <input
            ref={inputRef}
            type="text"
            className="route-chip-input route-input"
            placeholder={
              tokens.length === 0
                ? 'TYPE ROUTE: e.g. LPEV MAXED LPCS'
                : 'Add waypoint (e.g. LPCO)...'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              handleCommitInput();
            }}
            onKeyDown={handleKeyDown}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>

      {/* ─── Elevated Action Toolbar ─── */}
      <div className="route-action-toolbar">
        {onSaveFlight && (
          <button
            type="button"
            className={`route-btn-save ${isFlightSaved ? 'saved' : ''}`}
            onClick={onSaveFlight}
            disabled={routeInput.trim().length === 0}
            title={routeInput.trim().length > 0 ? 'Save flight to library' : 'Enter route to save'}
          >
            💾 {isFlightSaved ? 'SAVED ✓' : 'SAVE'}
          </button>
        )}

        <button
          type="button"
          className="route-btn-share"
          onClick={onShareRoute}
          disabled={routeInput.trim().length === 0}
          title="Share flight route link"
        >
          ↗ SHARE
        </button>

        <button
          type="button"
          className="route-btn-kneeboard"
          onClick={onOpenKneeboard}
          title="Open Curated SOP Form 002 PDF Kneeboard"
        >
          📒 PDF Kneeboard
        </button>

        <button
          type="button"
          className="route-btn-secondary"
          onClick={onReverseRoute}
          disabled={routeInput.trim().length === 0}
          title="Reverse Route (Return Flight)"
        >
          ⇄ Reverse
        </button>

        <button
          type="button"
          className="route-btn-secondary"
          onClick={onClearRoute}
          disabled={routeInput.trim().length === 0}
          title="Clear Route"
        >
          ✕ Clear
        </button>
      </div>

      {/* ─── Waypoint Status Pills ─── */}
      {tokens.length > 0 && (
        <div className="route-status-pills">
          {tokens.map((token, idx) => (
            <span
              key={`pill_${token.identifier}_${idx}`}
              className={`route-status-pill ${token.status}`}
              onClick={() => onTokenClick(token)}
            >
              {token.identifier} {token.status === 'resolved' ? '✓' : '⚠️'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
