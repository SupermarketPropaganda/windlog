import {
  Waypoint,
  Leg,
  AircraftProfile,
  Wind,
  NavLogSummary,
  ClimbDescentProfile,
  StepTransition,
  AlternatePlan,
} from '../types';
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
 * Finds geographic coordinates along a multi-leg route at a specific cumulative distance from departure.
 */
export function findCoordinateAlongRoute(
  legs: Leg[],
  targetDistNm: number
): { latitude: number; longitude: number } | undefined {
  if (!legs || legs.length === 0) return undefined;
  if (targetDistNm <= 0) {
    return { latitude: legs[0].from.latitude, longitude: legs[0].from.longitude };
  }

  let accumulatedDist = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const legStart = accumulatedDist;
    const legEnd = accumulatedDist + leg.distance;

    if (targetDistNm <= legEnd || i === legs.length - 1) {
      const remainingInLeg = Math.max(0, Math.min(leg.distance, targetDistNm - legStart));
      const fraction = leg.distance > 0 ? remainingInLeg / leg.distance : 0;
      const interp = intermediatePoint(
        leg.from.latitude,
        leg.from.longitude,
        leg.to.latitude,
        leg.to.longitude,
        fraction
      );
      return { latitude: interp.latitude, longitude: interp.longitude };
    }
    accumulatedDist = legEnd;
  }

  const lastLeg = legs[legs.length - 1];
  return { latitude: lastLeg.to.latitude, longitude: lastLeg.to.longitude };
}

/**
 * Computes realistic GA climb, descent, TOC, TOD, step transitions, and fuel burns.
 */
export function calculateClimbDescentProfile(
  waypoints: Waypoint[],
  legs: Leg[],
  profile: AircraftProfile,
  _wind: Wind | null,
  totalDistance: number,
  totalEte: number
): ClimbDescentProfile {
  const depElev = waypoints[0]?.elevation ?? 0;
  const initialCruiseAlt = legs[0]?.altitude ?? profile.cruiseAltitude;
  const climbDeltaAlt = Math.max(0, initialCruiseAlt - depElev);

  const climbRateFpm = profile.climbRateFpm && profile.climbRateFpm > 0 ? profile.climbRateFpm : 700;
  const climbTimeSeconds = climbDeltaAlt > 0 ? (climbDeltaAlt / climbRateFpm) * 60 : 0;
  const climbTAS = profile.climbSpeedKt && profile.climbSpeedKt > 0 ? profile.climbSpeedKt : 75;

  // Factor in departure groundspeed ratio for wind effect during climb
  const leg0GroundSpeed = legs[0]?.groundSpeed ?? profile.tas;
  const climbGsRatio = profile.tas > 0 ? leg0GroundSpeed / profile.tas : 1.0;
  const climbGS = Math.max(30, climbTAS * climbGsRatio);
  let climbDistanceNm = (climbTimeSeconds / 3600) * climbGS;
  climbDistanceNm = Math.min(climbDistanceNm, totalDistance);

  const climbMultiplier = profile.climbFuelFlowMultiplier ?? 1.35;
  const climbFuelFlow = (profile.fuelFlow > 0 ? profile.fuelFlow : 0) * climbMultiplier;
  const climbFuelBurn = (climbTimeSeconds / 3600) * climbFuelFlow;

  const tocDistanceNm = climbDistanceNm;
  const tocAltitudeFt = initialCruiseAlt;
  const tocCoordinate = findCoordinateAlongRoute(legs, tocDistanceNm);

  // Destination Descent calculation
  const destElev = waypoints[waypoints.length - 1]?.elevation ?? 0;
  const finalCruiseAlt = legs[legs.length - 1]?.altitude ?? profile.cruiseAltitude;
  // Standard VFR traffic pattern is 1,000 ft above field elevation
  const patternAlt = destElev + 1000;
  const descentDeltaAlt = Math.max(0, finalCruiseAlt - patternAlt);

  const descentRateFpm = profile.descentRateFpm && profile.descentRateFpm > 0 ? profile.descentRateFpm : 500;
  const descentTimeSeconds = descentDeltaAlt > 0 ? (descentDeltaAlt / descentRateFpm) * 60 : 0;
  const descentTAS = profile.descentSpeedKt && profile.descentSpeedKt > 0 ? profile.descentSpeedKt : Math.min(profile.tas || 105, 115);

  const lastLegGroundSpeed = legs[legs.length - 1]?.groundSpeed ?? profile.tas;
  const descentGsRatio = profile.tas > 0 ? lastLegGroundSpeed / profile.tas : 1.0;
  const descentGS = Math.max(30, descentTAS * descentGsRatio);
  let descentDistanceNm = (descentTimeSeconds / 3600) * descentGS;
  descentDistanceNm = Math.min(descentDistanceNm, Math.max(0, totalDistance - tocDistanceNm));

  const descentMultiplier = profile.descentFuelFlowMultiplier ?? 0.65;
  const descentFuelFlow = (profile.fuelFlow > 0 ? profile.fuelFlow : 0) * descentMultiplier;
  const descentFuelBurn = (descentTimeSeconds / 3600) * descentFuelFlow;

  const todDistanceNm = Math.max(tocDistanceNm, totalDistance - descentDistanceNm);
  const todAltitudeFt = finalCruiseAlt;
  const todCoordinate = findCoordinateAlongRoute(legs, todDistanceNm);

  // Step-climb / Step-down transitions between adjacent legs with differing altitudes
  const stepTransitions: StepTransition[] = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const fromAlt = legs[i].altitude;
    const toAlt = legs[i + 1].altitude;
    if (fromAlt !== toAlt) {
      const deltaAlt = Math.abs(toAlt - fromAlt);
      const isClimb = toAlt > fromAlt;
      const rate = isClimb ? climbRateFpm : descentRateFpm;
      const timeSec = (deltaAlt / rate) * 60;
      const nextLegGS = legs[i + 1].groundSpeed > 0 ? legs[i + 1].groundSpeed : profile.tas;
      const distNm = (timeSec / 3600) * nextLegGS;
      const flow = (profile.fuelFlow > 0 ? profile.fuelFlow : 0) * (isClimb ? climbMultiplier : descentMultiplier);
      const fuel = (timeSec / 3600) * flow;

      stepTransitions.push({
        fromLegIndex: i,
        toLegIndex: i + 1,
        type: isClimb ? 'step-climb' : 'step-down',
        fromAltitudeFt: fromAlt,
        toAltitudeFt: toAlt,
        altitudeDeltaFt: deltaAlt,
        timeSeconds: timeSec,
        distanceNm: distNm,
        fuelBurn: fuel,
      });
    }
  }

  // Level cruise segment between TOC and TOD
  const cruiseDistanceNm = Math.max(0, totalDistance - climbDistanceNm - descentDistanceNm);
  const cruiseTimeSeconds = Math.max(0, totalEte - climbTimeSeconds - descentTimeSeconds);
  const cruiseFuelBurn = Math.max(0, (cruiseTimeSeconds / 3600) * (profile.fuelFlow > 0 ? profile.fuelFlow : 0));

  return {
    climbTimeSeconds,
    climbDistanceNm,
    climbFuelBurn,
    tocAltitudeFt,
    tocDistanceNm,
    tocCoordinate,

    descentTimeSeconds,
    descentDistanceNm,
    descentFuelBurn,
    todAltitudeFt,
    todDistanceNm,
    todCoordinate,

    cruiseTimeSeconds,
    cruiseDistanceNm,
    cruiseFuelBurn,

    stepTransitions,
  };
}

/**
 * Computes complete navigation solution and SOP Form 002 fuel required for diversion to an alternate airport.
 */
export function computeAlternatePlan(
  fromAirport: Waypoint,
  toAirport: Waypoint,
  profile: AircraftProfile,
  wind: Wind | null,
  plannedAlt: number = 2500,
  tripFuel: number = 0
): AlternatePlan {
  const distance = greatCircleDistance(
    fromAirport.latitude,
    fromAirport.longitude,
    toAirport.latitude,
    toAirport.longitude
  );
  const trueTrack = initialBearing(
    fromAirport.latitude,
    fromAirport.longitude,
    toAirport.latitude,
    toAirport.longitude
  );

  const mid = intermediatePoint(
    fromAirport.latitude,
    fromAirport.longitude,
    toAirport.latitude,
    toAirport.longitude,
    0.5
  );
  const magneticVariation = magneticDeclination(mid.latitude, mid.longitude, plannedAlt);

  let magneticTrack = (trueTrack - magneticVariation) % 360;
  if (magneticTrack < 0) magneticTrack += 360;

  // Solve wind triangle for alternate leg
  let wca = 0;
  let groundSpeed = profile.tas;
  let trueHeading = trueTrack;

  if (wind && wind.speed > 0) {
    const result = solveWindTriangle(trueTrack, profile.tas, wind.direction, wind.speed);
    wca = result.windCorrectionAngle;
    groundSpeed = result.groundSpeed;
    trueHeading = result.trueHeading;
  }

  let magneticHeading = (trueHeading - magneticVariation) % 360;
  if (magneticHeading < 0) magneticHeading += 360;

  let eetSeconds = 0;
  if (groundSpeed > 0) {
    eetSeconds = (distance / groundSpeed) * 3600;
  }

  const fuelRate = profile.fuelFlow > 0 ? profile.fuelFlow : 0;
  const fuelBurn = (eetSeconds / 3600) * fuelRate;

  // SOP Form 002 Fuel Requirements:
  // - Trip Fuel
  // - Contingency Fuel: 5% of Trip Fuel
  // - Alternate Fuel: direct flight burn to alternate
  // - Final Reserve: 45 min at cruise fuel flow
  // - Taxi Fuel allowance: 1.0 gal (or 4.0 L)
  const contingencyFuel = 0.05 * tripFuel;
  const finalReserveFuel = 0.75 * fuelRate; // 45 min = 0.75 hour
  const taxiFuel = profile.fuelUnit === 'gph' ? 1.0 : 4.0;
  const totalFuelRequired = tripFuel + contingencyFuel + fuelBurn + finalReserveFuel + taxiFuel;

  return {
    fromAirport,
    toAirport,
    altitude: plannedAlt,
    wind,
    trueTrack,
    magneticVariation,
    magneticTrack,
    tas: profile.tas,
    windCorrectionAngle: wca,
    trueHeading,
    magneticHeading,
    groundSpeed,
    distance,
    eetSeconds,
    fuelBurn,
    contingencyFuel,
    finalReserveFuel,
    taxiFuel,
    totalFuelRequired,
  };
}

/**
 * Finds the top nearest suitable alternate aerodromes from a given destination waypoint.
 */
export function findNearestCandidateAlternates(
  destination: Waypoint,
  candidateAirports: Waypoint[],
  maxCount: number = 4
): Waypoint[] {
  if (!destination || !candidateAirports || candidateAirports.length === 0) return [];

  const list: { waypoint: Waypoint; distMeters: number }[] = [];

  for (const candidate of candidateAirports) {
    // Exclude if it's the exact same airport
    if (
      candidate.identifier.toUpperCase() === destination.identifier.toUpperCase() ||
      (Math.abs(candidate.latitude - destination.latitude) < 0.01 &&
        Math.abs(candidate.longitude - destination.longitude) < 0.01)
    ) {
      continue;
    }

    const distM = greatCircleDistance(
      destination.latitude,
      destination.longitude,
      candidate.latitude,
      candidate.longitude
    );

    list.push({
      waypoint: candidate,
      distMeters: distM,
    });
  }

  list.sort((a, b) => a.distMeters - b.distMeters);
  return list.slice(0, maxCount).map((item) => item.waypoint);
}

/**
 * Computes the navigation log summary for a given sequence of waypoints,
 * taking into account per-leg altitudes, winds, aircraft fuel performance,
 * climb/descent profiles, and Top of Climb / Top of Descent coordinates.
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

  // Calculate detailed climb and descent profile (TOC, TOD, climb fuel/time, descent time)
  const climbDescent =
    legs.length > 0
      ? calculateClimbDescentProfile(waypoints, legs, profile, wind, totalDistance, totalEte)
      : undefined;

  return {
    totalDistance,
    totalEte,
    totalFuel,
    vfrDayReserveFuel,
    vfrNightReserveFuel,
    minFuelRequiredDay,
    minFuelRequiredNight,
    legs,
    climbDescent,
  };
}
