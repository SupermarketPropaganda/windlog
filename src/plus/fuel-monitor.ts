/**
 * In-Flight Fuel Monitor & Tank Switch Reminder Engine
 *
 * Tracks live fuel burn (FOB countdown), reserve compliance, and provides
 * timed reminders for cycling fuel selector valves (e.g. Left / Right tanks).
 */

export type FuelTank = 'LEFT' | 'RIGHT' | 'MAIN' | 'AUX';
export type FuelUnit = 'gph' | 'lph';

export interface FuelMonitorConfig {
  initialFob: number;             // Gallons or Liters
  fuelFlowRate: number;          // GPH or LPH
  fuelUnit: FuelUnit;
  reservePolicyMinutes: number;  // 30 or 45 min
  tankSwitchIntervalMinutes: number; // e.g. 30 min
}

export interface FuelTankSwitchEvent {
  timestamp: number;
  fromTank: FuelTank;
  toTank: FuelTank;
  fobAtSwitch: number;
}

export interface FuelMonitorState {
  initialFob: number;
  currentFob: number;
  fuelBurned: number;
  fuelUnit: FuelUnit;
  fuelFlowRate: number;
  timeToEmptySec: number;
  reserveFuelVolume: number;
  isBelowReserve: boolean;

  // Tank Cycling
  activeTank: FuelTank;
  tankSwitchIntervalSec: number;
  secondsUntilSwitch: number;
  isSwitchDue: boolean;
  isSwitchOverdue: boolean;
  switchHistory: FuelTankSwitchEvent[];
}

export class FuelMonitor {
  private config: FuelMonitorConfig;
  private activeTank: FuelTank = 'LEFT';
  private lastSwitchTimestamp: number = Date.now();
  private switchHistory: FuelTankSwitchEvent[] = [];
  private totalAirborneSec: number = 0;

  constructor(config: Partial<FuelMonitorConfig> = {}) {
    this.config = {
      initialFob: Math.max(0, Number.isFinite(config.initialFob) ? (config.initialFob as number) : 40),
      fuelFlowRate: Math.max(0, Number.isFinite(config.fuelFlowRate) ? (config.fuelFlowRate as number) : 8.5),
      fuelUnit: config.fuelUnit ?? 'gph',
      reservePolicyMinutes: Math.max(0, Number.isFinite(config.reservePolicyMinutes) ? (config.reservePolicyMinutes as number) : 45),
      tankSwitchIntervalMinutes: Math.max(1, Number.isFinite(config.tankSwitchIntervalMinutes) ? (config.tankSwitchIntervalMinutes as number) : 30),
    };
  }

  public updateConfig(updates: Partial<FuelMonitorConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      initialFob: updates.initialFob !== undefined ? Math.max(0, Number.isFinite(updates.initialFob) ? updates.initialFob : this.config.initialFob) : this.config.initialFob,
      fuelFlowRate: updates.fuelFlowRate !== undefined ? Math.max(0, Number.isFinite(updates.fuelFlowRate) ? updates.fuelFlowRate : this.config.fuelFlowRate) : this.config.fuelFlowRate,
      reservePolicyMinutes: updates.reservePolicyMinutes !== undefined ? Math.max(0, Number.isFinite(updates.reservePolicyMinutes) ? updates.reservePolicyMinutes : this.config.reservePolicyMinutes) : this.config.reservePolicyMinutes,
      tankSwitchIntervalMinutes: updates.tankSwitchIntervalMinutes !== undefined ? Math.max(1, Number.isFinite(updates.tankSwitchIntervalMinutes) ? updates.tankSwitchIntervalMinutes : this.config.tankSwitchIntervalMinutes) : this.config.tankSwitchIntervalMinutes,
    };
  }

  public tick(elapsedDeltaSec: number = 1): FuelMonitorState {
    if (Number.isFinite(elapsedDeltaSec) && elapsedDeltaSec > 0) {
      this.totalAirborneSec += elapsedDeltaSec;
    }
    return this.getState();
  }

  public setAirborneSeconds(seconds: number): void {
    if (Number.isFinite(seconds) && seconds >= 0) {
      this.totalAirborneSec = seconds;
    }
  }

  public switchTank(targetTank?: FuelTank): FuelTankSwitchEvent {
    const fromTank = this.activeTank;
    const toTank =
      targetTank ??
      (this.activeTank === 'LEFT'
        ? 'RIGHT'
        : this.activeTank === 'RIGHT'
        ? 'LEFT'
        : this.activeTank === 'MAIN'
        ? 'AUX'
        : 'MAIN');

    const state = this.getState();
    const event: FuelTankSwitchEvent = {
      timestamp: Date.now(),
      fromTank,
      toTank,
      fobAtSwitch: state.currentFob,
    };

    this.activeTank = toTank;
    this.lastSwitchTimestamp = Date.now();
    this.switchHistory.push(event);

    return event;
  }

  public resetTimer(): void {
    this.lastSwitchTimestamp = Date.now();
  }

  public getState(): FuelMonitorState {
    const hoursFlown = this.totalAirborneSec / 3600;
    const fuelBurned = Math.round(hoursFlown * this.config.fuelFlowRate * 10) / 10;
    const currentFob = Math.max(0, Math.round((this.config.initialFob - fuelBurned) * 10) / 10);

    const timeToEmptySec =
      this.config.fuelFlowRate > 0 && currentFob > 0
        ? Math.round((currentFob / this.config.fuelFlowRate) * 3600)
        : currentFob === 0 && this.config.fuelFlowRate > 0
        ? 0
        : 999999;

    const reserveFuelVolume =
      Math.round(((this.config.reservePolicyMinutes / 60) * this.config.fuelFlowRate) * 10) / 10;
    const isBelowReserve = this.config.fuelFlowRate > 0 ? currentFob <= reserveFuelVolume : false;

    const intervalSec = this.config.tankSwitchIntervalMinutes * 60;
    const secSinceSwitch = Math.max(0, Math.floor((Date.now() - this.lastSwitchTimestamp) / 1000));
    const secondsUntilSwitch = Math.max(0, intervalSec - secSinceSwitch);

    const isSwitchDue = secondsUntilSwitch === 0;
    const isSwitchOverdue = secSinceSwitch >= intervalSec + 300; // 5 min overdue

    return {
      initialFob: this.config.initialFob,
      currentFob,
      fuelBurned,
      fuelUnit: this.config.fuelUnit,
      fuelFlowRate: this.config.fuelFlowRate,
      timeToEmptySec,
      reserveFuelVolume,
      isBelowReserve,
      activeTank: this.activeTank,
      tankSwitchIntervalSec: intervalSec,
      secondsUntilSwitch,
      isSwitchDue,
      isSwitchOverdue,
      switchHistory: [...this.switchHistory],
    };
  }
}
