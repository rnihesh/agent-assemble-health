"""ASGI middleware for extracting SHARP context from incoming requests.

The middleware reads SHARP-related headers from every request and, when a
valid patient context is found, stores it in the ASGI scope's ``state``
dictionary so that downstream handlers can access it.
"""

from contextvars import ContextVar
from typing import Optional

from medassist.sharp.context import SharpContext

# Context variable that holds the current request's SHARP context.
# Agents and tools can import this variable and call .get() to retrieve
# the SharpContext for the request currently being processed.
sharp_context_var: ContextVar[Optional[SharpContext]] = ContextVar(
    "sharp_context", default=None
)


class SharpContextMiddleware:
    """ASGI middleware that extracts SHARP context from request headers.

    Usage with any ASGI app (e.g. the A2A app produced by ``to_a2a``):

        app = SharpContextMiddleware(a2a_app)
        uvicorn.run(app, ...)

    Downstream code can read the context via the module-level context var:

        from medassist.sharp.middleware import sharp_context_var
        ctx = sharp_context_var.get()
        if ctx:
            print(ctx.patient_id)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            # Build a plain dict from the raw ASGI header tuples.
            headers: dict[str, str] = {}
            for raw_name, raw_value in scope.get("headers", []):
                name = raw_name.decode("latin-1").lower()
                value = raw_value.decode("latin-1")
                headers[name] = value

            ctx = SharpContext.from_headers(headers)

            # Store in the ASGI scope state so frameworks like Starlette
            # can also surface it via request.state.
            if "state" not in scope:
                scope["state"] = {}
            scope["state"]["sharp_context"] = ctx

            # Store in the context variable for direct access in async code.
            token = sharp_context_var.set(ctx)
            try:
                await self.app(scope, receive, send)
            finally:
                sharp_context_var.reset(token)
        else:
            await self.app(scope, receive, send)
