"""Entry point for the MedAssist A2A agent server."""

import os
import uvicorn

from medassist.config import AGENT_PORT, GOOGLE_API_KEY
from medassist.agents.root_agent import create_root_agent
from medassist.sharp.middleware import SharpContextMiddleware

# Ensure the Google API key is set in the environment for the ADK to pick up.
if GOOGLE_API_KEY:
    os.environ.setdefault("GOOGLE_API_KEY", GOOGLE_API_KEY)


def create_app():
    """Create the A2A ASGI application with SHARP middleware."""
    import logging
    from google.adk.a2a import to_a2a

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    logger = logging.getLogger("medassist")

    logger.info("Starting MedAssist A2A Agent on port %d", AGENT_PORT)
    logger.info("MCP Server URL: %s", MCP_SERVER_URL)

    root_agent = create_root_agent()
    a2a_app = to_a2a(root_agent)

    # Wrap with SHARP context middleware so that patient context from
    # EHR launch headers is available to agents and tools.
    app = SharpContextMiddleware(a2a_app)
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(
        "medassist.main:app",
        host="0.0.0.0",
        port=AGENT_PORT,
        reload=False,
    )
