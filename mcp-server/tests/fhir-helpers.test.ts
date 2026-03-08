import { describe, it, expect } from 'vitest';
import {
  getPatientAge,
  getPatientSex,
  formatHumanName,
  getCodeDisplay,
  getLoincCode,
  isActiveCondition,
  calculateEGFR,
  calculateAnionGap,
  calculateBMI,
  daysAgo,
  formatDate,
  conditionMatchesKeywords,
  getSnomedCode,
} from '../src/utils/fhir-helpers.js';
import type { Patient, HumanName, CodeableConcept, Condition } from '../src/fhir/types.js';
import { mockPatient, mockCondition } from './helpers/mock-fhir.js';

// ══════════════════════════════════════════════════════════════════════════════
// getPatientAge
// ══════════════════════════════════════════════════════════════════════════════

describe('getPatientAge', () => {
  it('returns correct age for a past birthDate', () => {
    const now = new Date();
    const birthYear = now.getFullYear() - 40;
    // Use a birthDate well in the past within this year
    const patient = mockPatient({ birthDate: `${birthYear}-01-01` });
    const age = getPatientAge(patient);
    expect(age).toBe(40);
  });

  it('returns 0 when birthDate is missing', () => {
    const patient = mockPatient({ birthDate: undefined });
    expect(getPatientAge(patient)).toBe(0);
  });

  it('accounts for birthday not yet reached this year', () => {
    const now = new Date();
    const birthYear = now.getFullYear() - 30;
    // Set birthDate to December 31 so it has not happened yet (unless today IS Dec 31)
    const patient = mockPatient({ birthDate: `${birthYear}-12-31` });
    const age = getPatientAge(patient);
    // If today is Dec 31, age = 30; otherwise age = 29
    if (now.getMonth() === 11 && now.getDate() === 31) {
      expect(age).toBe(30);
    } else {
      expect(age).toBe(29);
    }
  });

  it('returns 0 for a patient born today', () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const patient = mockPatient({ birthDate: todayStr });
    expect(getPatientAge(patient)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getPatientSex
// ══════════════════════════════════════════════════════════════════════════════

describe('getPatientSex', () => {
  it('returns "male" for male patient', () => {
    expect(getPatientSex(mockPatient({ gender: 'male' }))).toBe('male');
  });

  it('returns "female" for female patient', () => {
    expect(getPatientSex(mockPatient({ gender: 'female' }))).toBe('female');
  });

  it('lowercases the gender value', () => {
    expect(getPatientSex(mockPatient({ gender: 'Female' }))).toBe('female');
  });

  it('returns "unknown" when gender is undefined', () => {
    expect(getPatientSex(mockPatient({ gender: undefined }))).toBe('unknown');
  });

  it('returns "other" for non-standard gender', () => {
    expect(getPatientSex(mockPatient({ gender: 'other' }))).toBe('other');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// formatHumanName
// ══════════════════════════════════════════════════════════════════════════════

describe('formatHumanName', () => {
  it('returns text field when present', () => {
    const name: HumanName = { text: 'Dr. John Smith Jr.' };
    expect(formatHumanName(name)).toBe('Dr. John Smith Jr.');
  });

  it('joins given and family names', () => {
    const name: HumanName = { given: ['John', 'Michael'], family: 'Doe' };
    expect(formatHumanName(name)).toBe('John Michael Doe');
  });

  it('includes prefix and suffix', () => {
    const name: HumanName = {
      prefix: ['Dr.'],
      given: ['Jane'],
      family: 'Smith',
      suffix: ['MD', 'PhD'],
    };
    expect(formatHumanName(name)).toBe('Dr. Jane Smith MD PhD');
  });

  it('returns "Unknown" for empty name', () => {
    const name: HumanName = {};
    expect(formatHumanName(name)).toBe('Unknown');
  });

  it('handles given name only', () => {
    const name: HumanName = { given: ['Alice'] };
    expect(formatHumanName(name)).toBe('Alice');
  });

  it('handles family name only', () => {
    const name: HumanName = { family: 'Wong' };
    expect(formatHumanName(name)).toBe('Wong');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getCodeDisplay
// ══════════════════════════════════════════════════════════════════════════════

describe('getCodeDisplay', () => {
  it('returns text when present', () => {
    const concept: CodeableConcept = { text: 'Diabetes mellitus' };
    expect(getCodeDisplay(concept)).toBe('Diabetes mellitus');
  });

  it('returns coding display when text is absent', () => {
    const concept: CodeableConcept = {
      coding: [{ display: 'Hypertension', code: 'I10' }],
    };
    expect(getCodeDisplay(concept)).toBe('Hypertension');
  });

  it('returns coding code when display is absent', () => {
    const concept: CodeableConcept = {
      coding: [{ code: 'I10' }],
    };
    expect(getCodeDisplay(concept)).toBe('I10');
  });

  it('returns "Unknown" for undefined concept', () => {
    expect(getCodeDisplay(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for concept with no text and no coding', () => {
    const concept: CodeableConcept = {};
    expect(getCodeDisplay(concept)).toBe('Unknown');
  });

  it('returns "Unknown" for empty coding array', () => {
    const concept: CodeableConcept = { coding: [] };
    expect(getCodeDisplay(concept)).toBe('Unknown');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getLoincCode
// ══════════════════════════════════════════════════════════════════════════════

describe('getLoincCode', () => {
  it('returns LOINC code when present', () => {
    const concept: CodeableConcept = {
      coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine' }],
    };
    expect(getLoincCode(concept)).toBe('2160-0');
  });

  it('returns null for non-LOINC system', () => {
    const concept: CodeableConcept = {
      coding: [{ system: 'http://snomed.info/sct', code: '12345' }],
    };
    expect(getLoincCode(concept)).toBeNull();
  });

  it('returns null when coding is missing', () => {
    expect(getLoincCode(undefined)).toBeNull();
    expect(getLoincCode({ text: 'Creatinine' })).toBeNull();
  });

  it('picks the LOINC coding from multiple codings', () => {
    const concept: CodeableConcept = {
      coding: [
        { system: 'http://snomed.info/sct', code: '99999' },
        { system: 'http://loinc.org', code: '718-7' },
      ],
    };
    expect(getLoincCode(concept)).toBe('718-7');
  });

  it('returns null when LOINC coding has no code', () => {
    const concept: CodeableConcept = {
      coding: [{ system: 'http://loinc.org', display: 'WBC' }],
    };
    expect(getLoincCode(concept)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// isActiveCondition
// ══════════════════════════════════════════════════════════════════════════════

describe('isActiveCondition', () => {
  it('returns true for "active" status', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'active' }] },
    });
    expect(isActiveCondition(condition)).toBe(true);
  });

  it('returns true for "recurrence"', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'recurrence' }] },
    });
    expect(isActiveCondition(condition)).toBe(true);
  });

  it('returns true for "relapse"', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'relapse' }] },
    });
    expect(isActiveCondition(condition)).toBe(true);
  });

  it('returns false for "inactive"', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'inactive' }] },
    });
    expect(isActiveCondition(condition)).toBe(false);
  });

  it('returns false for "remission"', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'remission' }] },
    });
    expect(isActiveCondition(condition)).toBe(false);
  });

  it('returns false for "resolved"', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { coding: [{ code: 'resolved' }] },
    });
    expect(isActiveCondition(condition)).toBe(false);
  });

  it('returns false when clinicalStatus is absent', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: undefined,
    });
    expect(isActiveCondition(condition)).toBe(false);
  });

  it('uses text fallback when coding is absent', () => {
    const condition = mockCondition('Test', {
      clinicalStatus: { text: 'active' },
    });
    expect(isActiveCondition(condition)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// calculateEGFR
// ══════════════════════════════════════════════════════════════════════════════

describe('calculateEGFR', () => {
  it('calculates eGFR for a 60-year-old male with creatinine 1.0', () => {
    const egfr = calculateEGFR(1.0, 60, 'male');
    // Expected approximately 93-100 range for normal creatinine in a 60-year-old male
    expect(egfr).toBeGreaterThan(80);
    expect(egfr).toBeLessThan(110);
  });

  it('calculates eGFR for a 60-year-old female with creatinine 1.0', () => {
    const egfr = calculateEGFR(1.0, 60, 'female');
    // CKD-EPI 2021 race-free: female, age 60, Scr 1.0 yields ~64.5
    expect(egfr).toBeGreaterThan(50);
    expect(egfr).toBeLessThan(80);
  });

  it('returns lower eGFR for higher creatinine', () => {
    const egfrNormal = calculateEGFR(1.0, 50, 'male');
    const egfrHigh = calculateEGFR(3.0, 50, 'male');
    expect(egfrHigh).toBeLessThan(egfrNormal);
  });

  it('returns lower eGFR for older patients', () => {
    const egfrYoung = calculateEGFR(1.0, 30, 'male');
    const egfrOld = calculateEGFR(1.0, 80, 'male');
    expect(egfrOld).toBeLessThan(egfrYoung);
  });

  it('rounds to one decimal place', () => {
    const egfr = calculateEGFR(1.1, 55, 'female');
    const decimals = egfr.toString().split('.')[1];
    expect(!decimals || decimals.length <= 1).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// calculateAnionGap
// ══════════════════════════════════════════════════════════════════════════════

describe('calculateAnionGap', () => {
  it('calculates normal anion gap', () => {
    // Na=140, Cl=104, HCO3=24 => AG = 140 - (104+24) = 12
    expect(calculateAnionGap(140, 104, 24)).toBe(12);
  });

  it('calculates elevated anion gap', () => {
    // Na=140, Cl=100, HCO3=15 => AG = 140 - (100+15) = 25
    expect(calculateAnionGap(140, 100, 15)).toBe(25);
  });

  it('calculates low anion gap', () => {
    // Na=140, Cl=110, HCO3=26 => AG = 140 - (110+26) = 4
    expect(calculateAnionGap(140, 110, 26)).toBe(4);
  });

  it('handles zero values', () => {
    expect(calculateAnionGap(0, 0, 0)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// calculateBMI
// ══════════════════════════════════════════════════════════════════════════════

describe('calculateBMI', () => {
  it('calculates normal BMI', () => {
    // 70 kg, 175 cm => BMI ~22.9
    const bmi = calculateBMI(70, 175);
    expect(bmi).toBeCloseTo(22.9, 1);
  });

  it('calculates overweight BMI', () => {
    // 85 kg, 175 cm => BMI ~27.8
    const bmi = calculateBMI(85, 175);
    expect(bmi).toBeGreaterThan(25);
    expect(bmi).toBeLessThan(30);
  });

  it('calculates obese BMI', () => {
    // 110 kg, 175 cm => BMI ~35.9
    const bmi = calculateBMI(110, 175);
    expect(bmi).toBeGreaterThan(30);
  });

  it('returns 0 for zero height', () => {
    expect(calculateBMI(70, 0)).toBe(0);
  });

  it('returns 0 for negative height', () => {
    expect(calculateBMI(70, -10)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// daysAgo
// ══════════════════════════════════════════════════════════════════════════════

describe('daysAgo', () => {
  it('returns approximately correct number of days', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now);
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const result = daysAgo(tenDaysAgo.toISOString().split('T')[0]);
    expect(result).toBeGreaterThanOrEqual(9);
    expect(result).toBeLessThanOrEqual(11);
  });

  it('returns 0 for today', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(daysAgo(today)).toBe(0);
  });

  it('returns large number for old dates', () => {
    expect(daysAgo('2000-01-01')).toBeGreaterThan(8000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// formatDate
// ══════════════════════════════════════════════════════════════════════════════

describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2024-03-15');
    // Should produce something like "Mar 15, 2024"
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('returns "Unknown" for undefined', () => {
    expect(formatDate(undefined)).toBe('Unknown');
  });

  it('handles ISO datetime string', () => {
    const result = formatDate('2024-06-01T10:30:00Z');
    expect(result).toContain('2024');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// conditionMatchesKeywords
// ══════════════════════════════════════════════════════════════════════════════

describe('conditionMatchesKeywords', () => {
  it('matches a keyword in the display text', () => {
    const condition = mockCondition('Essential hypertension');
    expect(conditionMatchesKeywords(condition, ['hypertension'])).toBe(true);
  });

  it('is case-insensitive', () => {
    const condition = mockCondition('Diabetes mellitus type 2');
    expect(conditionMatchesKeywords(condition, ['DIABETES'])).toBe(true);
  });

  it('returns false for non-matching keywords', () => {
    const condition = mockCondition('Essential hypertension');
    expect(conditionMatchesKeywords(condition, ['diabetes', 'cancer'])).toBe(false);
  });

  it('matches partial keywords', () => {
    const condition = mockCondition('Type 2 diabetes mellitus');
    expect(conditionMatchesKeywords(condition, ['diabet'])).toBe(true);
  });

  it('checks text and coding fields', () => {
    const condition = mockCondition('HTN', {
      code: {
        text: 'Hypertension',
        coding: [{ display: 'HTN', code: 'I10' }],
      },
    });
    expect(conditionMatchesKeywords(condition, ['hypertension'])).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getSnomedCode
// ══════════════════════════════════════════════════════════════════════════════

describe('getSnomedCode', () => {
  it('returns SNOMED code when present', () => {
    const concept: CodeableConcept = {
      coding: [{ system: 'http://snomed.info/sct', code: '73211009', display: 'Diabetes' }],
    };
    expect(getSnomedCode(concept)).toBe('73211009');
  });

  it('returns null for non-SNOMED coding', () => {
    const concept: CodeableConcept = {
      coding: [{ system: 'http://loinc.org', code: '2160-0' }],
    };
    expect(getSnomedCode(concept)).toBeNull();
  });

  it('returns null for undefined concept', () => {
    expect(getSnomedCode(undefined)).toBeNull();
  });

  it('returns null when coding array is missing', () => {
    expect(getSnomedCode({ text: 'test' })).toBeNull();
  });

  it('picks SNOMED from mixed codings', () => {
    const concept: CodeableConcept = {
      coding: [
        { system: 'http://loinc.org', code: '2160-0' },
        { system: 'http://snomed.info/sct', code: '44054006' },
      ],
    };
    expect(getSnomedCode(concept)).toBe('44054006');
  });
});
