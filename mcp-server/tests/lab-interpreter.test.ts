import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interpretLabResults } from '../src/tools/lab-interpreter.js';
import { mockPatient, mockObservation, mockFHIRClient } from './helpers/mock-fhir.js';

// Mock the FHIR query modules so we can control data flow
vi.mock('../src/fhir/queries/patient.js', () => ({
  getPatient: vi.fn(),
}));
vi.mock('../src/fhir/queries/observations.js', () => ({
  getRecentLabs: vi.fn(),
  getRecentVitals: vi.fn(),
}));

import { getPatient } from '../src/fhir/queries/patient.js';
import { getRecentLabs } from '../src/fhir/queries/observations.js';

const mockedGetPatient = vi.mocked(getPatient);
const mockedGetRecentLabs = vi.mocked(getRecentLabs);

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// Normal, High, Low flags
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - flag detection', () => {
  it('flags NORMAL values correctly', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      // Sodium 140 (normal range 136-145)
      mockObservation('2951-2', 140, 'mEq/L', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Normal Results');
    expect(result).not.toContain('CRITICAL');
    expect(result).not.toContain('Abnormal Results');
  });

  it('flags HIGH values correctly', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      // Sodium 150 (normal range 136-145)
      mockObservation('2951-2', 150, 'mEq/L', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Abnormal Results');
    expect(result).toContain('**HIGH**');
  });

  it('flags LOW values correctly', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      // Potassium 3.0 (normal range 3.5-5.0)
      mockObservation('2823-3', 3.0, 'mEq/L', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Abnormal Results');
    expect(result).toContain('**LOW**');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Critical values
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - critical values', () => {
  it('detects CRITICAL HIGH', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      // Potassium 7.0 (critical high >= 6.5)
      mockObservation('2823-3', 7.0, 'mEq/L', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('CRITICAL');
    expect(result).toContain('IMMEDIATE ATTENTION');
  });

  it('detects CRITICAL LOW', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      // Hemoglobin 5.0 (critical low <= 7.0)
      mockObservation('718-7', 5.0, 'g/dL', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('CRITICAL LOW');
    expect(result).toContain('IMMEDIATE ATTENTION');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Sex-adjusted ranges
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - sex-adjusted ranges', () => {
  it('uses male hemoglobin range (13.5-17.5)', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    // 12.5 is normal for females but LOW for males
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('718-7', 12.5, 'g/dL', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('**LOW**');
  });

  it('uses female hemoglobin range (12.0-16.0)', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'female' });
    mockedGetPatient.mockResolvedValue(patient);
    // 12.5 is within normal range for females
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('718-7', 12.5, 'g/dL', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Normal Results');
    expect(result).not.toContain('Abnormal Results');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Trend detection
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - trend detection', () => {
  it('detects improving trend (values moving toward normal)', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    // Glucose normal range is 70-100. Values going from 200 toward 85 (middle of normal).
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('2345-7', 200, 'mg/dL', '2024-10-01'),
      mockObservation('2345-7', 120, 'mg/dL', '2024-12-01'),
      // latest result used for flagging, earliest for trend
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Trends');
    expect(result).toContain('Improving');
  });

  it('detects worsening trend', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    // Glucose going from near-normal to very high
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('2345-7', 110, 'mg/dL', '2024-10-01'),
      mockObservation('2345-7', 250, 'mg/dL', '2025-01-01'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Trends');
    expect(result).toContain('WORSENING');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Derived values
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - derived values', () => {
  it('calculates eGFR from creatinine', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('2160-0', 1.2, 'mg/dL', '2025-01-15'),
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Estimated GFR');
    expect(result).toContain('mL/min/1.73m2');
  });

  it('calculates anion gap when Na, Cl, HCO3 are available', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('2951-2', 140, 'mEq/L', '2025-01-15'), // Na
      mockObservation('2075-0', 104, 'mEq/L', '2025-01-15'), // Cl
      mockObservation('2028-9', 24, 'mEq/L', '2025-01-15'),  // HCO3
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Anion Gap');
    expect(result).toContain('12'); // 140 - (104+24) = 12
  });

  it('calculates LDL via Friedewald when direct LDL is absent', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('2093-3', 200, 'mg/dL', '2025-01-15'), // Total cholesterol
      mockObservation('2085-9', 50, 'mg/dL', '2025-01-15'),  // HDL
      mockObservation('2571-8', 150, 'mg/dL', '2025-01-15'), // Triglycerides
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('Calculated LDL');
    // 200 - 50 - 150/5 = 120
    expect(result).toContain('120');
  });

  it('calculates BUN/Creatinine ratio', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([
      mockObservation('3094-0', 20, 'mg/dL', '2025-01-15'),  // BUN
      mockObservation('2160-0', 1.0, 'mg/dL', '2025-01-15'), // Creatinine
    ]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('BUN/Creatinine Ratio');
    expect(result).toContain('20'); // 20/1.0 = 20
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Empty labs
// ══════════════════════════════════════════════════════════════════════════════

describe('interpretLabResults - no labs', () => {
  it('returns appropriate message when no labs found', async () => {
    const patient = mockPatient({ birthDate: '1960-01-01', gender: 'male' });
    mockedGetPatient.mockResolvedValue(patient);
    mockedGetRecentLabs.mockResolvedValue([]);

    const client = mockFHIRClient({});
    const result = await interpretLabResults(client, { patientId: 'p1' });

    expect(result).toContain('No laboratory results found');
  });
});
