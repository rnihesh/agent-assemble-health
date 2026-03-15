"""Entry point for the MedAssist A2A agent server."""

import json
import logging
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import uvicorn

from medassist.agents.root_agent import create_root_agent
from medassist.config import AGENT_PORT, AGENT_PUBLIC_URL, GOOGLE_API_KEY, MCP_SERVER_URL
from medassist.sharp.middleware import SharpContextMiddleware
from medassist.utils.health import check_mcp_health

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("medassist")
AGENT_CARD_PATH = Path(__file__).resolve().parents[1] / "agent_card.json"

# Ensure the Google API key is set in the environment for the ADK to pick up.
if GOOGLE_API_KEY:
    os.environ.setdefault("GOOGLE_API_KEY", GOOGLE_API_KEY)


def load_agent_card() -> dict[str, Any]:
    """Load the static A2A agent card from disk."""
    with AGENT_CARD_PATH.open("r", encoding="utf-8") as card_file:
        return json.load(card_file)


def normalize_base_url(base_url: str) -> str:
    """Normalize a public base URL by removing any trailing slash."""
    return base_url.rstrip("/")


def extract_headers(scope: dict[str, Any]) -> dict[str, str]:
    """Convert raw ASGI headers into a normalized string dictionary."""
    headers: dict[str, str] = {}
    for raw_name, raw_value in scope.get("headers", []):
        headers[raw_name.decode("latin-1").lower()] = raw_value.decode("latin-1")
    return headers


def build_public_base_url(headers: dict[str, str] | None = None) -> str:
    """Resolve the public base URL for agent-card and A2A endpoint metadata."""
    if AGENT_PUBLIC_URL:
        return normalize_base_url(AGENT_PUBLIC_URL)

    if headers:
        forwarded_proto = headers.get("x-forwarded-proto") or headers.get(
            "x-forwarded-scheme"
        )
        forwarded_host = headers.get("x-forwarded-host") or headers.get("host")
        if forwarded_host:
            scheme = (forwarded_proto or "http").split(",", 1)[0].strip()
            host = forwarded_host.split(",", 1)[0].strip()
            if host:
                return normalize_base_url(f"{scheme}://{host}")

    return f"http://localhost:{AGENT_PORT}"


def parse_public_base_url(base_url: str) -> tuple[str, str, int]:
    """Split a public base URL into protocol, host, and port for ADK setup."""
    parsed = urlparse(base_url)
    protocol = parsed.scheme or "http"
    host = parsed.hostname or "localhost"

    if parsed.port is not None:
        port = parsed.port
    elif protocol == "https":
        port = 443
    else:
        port = 80

    return protocol, host, port


def build_agent_card(base_url: str | None = None) -> dict[str, Any]:
    """Load the agent card and apply the correct public URL."""
    card = load_agent_card()
    card["url"] = normalize_base_url(base_url or build_public_base_url())
    return card


def build_agent_card_model(base_url: str | None = None):
    """Build an A2A AgentCard model from the JSON payload."""
    from a2a.types import AgentCard

    return AgentCard(**build_agent_card(base_url))


async def send_json(send, status: int, payload: dict[str, Any]) -> None:
    """Send a JSON response from a bare ASGI application."""
    body = json.dumps(payload).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


def create_apps():
    """Create both the raw A2A app and the wrapped public ASGI app."""
    try:
        from google.adk.a2a import to_a2a
    except ImportError:
        from google.adk.a2a.utils.agent_to_a2a import to_a2a

    logger.info("Starting MedAssist A2A Agent on port %d", AGENT_PORT)
    logger.info("MCP Server URL: %s", MCP_SERVER_URL)

    root_agent = create_root_agent()
    public_base_url = build_public_base_url()
    protocol, host, port = parse_public_base_url(public_base_url)
    raw_a2a_app = to_a2a(
        root_agent,
        host=host,
        port=port,
        protocol=protocol,
        agent_card=build_agent_card_model(public_base_url),
    )

    async def routed_app(scope, receive, send):
        if scope["type"] != "http":
            await raw_a2a_app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        headers = extract_headers(scope)

        if path == "/.well-known/agent-card.json":
            if method != "GET":
                await send_json(send, 405, {"error": "Method not allowed"})
                return
            await send_json(send, 200, build_agent_card(build_public_base_url(headers)))
            return

        if path == "/health":
            if method != "GET":
                await send_json(send, 405, {"error": "Method not allowed"})
                return

            mcp_health = await check_mcp_health(MCP_SERVER_URL)
            status = 200 if mcp_health.get("status") == "healthy" else 503
            await send_json(
                send,
                status,
                {
                    "status": "ok" if status == 200 else "degraded",
                    "name": "medassist-agent",
                    "version": "1.0.0",
                    "publicUrl": build_public_base_url(headers),
                    "mcpServerUrl": MCP_SERVER_URL,
                    "googleApiKeyConfigured": bool(GOOGLE_API_KEY),
                    "mcp": mcp_health,
                },
            )
            return

        await raw_a2a_app(scope, receive, send)

    return raw_a2a_app, SharpContextMiddleware(routed_app)


a2a_app, app = create_apps()

if __name__ == "__main__":
    uvicorn.run(
        "medassist.main:app",
        host="0.0.0.0",
        port=AGENT_PORT,
        reload=False,
    )
