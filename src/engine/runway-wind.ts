import { RunwayWindResult } from '../types';

/**
 * Normalizes an angle into [1, 360] degrees (where 0° maps to 360°)
 */
export function normalizeAngle360(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a === 0 ? 360 : a;
}

/**
 * Normalizes relative angle difference into [-180, 180] degrees
 */
export function normalizeAngle180(deg: number): number {
  let a = (deg + 180) % 360;
  if (a < 0) a += 360;
  return a - 180;
}

/**
 * Computes runway headwind/tailwind, crosswind components, and reciprocal recommendations.
 */
export function computeRunwayWindComponents(
  runwayHeading: number,
  windDirection: number,
  windSpeed: number,
  gustSpeed?: number,
  maxDemonstratedCrosswind: number = 15
): RunwayWindResult {
  const rwyHdg = normalizeAngle360(runwayHeading);
  const windDir = normalizeAngle360(windDirection);
  const speed = Math.max(0, windSpeed);

  // Relative angle between runway and wind direction
  const angleDiff = normalizeAngle180(windDir - rwyHdg);
  const rad = (angleDiff * Math.PI) / 180;

  // Headwind > 0, Tailwind < 0
  const headwind = speed * Math.cos(rad);
  const crosswind = Math.abs(speed * Math.sin(rad));

  let crosswindSide: 'left' | 'right' | 'direct' = 'direct';
  if (Math.sin(rad) < -0.05) {
    crosswindSide = 'left';
  } else if (Math.sin(rad) > 0.05) {
    crosswindSide = 'right';
  }

  // Gust calculations
  let gustHeadwind: number | undefined;
  let gustCrosswind: number | undefined;
  if (gustSpeed && gustSpeed > speed) {
    gustHeadwind = gustSpeed * Math.cos(rad);
    gustCrosswind = Math.abs(gustSpeed * Math.sin(rad));
  }

  // Reciprocal Runway (opposite end)
  const reciprocalHeading = normalizeAngle360(rwyHdg + 180);
  const recipAngleDiff = normalizeAngle180(windDir - reciprocalHeading);
  const recipRad = (recipAngleDiff * Math.PI) / 180;
  const reciprocalHeadwind = speed * Math.cos(recipRad);
  const reciprocalCrosswind = Math.abs(speed * Math.sin(recipRad));

  // Crosswind Safety Status
  const effectiveCrosswind = gustCrosswind !== undefined ? Math.max(crosswind, gustCrosswind) : crosswind;
  let crosswindStatus: 'safe' | 'caution' | 'exceeded' = 'safe';
  
  if (maxDemonstratedCrosswind > 0) {
    if (effectiveCrosswind > maxDemonstratedCrosswind) {
      crosswindStatus = 'exceeded';
    } else if (effectiveCrosswind >= maxDemonstratedCrosswind * 0.7) {
      crosswindStatus = 'caution';
    }
  }

  return {
    runwayHeading: rwyHdg,
    windDirection: windDir,
    windSpeed: speed,
    gustSpeed,
    
    headwind: Math.round(headwind * 10) / 10,
    crosswind: Math.round(crosswind * 10) / 10,
    crosswindSide,
    
    gustHeadwind: gustHeadwind !== undefined ? Math.round(gustHeadwind * 10) / 10 : undefined,
    gustCrosswind: gustCrosswind !== undefined ? Math.round(gustCrosswind * 10) / 10 : undefined,
    
    reciprocalHeading,
    reciprocalHeadwind: Math.round(reciprocalHeadwind * 10) / 10,
    reciprocalCrosswind: Math.round(reciprocalCrosswind * 10) / 10,
    
    maxDemonstratedCrosswind,
    crosswindStatus,
    angleDifference: Math.round(angleDiff),
  };
}
