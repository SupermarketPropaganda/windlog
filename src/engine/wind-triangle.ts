/**
 * Solves the aviation wind triangle.
 * @param trueTrack Desired track over ground (degrees True)
 * @param tas True Airspeed (knots)
 * @param windDirection Wind from direction (degrees True)
 * @param windSpeed Wind speed (knots)
 * @returns Wind correction angle, ground speed, and true heading
 */
export function solveWindTriangle(
  trueTrack: number,
  tas: number,
  windDirection: number,
  windSpeed: number
): { windCorrectionAngle: number; groundSpeed: number; trueHeading: number } {
  // Edge case: no wind or no speed
  if (windSpeed === 0 || tas <= 0) {
    return {
      windCorrectionAngle: 0,
      groundSpeed: Math.max(0, tas),
      trueHeading: ((trueTrack % 360) + 360) % 360,
    };
  }

  // Convert angles to radians
  const ttRad = (trueTrack * Math.PI) / 180;
  // Wind direction is where wind is coming FROM.
  const wdRad = (windDirection * Math.PI) / 180;

  // Wind angle relative to track
  const windAngle = wdRad - ttRad;

  // Crosswind and headwind components
  let crosswind = windSpeed * Math.sin(windAngle);
  const headwind = windSpeed * Math.cos(windAngle);

  // Clean floating-point artifacts near zero
  if (Math.abs(crosswind) < 1e-10) {
    crosswind = 0;
  }

  // If crosswind is greater than or equal to TAS, we can't maintain track
  let windCorrectionAngleRad = 0;
  if (Math.abs(crosswind) >= tas) {
    // Return crab angle limit (90 degrees in the direction of the wind)
    windCorrectionAngleRad = Math.sign(crosswind) * (Math.PI / 2);
  } else {
    // Calculate wind correction angle
    windCorrectionAngleRad = Math.asin(crosswind / tas);
  }

  let windCorrectionAngle = (windCorrectionAngleRad * 180) / Math.PI;
  if (Math.abs(windCorrectionAngle) < 1e-10) {
    windCorrectionAngle = 0; // eliminate -0 artifact
  }

  let trueHeading = (trueTrack + windCorrectionAngle) % 360;
  if (trueHeading < 0) {
    trueHeading += 360;
  }
  if (Math.abs(trueHeading - 360) < 1e-10) {
    trueHeading = 0;
  }

  // Calculate ground speed
  let groundSpeed = 0;
  if (Math.abs(crosswind) >= tas) {
    groundSpeed = 0; // cannot make forward progress
  } else {
    groundSpeed = tas * Math.cos(windCorrectionAngleRad) - headwind;
  }

  if (groundSpeed < 0) {
    groundSpeed = 0; // going backwards
  }

  return {
    windCorrectionAngle,
    groundSpeed,
    trueHeading,
  };
}
