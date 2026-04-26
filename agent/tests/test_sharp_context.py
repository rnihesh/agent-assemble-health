"""Tests for SHARP context resolution from canonical HTTP headers."""

from __future__ import annotations

import base64
import json


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _make_jwt(payload: dict) -> str:
    """Construct a JWT-shaped string for tests. Signature is never verified."""
    header = _b64url(json.dumps({"alg": "none", "typ": "JWT"}).encode("utf-8"))
    body = _b64url(json.dumps(payload).encode("utf-8"))
    return f"{header}.{body}.sig"


# ---------------------------------------------------------------------------
# Canonical SHARP header reads
# ---------------------------------------------------------------------------


class TestSharpContextCanonicalHeaders:
    def test_canonical_headers_populate_full_context(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers(
            {
                "X-Patient-ID": "patient-123",
                "X-FHIR-Server-URL": "https://fhir.example.com",
                "X-FHIR-Access-Token": "Bearer abc123",
            }
        )
        assert ctx is not None
        assert ctx.patient_id == "patient-123"
        assert ctx.fhir_server_url == "https://fhir.example.com"
        assert ctx.fhir_access_token == "Bearer abc123"

    def test_lowercase_canonical_headers_resolve(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers(
            {
                "x-patient-id": "patient-lower",
                "x-fhir-server-url": "https://fhir.example.com",
            }
        )
        assert ctx is not None
        assert ctx.patient_id == "patient-lower"

    def test_optional_refresh_fields(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers(
            {
                "x-patient-id": "p1",
                "x-fhir-refresh-token": "refresh",
                "x-fhir-refresh-url": "https://auth.example.com/token",
            }
        )
        assert ctx is not None
        assert ctx.fhir_refresh_token == "refresh"
        assert ctx.fhir_refresh_url == "https://auth.example.com/token"

    def test_missing_patient_id_returns_none(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers(
            {"x-fhir-server-url": "https://fhir.example.com"}
        )
        assert ctx is None

    def test_minimal_canonical_headers_resolve_patient_only(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers({"x-patient-id": "patient-456"})
        assert ctx is not None
        assert ctx.patient_id == "patient-456"
        assert ctx.fhir_server_url is None
        assert ctx.fhir_access_token is None

    def test_empty_headers_returns_none(self):
        from medassist.sharp.context import SharpContext

        assert SharpContext.from_headers({}) is None


class TestSharpContextJwtPatientClaim:
    def test_jwt_patient_claim_resolves_patient_id_without_explicit_header(self):
        from medassist.sharp.context import SharpContext

        token = _make_jwt({"patient": "patient-from-jwt"})
        ctx = SharpContext.from_headers(
            {
                "x-fhir-access-token": token,
                "x-fhir-server-url": "https://fhir.example.com",
            }
        )
        assert ctx is not None
        assert ctx.patient_id == "patient-from-jwt"
        assert ctx.fhir_access_token == token

    def test_jwt_patient_claim_takes_precedence_over_explicit_header(self):
        from medassist.sharp.context import SharpContext

        token = _make_jwt({"patient": "jwt-wins"})
        ctx = SharpContext.from_headers(
            {
                "x-patient-id": "header-loses",
                "x-fhir-access-token": token,
            }
        )
        assert ctx is not None
        assert ctx.patient_id == "jwt-wins"

    def test_malformed_token_falls_back_to_header_patient_id(self):
        from medassist.sharp.context import SharpContext

        ctx = SharpContext.from_headers(
            {
                "x-patient-id": "header-fallback",
                "x-fhir-access-token": "not-a-jwt",
            }
        )
        assert ctx is not None
        assert ctx.patient_id == "header-fallback"

    def test_jwt_without_patient_claim_does_not_resolve(self):
        from medassist.sharp.context import SharpContext

        token = _make_jwt({"sub": "user", "scope": "patient/Patient.rs"})
        ctx = SharpContext.from_headers(
            {
                "x-fhir-server-url": "https://fhir.example.com",
                "x-fhir-access-token": token,
            }
        )
        assert ctx is None
