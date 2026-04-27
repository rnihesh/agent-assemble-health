"""Configuration for the MedAssist agent."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

AGENT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Prefer an agent-local .env if present, then fill any missing values from the
# project root .env so both `cd agent` and project-root workflows behave the same.
load_dotenv(AGENT_DIR / ".env")
load_dotenv(PROJECT_ROOT / ".env")

logger = logging.getLogger(__name__)

MCP_SERVER_URL: str = os.getenv("MCP_SERVER_URL", "http://localhost:3001/mcp")
AGENT_PORT: int = int(os.getenv("AGENT_PORT", "8001"))
AGENT_PUBLIC_URL: str = os.getenv("AGENT_PUBLIC_URL", "").strip()
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
# Agent LLM model name. Read from AGENT_MODEL env so the choice can be
# swapped without code edits (e.g. to AGENT_MODEL_FALLBACK if the primary
# is unavailable). Defaults to a flash-lite preview that's lighter on
# token-per-minute limits than the older gemini-2.0-flash.
AGENT_MODEL: str = os.getenv("AGENT_MODEL", "gemini-3.1-flash-lite-preview").strip()

if not GOOGLE_API_KEY:
    logger.warning(
        "GOOGLE_API_KEY is not set. The agent will not be able to use Gemini models. "
        "Set the GOOGLE_API_KEY environment variable."
    )
