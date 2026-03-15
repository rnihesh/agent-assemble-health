"""Tests for MedAssist agent configuration and structure."""

import json
import os
import pathlib

import pytest

# Base path for the agent project
AGENT_DIR = pathlib.Path(__file__).resolve().parent.parent
MEDASSIST_DIR = AGENT_DIR / "medassist"
KNOWLEDGE_DIR = MEDASSIST_DIR / "knowledge"


# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------

class TestConfig:
    """Tests for medassist.config default values."""

    def test_default_mcp_server_url(self, monkeypatch):
        monkeypatch.delenv("MCP_SERVER_URL", raising=False)
        # Re-import to pick up defaults
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.MCP_SERVER_URL == "http://localhost:3001/mcp"

    def test_default_agent_port(self, monkeypatch):
        monkeypatch.delenv("AGENT_PORT", raising=False)
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.AGENT_PORT == 8001

    def test_custom_agent_port(self, monkeypatch):
        monkeypatch.setenv("AGENT_PORT", "9999")
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.AGENT_PORT == 9999

    def test_google_api_key_defaults_empty(self, monkeypatch):
        monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.GOOGLE_API_KEY == ""

    def test_default_agent_public_url_empty(self, monkeypatch):
        monkeypatch.delenv("AGENT_PUBLIC_URL", raising=False)
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.AGENT_PUBLIC_URL == ""

    def test_custom_agent_public_url(self, monkeypatch):
        monkeypatch.setenv("AGENT_PUBLIC_URL", "https://agent.example.com")
        import importlib
        import medassist.config as cfg
        importlib.reload(cfg)
        assert cfg.AGENT_PUBLIC_URL == "https://agent.example.com"


# ---------------------------------------------------------------------------
# Agent card tests
# ---------------------------------------------------------------------------

class TestAgentCard:
    """Tests for agent_card.json validity."""

    @pytest.fixture
    def agent_card(self):
        card_path = AGENT_DIR / "agent_card.json"
        assert card_path.exists(), "agent_card.json must exist at the project root"
        with open(card_path) as f:
            return json.load(f)

    def test_agent_card_is_valid_json(self, agent_card):
        assert isinstance(agent_card, dict)

    def test_agent_card_has_required_fields(self, agent_card):
        required = ["name", "description", "url", "version", "capabilities", "skills"]
        for field in required:
            assert field in agent_card, f"Missing required field: {field}"

    def test_agent_card_name(self, agent_card):
        assert agent_card["name"] == "MedAssist"

    def test_agent_card_version(self, agent_card):
        assert agent_card["version"] == "1.0.0"

    def test_agent_card_has_four_skills(self, agent_card):
        assert len(agent_card["skills"]) == 4

    def test_agent_card_skill_ids(self, agent_card):
        skill_ids = {s["id"] for s in agent_card["skills"]}
        expected = {"patient_review", "medication_safety", "risk_assessment", "preventive_care"}
        assert skill_ids == expected

    def test_agent_card_skills_have_required_fields(self, agent_card):
        for skill in agent_card["skills"]:
            for field in ["id", "name", "description", "tags"]:
                assert field in skill, f"Skill {skill.get('id', '?')} missing field: {field}"

    def test_agent_card_capabilities(self, agent_card):
        assert agent_card["capabilities"]["streaming"] is True
        assert agent_card["capabilities"]["pushNotifications"] is False

    def test_agent_card_output_modes(self, agent_card):
        assert "text/plain" in agent_card["defaultOutputModes"]
        assert "text/markdown" in agent_card["defaultOutputModes"]


# ---------------------------------------------------------------------------
# Agent structure tests
# ---------------------------------------------------------------------------

class TestAgentStructure:
    """Tests that agents are properly configured."""

    def test_root_agent_creation(self):
        from medassist.agents.root_agent import create_root_agent
        agent = create_root_agent()
        assert agent.name == "medassist"
        assert agent.model == "gemini-2.0-flash"

    def test_root_agent_has_sub_agents(self):
        from medassist.agents.root_agent import create_root_agent
        agent = create_root_agent()
        assert agent.sub_agents is not None
        assert len(agent.sub_agents) == 4

    def test_root_agent_sub_agent_names(self):
        from medassist.agents.root_agent import create_root_agent
        agent = create_root_agent()
        sub_agent_names = {sa.name for sa in agent.sub_agents}
        expected = {"patient_review", "medication_safety", "risk_assessment", "preventive_care"}
        assert sub_agent_names == expected

    def test_patient_review_agent(self):
        from medassist.agents.patient_review import create_patient_review_agent
        agent = create_patient_review_agent()
        assert agent.name == "patient_review"
        assert agent.model == "gemini-2.0-flash"
        assert agent.instruction is not None
        assert len(agent.instruction) > 100

    def test_medication_safety_agent(self):
        from medassist.agents.medication_safety import create_medication_safety_agent
        agent = create_medication_safety_agent()
        assert agent.name == "medication_safety"
        assert agent.model == "gemini-2.0-flash"
        assert agent.instruction is not None
        assert len(agent.instruction) > 100

    def test_risk_assessment_agent(self):
        from medassist.agents.risk_assessment import create_risk_assessment_agent
        agent = create_risk_assessment_agent()
        assert agent.name == "risk_assessment"
        assert agent.model == "gemini-2.0-flash"
        assert agent.instruction is not None
        assert len(agent.instruction) > 100

    def test_preventive_care_agent(self):
        from medassist.agents.preventive_care import create_preventive_care_agent
        agent = create_preventive_care_agent()
        assert agent.name == "preventive_care"
        assert agent.model == "gemini-2.0-flash"
        assert agent.instruction is not None
        assert len(agent.instruction) > 100

    def test_root_agent_has_tools(self):
        from medassist.agents.root_agent import create_root_agent
        agent = create_root_agent()
        assert agent.tools is not None
        assert len(agent.tools) > 0

    def test_root_agent_has_instruction(self):
        from medassist.agents.root_agent import create_root_agent
        agent = create_root_agent()
        assert "MedAssist" in agent.instruction
        assert "patient_review" in agent.instruction
        assert "medication_safety" in agent.instruction
        assert "risk_assessment" in agent.instruction
        assert "preventive_care" in agent.instruction


# ---------------------------------------------------------------------------
# SHARP context tests
# ---------------------------------------------------------------------------

class TestSharpContext:
    """Tests for SHARP context extraction."""

    def test_sharp_context_from_valid_headers(self):
        from medassist.sharp.context import SharpContext
        headers = {
            "x-sharp-patient-id": "patient-123",
            "x-sharp-fhir-url": "https://fhir.example.com",
            "x-sharp-fhir-token": "Bearer abc123",
        }
        ctx = SharpContext.from_headers(headers)
        assert ctx is not None
        assert ctx.patient_id == "patient-123"
        assert ctx.fhir_server_url == "https://fhir.example.com"
        assert ctx.fhir_access_token == "Bearer abc123"

    def test_sharp_context_missing_patient_id_returns_none(self):
        from medassist.sharp.context import SharpContext
        headers = {
            "x-sharp-fhir-url": "https://fhir.example.com",
        }
        ctx = SharpContext.from_headers(headers)
        assert ctx is None

    def test_sharp_context_minimal_headers(self):
        from medassist.sharp.context import SharpContext
        headers = {
            "x-sharp-patient-id": "patient-456",
        }
        ctx = SharpContext.from_headers(headers)
        assert ctx is not None
        assert ctx.patient_id == "patient-456"
        assert ctx.fhir_server_url is None
        assert ctx.fhir_access_token is None

    def test_sharp_context_empty_headers(self):
        from medassist.sharp.context import SharpContext
        ctx = SharpContext.from_headers({})
        assert ctx is None


# ---------------------------------------------------------------------------
# Knowledge file tests
# ---------------------------------------------------------------------------

class TestKnowledgeFiles:
    """Tests that knowledge JSON files are valid and well-structured."""

    def test_lab_reference_ranges_valid(self):
        path = KNOWLEDGE_DIR / "lab_reference_ranges.json"
        assert path.exists()
        with open(path) as f:
            data = json.load(f)
        assert "labs" in data
        assert len(data["labs"]) >= 30
        for lab in data["labs"]:
            assert "loinc" in lab
            assert "name" in lab
            assert "unit" in lab
            assert "normalRange" in lab
            assert "category" in lab

    def test_risk_score_formulas_valid(self):
        path = KNOWLEDGE_DIR / "risk_score_formulas.json"
        assert path.exists()
        with open(path) as f:
            data = json.load(f)
        assert "calculators" in data
        assert len(data["calculators"]) == 6
        calculator_ids = {c["id"] for c in data["calculators"]}
        expected = {"cha2ds2-vasc", "heart", "wells-dvt", "wells-pe", "ascvd", "ckd-epi"}
        assert calculator_ids == expected

    def test_uspstf_guidelines_valid(self):
        path = KNOWLEDGE_DIR / "uspstf_guidelines.json"
        assert path.exists()
        with open(path) as f:
            data = json.load(f)
        assert "guidelines" in data
        assert len(data["guidelines"]) >= 25
        for guideline in data["guidelines"]:
            assert "id" in guideline
            assert "title" in guideline
            assert "grade" in guideline
            assert "recommendation" in guideline
            assert "source" in guideline

    def test_drug_interactions_valid(self):
        path = KNOWLEDGE_DIR / "drug_interactions.json"
        assert path.exists()
        with open(path) as f:
            data = json.load(f)
        assert "interactions" in data
        assert len(data["interactions"]) >= 30
        for interaction in data["interactions"]:
            assert "drug1" in interaction
            assert "drug2" in interaction
            assert "severity" in interaction
            assert "mechanism" in interaction
            assert "clinicalEffect" in interaction
            assert "management" in interaction

    def test_drug_interaction_severities_are_valid(self):
        path = KNOWLEDGE_DIR / "drug_interactions.json"
        with open(path) as f:
            data = json.load(f)
        valid_severities = {"critical", "major", "significant", "moderate", "minor"}
        for interaction in data["interactions"]:
            assert interaction["severity"] in valid_severities, (
                f"Invalid severity '{interaction['severity']}' for "
                f"{interaction['drug1']}-{interaction['drug2']}"
            )

    def test_uspstf_grades_are_valid(self):
        path = KNOWLEDGE_DIR / "uspstf_guidelines.json"
        with open(path) as f:
            data = json.load(f)
        valid_grades = {"A", "B", "C", "D", "I"}
        for guideline in data["guidelines"]:
            assert guideline["grade"] in valid_grades, (
                f"Invalid grade '{guideline['grade']}' for {guideline['id']}"
            )
