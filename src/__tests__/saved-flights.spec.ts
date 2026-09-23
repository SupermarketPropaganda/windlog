import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveFlightRecord,
  getSavedFlightsSync,
  deleteSavedFlight,
  getSavedFlightById,
  generateFlightTitle,
  clearAllSavedFlights,
} from '../data/saved-flights';
import { safeStorage } from '../services/auth-service';
import { Waypoint } from '../types';

describe('Saved Flights Storage & Management', () => {
  beforeEach(async () => {
    safeStorage.clear();
    await clearAllSavedFlights();
  });

  it('generates meaningful titles based on waypoints or route strings', () => {
    const wpts: Waypoint[] = [
      {
        id: 1,
        identifier: 'LPCS',
        name: 'Cascais Tires',
        type: 'airport',
        latitude: 38.7256,
        longitude: -9.3556,
        country: 'PT',
      },
      {
        id: 2,
        identifier: 'LPPT',
        name: 'Lisboa Portela',
        type: 'airport',
        latitude: 38.7742,
        longitude: -9.1342,
        country: 'PT',
      },
    ];

    expect(generateFlightTitle('LPCS LPPT', wpts)).toBe('LPCS ➔ LPPT');
    expect(generateFlightTitle('LPCS/4500 COIMB/3500 LPPT')).toBe('LPCS ➔ LPPT');
    expect(generateFlightTitle('LPCS')).toBe('Flight from LPCS');
  });

  it('saves and retrieves flights in durable storage', async () => {
    const flight = await saveFlightRecord({
      name: 'Cascais to Porto Scenic',
      routeInput: 'LPCS COIMB LPPR',
      departureTime: '2026-09-24T14:00:00.000Z',
      profile: {
        aircraftModel: 'Cessna 172',
        cruiseAltitude: 4500,
        tas: 110,
        fuelFlow: 8.5,
        fuelUnit: 'gph',
      },
      legAltitudeOverrides: { 1: 3500 },
      summary: {
        totalDistance: 154.2,
        totalEte: 5040,
        totalFuel: 11.9,
        legsCount: 2,
      },
      userId: 'pilot_123',
    });

    expect(flight.id).toBeDefined();
    expect(flight.name).toBe('Cascais to Porto Scenic');
    expect(flight.departureTime).toBe('2026-09-24T14:00:00.000Z');

    const all = getSavedFlightsSync('pilot_123');
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(flight.id);
    expect(all[0].routeInput).toBe('LPCS COIMB LPPR');

    // Retrieve by ID
    const retrieved = getSavedFlightById(flight.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Cascais to Porto Scenic');
  });

  it('updates an existing saved flight and updates timestamps', async () => {
    const flight = await saveFlightRecord({
      name: 'Original Flight',
      routeInput: 'LPCS LPPT',
      departureTime: null,
      profile: {
        cruiseAltitude: 3000,
        tas: 100,
        fuelFlow: 8.0,
        fuelUnit: 'gph',
      },
      legAltitudeOverrides: {},
    });

    // Update with new name and altitude
    const updated = await saveFlightRecord({
      id: flight.id,
      name: 'Renamed Flight Route',
      routeInput: 'LPCS COIMB LPPT',
      departureTime: '2026-09-25T10:00:00.000Z',
      profile: {
        ...flight.profile,
        cruiseAltitude: 5500,
      },
      legAltitudeOverrides: { 0: 5500 },
    });

    expect(updated.id).toBe(flight.id);
    expect(updated.name).toBe('Renamed Flight Route');
    expect(updated.departureTime).toBe('2026-09-25T10:00:00.000Z');
    expect(updated.createdAt).toBe(flight.createdAt);

    const all = getSavedFlightsSync();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Renamed Flight Route');
  });

  it('deletes saved flights successfully', async () => {
    const flight1 = await saveFlightRecord({
      name: 'Flight Alpha',
      routeInput: 'LPCS LPPT',
      departureTime: null,
      profile: { cruiseAltitude: 3000, tas: 100, fuelFlow: 8, fuelUnit: 'gph' },
      legAltitudeOverrides: {},
    });

    const flight2 = await saveFlightRecord({
      name: 'Flight Beta',
      routeInput: 'LPPR LPMA',
      departureTime: null,
      profile: { cruiseAltitude: 4500, tas: 120, fuelFlow: 9, fuelUnit: 'gph' },
      legAltitudeOverrides: {},
    });

    expect(getSavedFlightsSync().length).toBe(2);

    const deleted = await deleteSavedFlight(flight1.id);
    expect(deleted).toBe(true);

    const remaining = getSavedFlightsSync();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(flight2.id);

    // Deleting non-existent ID returns false
    const deletedAgain = await deleteSavedFlight('non_existent_id');
    expect(deletedAgain).toBe(false);
  });
});
