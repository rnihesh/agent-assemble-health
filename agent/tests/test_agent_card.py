"""Schema-shape tests for the v1 A2A agent card."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from medassist.a2a.agent_card import (
    FHIR_CONTEXT_EXTENSION_URI,
    AgentCardV1,
    AgentExtensionV1,
    build_agent_card_v1,
    serialize_agent_card_v1,
)


AGENT_DIR = Path(__file__).resolve().parent.parent
EXPECTED_SKILL_IDS = {
    "patient_review",
    "medication_safety",
    "risk_assessment",
    "preventive_care",
}


# ---------------------------------------------------------------------------
# Shim shape
# ---------------------------------------------------------------------------


class TestShimClasses:
    def test_agent_extension_v1_carries_params(self):
        ext = AgentExtensionV1(
            uri="example://ext",
            description="x",
            params={"foo": "bar"},
            required=False,
        )
        dumped = ext.model_dump(by_alias=True, exclude_none=True)
        assert dumped["params"] == {"foo": "bar"}
        assert dumped["uri"] == "example://ext"

    def test_agent_card_v1_supports_extra_fields(self):
        card = build_agent_card_v1("https://agent.example.com")
        assert isinstance(card, AgentCardV1)
        assert isinstance(card.supportedInterfaces, list)
        assert isinstance(card.securitySchemes, dict)


# ---------------------------------------------------------------------------
# Serialized v1 wire shape
# ---------------------------------------------------------------------------


class TestServedCardShape:
    @pytest.fixture
    def served(self):
        return serialize_agent_card_v1(
            build_agent_card_v1("https://agent.example.com")
        )

    def test_top_level_url_is_dropped(self, served):
        assert "url" not in served

    def test_preferred_transport_is_dropped(self, served):
        assert "preferredTransport" not in served

    def test_supported_interfaces_is_populated(self, served):
        assert "supportedInterfaces" in served
        assert isinstance(served["supportedInterfaces"], list)
        assert len(served["supportedInterfaces"]) >= 1
        first = served["supportedInterfaces"][0]
        assert first["url"] == "https://agent.example.com"
        assert first["protocolBinding"] == "JSONRPC"
        assert "protocolVersion" in first

    def test_supported_interfaces_url_uses_public_url_argument(self):
        served = serialize_agent_card_v1(
            build_agent_card_v1("https://prod.medassist.example.com")
        )
        assert served["supportedInterfaces"][0]["url"] == "https://prod.medassist.example.com"

    def test_capabilities_state_transition_history_is_false(self, served):
        assert served["capabilities"]["stateTransitionHistory"] is False

    def test_capabilities_declares_fhir_context_extension(self, served):
        extensions = served["capabilities"].get("extensions") or []
        uris = [ext.get("uri") for ext in extensions]
        assert FHIR_CONTEXT_EXTENSION_URI in uris

    def test_card_has_exactly_four_skills_with_expected_ids(self, served):
        skills = served["skills"]
        assert len(skills) == 4
        assert {s["id"] for s in skills} == EXPECTED_SKILL_IDS

    def test_security_schemes_uses_v1_typed_key_dict_shape(self, served):
        # securitySchemes is present (even if empty) and is a plain dict —
        # not a flat type/name/in object that the OLD a2a-sdk would emit.
        assert "securitySchemes" in served
        assert isinstance(served["securitySchemes"], dict)

    def test_card_name_and_version(self, served):
        assert served["name"] == "MedAssist"
        assert served["version"] == "1.0.0"

    def test_default_output_modes_include_markdown(self, served):
        assert "text/markdown" in served["defaultOutputModes"]


# ---------------------------------------------------------------------------
# On-disk agent_card.json mirrors the v1 shape
# ---------------------------------------------------------------------------


class TestAgentCardJsonOnDisk:
    @pytest.fixture
    def disk_card(self):
        path = AGENT_DIR / "agent_card.json"
        assert path.exists(), "agent_card.json must exist"
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def test_disk_card_is_v1_shape(self, disk_card):
        assert "supportedInterfaces" in disk_card
        assert "url" not in disk_card
        assert "preferredTransport" not in disk_card

    def test_disk_card_declares_fhir_context_extension(self, disk_card):
        extensions = disk_card["capabilities"].get("extensions") or []
        uris = [ext.get("uri") for ext in extensions]
        assert FHIR_CONTEXT_EXTENSION_URI in uris

    def test_disk_card_skill_ids(self, disk_card):
        assert {s["id"] for s in disk_card["skills"]} == EXPECTED_SKILL_IDS
