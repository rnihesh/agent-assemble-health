export interface SharpContext {
  patientId: string;
  fhirServerUrl?: string;
  fhirAccessToken?: string;
  fhirRefreshToken?: string;
  fhirRefreshUrl?: string;
}
