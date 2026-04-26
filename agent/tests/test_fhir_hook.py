"""Tests for the A2A FHIR-context before_model_callback.

The hook reads the inbound A2A message metadata, looks for the Prompt
Opinion FHIR-context extension URI, and writes patient/FHIR connection
details into ADK session state. The toolset's `header_provider` then
reads from session state and emits canonical SHARP headers on outbound
MCP calls.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# Helpers — minimal stand-ins for the ADK callback context plumbing. We
# fabricate the shape rather than spinning up a full LlmAgent / Runner so
# the unit tests stay fast and focused.
# ---------------------------------------------------------------------------


class _FakeState(dict):
    """A dict that also exposes the .get/.setitem semantics used by the hook."""


def _make_callback_context(custom_metadata: dict[str, Any] | None) -> Any:
    state = _FakeState()
    invocation_context = MagicMock()
    invocation_context.run_config = MagicMock()
    invocation_context.run_config.custom_metadata = custom_metadata
    callback_context = MagicMock()
    callback_context._invocation_context = invocation_context
    callback_context.state = state
    return callback_context


# ---------------------------------------------------------------------------
# extract_fhir_context — the before_model_callback under test
# ---------------------------------------------------------------------------


class TestExtractFhirContext:
    def test_populates_session_state_from_a2a_metadata(self):
        from medassist.sharp.fhir_hook import (
            FHIR_CONTEXT_EXTENSION_URI,
            extract_fhir_context,
        )

        ctx = _make_callback_context(
            {
                "a2a_metadata": {
                    FHIR_CONTEXT_EXTENSION_URI: {
                        "fhirUrl": "https://hapi.fhir.org/baseR4",
                        "fhirToken": "opaque-token",
                        "patientId": "patient-42",
                    }
                }
            }
        )

        result = extract_fhir_context(ctx, MagicMock())
        assert result is None  # hook never short-circuits the LLM call
        assert ctx.state["fhirUrl"] == "https://hapi.fhir.org/baseR4"
        assert ctx.state["fhirToken"] == "opaque-token"
        assert ctx.state["patientId"] == "patient-42"

    def test_request_without_metadata_leaves_state_empty(self):
        from medassist.sharp.fhir_hook import extract_fhir_context

        ctx = _make_callback_context(None)
        result = extract_fhir_context(ctx, MagicMock())
        assert result is None
        assert "fhirUrl" not in ctx.state
        assert "fhirToken" not in ctx.state
        assert "patientId" not in ctx.state

    def test_partial_metadata_only_populates_present_fields(self):
        from medassist.sharp.fhir_hook import (
            FHIR_CONTEXT_EXTENSION_URI,
            extract_fhir_context,
        )

        ctx = _make_callback_context(
            {
                "a2a_metadata": {
                    FHIR_CONTEXT_EXTENSION_URI: {
                        "patientId": "patient-only",
                    }
                }
            }
        )

        extract_fhir_context(ctx, MagicMock())
        assert ctx.state.get("patientId") == "patient-only"
        assert "fhirUrl" not in ctx.state
        assert "fhirToken" not in ctx.state

    def test_malformed_metadata_is_ignored_not_raised(self, caplog):
        from medassist.sharp.fhir_hook import (
            FHIR_CONTEXT_EXTENSION_URI,
            extract_fhir_context,
        )

        # Non-dict payload at the extension URI.
        ctx = _make_callback_context(
            {"a2a_metadata": {FHIR_CONTEXT_EXTENSION_URI: "not-a-dict"}}
        )
        # Should not raise.
        extract_fhir_context(ctx, MagicMock())
        assert "patientId" not in ctx.state

    def test_metadata_missing_extension_uri_leaves_state_empty(self):
        from medassist.sharp.fhir_hook import extract_fhir_context

        ctx = _make_callback_context(
            {"a2a_metadata": {"some.other.extension": {"foo": "bar"}}}
        )
        extract_fhir_context(ctx, MagicMock())
        assert "patientId" not in ctx.state

    def test_accepts_json_string_payload(self):
        """A2A wire protocol may serialize metadata values as JSON strings."""
        from medassist.sharp.fhir_hook import (
            FHIR_CONTEXT_EXTENSION_URI,
            extract_fhir_context,
        )

        ctx = _make_callback_context(
            {
                "a2a_metadata": {
                    FHIR_CONTEXT_EXTENSION_URI: (
                        '{"fhirUrl": "https://fhir.example.com", '
                        '"fhirToken": "t", "patientId": "p"}'
                    )
                }
            }
        )

        extract_fhir_context(ctx, MagicMock())
        assert ctx.state.get("patientId") == "p"
        assert ctx.state.get("fhirUrl") == "https://fhir.example.com"
        assert ctx.state.get("fhirToken") == "t"


# ---------------------------------------------------------------------------
# header_provider — used by the McpToolset to convert session state into
# canonical SHARP headers on every outbound MCP call.
# ---------------------------------------------------------------------------


class TestSharpHeaderProvider:
    def test_emits_canonical_sharp_headers_from_session_state(self):
        from medassist.sharp.fhir_hook import build_sharp_header_provider

        readonly_ctx = MagicMock()
        readonly_ctx.state = {
            "patientId": "patient-42",
            "fhirUrl": "https://hapi.fhir.org/baseR4",
            "fhirToken": "opaque-token",
        }

        provider = build_sharp_header_provider()
        headers = provider(readonly_ctx)

        assert headers["X-Patient-ID"] == "patient-42"
        assert headers["X-FHIR-Server-URL"] == "https://hapi.fhir.org/baseR4"
        assert headers["X-FHIR-Access-Token"] == "opaque-token"

    def test_emits_no_headers_when_session_state_is_empty(self):
        from medassist.sharp.fhir_hook import build_sharp_header_provider

        readonly_ctx = MagicMock()
        readonly_ctx.state = {}

        provider = build_sharp_header_provider()
        headers = provider(readonly_ctx)
        assert headers == {}

    def test_emits_only_present_fields_when_state_is_partial(self):
        from medassist.sharp.fhir_hook import build_sharp_header_provider

        readonly_ctx = MagicMock()
        readonly_ctx.state = {"patientId": "patient-only"}

        provider = build_sharp_header_provider()
        headers = provider(readonly_ctx)
        assert headers == {"X-Patient-ID": "patient-only"}
