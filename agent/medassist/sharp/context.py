"""SHARP launch-context resolution for MedAssist.

Per the SHARP spec (https://www.sharponmcp.com), the canonical wire format
for FHIR launch context uses the following HTTP headers:

    X-Patient-ID          required (or derivable from a JWT `patient` claim)
    X-FHIR-Server-URL     required when the agent must reach the FHIR server
    X-FHIR-Access-Token   bearer token; can be a JWT carrying a `patient` claim
    X-FHIR-Refresh-Token  optional
    X-FHIR-Refresh-URL    optional

Header reads are case-insensitive. The dataclass field names stay snake_case
(`patient_id`, `fhir_server_url`, `fhir_access_token`) for Python ergonomics
and to remain compatible with the rest of the codebase.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

# Canonical SHARP HTTP header names. Stored in lowercase because both
# Starlette ASGI and most HTTP clients normalize header names to lowercase
# on receipt; the resolution helpers below accept any casing.
SHARP_HEADER_PATIENT_ID = "x-patient-id"
SHARP_HEADER_FHIR_SERVER_URL = "x-fhir-server-url"
SHARP_HEADER_FHIR_ACCESS_TOKEN = "x-fhir-access-token"
SHARP_HEADER_FHIR_REFRESH_TOKEN = "x-fhir-refresh-token"
SHARP_HEADER_FHIR_REFRESH_URL = "x-fhir-refresh-url"


def _decode_jwt_payload(token: str) -> Optional[dict[str, Any]]:
    """Decode a JWT payload without verifying the signature.

    Mirrors po-community-mcp's behavior: SMART-on-FHIR launchers commonly
    embed a `patient` claim in the access token, and the SHARP spec lets
    the receiver derive the patient identifier from that claim. We never
    treat this as authentication — the token still has to round-trip to
    the FHIR server, which is the actual auth boundary.
    """
    if not isinstance(token, str) or not token:
        return None
    stripped = token
    if stripped.lower().startswith("bearer "):
        stripped = stripped[len("bearer "):]
    stripped = stripped.strip()
    parts = stripped.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1]
        # base64url decode with padding
        padding = "=" * (-len(payload) % 4)
        raw = base64.urlsafe_b64decode(payload + padding)
        claims = json.loads(raw.decode("utf-8"))
        if isinstance(claims, dict):
            return claims
        return None
    except Exception:
        return None


def patient_from_jwt(token: Optional[str]) -> Optional[str]:
    """Return the `patient` claim of a JWT if present and non-empty."""
    if not token:
        return None
    claims = _decode_jwt_payload(token)
    if not claims:
        return None
    patient = claims.get("patient")
    if isinstance(patient, str) and patient.strip():
        return patient.strip()
    return None


def _read_header(headers: Mapping[str, Any], name: str) -> Optional[str]:
    """Case-insensitive header lookup that accepts any Mapping shape."""
    target = name.lower()
    for key, value in headers.items():
        if not isinstance(key, str):
            continue
        if key.lower() != target:
            continue
        if isinstance(value, (list, tuple)) and value:
            value = value[0]
        if isinstance(value, bytes):
            try:
                value = value.decode("latin-1")
            except Exception:
                continue
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
    return None


@dataclass
class SharpContext:
    """Holds SHARP/FHIR launch context for the current request.

    The patient identifier is required; FHIR server URL, access token, and
    refresh credentials are optional and only used when the MCP tools must
    reach the FHIR server on the user's behalf.
    """

    patient_id: str
    fhir_server_url: Optional[str] = None
    fhir_access_token: Optional[str] = None
    fhir_refresh_token: Optional[str] = None
    fhir_refresh_url: Optional[str] = None

    @classmethod
    def from_headers(cls, headers: Mapping[str, Any]) -> Optional["SharpContext"]:
        """Build a SharpContext from canonical SHARP HTTP headers.

        Resolution rules (matching po-community-mcp):
          * Read all five canonical headers case-insensitively.
          * If `X-FHIR-Access-Token` decodes as a JWT with a `patient` claim,
            that claim wins over `X-Patient-ID`.
          * Returns ``None`` when no patient ID can be resolved.
        """
        if not headers:
            return None

        header_pid = _read_header(headers, SHARP_HEADER_PATIENT_ID)
        fhir_url = _read_header(headers, SHARP_HEADER_FHIR_SERVER_URL)
        fhir_token = _read_header(headers, SHARP_HEADER_FHIR_ACCESS_TOKEN)
        refresh_token = _read_header(headers, SHARP_HEADER_FHIR_REFRESH_TOKEN)
        refresh_url = _read_header(headers, SHARP_HEADER_FHIR_REFRESH_URL)

        jwt_pid = patient_from_jwt(fhir_token)
        patient_id = jwt_pid or header_pid

        if not patient_id:
            return None

        return cls(
            patient_id=patient_id,
            fhir_server_url=fhir_url,
            fhir_access_token=fhir_token,
            fhir_refresh_token=refresh_token,
            fhir_refresh_url=refresh_url,
        )
