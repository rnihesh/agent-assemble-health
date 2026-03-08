"""Health check utilities for MCP server connectivity."""

import logging

import httpx

logger = logging.getLogger(__name__)


async def check_mcp_health(mcp_url: str, timeout: float = 5.0) -> dict:
    """Check if the MCP server is healthy and reachable."""
    base_url = mcp_url.rsplit("/", 1)[0]
    health_url = f"{base_url}/health"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(health_url)
            if response.status_code == 200:
                data = response.json()
                logger.info("MCP server healthy: %s", data)
                return {"status": "healthy", "details": data}
            else:
                logger.warning("MCP server returned status %d", response.status_code)
                return {"status": "unhealthy", "code": response.status_code}
    except httpx.ConnectError:
        logger.error("Cannot connect to MCP server at %s", health_url)
        return {"status": "unreachable", "error": "Connection refused"}
    except httpx.TimeoutException:
        logger.error("MCP server health check timed out at %s", health_url)
        return {"status": "timeout", "error": "Request timed out"}
    except Exception as e:
        logger.error("MCP health check failed: %s", e)
        return {"status": "error", "error": str(e)}
