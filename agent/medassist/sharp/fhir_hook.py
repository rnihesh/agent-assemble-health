"""A2A FHIR-context extraction hook (`before_model_callback`).

This module mirrors `po-adk-python/shared/fhir_hook.py`. The hook is bound
to the root agent at A2A app composition time. On every LLM step it scans
the inbound A2A request's metadata for the Prompt Opinion FHIR-context
extension URI; if found, it writes ``fhirUrl``, ``fhirToken`` and
``patientId`` into ADK session state.

A separate :func:`build_sharp_header_provider` callable is given to the
``McpToolset`` so that every outbound MCP call carries canonical SHARP
HTTP headers (`X-Patient-ID`, `X-FHIR-Server-URL`, `X-FHIR-Access-Token`)
sourced from session state — not from prompt text. Tools therefore see the
same context the platform launched the agent with, regardless of how many
sub-agent fan-outs occurred in between.

The session-state path is the ADK-native pattern: passing context via
``RunContext`` would not survive sub-agent delegation, but session state
is shared across the entire conversation graph.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: The canonical Prompt Opinion FHIR-context A2A extension URI. Inbound A2A
#: messages may include this key inside their ``metadata`` dict; on hit, the
#: hook extracts the embedded fhirUrl/fhirToken/patientId triple.
FHIR_CONTEXT_EXTENSION_URI = (
    "https://app.promptopinion.ai/schemas/a2a/v1/fhir-context"
)

# Canonical SHARP outbound header names (case-insensitive on the wire; we
# emit these exact spellings to match the spec docs).
SHARP_OUTBOUND_HEADERS = {
    "patientId": "X-Patient-ID",
    "fhirUrl": "X-FHIR-Server-URL",
    "fhirToken": "X-FHIR-Access-Token",
}

# Session-state keys; identical names to po-adk-python so debugging traces
# are recognizable to anyone familiar with the reference implementation.
SESSION_STATE_KEYS = ("fhirUrl", "fhirToken", "patientId")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_fhir_data(value: Any) -> Optional[Dict[str, Any]]:
    """Accept either a dict or a JSON-encoded string and return a normalized dict.

    A2A clients sometimes serialize metadata values; po-adk-python's hook
    handles both shapes. Returns None when the value cannot be coerced into
    a non-empty dict.
    """
    if value is None:
        return None
    if isinstance(value, dict):
        return value if value else None
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return None
        if isinstance(parsed, dict):
            return parsed if parsed else None
    return None


def _extract_metadata_sources(callback_context: Any) -> list[Dict[str, Any]]:
    """Return all dict-like locations metadata may live in for this invocation.

    The A2A → ADK bridge stores the inbound A2A message metadata under
    ``invocation_context.run_config.custom_metadata["a2a_metadata"]`` (see
    ``google.adk.a2a.converters.request_converter.convert_a2a_request_to_agent_run_request``).
    We collect any dict-shaped sources and let the caller search them in
    order — same defensive pattern the reference implementation uses.
    """
    sources: list[Dict[str, Any]] = []
    invocation_context = getattr(callback_context, "_invocation_context", None)
    if invocation_context is None:
        return sources

    run_config = getattr(invocation_context, "run_config", None)
    custom = getattr(run_config, "custom_metadata", None) if run_config else None
    if isinstance(custom, dict):
        # Preferred bridge location: nested under "a2a_metadata".
        a2a = custom.get("a2a_metadata")
        if isinstance(a2a, dict):
            sources.append(a2a)
        # Some bridges flatten — accept the custom_metadata dict itself too.
        sources.append(custom)

    # Session-level metadata is another defensible spot to look in case
    # upstream ever moves the bridge.
    session = getattr(invocation_context, "session", None)
    session_state = getattr(session, "state", None) if session else None
    if isinstance(session_state, dict):
        sources.append(session_state)

    return sources


def extract_fhir_from_payload(payload: Any) -> Optional[Dict[str, Any]]:
    """Public utility: pull the FHIR-context object out of any metadata blob.

    Searches the payload (and one level of nesting under the canonical
    extension URI) for a dict with ``fhirUrl``/``fhirToken``/``patientId``.
    """
    candidate = _coerce_fhir_data(payload)
    if candidate is None:
        return None
    if FHIR_CONTEXT_EXTENSION_URI in candidate:
        return _coerce_fhir_data(candidate[FHIR_CONTEXT_EXTENSION_URI])
    if any(k in candidate for k in SESSION_STATE_KEYS):
        return candidate
    return None


# ---------------------------------------------------------------------------
# before_model_callback
# ---------------------------------------------------------------------------


def extract_fhir_context(callback_context: Any, llm_request: Any) -> None:
    """ADK ``before_model_callback`` that writes FHIR context to session state.

    Returning ``None`` means "continue with the LLM call unchanged" — the
    hook never short-circuits the model; it only side-effects session
    state. Errors are logged and swallowed so a malformed metadata blob
    never breaks the model call path.
    """
    try:
        sources = _extract_metadata_sources(callback_context)
        fhir_payload: Optional[Dict[str, Any]] = None
        for src in sources:
            value = src.get(FHIR_CONTEXT_EXTENSION_URI)
            if value is not None:
                fhir_payload = _coerce_fhir_data(value)
                if fhir_payload:
                    break

        if not fhir_payload:
            return None

        state = getattr(callback_context, "state", None)
        if state is None:
            logger.debug("No session state available; skipping FHIR-context write")
            return None

        for key in SESSION_STATE_KEYS:
            if key in fhir_payload and fhir_payload[key] is not None:
                state[key] = fhir_payload[key]

        logger.info(
            "Wrote FHIR context into session state: patientId=%s fhirUrl=%s",
            state.get("patientId"),
            state.get("fhirUrl"),
        )
    except Exception:
        # Never let a hook error break the agent run.
        logger.exception("extract_fhir_context failed; continuing without FHIR context")
    return None


# ---------------------------------------------------------------------------
# Outbound MCP header provider
# ---------------------------------------------------------------------------


def build_sharp_header_provider() -> Callable[[Any], Dict[str, str]]:
    """Return a ``header_provider`` for ``McpToolset``.

    ADK invokes the provider once per session creation and once per tool
    invocation (via ``McpToolset._execute_with_session``), passing a
    ``ReadonlyContext`` whose ``.state`` mirrors current session state.
    We translate the three FHIR-context fields into canonical SHARP HTTP
    headers so the MCP server's header reader picks them up directly.

    Mechanism note: this is the chosen integration point because (a) ADK
    1.x exposes ``header_provider`` natively on ``McpToolset``, (b) it is
    invoked synchronously with access to the live ``ReadonlyContext.state``,
    and (c) it threads through to ``MCPSessionManager._merge_headers`` which
    forwards them to the streamablehttp client. No subclassing or custom
    HTTP transport is needed.
    """

    def _provider(readonly_context: Any) -> Dict[str, str]:
        state = getattr(readonly_context, "state", {}) or {}
        headers: Dict[str, str] = {}
        for state_key, header_name in SHARP_OUTBOUND_HEADERS.items():
            value = state.get(state_key)
            if isinstance(value, str) and value.strip():
                headers[header_name] = value.strip()
        return headers

    return _provider
