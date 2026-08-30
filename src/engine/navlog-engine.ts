import { Waypoint, Leg, AircraftProfile, Wind, NavLogSummary } from '../types';
import { greatCircleDistance, initialBearing, intermediatePoint } from './coordinate-math';
import { magneticDeclination } from './wmm2025';
import { solveWindTriangle } from './wind-triangle';

export interface SemicircularRuleResult {
  isEastbound: boolean;
  ruleLabel: string;
  suggestedAltitude: number;
  availableLevels: number[];
}

/**
 * Calculates standard ICAO VFR semicircular cruising level options.
 * Magnetic track 000°-179° (North/Eastbound): Odd thousands + 500 ft (1500, 3500, 5500, 7500, 9500...)
 * Magnetic track 180°-359° (South/Westbound): Even thousands + 500 ft (2500, 4500, 6500, 8500, 10500...)
 * @param magneticTrack Magnetic track in degrees (0-360)
 * @param currentAltitude Current leg altitude to find the closest recommendation
 */
export function getSemicircularOptions(
  magneticTrack: number,
  currentAltitude: number = 4500
): SemicircularRuleResult {
  const normTrack = ((magneticTrack % 360) + 360) % 360;
  const isEastbound = normTrack >= 0 && normTrack < 180;

  if (isEastbound) {
    const levels = [1500, 3500, 5500, 7500, 9500, 11500];
    let closest = levels[0];
    let minDiff = Math.abs(currentAltitude - closest);
    for (const lvl of levels) {
      const diff = Math.abs(currentAltitude - lvl);
      if (diff < minDiff) {
        minDiff = diff;
        closest = lvl;
      }
    }

    return {
      isEastbound: true,
      ruleLabel: 'North / Eastbound (000°-179° Magnetic Track): ODD + 500',
      suggestedAltitude: closest,
      availableLevels: levels,
    };
  } else {
    const levels = [2500, 4500, 6500, 8500, 10500];
    let closest = levels[0];
    let minDiff = Math.abs(currentAltitude - closest);
    for (const lvl of levels) {
      const diff = Math.abs(currentAltitude - lvl);
      if (diff < minDiff) {
        minDiff = diff;
        closest = lvl;
      }
    }

    return {
      isEastbound: false,
      ruleLabel: 'South / Westbound (180°-359° Magnetic Track): EVEN + 500',
      suggestedAltitude: closest,
      availableLevels: levels,
    };
  }
}

/**
 * Computes the navigation log summary for a given sequence of waypoints,
 * taking into account per-leg altitudes, winds, and aircraft fuel performance.
 */
export function computeNavLog(
  waypoints: Waypoint[],
  profile: AircraftProfile,
  wind: Wind | null,
  legAltitudes?: (number | undefined)[],
  legWinds?: (Wind | null)[]
): NavLogSummary {
  const legs: Leg[] = [];
  let totalDistance = 0;
  let totalEte = 0;
  let totalFuel = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    // Determine altitude for this specific leg
    const legAltitude =
      legAltitudes && legAltitudes[i] !== undefined && legAltitudes[i]! > 0
        ? legAltitudes[i]!
        : profile.cruiseAltitude;

    // Determine wind for this specific leg
    const legWind = legWinds && legWinds[i] !== undefined ? legWinds[i] : wind;

    // Calculate distance and true track
    const distance = greatCircleDistance(from.latitude, from.longitude, to.latitude, to.longitude);
    const trueTrack = initialBearing(from.latitude, from.longitude, to.latitude, to.longitude);

    // Get magnetic variation at spherical midpoint (accurately handles anti-meridian crossings)
    const mid = intermediatePoint(from.latitude, from.longitude, to.latitude, to.longitude, 0.5);
    const magneticVariation = magneticDeclination(mid.latitude, mid.longitude, legAltitude);

    // Solve wind triangle
    let wca = 0;
    let groundSpeed = profile.tas;
    let trueHeading = trueTrack;

    if (legWind) {
      const result = solveWindTriangle(trueTrack, profile.tas, legWind.direction, legWind.speed);
      wca = result.windCorrectionAngle;
      groundSpeed = result.groundSpeed;
      trueHeading = result.trueHeading;
    }

    // Compute magnetic heading
    let magneticHeading = (trueHeading - magneticVariation) % 360;
    if (magneticHeading < 0) {
      magneticHeading += 360;
    }

    // ETE in seconds
    let ete = Infinity;
    if (groundSpeed > 0) {
      ete = (distance / groundSpeed) * 3600;
    }

    // Fuel calculation for this leg
    const fuelRate = profile.fuelFlow > 0 ? profile.fuelFlow : 0;
    const fuelBurn = isFinite(ete) && ete > 0 ? (ete / 3600) * fuelRate : 0;

    const leg: Leg = {
      id: `${from.identifier}-${to.identifier}-${i}-${legAltitude}`,
      from,
      to,
      distance,
      trueTrack,
      magneticVariation,
      windCorrectionAngle: wca,
      trueHeading,
      magneticHeading,
      groundSpeed,
      ete,
      altitude: legAltitude,
      wind: legWind,
      fuelBurn,
    };

    legs.push(leg);
    totalDistance += distance;
    if (isFinite(ete)) {
      totalEte += ete;
      totalFuel += fuelBurn;
    }
  }

  // Legal VFR Reserves (Day: +30 min / 0.5h, Night: +45 min / 0.75h)
  const fuelRate = profile.fuelFlow > 0 ? profile.fuelFlow : 0;
  const vfrDayReserveFuel = 0.5 * fuelRate;
  const vfrNightReserveFuel = 0.75 * fuelRate;
  const minFuelRequiredDay = totalFuel + vfrDayReserveFuel;
  const minFuelRequiredNight = totalFuel + vfrNightReserveFuel;

  return {
    totalDistance,
    totalEte,
    totalFuel,
    vfrDayReserveFuel,
    vfrNightReserveFuel,
    minFuelRequiredDay,
    minFuelRequiredNight,
    legs,
  };
}
