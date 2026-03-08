import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDrugInteractions } from '../src/tools/drug-interaction.js';
import {
  mockFHIRClient,
  mockMedication,
  mockAllergy,
} from './helpers/mock-fhir.js';

// Mock all external dependencies
vi.mock('../src/fhir/queries/medications.js', () => ({
  getActiveMedications: vi.fn(),
}));
vi.mock('../src/fhir/queries/allergies.js', () => ({
  getAllergies: vi.fn(),
}));
vi.mock('../src/external/rxnorm.js', () => ({
  getRxCUI: vi.fn().mockResolvedValue(null),
  getMultiInteractions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/external/openfda.js', () => ({
  searchDrugLabel: vi.fn().mockResolvedValue(null),
}));

import { getActiveMedications } from '../src/fhir/queries/medications.js';
import { getAllergies } from '../src/fhir/queries/allergies.js';
import { getRxCUI, getMultiInteractions } from '../src/external/rxnorm.js';
import { searchDrugLabel } from '../src/external/openfda.js';

const mockedGetActiveMedications = vi.mocked(getActiveMedications);
const mockedGetAllergies = vi.mocked(getAllergies);
const mockedGetRxCUI = vi.mocked(getRxCUI);
const mockedGetMultiInteractions = vi.mocked(getMultiInteractions);
const mockedSearchDrugLabel = vi.mocked(searchDrugLabel);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRxCUI.mockResolvedValue(null);
  mockedGetMultiInteractions.mockResolvedValue([]);
  mockedSearchDrugLabel.mockResolvedValue(null);
});

// ══════════════════════════════════════════════════════════════════════════════
// Local matrix matching
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - local matrix', () => {
  it('detects warfarin + aspirin interaction', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['warfarin', 'aspirin'],
    });

    expect(result).toContain('HIGH Severity Interactions');
    expect(result).toContain('warfarin');
    expect(result).toContain('aspirin');
    expect(result).toContain('bleeding');
  });

  it('detects warfarin + ibuprofen interaction', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['warfarin', 'ibuprofen'],
    });

    expect(result).toContain('HIGH Severity Interactions');
    expect(result).toContain('warfarin');
    expect(result).toContain('ibuprofen');
  });

  it('is case-insensitive when matching drugs', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['WARFARIN', 'ASPIRIN'],
    });

    expect(result).toContain('HIGH Severity Interactions');
  });

  it('detects SSRI + MAOI interaction', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['fluoxetine', 'phenelzine'],
    });

    expect(result).toContain('HIGH Severity Interactions');
    expect(result).toContain('serotonin');
  });

  it('detects MODERATE severity interactions', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['sumatriptan', 'fluoxetine'],
    });

    expect(result).toContain('MODERATE Severity Interactions');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Deduplication and sorting
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - deduplication and sorting', () => {
  it('sorts HIGH before MODERATE interactions', async () => {
    // warfarin+aspirin=HIGH, sumatriptan+fluoxetine=MODERATE
    const result = await checkDrugInteractions(null, {
      medications: ['warfarin', 'aspirin', 'sumatriptan', 'fluoxetine'],
    });

    const highIdx = result.indexOf('HIGH Severity Interactions');
    const modIdx = result.indexOf('MODERATE Severity Interactions');
    expect(highIdx).toBeLessThan(modIdx);
  });

  it('deduplicates interactions (same pair should appear once)', async () => {
    // Create scenario where same pair might be matched twice
    // warfarin + aspirin is in the matrix; providing them once should yield one match
    const result = await checkDrugInteractions(null, {
      medications: ['warfarin', 'aspirin'],
    });

    const matches = result.match(/warfarin.*\+.*aspirin|aspirin.*\+.*warfarin/gi) ?? [];
    // Title + mechanism/effect lines may mention both, but the ### heading should appear once
    const headings = result.match(/###.*warfarin.*aspirin|###.*aspirin.*warfarin/gi) ?? [];
    expect(headings.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Allergy conflict detection
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - allergy conflicts', () => {
  it('detects medication matching a known allergy', async () => {
    const client = mockFHIRClient({});
    mockedGetActiveMedications.mockResolvedValue([]);
    mockedGetAllergies.mockResolvedValue([
      mockAllergy('Penicillin', 'high', {
        reaction: [
          {
            manifestation: [{ text: 'Anaphylaxis' }],
            severity: 'severe',
          },
        ],
      }),
    ]);

    const result = await checkDrugInteractions(client, {
      patientId: 'p1',
      medications: ['Penicillin'],
    });

    expect(result).toContain('ALLERGY ALERTS');
    expect(result).toContain('Penicillin');
    expect(result).toContain('DO NOT ADMINISTER');
  });

  it('no allergy alert when no matching allergies', async () => {
    const client = mockFHIRClient({});
    mockedGetActiveMedications.mockResolvedValue([]);
    mockedGetAllergies.mockResolvedValue([
      mockAllergy('Sulfa'),
    ]);

    const result = await checkDrugInteractions(client, {
      patientId: 'p1',
      medications: ['metformin'],
    });

    expect(result).not.toContain('ALLERGY ALERTS');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Therapeutic duplication detection
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - therapeutic duplication', () => {
  it('detects therapeutic duplication when drugs share a pharm class', async () => {
    const aceLabel = {
      brandNames: ['Drug A'],
      genericNames: ['drug_a'],
      pharmClasses: ['ACE Inhibitors [MoA]'],
      interactions: [],
      warnings: [],
      contraindications: [],
      boxedWarnings: [],
    };
    // searchDrugLabel is called 4 times total:
    // 2 by checkOpenFDAInteractions + 2 by detectTherapeuticDuplications
    mockedSearchDrugLabel
      .mockResolvedValueOnce(aceLabel)   // OpenFDA: lisinopril
      .mockResolvedValueOnce(aceLabel)   // OpenFDA: enalapril
      .mockResolvedValueOnce(aceLabel)   // Duplication: lisinopril
      .mockResolvedValueOnce(aceLabel);  // Duplication: enalapril

    const result = await checkDrugInteractions(null, {
      medications: ['lisinopril', 'enalapril'],
    });

    expect(result).toContain('Therapeutic Duplications');
    expect(result).toContain('ACE Inhibitors');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// No medications
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - no medications', () => {
  it('returns appropriate message when no medications provided', async () => {
    const result = await checkDrugInteractions(null, {
      medications: [],
    });

    expect(result).toContain('No medications provided');
  });

  it('returns appropriate message with no meds from FHIR either', async () => {
    const client = mockFHIRClient({});
    mockedGetActiveMedications.mockResolvedValue([]);

    const result = await checkDrugInteractions(client, {
      patientId: 'p1',
      medications: [],
    });

    expect(result).toContain('No medications provided');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// No interactions found
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - no interactions', () => {
  it('returns clean summary when no interactions found', async () => {
    const result = await checkDrugInteractions(null, {
      medications: ['acetaminophen', 'omeprazole'],
    });

    expect(result).toContain('No significant drug-drug interactions');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RxNorm integration (mocked)
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - RxNorm API (mocked)', () => {
  it('integrates RxNorm interaction results', async () => {
    mockedGetRxCUI
      .mockResolvedValueOnce('12345')
      .mockResolvedValueOnce('67890');

    mockedGetMultiInteractions.mockResolvedValue([
      {
        drug1: 'Drug A',
        drug2: 'Drug B',
        severity: 'N/A',
        description: 'May increase risk of QT prolongation',
        source: 'DrugBank',
      },
    ]);

    const result = await checkDrugInteractions(null, {
      medications: ['drugA', 'drugB'],
    });

    expect(result).toContain('Drug A');
    expect(result).toContain('Drug B');
    expect(result).toContain('QT prolongation');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// OpenFDA integration (mocked)
// ══════════════════════════════════════════════════════════════════════════════

describe('checkDrugInteractions - OpenFDA (mocked)', () => {
  it('includes FDA label interaction notes', async () => {
    mockedSearchDrugLabel.mockResolvedValue({
      brandNames: ['Warfarin Sodium'],
      genericNames: ['warfarin'],
      pharmClasses: ['Vitamin K Antagonists [MoA]'],
      interactions: ['Warfarin interacts with many drugs and foods.'],
      warnings: [],
      contraindications: [],
      boxedWarnings: [],
    });

    const result = await checkDrugInteractions(null, {
      medications: ['warfarin'],
    });

    expect(result).toContain('FDA Label Interaction Notes');
    expect(result).toContain('Warfarin interacts with many drugs');
  });
});
