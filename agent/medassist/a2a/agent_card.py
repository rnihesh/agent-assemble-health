"""A2A agent-card v1 shim for MedAssist.

The shim classes (``AgentCardV1`` and ``AgentExtensionV1``) are copied
verbatim from po-adk-python/shared/app_factory.py. The installed
``a2a-sdk`` 0.3.x lacks the v1 ``supportedInterfaces`` field and types
``security_schemes`` as ``dict[str, SecurityScheme]``, which forces
serialization in the OLD flat security-scheme format. The v1 wire format
expects nested-key entries (e.g. ``apiKeySecurityScheme``) — overriding
``securitySchemes`` to ``dict[str, Any]`` lets a v1-shaped dict pass
through Pydantic unchanged.

When the upstream a2a-sdk ships native v1 support, this whole module can
be deleted in favor of plain ``AgentCard`` construction.

The :func:`build_agent_card_v1` helper assembles MedAssist's card with all
four skills, the FHIR-context extension declaration, and a single
``supportedInterfaces`` entry pointing at ``AGENT_PUBLIC_URL``. The
:func:`serialize_agent_card_v1` helper produces the ready-to-serve JSON
shape — strips the deprecated top-level ``url`` and ``preferredTransport``
fields per the A2A v1 migration guide
(https://docs.promptopinion.ai/a2a-v1-migration).
"""

from __future__ import annotations

from typing import Any, Optional

from a2a.types import AgentCapabilities, AgentCard, AgentExtension, AgentSkill
from pydantic import Field


# Canonical extension URI MedAssist advertises in the agent card. Mirrors
# the URI in medassist.sharp.fhir_hook.
FHIR_CONTEXT_EXTENSION_URI = (
    "https://app.promptopinion.ai/schemas/a2a/v1/fhir-context"
)


# ---------------------------------------------------------------------------
# Shim classes — verbatim from po-adk-python/shared/app_factory.py
# ---------------------------------------------------------------------------


class AgentExtensionV1(AgentExtension):
    """AgentExtension subclass that adds the `params` field for SMART scope declarations.

    The installed a2a-sdk does not define `params` on AgentExtension, so the
    scopes payload would be silently dropped during JSON serialisation.  Declaring
    the field explicitly here ensures it is included in the agent card output.

    Once the a2a-sdk ships native v1 support this subclass can be removed.
    """

    params: dict[str, Any] | None = Field(default=None)


class AgentCardV1(AgentCard):
    """AgentCard subclass that patches two fields missing/changed in A2A v1.

    1. supportedInterfaces — not defined in installed a2a-sdk; added here so
       it is included in the serialised JSON.
    2. securitySchemes — the parent types this as dict[str, SecurityScheme],
       which forces Pydantic to serialise using the OLD flat format
       (type/name/in).  Po v1 expects the NEW nested-key format
       (apiKeySecurityScheme/...).  Overriding to dict[str, Any] lets the
       v1-format dict pass through unmodified.

    Both overrides can be removed once the a2a-sdk ships native v1 support.
    """

    supportedInterfaces: list[dict[str, Any]] = Field(default_factory=list)
    securitySchemes: dict[str, Any] | None = None  # override parent's typed field


# ---------------------------------------------------------------------------
# MedAssist card construction
# ---------------------------------------------------------------------------


_DEFAULT_PUBLIC_URL = "http://localhost:8001"


def _build_skills() -> list[AgentSkill]:
    """Return MedAssist's four sub-agent skills, preserving current IDs."""
    return [
        AgentSkill(
            id="patient_review",
            name="Comprehensive Patient Review",
            description=(
                "Generate a complete clinical overview including demographics, "
                "conditions, medications, labs, vitals, allergies, immunizations, "
                "risk scores, and care gaps for a patient."
            ),
            tags=["clinical", "patient", "review", "summary"],
        ),
        AgentSkill(
            id="medication_safety",
            name="Medication Safety Check",
            description=(
                "Evaluate medication safety by checking drug-drug interactions, "
                "allergy cross-reactivity, therapeutic duplications, and "
                "contraindications for a patient's current or proposed medications."
            ),
            tags=["medication", "safety", "interactions", "pharmacy"],
        ),
        AgentSkill(
            id="risk_assessment",
            name="Clinical Risk Assessment",
            description=(
                "Calculate and interpret clinical risk scores (CHA2DS2-VASc, HEART, "
                "Wells DVT/PE, ASCVD, CKD-EPI) based on patient data, automatically "
                "selecting applicable calculators."
            ),
            tags=["risk", "scoring", "assessment", "clinical"],
        ),
        AgentSkill(
            id="preventive_care",
            name="Preventive Care Recommendations",
            description=(
                "Identify care gaps including overdue screenings, vaccination gaps, "
                "and condition-specific monitoring needs based on USPSTF and CDC "
                "guidelines."
            ),
            tags=["preventive", "screening", "vaccination", "guidelines"],
        ),
    ]


def build_agent_card_v1(public_url: Optional[str] = None) -> AgentCardV1:
    """Construct the MedAssist v1 agent card.

    The ``public_url`` defaults to the ``AGENT_PUBLIC_URL`` env var (or
    ``http://localhost:8001`` if unset). It is the URL clients should use
    to reach the A2A endpoint.

    The card declares the FHIR-context extension under
    ``capabilities.extensions``; the URI matches what the agent's hook
    looks for in inbound A2A message metadata.

    The legacy ``AgentCard.url`` field is required by the installed a2a-sdk
    so we still set it to ``public_url`` — :func:`serialize_agent_card_v1`
    drops it (and ``preferredTransport``) from the served JSON to match the
    v1 wire format.
    """
    public_url = (public_url or _DEFAULT_PUBLIC_URL).rstrip("/")

    extensions = [
        AgentExtensionV1(
            uri=FHIR_CONTEXT_EXTENSION_URI,
            description=(
                "Receives FHIR launch context (patient ID, FHIR server URL, "
                "access token) on inbound A2A messages and forwards it to "
                "MedAssist's MCP tools as canonical SHARP HTTP headers."
            ),
            required=False,
        ),
    ]

    capabilities = AgentCapabilities(
        streaming=True,
        push_notifications=False,
        state_transition_history=False,
        extensions=extensions,
    )

    skills = _build_skills()

    # No auth required for the hackathon. Declare an empty schemes map so
    # the v1 typed-key shape is still well-formed.
    security_schemes: dict[str, Any] = {}

    return AgentCardV1(
        name="MedAssist",
        description=(
            "Clinical Decision Support Agent for healthcare professionals. "
            "Provides patient summaries, drug interaction checking, lab "
            "interpretation, clinical risk scoring, care gap identification, "
            "and guideline matching."
        ),
        version="1.0.0",
        url=public_url,  # required by a2a-sdk; stripped from serialized output
        protocol_version="0.3.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain", "text/markdown"],
        capabilities=capabilities,
        skills=skills,
        supportedInterfaces=[
            {
                "url": public_url,
                "protocolBinding": "JSONRPC",
                "protocolVersion": "1.0",
            },
        ],
        securitySchemes=security_schemes,
        security=[],
    )


# Top-level fields the v1 wire format does NOT carry. The installed
# a2a-sdk requires `url` for AgentCard construction, but the v1 spec
# replaces both with `supportedInterfaces[].url`.
_V1_DROP_TOP_LEVEL = ("url", "preferredTransport")


def serialize_agent_card_v1(card: AgentCardV1) -> dict[str, Any]:
    """Render an :class:`AgentCardV1` as a JSON-ready dict in v1 wire shape.

    Strips the deprecated top-level ``url`` and ``preferredTransport`` fields
    (the v1 spec moves them under ``supportedInterfaces``). Uses the
    a2a-sdk's camelCase serializer so field names match the expected wire
    format.
    """
    payload = card.model_dump(by_alias=True, exclude_none=True)
    for key in _V1_DROP_TOP_LEVEL:
        payload.pop(key, None)
    return payload
