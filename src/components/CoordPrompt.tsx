import React, { useState } from 'react';
import { Waypoint } from '../types';

export interface CoordPromptProps {
  /** The unknown identifier entered by the user */
  identifier: string;
  /** Callback fired with the constructed custom waypoint */
  onConfirm: (waypoint: Waypoint) => void;
  /** Callback fired to dismiss the modal */
  onCancel: () => void;
}

/**
 * Parses coordinates from decimal degrees (e.g. "38.725, -9.355", "+38.725 -9.355")
 * or DMS format (e.g. "N38°43'30\" W009°21'19\"", "38°43'30\"N 009°21'19\"W").
 * Validates coordinate ranges (Lat [-90, 90], Lon [-180, 180]).
 */
export function parseCoordinates(input: string): { lat: number; lon: number } | null {
  if (!input) return null;
  const clean = input.trim();

  // 1. Decimal degrees (comma, space, or semicolon separated)
  const decimalRegex = /^([+-]?\d+(?:\.\d+)?)[,\s;]+([+-]?\d+(?:\.\d+)?)$/;
  const decMatch = clean.match(decimalRegex);
  if (decMatch) {
    const lat = parseFloat(decMatch[1]);
    const lon = parseFloat(decMatch[2]);
    if (isNaN(lat) || isNaN(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  // 2. DMS with Prefix Direction: N38°43'30" W009°21'19"
  const prefixDmsRegex = /^([NS])\s*(\d+)°?\s*(\d+)'?\s*(\d+(?:\.\d+)?)?"?\s*[,/;\s]+\s*([EW])\s*(\d+)°?\s*(\d+)'?\s*(\d+(?:\.\d+)?)?"?$/i;
  let match = clean.match(prefixDmsRegex);
  if (match) {
    const latDir = match[1].toUpperCase();
    const latDeg = parseInt(match[2], 10);
    const latMin = parseInt(match[3] || '0', 10);
    const latSec = parseFloat(match[4] || '0');
    if (latMin >= 60 || latSec >= 60) return null;

    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === 'S') lat = -lat;

    const lonDir = match[5].toUpperCase();
    const lonDeg = parseInt(match[6], 10);
    const lonMin = parseInt(match[7] || '0', 10);
    const lonSec = parseFloat(match[8] || '0');
    if (lonMin >= 60 || lonSec >= 60) return null;

    let lon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (lonDir === 'W') lon = -lon;

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  // 3. DMS with Suffix Direction: 38°43'30"N 009°21'19"W
  const suffixDmsRegex = /^(\d+)°?\s*(\d+)'?\s*(\d+(?:\.\d+)?)?"?\s*([NS])\s*[,/;\s]+\s*(\d+)°?\s*(\d+)'?\s*(\d+(?:\.\d+)?)?"?\s*([EW])$/i;
  match = clean.match(suffixDmsRegex);
  if (match) {
    const latDeg = parseInt(match[1], 10);
    const latMin = parseInt(match[2] || '0', 10);
    const latSec = parseFloat(match[3] || '0');
    const latDir = match[4].toUpperCase();
    if (latMin >= 60 || latSec >= 60) return null;

    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === 'S') lat = -lat;

    const lonDeg = parseInt(match[5], 10);
    const lonMin = parseInt(match[6] || '0', 10);
    const lonSec = parseFloat(match[7] || '0');
    const lonDir = match[8].toUpperCase();
    if (lonMin >= 60 || lonSec >= 60) return null;

    let lon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (lonDir === 'W') lon = -lon;

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  return null;
}

/**
 * Modal overlay for manually entering custom waypoint coordinates.
 */
export const CoordPrompt: React.FC<CoordPromptProps> = ({ identifier, onConfirm, onCancel }) => {
  const [coordInput, setCoordInput] = useState('');
  const [name, setName] = useState('');
  const [save, setSave] = useState(true);

  const parsed = parseCoordinates(coordInput);

  const handleConfirm = () => {
    if (parsed) {
      onConfirm({
        id: Date.now(),
        identifier: identifier.toUpperCase(),
        name: name || identifier.toUpperCase(),
        type: 'custom',
        latitude: parsed.lat,
        longitude: parsed.lon,
        country: 'ZZ',
        isCustom: true,
      });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="coord-prompt">
        <h2>Waypoint "{identifier.toUpperCase()}" not found</h2>
        <p>Enter coordinates manually</p>

        <div className="form-group">
          <label>Coordinates (Decimal or DMS)</label>
          <input
            type="text"
            placeholder="38.725, -9.355 or 38°43'30&quot;N 009°21'19&quot;W"
            value={coordInput}
            onChange={(e) => setCoordInput(e.target.value)}
          />
          {parsed ? (
            <div className="coord-preview">
              ✓ Parsed: {parsed.lat.toFixed(4)}°, {parsed.lon.toFixed(4)}°
            </div>
          ) : (
            coordInput.trim().length > 0 && (
              <div className="coord-preview" style={{ color: 'var(--danger-color)' }}>
                Invalid format or out of bounds (Lat: ±90, Lon: ±180)
              </div>
            )
          )}
        </div>

        <div className="form-group">
          <label>Name (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Farm strip / Reporting Point"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="save-wpt"
            checked={save}
            onChange={(e) => setSave(e.target.checked)}
          />
          <label htmlFor="save-wpt">Save for future routes</label>
        </div>

        <div className="modal-actions">
          <button className="btn btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-confirm" onClick={handleConfirm} disabled={!parsed}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
