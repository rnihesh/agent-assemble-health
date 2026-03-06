import os
from dotenv import load_dotenv

load_dotenv()

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:3001/mcp")
AGENT_PORT = int(os.getenv("AGENT_PORT", "8001"))
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
