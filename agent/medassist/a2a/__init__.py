"""A2A protocol shims for MedAssist."""

from medassist.a2a.agent_card import (
    AgentCardV1,
    AgentExtensionV1,
    FHIR_CONTEXT_EXTENSION_URI,
    build_agent_card_v1,
    serialize_agent_card_v1,
)

__all__ = [
    "AgentCardV1",
    "AgentExtensionV1",
    "FHIR_CONTEXT_EXTENSION_URI",
    "build_agent_card_v1",
    "serialize_agent_card_v1",
]
