// ──────────────────────────────────────────────────────────────────────────────
// FHIR R4 Resource Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

// ── Common / Backbone types ──────────────────────────────────────────────────

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference?: string;
  display?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
  comparator?: string;
}

export interface HumanName {
  use?: string;
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface Address {
  use?: string;
  type?: string;
  text?: string;
  line?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface ContactPoint {
  system?: string; // phone | fax | email | pager | url | sms | other
  value?: string;
  use?: string; // home | work | temp | old | mobile
}

export interface Identifier {
  system?: string;
  value?: string;
  type?: CodeableConcept;
}

export interface Extension {
  url: string;
  valueString?: string;
  valueCode?: string;
  valueCoding?: Coding;
  valueBoolean?: boolean;
  valueInteger?: number;
}

// ── Resources ────────────────────────────────────────────────────────────────

export interface Resource {
  resourceType: string;
  id?: string;
  meta?: {
    lastUpdated?: string;
    versionId?: string;
  };
}

export interface BundleEntry<T = Resource> {
  fullUrl?: string;
  resource?: T;
}

export interface Bundle<T = Resource> extends Resource {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: BundleEntry<T>[];
  link?: { relation: string; url: string }[];
}

export interface Patient extends Resource {
  resourceType: "Patient";
  identifier?: Identifier[];
  name?: HumanName[];
  gender?: string;
  birthDate?: string;
  address?: Address[];
  telecom?: ContactPoint[];
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  maritalStatus?: CodeableConcept;
  extension?: Extension[];
}

export interface Condition extends Resource {
  resourceType: "Condition";
  code?: CodeableConcept;
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  subject?: Reference;
  onsetDateTime?: string;
  onsetPeriod?: Period;
  abatementDateTime?: string;
  recordedDate?: string;
}

export interface DosageInstruction {
  text?: string;
  timing?: {
    repeat?: {
      frequency?: number;
      period?: number;
      periodUnit?: string;
    };
    code?: CodeableConcept;
  };
  route?: CodeableConcept;
  doseAndRate?: {
    doseQuantity?: Quantity;
  }[];
}

export interface MedicationRequest extends Resource {
  resourceType: "MedicationRequest";
  status?: string;
  intent?: string;
  medicationCodeableConcept?: CodeableConcept;
  medicationReference?: Reference;
  subject?: Reference;
  authoredOn?: string;
  requester?: Reference;
  dosageInstruction?: DosageInstruction[];
  dispenseRequest?: {
    numberOfRepeatsAllowed?: number;
    quantity?: Quantity;
    expectedSupplyDuration?: Quantity;
  };
}

export interface ObservationComponent {
  code: CodeableConcept;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
}

export interface Observation extends Resource {
  resourceType: "Observation";
  status?: string;
  category?: CodeableConcept[];
  code?: CodeableConcept;
  subject?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  issued?: string;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  component?: ObservationComponent[];
  interpretation?: CodeableConcept[];
  referenceRange?: {
    low?: Quantity;
    high?: Quantity;
    text?: string;
  }[];
}

export interface AllergyReaction {
  substance?: CodeableConcept;
  manifestation?: CodeableConcept[];
  severity?: string;
  description?: string;
}

export interface AllergyIntolerance extends Resource {
  resourceType: "AllergyIntolerance";
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  type?: string;
  category?: string[];
  criticality?: string;
  code?: CodeableConcept;
  patient?: Reference;
  onsetDateTime?: string;
  recordedDate?: string;
  reaction?: AllergyReaction[];
}

export interface Immunization extends Resource {
  resourceType: "Immunization";
  status?: string;
  vaccineCode?: CodeableConcept;
  patient?: Reference;
  occurrenceDateTime?: string;
  occurrenceString?: string;
  primarySource?: boolean;
}

export interface Procedure extends Resource {
  resourceType: "Procedure";
  status?: string;
  code?: CodeableConcept;
  subject?: Reference;
  performedDateTime?: string;
  performedPeriod?: Period;
  category?: CodeableConcept;
}

// ── Operation / Error types ──────────────────────────────────────────────────

export interface OperationOutcomeIssue {
  severity: string;
  code: string;
  diagnostics?: string;
  details?: CodeableConcept;
}

export interface OperationOutcome extends Resource {
  resourceType: "OperationOutcome";
  issue: OperationOutcomeIssue[];
}
