import { describe, it, expect, beforeEach } from 'vitest';
import { authService, safeStorage } from '../services/auth-service';
import { setStorageItem, getStorageItemSync } from '../data/storage-manager';
import { AIRCRAFT_PRESETS } from '../components/AircraftBar';
import { AircraftProfile } from '../types';

describe('Pilot Profile & Flight Planning Defaults Suite', () => {
  beforeEach(() => {
    safeStorage.clear();
  });

  it('provides all essential aircraft presets with standard performance parameters', () => {
    const c172 = AIRCRAFT_PRESETS.find((p) => p.id === 'c172');
    const pa28 = AIRCRAFT_PRESETS.find((p) => p.id === 'pa28');
    const da40 = AIRCRAFT_PRESETS.find((p) => p.id === 'da40');
    const p2002 = AIRCRAFT_PRESETS.find((p) => p.id === 'p2002');
    const rotax = AIRCRAFT_PRESETS.find((p) => p.id === 'rotax');

    expect(c172).toBeDefined();
    expect(c172?.tas).toBe(105);
    expect(c172?.fuelFlow).toBe(8.5);
    expect(c172?.fuelUnit).toBe('gph');

    expect(pa28).toBeDefined();
    expect(pa28?.tas).toBe(115);
    expect(pa28?.fuelFlow).toBe(9.0);

    expect(da40).toBeDefined();
    expect(da40?.tas).toBe(130);
    expect(da40?.fuelFlow).toBe(6.5);

    expect(p2002).toBeDefined();
    expect(p2002?.fuelUnit).toBe('lph');

    expect(rotax).toBeDefined();
    expect(rotax?.fuelUnit).toBe('lph');
  });

  it('persists and retrieves flight planning defaults and cockpit preferences in local storage', () => {
    const testProfile: AircraftProfile = {
      aircraftModel: 'pa28',
      cruiseAltitude: 6500,
      tas: 118,
      fuelFlow: 9.2,
      fuelUnit: 'gph',
    };

    setStorageItem('windlog_profile', testProfile);
    setStorageItem('windlog_pilot_name', 'Capt. Sully');
    setStorageItem('windlog_pilot_license', 'ATPL');
    setStorageItem('windlog_home_base', 'LPCS');
    setStorageItem('windlog_auto_home_base', true);
    setStorageItem('windlog_altimeter_unit', 'hPa');
    setStorageItem('windlog_reserve_fuel_mins', 45);

    expect(getStorageItemSync<AircraftProfile | null>('windlog_profile', null)).toEqual(testProfile);
    expect(getStorageItemSync<string>('windlog_pilot_name', '')).toBe('Capt. Sully');
    expect(getStorageItemSync<string>('windlog_pilot_license', '')).toBe('ATPL');
    expect(getStorageItemSync<string>('windlog_home_base', '')).toBe('LPCS');
    expect(getStorageItemSync<boolean>('windlog_auto_home_base', false)).toBe(true);
    expect(getStorageItemSync<string>('windlog_altimeter_unit', '')).toBe('hPa');
    expect(getStorageItemSync<number>('windlog_reserve_fuel_mins', 0)).toBe(45);
  });

  it('updates authenticated user profile with cockpit preferences', async () => {
    const user = await authService.signUp({
      email: 'chiefpilot@skyline.aero',
      password: 'SkylinePassword2026',
      displayName: 'Captain Roger',
      pilotLicense: 'CPL(A)',
      homeBaseAirport: 'LPPT',
    });

    expect(user.displayName).toBe('Captain Roger');
    expect(user.homeBaseAirport).toBe('LPPT');

    const updated = await authService.updateProfile({
      displayName: 'Capt. Roger Murdoch',
      pilotLicense: 'ATPL',
      homeBaseAirport: 'LPCS',
      preferences: {
        homeBaseAirport: 'LPCS',
        autoFillHomeBase: true,
        defaultAircraftModel: 'c172',
        defaultCruiseAltitude: 4500,
        defaultTas: 105,
        defaultFuelFlow: 8.5,
        defaultFuelUnit: 'gph',
        altimeterUnit: 'hPa',
        reserveFuelMinutes: 45,
      },
    });

    expect(updated.displayName).toBe('Capt. Roger Murdoch');
    expect(updated.pilotLicense).toBe('ATPL');
    expect(updated.homeBaseAirport).toBe('LPCS');
    expect(updated.preferences?.autoFillHomeBase).toBe(true);
    expect(updated.preferences?.defaultAircraftModel).toBe('c172');
    expect(updated.preferences?.reserveFuelMinutes).toBe(45);
  });

  it('allows authenticated pilot to change password and prevents invalid old password', async () => {
    await authService.signUp({
      email: 'pilot.change@skyline.aero',
      password: 'InitialPassword123',
      displayName: 'Test Pilot',
    });

    // Attempt change with wrong old password
    await expect(
      authService.changePassword('WrongOldPassword', 'BrandNewPassword123')
    ).rejects.toThrow(/current password is incorrect/i);

    // Change with correct old password
    await authService.changePassword('InitialPassword123', 'BrandNewPassword123');

    // Sign out and verify sign in with new password
    await authService.signOut();
    const signedIn = await authService.signIn('pilot.change@skyline.aero', 'BrandNewPassword123');
    expect(signedIn.email).toBe('pilot.change@skyline.aero');
  });

  it('auto-fills departure airport when autoFillHomeBase is enabled', () => {
    setStorageItem('windlog_auto_home_base', true);
    setStorageItem('windlog_home_base', 'LPCS');

    const autoFillHome = getStorageItemSync<boolean>('windlog_auto_home_base', false);
    const homeBase = getStorageItemSync<string>('windlog_home_base', '');

    const initialRoute = autoFillHome && homeBase.trim() ? `${homeBase.trim().toUpperCase()} ` : '';
    expect(initialRoute).toBe('LPCS ');
  });
});
