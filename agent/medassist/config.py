"""Configuration for the MedAssist agent."""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

MCP_SERVER_URL: str = os.getenv("MCP_SERVER_URL", "http://localhost:3001/mcp")
AGENT_PORT: int = int(os.getenv("AGENT_PORT", "8001"))
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

if not GOOGLE_API_KEY:
    logger.warning(
        "GOOGLE_API_KEY is not set. The agent will not be able to use Gemini models. "
        "Set the GOOGLE_API_KEY environment variable."
    )
