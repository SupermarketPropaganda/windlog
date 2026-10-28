import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuelMonitor } from '../fuel-monitor';

describe('FuelMonitor In-Flight FOB & Tank Cycling Engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default config and calculates fuel burn accurately', () => {
    const monitor = new FuelMonitor({
      initialFob: 40,
      fuelFlowRate: 10, // 10 GPH
      reservePolicyMinutes: 45,
      tankSwitchIntervalMinutes: 30,
    });

    const state0 = monitor.getState();
    expect(state0.currentFob).toBe(40);
    expect(state0.fuelBurned).toBe(0);
    expect(state0.timeToEmptySec).toBe(4 * 3600); // 40 gal @ 10 gph = 4 hrs
    expect(state0.reserveFuelVolume).toBe(7.5);   // 45 min @ 10 gph = 7.5 gal
    expect(state0.isBelowReserve).toBe(false);

    // Simulate 1.5 hours flown (5400 seconds)
    monitor.setAirborneSeconds(5400);
    const state1 = monitor.getState();
    expect(state1.fuelBurned).toBe(15); // 1.5 hrs * 10 GPH = 15 gal
    expect(state1.currentFob).toBe(25);  // 40 - 15 = 25 gal
    expect(state1.timeToEmptySec).toBe(2.5 * 3600);
  });

  it('triggers fuel tank switch reminder when interval expires', () => {
    const monitor = new FuelMonitor({
      initialFob: 40,
      fuelFlowRate: 8.5,
      tankSwitchIntervalMinutes: 30,
    });

    expect(monitor.getState().activeTank).toBe('LEFT');
    expect(monitor.getState().secondsUntilSwitch).toBe(1800);
    expect(monitor.getState().isSwitchDue).toBe(false);

    // Fast forward 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);

    const dueState = monitor.getState();
    expect(dueState.secondsUntilSwitch).toBe(0);
    expect(dueState.isSwitchDue).toBe(true);

    // Pilot switches tank to RIGHT
    const switchEvent = monitor.switchTank();
    expect(switchEvent.fromTank).toBe('LEFT');
    expect(switchEvent.toTank).toBe('RIGHT');

    const resetState = monitor.getState();
    expect(resetState.activeTank).toBe('RIGHT');
    expect(resetState.secondsUntilSwitch).toBe(1800);
    expect(resetState.isSwitchDue).toBe(false);
    expect(resetState.switchHistory.length).toBe(1);
  });

  it('flags reserve fuel penetration when FOB falls below reserve policy', () => {
    const monitor = new FuelMonitor({
      initialFob: 20,
      fuelFlowRate: 10,
      reservePolicyMinutes: 45, // 7.5 gal reserve
    });

    // Burn 15 gallons (1.5 hrs)
    monitor.setAirborneSeconds(1.5 * 3600);
    const state = monitor.getState();
    expect(state.currentFob).toBe(5);
    expect(state.isBelowReserve).toBe(true);
  });
});
