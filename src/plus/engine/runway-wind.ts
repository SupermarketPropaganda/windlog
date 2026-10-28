import { RunwayDefinition } from '../../types';
import { findAirportRunways, generateGenericRunways } from '../../data/airport-runways';

export interface ScoredRunwayWind {
  designator: string;
  headingMag: number;
  lengthMeters: number;
  surface: string;
  headwindKt: number;
  tailwindKt: number;
  crosswindKt: number;
  crosswindSide: 'LEFT' | 'RIGHT' | 'NONE';
  isFavored: boolean;
  crosswindStatus: 'SAFE' | 'CAUTION' | 'LIMIT_EXCEEDED';
}

export interface AirportRunwayAdvisory {
  icao: string;
  name: string;
  elevationFt: number;
  windDirectionDeg: number;
  windSpeedKt: number;
  favoredRunway: ScoredRunwayWind;
  runways: ScoredRunwayWind[];
}

/**
 * Computes live headwind, tailwind, crosswind, and safe runway rankings for an airport based on active wind.
 */
export function computeAirportRunwayAdvisory(
  icaoOrIdent: string,
  windDirectionDeg: number,
  windSpeedKt: number,
  fallbackElevationFt: number = 0,
  maxDemonstratedCrosswindKt: number = 15
): AirportRunwayAdvisory | null {
  const airportInfo = findAirportRunways(icaoOrIdent);
  let runways: RunwayDefinition[] = [];
  let name = icaoOrIdent.toUpperCase();
  let elevationFt = fallbackElevationFt;

  if (airportInfo && airportInfo.runways && airportInfo.runways.length > 0) {
    runways = airportInfo.runways;
    name = airportInfo.name || name;
    elevationFt = airportInfo.elevation ?? fallbackElevationFt;
  } else {
    // Generate generic 09/27 runways if unknown
    runways = generateGenericRunways(90);
  }

  const windDir = ((windDirectionDeg % 360) + 360) % 360;
  const windSpd = Math.max(0, windSpeedKt || 0);

  const scored: ScoredRunwayWind[] = runways.map((rwy) => {
    const rwyHeading = ((rwy.heading % 360) + 360) % 360;
    const relRad = ((windDir - rwyHeading) * Math.PI) / 180;
    const rawHw = windSpd * Math.cos(relRad);
    const headwindKt = Math.max(0, Math.round(rawHw * 10) / 10);
    const tailwindKt = rawHw < -0.1 ? Math.round(Math.abs(rawHw) * 10) / 10 : 0;
    const crosswindKt = Math.round(Math.abs(windSpd * Math.sin(relRad)) * 10) / 10;
    const sinVal = Math.sin(relRad);
    const crosswindSide: 'LEFT' | 'RIGHT' | 'NONE' =
      crosswindKt < 0.5 ? 'NONE' : sinVal > 0 ? 'RIGHT' : 'LEFT';

    let crosswindStatus: 'SAFE' | 'CAUTION' | 'LIMIT_EXCEEDED' = 'SAFE';
    if (crosswindKt > maxDemonstratedCrosswindKt) {
      crosswindStatus = 'LIMIT_EXCEEDED';
    } else if (crosswindKt >= maxDemonstratedCrosswindKt * 0.75) {
      crosswindStatus = 'CAUTION';
    }

    return {
      designator: rwy.designator,
      headingMag: rwyHeading,
      lengthMeters: rwy.lengthMeters || 1200,
      surface: rwy.surface || 'ASPHALT',
      headwindKt,
      tailwindKt,
      crosswindKt,
      crosswindSide,
      isFavored: false,
      crosswindStatus,
    };
  });

  // Favored runway: maximum headwind component (or minimal tailwind)
  let bestRunway = scored[0];
  let maxScore = -Infinity;

  for (const s of scored) {
    // Score prioritizes headwind over tailwind, penalizes high crosswind
    const score = (s.headwindKt - s.tailwindKt * 2) - s.crosswindKt * 0.3;
    if (score > maxScore) {
      maxScore = score;
      bestRunway = s;
    }
  }

  const finalRunways = scored.map((s) => ({
    ...s,
    isFavored: s.designator === bestRunway.designator,
  }));

  const favored = finalRunways.find((s) => s.isFavored) || finalRunways[0];

  return {
    icao: icaoOrIdent.toUpperCase(),
    name,
    elevationFt,
    windDirectionDeg: windDir,
    windSpeedKt: windSpd,
    favoredRunway: favored,
    runways: finalRunways,
  };
}
