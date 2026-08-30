import React, { useEffect, useState } from 'react';
import { AircraftProfile, FuelUnit } from '../types';

export interface AircraftBarProps {
  /** The current aircraft profile */
  profile: AircraftProfile;
  /** Callback fired when the profile is updated */
  onChange: (profile: AircraftProfile) => void;
}

export interface AircraftPreset {
  id: string;
  name: string;
  tas: number;
  fuelFlow: number;
  fuelUnit: FuelUnit;
  cruiseAltitude: number;
}

export const AIRCRAFT_PRESETS: AircraftPreset[] = [
  {
    id: 'c172',
    name: 'Cessna 172 Skyhawk',
    tas: 105,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
    cruiseAltitude: 4500,
  },
  {
    id: 'pa28',
    name: 'Piper PA-28 Cherokee',
    tas: 115,
    fuelFlow: 9.0,
    fuelUnit: 'gph',
    cruiseAltitude: 4500,
  },
  {
    id: 'da40',
    name: 'Diamond DA40 Star',
    tas: 130,
    fuelFlow: 6.5,
    fuelUnit: 'gph',
    cruiseAltitude: 5500,
  },
  {
    id: 'p2002',
    name: 'Tecnam P2002-JF Sierra',
    tas: 90,
    fuelFlow: 16.0,
    fuelUnit: 'lph',
    cruiseAltitude: 3500,
  },
  {
    id: 'rotax',
    name: 'Rotax 912 (ULM / LSA)',
    tas: 90,
    fuelFlow: 15.0,
    fuelUnit: 'lph',
    cruiseAltitude: 2500,
  },
  {
    id: 'custom',
    name: 'Custom Aircraft',
    tas: 105,
    fuelFlow: 8.5,
    fuelUnit: 'gph',
    cruiseAltitude: 4500,
  },
];

/**
 * Top control bar with aircraft presets, cruise altitude, TAS, and fuel burn rate.
 */
export const AircraftBar: React.FC<AircraftBarProps> = ({ profile, onChange }) => {
  const [alt, setAlt] = useState(profile.cruiseAltitude.toString());
  const [tas, setTas] = useState(profile.tas.toString());
  const [fuel, setFuel] = useState((profile.fuelFlow || 8.5).toString());
  const [selectedModel, setSelectedModel] = useState<string>(profile.aircraftModel || 'c172');

  useEffect(() => {
    setAlt(profile.cruiseAltitude.toString());
    setTas(profile.tas.toString());
    setFuel((profile.fuelFlow || 8.5).toString());
    if (profile.aircraftModel) {
      setSelectedModel(profile.aircraftModel);
    }
  }, [profile]);

  const handlePresetSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = e.target.value;
    setSelectedModel(presetId);
    const preset = AIRCRAFT_PRESETS.find((p) => p.id === presetId);
    if (preset && presetId !== 'custom') {
      setAlt(preset.cruiseAltitude.toString());
      setTas(preset.tas.toString());
      setFuel(preset.fuelFlow.toString());
      onChange({
        aircraftModel: presetId,
        cruiseAltitude: preset.cruiseAltitude,
        tas: preset.tas,
        fuelFlow: preset.fuelFlow,
        fuelUnit: preset.fuelUnit,
      });
    } else {
      onChange({
        ...profile,
        aircraftModel: 'custom',
      });
    }
  };

  const handleAltChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlt(e.target.value);
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      onChange({ ...profile, cruiseAltitude: val });
    }
  };

  const handleTasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTas(e.target.value);
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      onChange({ ...profile, tas: val, aircraftModel: 'custom' });
      setSelectedModel('custom');
    }
  };

  const handleFuelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFuel(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      onChange({ ...profile, fuelFlow: val, aircraftModel: 'custom' });
      setSelectedModel('custom');
    }
  };

  const handleUnitToggle = (unit: FuelUnit) => {
    let newFlow = profile.fuelFlow || 8.5;
    // Conversion if changing units
    if (profile.fuelUnit === 'gph' && unit === 'lph') {
      newFlow = Math.round(newFlow * 3.78541 * 10) / 10;
    } else if (profile.fuelUnit === 'lph' && unit === 'gph') {
      newFlow = Math.round((newFlow / 3.78541) * 10) / 10;
    }
    setFuel(newFlow.toString());
    onChange({
      ...profile,
      fuelFlow: newFlow,
      fuelUnit: unit,
    });
  };

  return (
    <div className="aircraft-bar">
      <div className="input-group preset-group">
        <label>Aircraft Model</label>
        <select
          className="aircraft-select"
          value={selectedModel}
          onChange={handlePresetSelect}
        >
          {AIRCRAFT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>Cruise Altitude</label>
        <div className="input-with-suffix">
          <input
            type="number"
            step="500"
            placeholder="4500"
            value={alt}
            onChange={handleAltChange}
          />
          <span className="suffix">ft</span>
        </div>
      </div>

      <div className="input-group">
        <label>True Airspeed (TAS)</label>
        <div className="input-with-suffix">
          <input
            type="number"
            step="5"
            placeholder="105"
            value={tas}
            onChange={handleTasChange}
          />
          <span className="suffix">kt</span>
        </div>
      </div>

      <div className="input-group">
        <div className="label-with-unit-switch">
          <label>Fuel Burn</label>
          <div className="unit-switch">
            <button
              type="button"
              className={`unit-btn ${profile.fuelUnit === 'gph' ? 'active' : ''}`}
              onClick={() => handleUnitToggle('gph')}
              title="Gallons per Hour"
            >
              GPH
            </button>
            <button
              type="button"
              className={`unit-btn ${profile.fuelUnit === 'lph' ? 'active' : ''}`}
              onClick={() => handleUnitToggle('lph')}
              title="Liters per Hour"
            >
              L/h
            </button>
          </div>
        </div>
        <div className="input-with-suffix">
          <input
            type="number"
            step="0.5"
            placeholder={profile.fuelUnit === 'gph' ? '8.5' : '32'}
            value={fuel}
            onChange={handleFuelChange}
          />
          <span className="suffix">{profile.fuelUnit === 'gph' ? 'gph' : 'L/h'}</span>
        </div>
      </div>
    </div>
  );
};
