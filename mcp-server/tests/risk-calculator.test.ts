import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateRiskScore } from '../src/tools/risk-calculator.js';
import {
  mockPatient,
  mockCondition,
  mockObservation,
  mockFHIRClient,
  mockBloodPressure,
  mockHeartRate,
} from './helpers/mock-fhir.js';

vi.mock('../src/fhir/queries/patient.js', () => ({
  getPatient: vi.fn(),
}));
vi.mock('../src/fhir/queries/conditions.js', () => ({
  getConditions: vi.fn(),
}));
vi.mock('../src/fhir/queries/observations.js', () => ({
  getRecentLabs: vi.fn(),
  getRecentVitals: vi.fn(),
}));

import { getPatient } from '../src/fhir/queries/patient.js';
import { getConditions } from '../src/fhir/queries/conditions.js';
import { getRecentLabs, getRecentVitals } from '../src/fhir/queries/observations.js';

const mockedGetPatient = vi.mocked(getPatient);
const mockedGetConditions = vi.mocked(getConditions);
const mockedGetRecentLabs = vi.mocked(getRecentLabs);
const mockedGetRecentVitals = vi.mocked(getRecentVitals);

beforeEach(() => {
  vi.clearAllMocks();
});

function setupMocks(overrides?: {
  patient?: ReturnType<typeof mockPatient>;
  conditions?: ReturnType<typeof mockCondition>[];
  labs?: ReturnType<typeof mockObservation>[];
  vitals?: ReturnType<typeof mockObservation>[];
}) {
  const patient = overrides?.patient ?? mockPatient({ birthDate: '1960-01-01', gender: 'male' });
  mockedGetPatient.mockResolvedValue(patient);
  mockedGetConditions.mockResolvedValue(overrides?.conditions ?? []);
  mockedGetRecentLabs.mockResolvedValue(overrides?.labs ?? []);
  mockedGetRecentVitals.mockResolvedValue(overrides?.vitals ?? []);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHA2DS2-VASc
// ══════════════════════════════════════════════════════════════════════════════

describe('CHA2DS2-VASc calculator', () => {
  it('returns low risk (score 0) for young male with no conditions', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1990-01-01', gender: 'male' }),
      conditions: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CHA2DS2-VASc',
    });

    expect(result).toContain('Score: 0');
    expect(result).toContain('Low');
  });

  it('adds 1 point for female sex', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1990-01-01', gender: 'female' }),
      conditions: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CHA2DS2-VASc',
    });

    expect(result).toContain('Score: 1');
  });

  it('scores high risk for patient with multiple conditions', async () => {
    setupMocks({
      // Age 80 gets 2 points for >=75
      patient: mockPatient({ birthDate: '1945-01-01', gender: 'female' }),
      conditions: [
        mockCondition('Heart failure'),
        mockCondition('Essential hypertension'),
        mockCondition('Diabetes mellitus'),
        mockCondition('Ischemic stroke'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CHA2DS2-VASc',
    });

    // HF=1, HTN=1, Age75=2, DM=1, Stroke=2, Female=1 = 8
    expect(result).toContain('High');
    expect(result).toContain('anticoagulation');
  });

  it('gives age 65-74 one point', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1955-06-01', gender: 'male' }),
      conditions: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CHA2DS2-VASc',
    });

    // 65-74 = 1 point
    expect(result).toContain('Score: 1');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// HEART Score
// ══════════════════════════════════════════════════════════════════════════════

describe('HEART Score calculator', () => {
  it('returns low risk for young patient with no risk factors and no troponin', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1990-01-01', gender: 'male' }),
      conditions: [],
      labs: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'HEART',
    });

    // History=1(default), ECG=1(default), Age(<45)=0, Risk=0, Trop=0 => 2
    expect(result).toContain('Low');
  });

  it('scores age points correctly for 45-64', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1970-01-01', gender: 'male' }),
      conditions: [],
      labs: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'HEART',
    });

    // History=1, ECG=1, Age(45-64)=1, Risk=0, Trop=0 => 3 (Low)
    expect(result).toContain('Score: 3');
  });

  it('interprets elevated troponin', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1960-01-01', gender: 'male' }),
      conditions: [],
      labs: [
        // Troponin I 0.1 ng/mL, normal limit for male is 0.04, 1-3x = 0.04-0.12
        mockObservation('49563-0', 0.1, 'ng/mL', '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'HEART',
    });

    // History=1, ECG=1, Age(>=65)=2, Risk=0, Trop(1-3x)=1 => 5
    expect(result).toContain('Moderate');
  });

  it('detects high risk with many risk factors', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1950-01-01', gender: 'male' }),
      conditions: [
        mockCondition('Essential hypertension'),
        mockCondition('Diabetes mellitus'),
        mockCondition('Obesity'),
      ],
      labs: [
        // Troponin very high >3x normal (>0.12 for male)
        mockObservation('49563-0', 0.5, 'ng/mL', '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'HEART',
    });

    // History=1, ECG=1, Age(>=65)=2, Risk(>=3)=2, Trop(>3x)=2 => 8 High
    expect(result).toContain('High');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wells-DVT
// ══════════════════════════════════════════════════════════════════════════════

describe('Wells-DVT calculator', () => {
  it('returns low/unlikely for no risk factors', async () => {
    setupMocks({
      conditions: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-DVT',
    });

    expect(result).toContain('Score: 0');
    expect(result).toContain('Low/Unlikely');
  });

  it('scores cancer and previous DVT', async () => {
    setupMocks({
      conditions: [
        mockCondition('Malignant neoplasm of lung'),
        mockCondition('Deep vein thrombosis'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-DVT',
    });

    // Cancer=1, DVT=1 => 2 (Moderate)
    expect(result).toContain('Score: 2');
    expect(result).toContain('Moderate');
  });

  it('scores high with cancer, DVT, and edema', async () => {
    setupMocks({
      conditions: [
        mockCondition('Malignant neoplasm'),
        mockCondition('Deep vein thrombosis'),
        mockCondition('Pitting edema'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-DVT',
    });

    // Cancer=1, DVT=1, Edema=1 => 3 (High/Likely)
    expect(result).toContain('Score: 3');
    expect(result).toContain('High/Likely');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Wells-PE
// ══════════════════════════════════════════════════════════════════════════════

describe('Wells-PE calculator', () => {
  it('returns low for no risk factors and normal HR', async () => {
    setupMocks({
      conditions: [],
      vitals: [mockHeartRate(80)],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-PE',
    });

    expect(result).toContain('Score: 0');
  });

  it('adds 1.5 points for elevated HR', async () => {
    setupMocks({
      conditions: [],
      vitals: [mockHeartRate(110)],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-PE',
    });

    expect(result).toContain('1.5');
    expect(result).toContain('Yes (110 bpm)');
  });

  it('adds points for previous VTE and cancer', async () => {
    setupMocks({
      conditions: [
        mockCondition('Pulmonary embolism'),
        mockCondition('Malignant neoplasm'),
      ],
      vitals: [mockHeartRate(105)],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'Wells-PE',
    });

    // HR>100=1.5, VTE=1.5, Cancer=1 => 4
    expect(result).toContain('Score: 4');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ASCVD
// ══════════════════════════════════════════════════════════════════════════════

describe('ASCVD calculator', () => {
  it('reports unable to calculate when data is missing', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1970-01-01', gender: 'male' }),
      conditions: [],
      labs: [],
      vitals: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'ASCVD',
    });

    expect(result).toContain('Unable to Calculate');
    expect(result).toContain('Missing required inputs');
  });

  it('calculates risk when all data is available', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1970-01-01', gender: 'male' }),
      conditions: [],
      labs: [
        mockObservation('2093-3', 200, 'mg/dL', '2025-01-15'), // Total cholesterol
        mockObservation('2085-9', 50, 'mg/dL', '2025-01-15'),  // HDL
      ],
      vitals: [
        mockBloodPressure(130, 80, '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'ASCVD',
    });

    expect(result).toContain('10-Year ASCVD Risk');
    expect(result).toContain('%');
  });

  it('reports unable when age is out of range', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '2000-01-01', gender: 'male' }),
      conditions: [],
      labs: [
        mockObservation('2093-3', 200, 'mg/dL'),
        mockObservation('2085-9', 50, 'mg/dL'),
      ],
      vitals: [mockBloodPressure(120, 80)],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'ASCVD',
    });

    expect(result).toContain('Unable to Calculate');
    expect(result).toContain('age 40-79');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CKD-EPI
// ══════════════════════════════════════════════════════════════════════════════

describe('CKD-EPI calculator', () => {
  it('calculates eGFR with normal creatinine', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1960-01-01', gender: 'male' }),
      labs: [
        mockObservation('2160-0', 1.0, 'mg/dL', '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CKD-EPI',
    });

    expect(result).toContain('eGFR:');
    expect(result).toContain('mL/min/1.73m2');
  });

  it('reports unable to calculate without creatinine', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1960-01-01', gender: 'male' }),
      labs: [],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CKD-EPI',
    });

    expect(result).toContain('Unable to Calculate');
    expect(result).toContain('Serum creatinine value not available');
  });

  it('detects CKD with elevated creatinine', async () => {
    setupMocks({
      patient: mockPatient({ birthDate: '1960-01-01', gender: 'male' }),
      labs: [
        mockObservation('2160-0', 4.0, 'mg/dL', '2025-01-15'),
      ],
    });

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'CKD-EPI',
    });

    expect(result).toContain('eGFR:');
    // eGFR should be very low for creatinine of 4.0
    // The result string contains the eGFR number
    expect(result).toContain('CKD Stage');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Unknown calculator
// ══════════════════════════════════════════════════════════════════════════════

describe('Unknown calculator', () => {
  it('returns error message for invalid calculator name', async () => {
    setupMocks();

    const client = mockFHIRClient({});
    const result = await calculateRiskScore(client, {
      patientId: 'p1',
      calculator: 'INVALID' as any,
    });

    expect(result).toContain('Unknown calculator');
  });
});
