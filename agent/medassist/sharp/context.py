from dataclasses import dataclass
from typing import Optional


@dataclass
class SharpContext:
    """Holds SHARP/FHIR launch context extracted from request headers.

    This context carries the patient identifier and optional FHIR server
    credentials that were established during a SMART on FHIR EHR launch.
    """

    patient_id: str
    fhir_server_url: Optional[str] = None
    fhir_access_token: Optional[str] = None

    @classmethod
    def from_headers(cls, headers: dict) -> Optional["SharpContext"]:
        """Create a SharpContext from HTTP request headers.

        Expected headers:
            x-sharp-patient-id   (required) - The FHIR Patient resource ID
            x-sharp-fhir-url     (optional) - Base URL of the FHIR server
            x-sharp-fhir-token   (optional) - OAuth2 bearer token for FHIR access

        Returns None if the required patient ID header is missing.
        """
        patient_id = headers.get("x-sharp-patient-id")
        if not patient_id:
            return None
        return cls(
            patient_id=patient_id,
            fhir_server_url=headers.get("x-sharp-fhir-url"),
            fhir_access_token=headers.get("x-sharp-fhir-token"),
        )
