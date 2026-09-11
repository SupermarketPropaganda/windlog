export type AirspaceType =
  | 'CTR'
  | 'TMA'
  | 'CTA'
  | 'ATZ'
  | 'RESTRICTED'
  | 'PROHIBITED'
  | 'DANGER';

export type AirspaceClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'SPECIAL';

export interface Airspace {
  id: string;
  name: string;
  type: AirspaceType;
  classification: AirspaceClass;
  lowerLimitFt: number; // In feet AMSL (0 = SFC / GND)
  upperLimitFt: number; // In feet AMSL (FL095 = 9500, FL145 = 14500, FL240 = 24000)
  lowerLimitLabel: string;
  upperLimitLabel: string;
  frequency?: string;
  polygon: [number, number][]; // [latitude, longitude]
  remarks?: string;
}

/**
 * Portuguese & Regional Aeronautical Airspaces (Lisboa FIR / LPPC)
 * Extracted from NAV Portugal AIP Portugal ENR 2.1 / ENR 5.1
 */
export const AIRSPACES: Airspace[] = [
  // ─── CONTROL ZONES (CTR - Surface to 2,000 / 2,500 FT) ───
  {
    id: 'LPCS_CTR',
    name: 'CASCAIS CTR',
    type: 'CTR',
    classification: 'D',
    lowerLimitFt: 0,
    upperLimitFt: 2500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2500 FT ALT',
    frequency: 'Cascais Tower 120.305 MHz',
    polygon: [
      [38.775, -9.455],
      [38.785, -9.325],
      [38.745, -9.280],
      [38.685, -9.300],
      [38.670, -9.420],
      [38.710, -9.480],
      [38.775, -9.455],
    ],
    remarks: 'VFR entry via BALQV, CROCA, BALIO, ERICE with Cascais Tower prior approval',
  },
  {
    id: 'LPST_CTR',
    name: 'SINTRA CTR',
    type: 'CTR',
    classification: 'C',
    lowerLimitFt: 0,
    upperLimitFt: 2500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2500 FT ALT',
    frequency: 'Sintra Tower 122.100 MHz',
    polygon: [
      [38.860, -9.420],
      [38.865, -9.300],
      [38.800, -9.280],
      [38.785, -9.325],
      [38.775, -9.455],
      [38.820, -9.450],
      [38.860, -9.420],
    ],
    remarks: 'Military Air Base No. 1. Contact Sintra Tower before entry',
  },
  {
    id: 'LPPT_CTR',
    name: 'LISBOA CTR',
    type: 'CTR',
    classification: 'C',
    lowerLimitFt: 0,
    upperLimitFt: 2000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2000 FT ALT',
    frequency: 'Lisboa Tower 118.005 MHz',
    polygon: [
      [38.830, -9.200],
      [38.840, -9.050],
      [38.760, -9.010],
      [38.710, -9.100],
      [38.700, -9.220],
      [38.760, -9.250],
      [38.830, -9.200],
    ],
    remarks: 'Lisbon Humberto Delgado Airport CTR. Strict ATC clearance required',
  },
  {
    id: 'LPMR_CTR',
    name: 'MONTE REAL CTR',
    type: 'CTR',
    classification: 'C',
    lowerLimitFt: 0,
    upperLimitFt: 3000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '3000 FT ALT',
    frequency: 'Monte Real Tower 122.100 MHz',
    polygon: [
      [39.880, -9.050],
      [39.890, -8.850],
      [39.750, -8.800],
      [39.720, -8.980],
      [39.780, -9.080],
      [39.880, -9.050],
    ],
    remarks: 'Military Air Base No. 5. F-16 operations active',
  },
  {
    id: 'LPPR_CTR',
    name: 'PORTO CTR',
    type: 'CTR',
    classification: 'C',
    lowerLimitFt: 0,
    upperLimitFt: 2500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2500 FT ALT',
    frequency: 'Porto Tower 118.000 MHz',
    polygon: [
      [41.280, -8.760],
      [41.300, -8.580],
      [41.190, -8.540],
      [41.160, -8.720],
      [41.280, -8.760],
    ],
    remarks: 'Francisco Sa Carneiro Airport CTR',
  },
  {
    id: 'LPFR_CTR',
    name: 'FARO CTR',
    type: 'CTR',
    classification: 'C',
    lowerLimitFt: 0,
    upperLimitFt: 2500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2500 FT ALT',
    frequency: 'Faro Tower 118.400 MHz',
    polygon: [
      [37.060, -8.080],
      [37.070, -7.860],
      [36.960, -7.850],
      [36.950, -8.070],
      [37.060, -8.080],
    ],
    remarks: 'Faro Airport CTR. Contact Faro Tower or Faro Approach',
  },

  // ─── TERMINAL CONTROL AREAS (TMA - Intermediate & Cruising Altitudes) ───
  {
    id: 'LISBOA_TMA_1',
    name: 'LISBOA TMA SECTOR 1',
    type: 'TMA',
    classification: 'C',
    lowerLimitFt: 1500,
    upperLimitFt: 9500,
    lowerLimitLabel: '1500 FT ALT',
    upperLimitLabel: 'FL 095',
    frequency: 'Lisboa Radar 119.105 MHz',
    polygon: [
      [39.050, -9.600],
      [39.100, -8.900],
      [38.650, -8.850],
      [38.550, -9.450],
      [38.750, -9.650],
      [39.050, -9.600],
    ],
    remarks: 'Lisboa TMA Sector 1 (surrounding Lisboa/Cascais/Sintra). Two-way radio & Transponder mandatory',
  },
  {
    id: 'LISBOA_TMA_2',
    name: 'LISBOA TMA SECTOR 2',
    type: 'TMA',
    classification: 'C',
    lowerLimitFt: 2500,
    upperLimitFt: 14500,
    lowerLimitLabel: '2500 FT ALT',
    upperLimitLabel: 'FL 145',
    frequency: 'Lisboa Military / Lisboa Radar 123.750 MHz',
    polygon: [
      [39.400, -9.800],
      [39.500, -8.600],
      [38.400, -8.500],
      [38.300, -9.600],
      [39.400, -9.800],
    ],
    remarks: 'Extended Lisboa TMA Sector 2',
  },
  {
    id: 'MONTE_REAL_TMA',
    name: 'MONTE REAL TMA',
    type: 'TMA',
    classification: 'C',
    lowerLimitFt: 3000,
    upperLimitFt: 14500,
    lowerLimitLabel: '3000 FT ALT',
    upperLimitLabel: 'FL 145',
    frequency: 'Monte Real Approach 122.100 MHz',
    polygon: [
      [40.150, -9.250],
      [40.200, -8.600],
      [39.550, -8.550],
      [39.500, -9.200],
      [40.150, -9.250],
    ],
    remarks: 'Monte Real Military Terminal Control Area',
  },
  {
    id: 'PORTO_TMA',
    name: 'PORTO TMA',
    type: 'TMA',
    classification: 'C',
    lowerLimitFt: 2500,
    upperLimitFt: 14500,
    lowerLimitLabel: '2500 FT ALT',
    upperLimitLabel: 'FL 145',
    frequency: 'Porto Approach 121.100 MHz',
    polygon: [
      [41.600, -8.950],
      [41.650, -8.300],
      [40.850, -8.250],
      [40.800, -8.900],
      [41.600, -8.950],
    ],
    remarks: 'Porto Terminal Control Area',
  },

  // ─── AERODROME TRAFFIC ZONES (ATZ - Uncontrolled Airfields) ───
  {
    id: 'LPCO_ATZ',
    name: 'COIMBRA ATZ',
    type: 'ATZ',
    classification: 'G',
    lowerLimitFt: 0,
    upperLimitFt: 2000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2000 FT AGL',
    frequency: 'Coimbra Radio 122.300 MHz',
    polygon: [
      [40.190, -8.500],
      [40.190, -8.440],
      [40.140, -8.440],
      [40.140, -8.500],
      [40.190, -8.500],
    ],
    remarks: 'Aeródromo Municipal Bissaya Barreto (LPCO). Blind broadcasting on 122.300',
  },
  {
    id: 'LPEV_ATZ',
    name: 'EVORA ATZ',
    type: 'ATZ',
    classification: 'G',
    lowerLimitFt: 0,
    upperLimitFt: 2000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '2000 FT AGL',
    frequency: 'Evora Radio 122.700 MHz',
    polygon: [
      [38.560, -7.920],
      [38.560, -7.860],
      [38.510, -7.860],
      [38.510, -7.920],
      [38.560, -7.920],
    ],
    remarks: 'Aeródromo Municipal de Évora (LPEV). Parachuting & Flight Training active',
  },

  // ─── SPECIAL USE AIRSPACE: RESTRICTED AREAS (LP-R) ───
  {
    id: 'LP_R51A',
    name: 'LP-R51A (STA MARGARIDA)',
    type: 'RESTRICTED',
    classification: 'SPECIAL',
    lowerLimitFt: 0,
    upperLimitFt: 24000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: 'FL 240',
    frequency: 'Lisboa Military 123.750 MHz',
    polygon: [
      [39.480, -8.400],
      [39.490, -8.220],
      [39.380, -8.200],
      [39.370, -8.380],
      [39.480, -8.400],
    ],
    remarks: 'Santa Margarida Military Firing & Ground Artillery Range. Flight strictly prohibited when active by NOTAM',
  },
  {
    id: 'LP_R42',
    name: 'LP-R42 (ALCOCHETE)',
    type: 'RESTRICTED',
    classification: 'SPECIAL',
    lowerLimitFt: 0,
    upperLimitFt: 14000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '14000 FT ALT',
    frequency: 'Lisboa Military 123.750 MHz',
    polygon: [
      [38.820, -8.850],
      [38.830, -8.700],
      [38.720, -8.680],
      [38.710, -8.840],
      [38.820, -8.850],
    ],
    remarks: 'Alcochete Firing Range (Campo de Tiro). Live ammunition testing',
  },

  // ─── SPECIAL USE AIRSPACE: PROHIBITED AREAS (LP-P) ───
  {
    id: 'LP_P11',
    name: 'LP-P11 (BELEM)',
    type: 'PROHIBITED',
    classification: 'SPECIAL',
    lowerLimitFt: 0,
    upperLimitFt: 1500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '1500 FT ALT',
    frequency: 'Lisboa Radar 119.105 MHz',
    polygon: [
      [38.705, -9.215],
      [38.705, -9.195],
      [38.690, -9.195],
      [38.690, -9.215],
      [38.705, -9.215],
    ],
    remarks: 'Presidential Palace & National Monuments. Strict prohibited area at all times',
  },

  // ─── SPECIAL USE AIRSPACE: DANGER AREAS (LP-D) ───
  {
    id: 'LP_D12',
    name: 'LP-D12 (ESPINHO)',
    type: 'DANGER',
    classification: 'SPECIAL',
    lowerLimitFt: 0,
    upperLimitFt: 12000,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: 'FL 120',
    frequency: 'Porto Information 120.300 MHz',
    polygon: [
      [41.010, -8.660],
      [41.020, -8.540],
      [40.940, -8.530],
      [40.930, -8.650],
      [41.010, -8.660],
    ],
    remarks: 'Intense parachuting activity over Espinho Aerodrome',
  },
  {
    id: 'LP_D25',
    name: 'LP-D25 (FIGUEIRA DA FOZ)',
    type: 'DANGER',
    classification: 'SPECIAL',
    lowerLimitFt: 0,
    upperLimitFt: 4500,
    lowerLimitLabel: 'SFC',
    upperLimitLabel: '4500 FT ALT',
    frequency: 'Lisboa Information 123.750 MHz',
    polygon: [
      [40.200, -8.950],
      [40.210, -8.820],
      [40.110, -8.810],
      [40.100, -8.940],
      [40.200, -8.950],
    ],
    remarks: 'Coastal low-level military training and paragliding',
  },
];
