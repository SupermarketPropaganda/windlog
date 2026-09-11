import { MassBalanceProfile } from '../types';

export const MASS_BALANCE_PRESETS: MassBalanceProfile[] = [
  {
    id: 'c172',
    name: 'Cessna 172S Skyhawk',
    weightUnit: 'lbs',
    armUnit: 'in',
    emptyWeight: 1663,
    emptyArm: 40.0,
    maxTakeoffWeight: 2550,
    maxLandingWeight: 2550,
    stations: [
      { id: 'front', name: 'Pilot & Front Passenger', arm: 37.0, weight: 340, maxWeight: 400 },
      { id: 'rear', name: 'Rear Passengers', arm: 73.0, weight: 0, maxWeight: 400 },
      { id: 'bag1', name: 'Baggage Area 1', arm: 95.0, weight: 20, maxWeight: 120 },
      { id: 'bag2', name: 'Baggage Area 2', arm: 123.0, weight: 0, maxWeight: 50 },
    ],
    fuelStation: {
      name: 'Fuel Tanks (53 gal usable)',
      arm: 48.0,
      fuelType: 'avgas',
      capacityGallons: 53,
      takeoffFuelVolume: 35,
      fuelUnit: 'gal',
    },
    envelope: {
      normal: [
        { arm: 35.0, weight: 1500 },
        { arm: 35.0, weight: 1950 },
        { arm: 41.0, weight: 2550 },
        { arm: 47.3, weight: 2550 },
        { arm: 47.3, weight: 1500 },
      ],
      utility: [
        { arm: 35.0, weight: 1500 },
        { arm: 35.0, weight: 1950 },
        { arm: 37.5, weight: 2200 },
        { arm: 40.5, weight: 2200 },
        { arm: 40.5, weight: 1500 },
      ],
    },
  },
  {
    id: 'pa28',
    name: 'Piper PA-28-181 Archer III',
    weightUnit: 'lbs',
    armUnit: 'in',
    emptyWeight: 1630,
    emptyArm: 86.0,
    maxTakeoffWeight: 2550,
    maxLandingWeight: 2550,
    stations: [
      { id: 'front', name: 'Front Seats (Pilot & Pax)', arm: 80.5, weight: 340, maxWeight: 400 },
      { id: 'rear', name: 'Rear Seats', arm: 118.1, weight: 0, maxWeight: 400 },
      { id: 'bag', name: 'Baggage Area', arm: 142.8, weight: 20, maxWeight: 200 },
    ],
    fuelStation: {
      name: 'Fuel Tanks (48 gal usable)',
      arm: 95.0,
      fuelType: 'avgas',
      capacityGallons: 48,
      takeoffFuelVolume: 36,
      fuelUnit: 'gal',
    },
    envelope: {
      normal: [
        { arm: 82.0, weight: 1700 },
        { arm: 82.0, weight: 2050 },
        { arm: 88.6, weight: 2550 },
        { arm: 93.0, weight: 2550 },
        { arm: 93.0, weight: 1700 },
      ],
    },
  },
  {
    id: 'p2002',
    name: 'Tecnam P2002-JF Sierra',
    weightUnit: 'kg',
    armUnit: 'm',
    emptyWeight: 360,
    emptyArm: 1.84,
    maxTakeoffWeight: 600,
    maxLandingWeight: 600,
    stations: [
      { id: 'front', name: 'Pilot & Passenger', arm: 1.80, weight: 150, maxWeight: 200 },
      { id: 'bag', name: 'Baggage Compartment', arm: 2.25, weight: 10, maxWeight: 20 },
    ],
    fuelStation: {
      name: 'Wing Tanks (100 L usable)',
      arm: 1.84,
      fuelType: 'mogas',
      capacityLiters: 100,
      takeoffFuelVolume: 70,
      fuelUnit: 'l',
    },
    envelope: {
      normal: [
        { arm: 1.78, weight: 350 },
        { arm: 1.78, weight: 600 },
        { arm: 1.95, weight: 600 },
        { arm: 1.95, weight: 350 },
      ],
    },
  },
  {
    id: 'da40',
    name: 'Diamond DA40 Star',
    weightUnit: 'kg',
    armUnit: 'm',
    emptyWeight: 795,
    emptyArm: 2.40,
    maxTakeoffWeight: 1150,
    maxLandingWeight: 1150,
    stations: [
      { id: 'front', name: 'Front Seats (Pilot & Copilot)', arm: 2.30, weight: 160, maxWeight: 200 },
      { id: 'rear', name: 'Rear Passengers', arm: 3.25, weight: 0, maxWeight: 180 },
      { id: 'bag', name: 'Baggage Compartment', arm: 3.65, weight: 15, maxWeight: 45 },
    ],
    fuelStation: {
      name: 'Main Tanks (106 L usable)',
      arm: 2.63,
      fuelType: 'avgas',
      capacityLiters: 106,
      takeoffFuelVolume: 80,
      fuelUnit: 'l',
    },
    envelope: {
      normal: [
        { arm: 2.40, weight: 750 },
        { arm: 2.40, weight: 980 },
        { arm: 2.46, weight: 1150 },
        { arm: 2.59, weight: 1150 },
        { arm: 2.59, weight: 750 },
      ],
    },
  },
  {
    id: 'rotax',
    name: 'Rotax 912 ULM / LSA (Ultralight)',
    weightUnit: 'kg',
    armUnit: 'm',
    emptyWeight: 295,
    emptyArm: 1.80,
    maxTakeoffWeight: 472.5,
    maxLandingWeight: 472.5,
    stations: [
      { id: 'front', name: 'Pilot & Passenger', arm: 1.80, weight: 150, maxWeight: 180 },
      { id: 'bag', name: 'Baggage Compartment', arm: 2.20, weight: 5, maxWeight: 15 },
    ],
    fuelStation: {
      name: 'Fuel Tank (70 L usable)',
      arm: 1.85,
      fuelType: 'mogas',
      capacityLiters: 70,
      takeoffFuelVolume: 50,
      fuelUnit: 'l',
    },
    envelope: {
      normal: [
        { arm: 1.75, weight: 280 },
        { arm: 1.75, weight: 472.5 },
        { arm: 1.90, weight: 472.5 },
        { arm: 1.90, weight: 280 },
      ],
    },
  },
];

import { getStorageItemSync, setStorageItem } from './storage-manager';

const CUSTOM_MB_STORAGE_KEY = 'windlog_custom_mb_profiles';

export function loadSavedCustomProfiles(): MassBalanceProfile[] {
  return getStorageItemSync<MassBalanceProfile[]>(CUSTOM_MB_STORAGE_KEY, []);
}

export function saveCustomProfile(profile: MassBalanceProfile): void {
  const list = loadSavedCustomProfiles().filter(p => p.id !== profile.id);
  list.push({ ...profile, isCustom: true });
  setStorageItem(CUSTOM_MB_STORAGE_KEY, list);
}

export function deleteCustomProfile(id: string): void {
  const list = loadSavedCustomProfiles().filter(p => p.id !== id);
  setStorageItem(CUSTOM_MB_STORAGE_KEY, list);
}
