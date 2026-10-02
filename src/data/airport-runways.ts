import { AirportRunwayInfo, RunwayDefinition, Waypoint } from '../types';

/**
 * Official Airport Runway Database (AIP Portugal & International)
 * Magnetic headings (QFU) and physical runway dimensions.
 */
export const AIRPORT_RUNWAYS: Record<string, AirportRunwayInfo> = {
  // ─── Portugal Continental ───
  LPCS: {
    icao: 'LPCS',
    name: 'Cascais Airport (Tires)',
    elevation: 325,
    runways: [
      { designator: '17', heading: 167, lengthMeters: 1700, surface: 'ASPHALT', reciprocalDesignator: '35' },
      { designator: '35', heading: 347, lengthMeters: 1700, surface: 'ASPHALT', reciprocalDesignator: '17' },
    ],
  },
  LPPT: {
    icao: 'LPPT',
    name: 'Lisbon Humberto Delgado Airport',
    elevation: 374,
    runways: [
      { designator: '02', heading: 24, lengthMeters: 3805, surface: 'ASPHALT', reciprocalDesignator: '20' },
      { designator: '20', heading: 204, lengthMeters: 3805, surface: 'ASPHALT', reciprocalDesignator: '02' },
      { designator: '03', heading: 32, lengthMeters: 2400, surface: 'ASPHALT', reciprocalDesignator: '21' },
      { designator: '21', heading: 212, lengthMeters: 2400, surface: 'ASPHALT', reciprocalDesignator: '03' },
    ],
  },
  LPFR: {
    icao: 'LPFR',
    name: 'Faro Gago Coutinho International Airport',
    elevation: 24,
    runways: [
      { designator: '10', heading: 97, lengthMeters: 2490, surface: 'ASPHALT', reciprocalDesignator: '28' },
      { designator: '28', heading: 277, lengthMeters: 2490, surface: 'ASPHALT', reciprocalDesignator: '10' },
    ],
  },
  LPPR: {
    icao: 'LPPR',
    name: 'Porto Francisco de Sá Carneiro Airport',
    elevation: 228,
    runways: [
      { designator: '17', heading: 169, lengthMeters: 3480, surface: 'ASPHALT', reciprocalDesignator: '35' },
      { designator: '35', heading: 349, lengthMeters: 3480, surface: 'ASPHALT', reciprocalDesignator: '17' },
    ],
  },
  LPBJ: {
    icao: 'LPBJ',
    name: 'Beja Airport / Air Base 11',
    elevation: 636,
    runways: [
      { designator: '01L', heading: 14, lengthMeters: 3450, surface: 'CONCRETE', reciprocalDesignator: '19R' },
      { designator: '19R', heading: 194, lengthMeters: 3450, surface: 'CONCRETE', reciprocalDesignator: '01L' },
      { designator: '01R', heading: 14, lengthMeters: 2950, surface: 'CONCRETE', reciprocalDesignator: '19L' },
      { designator: '19L', heading: 194, lengthMeters: 2950, surface: 'CONCRETE', reciprocalDesignator: '01R' },
    ],
  },
  LPEV: {
    icao: 'LPEV',
    name: 'Évora Municipal Aerodrome',
    elevation: 807,
    runways: [
      { designator: '01', heading: 7, lengthMeters: 1300, surface: 'ASPHALT', reciprocalDesignator: '19' },
      { designator: '19', heading: 187, lengthMeters: 1300, surface: 'ASPHALT', reciprocalDesignator: '01' },
    ],
  },
  LPCO: {
    icao: 'LPCO',
    name: 'Coimbra Municipal Aerodrome (Cernache)',
    elevation: 587,
    runways: [
      { designator: '16', heading: 159, lengthMeters: 920, surface: 'ASPHALT', reciprocalDesignator: '34' },
      { designator: '34', heading: 339, lengthMeters: 920, surface: 'ASPHALT', reciprocalDesignator: '16' },
    ],
  },
  LPVR: {
    icao: 'LPVR',
    name: 'Vila Real Municipal Aerodrome',
    elevation: 1805,
    runways: [
      { designator: '01', heading: 6, lengthMeters: 950, surface: 'ASPHALT', reciprocalDesignator: '19' },
      { designator: '19', heading: 186, lengthMeters: 950, surface: 'ASPHALT', reciprocalDesignator: '01' },
    ],
  },
  LPVZ: {
    icao: 'LPVZ',
    name: 'Viseu Gonçalves Lobato Aerodrome',
    elevation: 2060,
    runways: [
      { designator: '18', heading: 177, lengthMeters: 1200, surface: 'ASPHALT', reciprocalDesignator: '36' },
      { designator: '36', heading: 357, lengthMeters: 1200, surface: 'ASPHALT', reciprocalDesignator: '18' },
    ],
  },
  LPPM: {
    icao: 'LPPM',
    name: 'Portimão Aerodrome (Alvor)',
    elevation: 5,
    runways: [
      { designator: '11', heading: 107, lengthMeters: 850, surface: 'ASPHALT', reciprocalDesignator: '29' },
      { designator: '29', heading: 287, lengthMeters: 850, surface: 'ASPHALT', reciprocalDesignator: '11' },
    ],
  },
  LPSC: {
    icao: 'LPSC',
    name: 'Santa Cruz Aerodrome (Torres Vedras)',
    elevation: 157,
    runways: [
      { designator: '17', heading: 166, lengthMeters: 600, surface: 'ASPHALT', reciprocalDesignator: '35' },
      { designator: '35', heading: 346, lengthMeters: 600, surface: 'ASPHALT', reciprocalDesignator: '17' },
    ],
  },
  LPSO: {
    icao: 'LPSO',
    name: 'Ponte de Sor Municipal Aerodrome',
    elevation: 390,
    runways: [
      { designator: '03', heading: 30, lengthMeters: 1800, surface: 'ASPHALT', reciprocalDesignator: '21' },
      { designator: '21', heading: 210, lengthMeters: 1800, surface: 'ASPHALT', reciprocalDesignator: '03' },
    ],
  },
  LPVL: {
    icao: 'LPVL',
    name: 'Vilar de Luz Aerodrome (Maia)',
    elevation: 762,
    runways: [
      { designator: '16', heading: 157, lengthMeters: 1300, surface: 'ASPHALT', reciprocalDesignator: '34' },
      { designator: '34', heading: 337, lengthMeters: 1300, surface: 'ASPHALT', reciprocalDesignator: '16' },
    ],
  },
  LPBR: {
    icao: 'LPBR',
    name: 'Braga Municipal Aerodrome (Palmeira)',
    elevation: 247,
    runways: [
      { designator: '07', heading: 66, lengthMeters: 950, surface: 'ASPHALT', reciprocalDesignator: '25' },
      { designator: '25', heading: 246, lengthMeters: 950, surface: 'ASPHALT', reciprocalDesignator: '07' },
    ],
  },
  LPBG: {
    icao: 'LPBG',
    name: 'Bragança Municipal Aerodrome',
    elevation: 2241,
    runways: [
      { designator: '02', heading: 21, lengthMeters: 1700, surface: 'ASPHALT', reciprocalDesignator: '20' },
      { designator: '20', heading: 201, lengthMeters: 1700, surface: 'ASPHALT', reciprocalDesignator: '02' },
    ],
  },
  LPCB: {
    icao: 'LPCB',
    name: 'Castelo Branco Aerodrome',
    elevation: 1300,
    runways: [
      { designator: '16', heading: 158, lengthMeters: 1000, surface: 'ASPHALT', reciprocalDesignator: '34' },
      { designator: '34', heading: 338, lengthMeters: 1000, surface: 'ASPHALT', reciprocalDesignator: '16' },
    ],
  },
  LPCH: {
    icao: 'LPCH',
    name: 'Chaves Municipal Aerodrome',
    elevation: 1181,
    runways: [
      { designator: '01', heading: 6, lengthMeters: 1040, surface: 'ASPHALT', reciprocalDesignator: '19' },
      { designator: '19', heading: 186, lengthMeters: 1040, surface: 'ASPHALT', reciprocalDesignator: '01' },
    ],
  },
  LPJF: {
    icao: 'LPJF',
    name: 'Leiria Aerodrome (Gândara)',
    elevation: 151,
    runways: [
      { designator: '09', heading: 88, lengthMeters: 930, surface: 'ASPHALT', reciprocalDesignator: '27' },
      { designator: '27', heading: 268, lengthMeters: 930, surface: 'ASPHALT', reciprocalDesignator: '09' },
    ],
  },
  LPLZ: {
    icao: 'LPLZ',
    name: 'Lousã Aerodrome',
    elevation: 654,
    runways: [
      { designator: '10', heading: 98, lengthMeters: 600, surface: 'GRASS', reciprocalDesignator: '28' },
      { designator: '28', heading: 278, lengthMeters: 600, surface: 'GRASS', reciprocalDesignator: '10' },
    ],
  },
  LPSR: {
    icao: 'LPSR',
    name: 'Santarém Aerodrome (Cosme Pedrógão)',
    elevation: 30,
    runways: [
      { designator: '04', heading: 37, lengthMeters: 800, surface: 'GRASS', reciprocalDesignator: '22' },
      { designator: '22', heading: 217, lengthMeters: 800, surface: 'GRASS', reciprocalDesignator: '04' },
    ],
  },
  LPAR: {
    icao: 'LPAR',
    name: 'Alverca Air Base (OGMA)',
    elevation: 11,
    runways: [
      { designator: '04', heading: 39, lengthMeters: 1800, surface: 'CONCRETE', reciprocalDesignator: '22' },
      { designator: '22', heading: 219, lengthMeters: 1800, surface: 'CONCRETE', reciprocalDesignator: '04' },
    ],
  },
  LPST: {
    icao: 'LPST',
    name: 'Sintra Air Base (BA1)',
    elevation: 440,
    runways: [
      { designator: '16', heading: 163, lengthMeters: 1820, surface: 'ASPHALT', reciprocalDesignator: '34' },
      { designator: '34', heading: 343, lengthMeters: 1820, surface: 'ASPHALT', reciprocalDesignator: '16' },
      { designator: '11', heading: 115, lengthMeters: 1000, surface: 'ASPHALT', reciprocalDesignator: '29' },
      { designator: '29', heading: 295, lengthMeters: 1000, surface: 'ASPHALT', reciprocalDesignator: '11' },
    ],
  },
  LPOV: {
    icao: 'LPOV',
    name: 'Ovar Military Aerodrome',
    elevation: 56,
    runways: [
      { designator: '17', heading: 167, lengthMeters: 1980, surface: 'CONCRETE', reciprocalDesignator: '35' },
      { designator: '35', heading: 347, lengthMeters: 1980, surface: 'CONCRETE', reciprocalDesignator: '17' },
    ],
  },
  LPMR: {
    icao: 'LPMR',
    name: 'Monte Real Air Base (BA5)',
    elevation: 187,
    runways: [
      { designator: '01', heading: 10, lengthMeters: 2720, surface: 'CONCRETE', reciprocalDesignator: '19' },
      { designator: '19', heading: 190, lengthMeters: 2720, surface: 'CONCRETE', reciprocalDesignator: '01' },
    ],
  },
  LPMT: {
    icao: 'LPMT',
    name: 'Montijo Air Base (BA6)',
    elevation: 46,
    runways: [
      { designator: '01', heading: 9, lengthMeters: 2440, surface: 'CONCRETE', reciprocalDesignator: '19' },
      { designator: '19', heading: 189, lengthMeters: 2440, surface: 'CONCRETE', reciprocalDesignator: '01' },
      { designator: '08', heading: 82, lengthMeters: 2140, surface: 'CONCRETE', reciprocalDesignator: '26' },
      { designator: '26', heading: 262, lengthMeters: 2140, surface: 'CONCRETE', reciprocalDesignator: '08' },
    ],
  },

  // ─── Madeira & Azores ───
  LPMA: {
    icao: 'LPMA',
    name: 'Madeira Cristiano Ronaldo Airport',
    elevation: 192,
    runways: [
      { designator: '05', heading: 48, lengthMeters: 2781, surface: 'ASPHALT', reciprocalDesignator: '23' },
      { designator: '23', heading: 228, lengthMeters: 2781, surface: 'ASPHALT', reciprocalDesignator: '05' },
    ],
  },
  LPPS: {
    icao: 'LPPS',
    name: 'Porto Santo Airport',
    elevation: 341,
    runways: [
      { designator: '18', heading: 179, lengthMeters: 3000, surface: 'CONCRETE', reciprocalDesignator: '36' },
      { designator: '36', heading: 359, lengthMeters: 3000, surface: 'CONCRETE', reciprocalDesignator: '18' },
    ],
  },
  LPPD: {
    icao: 'LPPD',
    name: 'Ponta Delgada João Paulo II Airport',
    elevation: 259,
    runways: [
      { designator: '12', heading: 117, lengthMeters: 2497, surface: 'ASPHALT', reciprocalDesignator: '30' },
      { designator: '30', heading: 297, lengthMeters: 2497, surface: 'ASPHALT', reciprocalDesignator: '12' },
    ],
  },
  LPLA: {
    icao: 'LPLA',
    name: 'Lajes Air Base / Terceira Airport',
    elevation: 180,
    runways: [
      { designator: '15', heading: 148, lengthMeters: 3313, surface: 'ASPHALT', reciprocalDesignator: '33' },
      { designator: '33', heading: 328, lengthMeters: 3313, surface: 'ASPHALT', reciprocalDesignator: '15' },
    ],
  },
  LPAZ: {
    icao: 'LPAZ',
    name: 'Santa Maria Airport',
    elevation: 308,
    runways: [
      { designator: '18', heading: 177, lengthMeters: 3048, surface: 'CONCRETE', reciprocalDesignator: '36' },
      { designator: '36', heading: 357, lengthMeters: 3048, surface: 'CONCRETE', reciprocalDesignator: '18' },
      { designator: '15', heading: 147, lengthMeters: 1414, surface: 'ASPHALT', reciprocalDesignator: '33' },
      { designator: '33', heading: 327, lengthMeters: 1414, surface: 'ASPHALT', reciprocalDesignator: '15' },
    ],
  },
  LPHR: {
    icao: 'LPHR',
    name: 'Horta Airport (Faial)',
    elevation: 118,
    runways: [
      { designator: '10', heading: 98, lengthMeters: 1595, surface: 'ASPHALT', reciprocalDesignator: '28' },
      { designator: '28', heading: 278, lengthMeters: 1595, surface: 'ASPHALT', reciprocalDesignator: '10' },
    ],
  },
  LPPI: {
    icao: 'LPPI',
    name: 'Pico Airport',
    elevation: 109,
    runways: [
      { designator: '09', heading: 88, lengthMeters: 1745, surface: 'ASPHALT', reciprocalDesignator: '27' },
      { designator: '27', heading: 268, lengthMeters: 1745, surface: 'ASPHALT', reciprocalDesignator: '09' },
    ],
  },
  LPGR: {
    icao: 'LPGR',
    name: 'Graciosa Airport',
    elevation: 86,
    runways: [
      { designator: '09', heading: 89, lengthMeters: 1325, surface: 'ASPHALT', reciprocalDesignator: '27' },
      { designator: '27', heading: 269, lengthMeters: 1325, surface: 'ASPHALT', reciprocalDesignator: '09' },
    ],
  },
  LPFL: {
    icao: 'LPFL',
    name: 'Flores Airport',
    elevation: 112,
    runways: [
      { designator: '15', heading: 149, lengthMeters: 1400, surface: 'ASPHALT', reciprocalDesignator: '33' },
      { designator: '33', heading: 329, lengthMeters: 1400, surface: 'ASPHALT', reciprocalDesignator: '15' },
    ],
  },
  LPCR: {
    icao: 'LPCR',
    name: 'Corvo Airport',
    elevation: 62,
    runways: [
      { designator: '11', heading: 112, lengthMeters: 800, surface: 'ASPHALT', reciprocalDesignator: '29' },
      { designator: '29', heading: 292, lengthMeters: 800, surface: 'ASPHALT', reciprocalDesignator: '11' },
    ],
  },
  LPSJ: {
    icao: 'LPSJ',
    name: 'São Jorge Airport',
    elevation: 311,
    runways: [
      { designator: '13', heading: 132, lengthMeters: 1374, surface: 'ASPHALT', reciprocalDesignator: '31' },
      { designator: '31', heading: 312, lengthMeters: 1374, surface: 'ASPHALT', reciprocalDesignator: '13' },
    ],
  },

  // ─── Spain & Major European Hubs ───
  LEMD: {
    icao: 'LEMD',
    name: 'Adolfo Suárez Madrid–Barajas Airport',
    elevation: 1998,
    runways: [
      { designator: '14L', heading: 144, lengthMeters: 3500, surface: 'ASPHALT', reciprocalDesignator: '32R' },
      { designator: '32R', heading: 324, lengthMeters: 3500, surface: 'ASPHALT', reciprocalDesignator: '14L' },
      { designator: '14R', heading: 144, lengthMeters: 4100, surface: 'ASPHALT', reciprocalDesignator: '32L' },
      { designator: '32L', heading: 324, lengthMeters: 4100, surface: 'ASPHALT', reciprocalDesignator: '14R' },
      { designator: '18L', heading: 184, lengthMeters: 3500, surface: 'ASPHALT', reciprocalDesignator: '36R' },
      { designator: '36R', heading: 4, lengthMeters: 3500, surface: 'ASPHALT', reciprocalDesignator: '18L' },
      { designator: '18R', heading: 184, lengthMeters: 3700, surface: 'ASPHALT', reciprocalDesignator: '36L' },
      { designator: '36L', heading: 4, lengthMeters: 3700, surface: 'ASPHALT', reciprocalDesignator: '18R' },
    ],
  },
  LEBL: {
    icao: 'LEBL',
    name: 'Josep Tarradellas Barcelona–El Prat Airport',
    elevation: 14,
    runways: [
      { designator: '06L', heading: 64, lengthMeters: 3352, surface: 'ASPHALT', reciprocalDesignator: '24R' },
      { designator: '24R', heading: 244, lengthMeters: 3352, surface: 'ASPHALT', reciprocalDesignator: '06L' },
      { designator: '06R', heading: 64, lengthMeters: 2660, surface: 'ASPHALT', reciprocalDesignator: '24L' },
      { designator: '24L', heading: 244, lengthMeters: 2660, surface: 'ASPHALT', reciprocalDesignator: '06R' },
      { designator: '02', heading: 20, lengthMeters: 2528, surface: 'ASPHALT', reciprocalDesignator: '20' },
      { designator: '20', heading: 200, lengthMeters: 2528, surface: 'ASPHALT', reciprocalDesignator: '02' },
    ],
  },
  LEST: {
    icao: 'LEST',
    name: 'Santiago–Rosalía de Castro Airport',
    elevation: 1213,
    runways: [
      { designator: '17', heading: 169, lengthMeters: 3200, surface: 'ASPHALT', reciprocalDesignator: '35' },
      { designator: '35', heading: 349, lengthMeters: 3200, surface: 'ASPHALT', reciprocalDesignator: '17' },
    ],
  },
  LESE: {
    icao: 'LESE',
    name: 'Sevilla Airport (San Pablo)',
    elevation: 112,
    runways: [
      { designator: '09', heading: 89, lengthMeters: 3360, surface: 'ASPHALT', reciprocalDesignator: '27' },
      { designator: '27', heading: 269, lengthMeters: 3360, surface: 'ASPHALT', reciprocalDesignator: '09' },
    ],
  },
  LEMG: {
    icao: 'LEMG',
    name: 'Málaga–Costa del Sol Airport',
    elevation: 52,
    runways: [
      { designator: '13', heading: 126, lengthMeters: 3200, surface: 'ASPHALT', reciprocalDesignator: '31' },
      { designator: '31', heading: 306, lengthMeters: 3200, surface: 'ASPHALT', reciprocalDesignator: '13' },
      { designator: '12', heading: 120, lengthMeters: 2750, surface: 'ASPHALT', reciprocalDesignator: '30' },
      { designator: '30', heading: 300, lengthMeters: 2750, surface: 'ASPHALT', reciprocalDesignator: '12' },
    ],
  },
  EGLL: {
    icao: 'EGLL',
    name: 'London Heathrow Airport',
    elevation: 83,
    runways: [
      { designator: '09L', heading: 90, lengthMeters: 3902, surface: 'ASPHALT', reciprocalDesignator: '27R' },
      { designator: '27R', heading: 270, lengthMeters: 3902, surface: 'ASPHALT', reciprocalDesignator: '09L' },
      { designator: '09R', heading: 90, lengthMeters: 3660, surface: 'ASPHALT', reciprocalDesignator: '27L' },
      { designator: '27L', heading: 270, lengthMeters: 3660, surface: 'ASPHALT', reciprocalDesignator: '09R' },
    ],
  },
  LFPG: {
    icao: 'LFPG',
    name: 'Paris Charles de Gaulle Airport',
    elevation: 392,
    runways: [
      { designator: '08L', heading: 85, lengthMeters: 4215, surface: 'ASPHALT', reciprocalDesignator: '26R' },
      { designator: '26R', heading: 265, lengthMeters: 4215, surface: 'ASPHALT', reciprocalDesignator: '08L' },
      { designator: '08R', heading: 85, lengthMeters: 2700, surface: 'ASPHALT', reciprocalDesignator: '26L' },
      { designator: '26L', heading: 265, lengthMeters: 2700, surface: 'ASPHALT', reciprocalDesignator: '08R' },
      { designator: '09L', heading: 85, lengthMeters: 2700, surface: 'ASPHALT', reciprocalDesignator: '27R' },
      { designator: '27R', heading: 265, lengthMeters: 2700, surface: 'ASPHALT', reciprocalDesignator: '09L' },
      { designator: '09R', heading: 85, lengthMeters: 4200, surface: 'ASPHALT', reciprocalDesignator: '27L' },
      { designator: '27L', heading: 265, lengthMeters: 4200, surface: 'ASPHALT', reciprocalDesignator: '09R' },
    ],
  },
  KJFK: {
    icao: 'KJFK',
    name: 'John F. Kennedy International Airport',
    elevation: 13,
    runways: [
      { designator: '04L', heading: 44, lengthMeters: 3460, surface: 'ASPHALT', reciprocalDesignator: '22R' },
      { designator: '22R', heading: 224, lengthMeters: 3460, surface: 'ASPHALT', reciprocalDesignator: '04L' },
      { designator: '04R', heading: 44, lengthMeters: 2560, surface: 'ASPHALT', reciprocalDesignator: '22L' },
      { designator: '22L', heading: 224, lengthMeters: 2560, surface: 'ASPHALT', reciprocalDesignator: '04R' },
      { designator: '13L', heading: 134, lengthMeters: 3048, surface: 'ASPHALT', reciprocalDesignator: '31R' },
      { designator: '31R', heading: 314, lengthMeters: 3048, surface: 'ASPHALT', reciprocalDesignator: '13L' },
      { designator: '13R', heading: 134, lengthMeters: 4423, surface: 'ASPHALT', reciprocalDesignator: '31L' },
      { designator: '31L', heading: 314, lengthMeters: 4423, surface: 'ASPHALT', reciprocalDesignator: '13R' },
    ],
  },
};

/**
 * Finds airport runway definitions for a given identifier / ICAO.
 */
export function findAirportRunways(identifier: string): AirportRunwayInfo | null {
  if (!identifier) return null;
  const clean = identifier.toUpperCase().trim();
  return AIRPORT_RUNWAYS[clean] || null;
}

/**
 * Generates generic reciprocal runway definitions from any heading in degrees.
 * E.g., heading 170 -> RWY 17 (170°M) & RWY 35 (350°M).
 */
export function generateGenericRunways(heading: number): RunwayDefinition[] {
  let h1 = Math.round(heading) % 360;
  if (h1 <= 0) h1 = 360;
  let h2 = (h1 + 180) % 360;
  if (h2 <= 0) h2 = 360;

  const num1 = Math.round(h1 / 10).toString().padStart(2, '0');
  const num2 = Math.round(h2 / 10).toString().padStart(2, '0');

  return [
    { designator: num1, heading: h1, reciprocalDesignator: num2 },
    { designator: num2, heading: h2, reciprocalDesignator: num1 },
  ];
}

/**
 * Evaluates which runway among a list gives the best headwind advantage.
 */
export function scoreRunwaysForWind(
  runways: RunwayDefinition[],
  windDirection: number,
  windSpeed: number
): { runway: RunwayDefinition; headwind: number; crosswind: number; isBest: boolean }[] {
  if (!runways || runways.length === 0) return [];

  const windRad = (windDirection * Math.PI) / 180;

  const scored = runways.map((rwy) => {
    const rwyRad = (rwy.heading * Math.PI) / 180;
    const relRad = windRad - rwyRad;
    const headwind = (Math.round((windSpeed * Math.cos(relRad)) * 10) / 10) || 0;
    const crosswind = (Math.round(Math.abs(windSpeed * Math.sin(relRad)) * 10) / 10) || 0;
    return {
      runway: rwy,
      headwind,
      crosswind,
      isBest: false,
    };
  });

  // Find max headwind
  let maxHw = -Infinity;
  for (const s of scored) {
    if (s.headwind > maxHw) {
      maxHw = s.headwind;
    }
  }

  return scored.map((s) => ({
    ...s,
    isBest: windSpeed > 0 ? s.headwind === maxHw : false,
  }));
}

/**
 * Verified Geographic Coordinates & Elevations for European and Portuguese Aerodromes.
 */
export const AIRPORT_COORDINATES: Record<
  string,
  { lat: number; lon: number; elevation: number; country: string }
> = {
  // Portugal Continental
  LPCS: { lat: 38.7256, lon: -9.3553, elevation: 325, country: 'PT' },
  LPPT: { lat: 38.7813, lon: -9.1359, elevation: 374, country: 'PT' },
  LPFR: { lat: 37.0144, lon: -7.9659, elevation: 24, country: 'PT' },
  LPPR: { lat: 41.2481, lon: -8.6814, elevation: 228, country: 'PT' },
  LPBJ: { lat: 38.0792, lon: -7.9322, elevation: 636, country: 'PT' },
  LPEV: { lat: 38.5342, lon: -7.8894, elevation: 807, country: 'PT' },
  LPCO: { lat: 40.1583, lon: -8.4700, elevation: 587, country: 'PT' },
  LPVR: { lat: 41.2742, lon: -7.7206, elevation: 1805, country: 'PT' },
  LPVZ: { lat: 40.7256, lon: -7.8892, elevation: 2060, country: 'PT' },
  LPPM: { lat: 37.1494, lon: -8.5839, elevation: 5, country: 'PT' },
  LPSC: { lat: 39.1350, lon: -9.3800, elevation: 157, country: 'PT' },
  LPSO: { lat: 39.2122, lon: -8.0539, elevation: 390, country: 'PT' },
  LPVL: { lat: 41.2800, lon: -8.5178, elevation: 762, country: 'PT' },
  LPBR: { lat: 41.5878, lon: -8.4447, elevation: 247, country: 'PT' },
  LPBG: { lat: 41.8578, lon: -6.7072, elevation: 2241, country: 'PT' },
  LPCB: { lat: 39.8483, lon: -7.4403, elevation: 1300, country: 'PT' },
  LPCH: { lat: 41.7222, lon: -7.4633, elevation: 1181, country: 'PT' },
  LPJF: { lat: 39.7828, lon: -8.8242, elevation: 151, country: 'PT' },
  LPLZ: { lat: 40.1258, lon: -8.2458, elevation: 654, country: 'PT' },
  LPSR: { lat: 39.2611, lon: -8.6881, elevation: 30, country: 'PT' },
  LPAR: { lat: 38.9000, lon: -9.0300, elevation: 11, country: 'PT' },
  LPST: { lat: 38.8306, lon: -9.3392, elevation: 440, country: 'PT' },
  LPOV: { lat: 40.9142, lon: -8.6472, elevation: 56, country: 'PT' },
  LPMR: { lat: 39.8308, lon: -8.8878, elevation: 187, country: 'PT' },
  LPMT: { lat: 38.7078, lon: -8.9950, elevation: 46, country: 'PT' },

  // Atlantic (Azores & Madeira)
  LPMA: { lat: 32.6978, lon: -16.7744, elevation: 192, country: 'PT' },
  LPPS: { lat: 33.0786, lon: -16.3497, elevation: 341, country: 'PT' },
  LPPD: { lat: 37.7411, lon: -25.6978, elevation: 259, country: 'PT' },
  LPLA: { lat: 38.7619, lon: -27.0908, elevation: 177, country: 'PT' },
  LPFL: { lat: 39.4553, lon: -31.1314, elevation: 112, country: 'PT' },
  LPGR: { lat: 39.0850, lon: -28.0297, elevation: 85, country: 'PT' },
  LPHR: { lat: 38.5197, lon: -28.7158, elevation: 118, country: 'PT' },
  LPPI: { lat: 38.5544, lon: -28.4414, elevation: 108, country: 'PT' },
  LPSJ: { lat: 38.6653, lon: -28.1758, elevation: 312, country: 'PT' },
  LPAZ: { lat: 36.9714, lon: -25.1706, elevation: 305, country: 'PT' },
  LPCV: { lat: 38.3097, lon: -28.0306, elevation: 66, country: 'PT' },

  // Spain & Western Europe
  LEMD: { lat: 40.4936, lon: -3.5668, elevation: 2001, country: 'ES' },
  LEBL: { lat: 41.2971, lon: 2.0785, elevation: 14, country: 'ES' },
  LEZL: { lat: 37.4180, lon: -5.8931, elevation: 112, country: 'ES' },
  LEMG: { lat: 36.6749, lon: -4.4991, elevation: 52, country: 'ES' },
  LEVC: { lat: 39.4893, lon: -0.4816, elevation: 240, country: 'ES' },
  LEAL: { lat: 38.2822, lon: -0.5581, elevation: 141, country: 'ES' },
  LECO: { lat: 43.3021, lon: -8.3773, elevation: 328, country: 'ES' },
  LEVX: { lat: 42.2319, lon: -8.6268, elevation: 856, country: 'ES' },
  LEST: { lat: 42.8964, lon: -8.4151, elevation: 1214, country: 'ES' },
  LEAS: { lat: 43.5636, lon: -6.0346, elevation: 417, country: 'ES' },
  LEBB: { lat: 43.3011, lon: -2.9106, elevation: 138, country: 'ES' },
  LFPG: { lat: 49.0097, lon: 2.5478, elevation: 390, country: 'FR' },
  EGLL: { lat: 51.4700, lon: -0.4543, elevation: 83, country: 'GB' },
  EDDF: { lat: 50.0379, lon: 8.5622, elevation: 364, country: 'DE' },
  EHAM: { lat: 52.3105, lon: 4.7683, elevation: -11, country: 'NL' },
};

/**
 * Resolves a Waypoint structure for any aerodrome in the database.
 */
export function getAirportWaypoint(icao: string): Waypoint | null {
  if (!icao) return null;
  const upper = icao.toUpperCase().trim();
  const info = AIRPORT_RUNWAYS[upper];
  const coords = AIRPORT_COORDINATES[upper];
  if (!info && !coords) return null;

  return {
    id: Math.abs(upper.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)),
    identifier: upper,
    name: info?.name || upper,
    type: 'airport',
    latitude: coords?.lat ?? (info?.latitude ?? 0),
    longitude: coords?.lon ?? (info?.longitude ?? 0),
    elevation: coords?.elevation ?? info?.elevation ?? 0,
    country: coords?.country || 'PT',
    isCustom: false,
  };
}

/**
 * Returns a complete array of known candidate alternate aerodromes.
 */
export function getAllCandidateAlternates(): Waypoint[] {
  const result: Waypoint[] = [];
  const processed = new Set<string>();

  for (const icao of Object.keys(AIRPORT_COORDINATES)) {
    if (processed.has(icao)) continue;
    const wp = getAirportWaypoint(icao);
    if (wp && wp.latitude !== 0 && wp.longitude !== 0) {
      result.push(wp);
      processed.add(icao);
    }
  }

  return result;
}
