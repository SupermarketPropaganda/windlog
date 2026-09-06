import {
  MassBalanceProfile,
  MassBalanceResult,
  FuelType,
  WeightUnit,
  CGEnvelopePoint,
} from '../types';

/**
 * Fuel density in weight per volume unit
 */
export const FUEL_DENSITY = {
  avgas: {
    lbs_per_gal: 6.0,
    kg_per_liter: 0.72,
  },
  mogas: {
    lbs_per_gal: 5.9,
    kg_per_liter: 0.71,
  },
  jetA: {
    lbs_per_gal: 6.7,
    kg_per_liter: 0.804,
  },
};

/**
 * Converts fuel volume to weight in the profile's unit
 */
export function getFuelWeight(
  volume: number,
  volumeUnit: 'gal' | 'l',
  targetWeightUnit: WeightUnit,
  fuelType: FuelType = 'avgas'
): number {
  if (volume <= 0) return 0;
  const density = FUEL_DENSITY[fuelType] || FUEL_DENSITY.avgas;

  if (volumeUnit === 'gal' && targetWeightUnit === 'lbs') {
    return volume * density.lbs_per_gal;
  }
  if (volumeUnit === 'l' && targetWeightUnit === 'kg') {
    return volume * density.kg_per_liter;
  }

  // Cross-unit conversions
  if (volumeUnit === 'gal' && targetWeightUnit === 'kg') {
    return volume * 3.78541 * density.kg_per_liter;
  }
  if (volumeUnit === 'l' && targetWeightUnit === 'lbs') {
    return (volume / 3.78541) * density.lbs_per_gal;
  }

  return volume * density.lbs_per_gal;
}

/**
 * Converts a weight value between kg and lbs
 */
export function convertWeight(val: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return val;
  if (from === 'kg' && to === 'lbs') return val * 2.20462;
  if (from === 'lbs' && to === 'kg') return val / 2.20462;
  return val;
}

/**
 * Checks if a point lies directly on a polygon edge segment.
 */
function isPointOnSegment(p: CGEnvelopePoint, a: CGEnvelopePoint, b: CGEnvelopePoint, epsilon = 1e-5): boolean {
  const cross = (p.weight - a.weight) * (b.arm - a.arm) - (p.arm - a.arm) * (b.weight - a.weight);
  if (Math.abs(cross) > epsilon * Math.max(1, Math.abs(b.arm - a.arm), Math.abs(b.weight - a.weight))) {
    return false;
  }
  const dot = (p.arm - a.arm) * (b.arm - a.arm) + (p.weight - a.weight) * (b.weight - a.weight);
  if (dot < -epsilon) return false;
  const sqLen = (b.arm - a.arm) ** 2 + (b.weight - a.weight) ** 2;
  if (dot > sqLen + epsilon) return false;
  return true;
}

/**
 * Ray-casting algorithm to test if a (arm, weight) point is inside (or on boundary of) a CG envelope polygon.
 */
export function isPointInPolygon(
  point: CGEnvelopePoint,
  polygon: CGEnvelopePoint[]
): boolean {
  if (!polygon || polygon.length < 3) return false;
  if (!Number.isFinite(point.arm) || !Number.isFinite(point.weight)) return false;

  // 1. Check if point is on any boundary segment or vertex
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (isPointOnSegment(point, polygon[j], polygon[i])) {
      return true;
    }
  }

  // 2. Standard ray-casting for interior
  const x = point.arm;
  const y = point.weight;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].arm;
    const yi = polygon[i].weight;
    const xj = polygon[j].arm;
    const yj = polygon[j].weight;

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Computes complete Mass and Balance (Zero Fuel, Takeoff, and Landing).
 */
export function computeWeightAndBalance(
  profile: MassBalanceProfile,
  tripFuelBurnVolume: number = 0 // in fuelStation.fuelUnit
): MassBalanceResult {
  const warnings: string[] = [];

  const emptyWeight = Number.isFinite(profile.emptyWeight) ? profile.emptyWeight : 0;
  const emptyArm = Number.isFinite(profile.emptyArm) ? profile.emptyArm : 0;

  // 1. Basic Empty Weight
  let zfwWeight = emptyWeight;
  let zfwMoment = emptyWeight * emptyArm;

  // 2. Add Payload Stations
  for (const st of profile.stations) {
    const w = Number.isFinite(st.weight) ? Math.max(0, st.weight) : 0;
    const arm = Number.isFinite(st.arm) ? st.arm : 0;
    if (st.maxWeight && w > st.maxWeight) {
      warnings.push(`Station "${st.name}" exceeds max capacity of ${st.maxWeight} ${profile.weightUnit}`);
    }
    zfwWeight += w;
    zfwMoment += w * arm;
  }

  const zeroFuelCG = zfwWeight > 0 ? zfwMoment / zfwWeight : emptyArm;

  // 3. Takeoff Fuel Calculation
  const fuelStation = profile.fuelStation;
  const toFuelVolume = Number.isFinite(fuelStation.takeoffFuelVolume) ? Math.max(0, fuelStation.takeoffFuelVolume) : 0;
  
  if (fuelStation.fuelUnit === 'gal' && fuelStation.capacityGallons && toFuelVolume > fuelStation.capacityGallons) {
    warnings.push(`Takeoff fuel (${toFuelVolume} gal) exceeds tank capacity of ${fuelStation.capacityGallons} gal`);
  } else if (fuelStation.fuelUnit === 'l' && fuelStation.capacityLiters && toFuelVolume > fuelStation.capacityLiters) {
    warnings.push(`Takeoff fuel (${toFuelVolume} L) exceeds tank capacity of ${fuelStation.capacityLiters} L`);
  }

  const takeoffFuelWeight = getFuelWeight(
    toFuelVolume,
    fuelStation.fuelUnit,
    profile.weightUnit,
    fuelStation.fuelType
  );

  const takeoffWeight = zfwWeight + takeoffFuelWeight;
  const fuelArm = Number.isFinite(fuelStation.arm) ? fuelStation.arm : 0;
  const takeoffMoment = zfwMoment + takeoffFuelWeight * fuelArm;
  const takeoffCG = takeoffWeight > 0 ? takeoffMoment / takeoffWeight : zeroFuelCG;

  // 4. Landing Weight Calculation
  const validTripBurn = Number.isFinite(tripFuelBurnVolume) ? Math.max(0, tripFuelBurnVolume) : 0;
  if (validTripBurn > toFuelVolume && toFuelVolume > 0) {
    warnings.push(`Trip fuel burn (${validTripBurn.toFixed(1)} ${fuelStation.fuelUnit}) exceeds fuel on board (${toFuelVolume.toFixed(1)} ${fuelStation.fuelUnit})!`);
  }

  const tripFuelWeight = getFuelWeight(
    validTripBurn,
    fuelStation.fuelUnit,
    profile.weightUnit,
    fuelStation.fuelType
  );

  const landingFuelWeight = Math.max(0, takeoffFuelWeight - tripFuelWeight);
  const landingWeight = zfwWeight + landingFuelWeight;
  const landingMoment = zfwMoment + landingFuelWeight * fuelArm;
  const landingCG = landingWeight > 0 ? landingMoment / landingWeight : takeoffCG;

  // 5. Envelope Validation
  const normalEnvelope = profile.envelope.normal;
  const isZFWInEnvelope = isPointInPolygon({ arm: zeroFuelCG, weight: zfwWeight }, normalEnvelope);
  const isTOWInEnvelope = isPointInPolygon({ arm: takeoffCG, weight: takeoffWeight }, normalEnvelope);
  const isLWInEnvelope = isPointInPolygon({ arm: landingCG, weight: landingWeight }, normalEnvelope);

  // 6. Weight Limits
  const isOverweightTOW = takeoffWeight > profile.maxTakeoffWeight;
  const maxLW = profile.maxLandingWeight || profile.maxTakeoffWeight;
  const isOverweightLW = landingWeight > maxLW;

  const weightMargin = profile.maxTakeoffWeight - takeoffWeight;

  if (isOverweightTOW) {
    warnings.push(`Takeoff Weight exceeds MTOW by +${(takeoffWeight - profile.maxTakeoffWeight).toFixed(1)} ${profile.weightUnit}`);
  }
  if (isOverweightLW) {
    warnings.push(`Landing Weight exceeds MLW by +${(landingWeight - maxLW).toFixed(1)} ${profile.weightUnit}`);
  }
  if (!isTOWInEnvelope) {
    warnings.push(`Takeoff CG (${takeoffCG.toFixed(2)} ${profile.armUnit}) is outside legal CG limits!`);
  }
  if (!isLWInEnvelope) {
    warnings.push(`Landing CG (${landingCG.toFixed(2)} ${profile.armUnit}) is outside legal CG limits!`);
  }
  if (!isZFWInEnvelope) {
    warnings.push(`Zero Fuel CG (${zeroFuelCG.toFixed(2)} ${profile.armUnit}) is outside legal CG limits!`);
  }

  return {
    zeroFuelWeight: Math.round(zfwWeight * 10) / 10,
    zeroFuelMoment: Math.round(zfwMoment * 10) / 10,
    zeroFuelCG: Math.round(zeroFuelCG * 100) / 100,
    
    takeoffWeight: Math.round(takeoffWeight * 10) / 10,
    takeoffMoment: Math.round(takeoffMoment * 10) / 10,
    takeoffCG: Math.round(takeoffCG * 100) / 100,
    
    tripFuelWeight: Math.round(tripFuelWeight * 10) / 10,
    landingWeight: Math.round(landingWeight * 10) / 10,
    landingMoment: Math.round(landingMoment * 10) / 10,
    landingCG: Math.round(landingCG * 100) / 100,
    
    isZFWInEnvelope,
    isTOWInEnvelope,
    isLWInEnvelope,
    
    isOverweightTOW,
    isOverweightLW,
    
    weightMargin: Math.round(weightMargin * 10) / 10,
    warnings,
  };
}
