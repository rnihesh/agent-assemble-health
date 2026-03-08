"""Retry utility for transient errors."""

import asyncio
import logging
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        exponential_base: float = 2.0,
        retryable_exceptions: tuple = (ConnectionError, TimeoutError, OSError),
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.retryable_exceptions = retryable_exceptions


DEFAULT_RETRY = RetryConfig()


async def with_retry(
    func: Callable[..., Any],
    *args: Any,
    config: RetryConfig = DEFAULT_RETRY,
    operation_name: str = "operation",
    **kwargs: Any,
) -> Any:
    """Execute an async function with retry logic and exponential backoff."""
    last_exception = None
    for attempt in range(config.max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except config.retryable_exceptions as e:
            last_exception = e
            if attempt < config.max_retries:
                delay = min(
                    config.base_delay * (config.exponential_base ** attempt),
                    config.max_delay,
                )
                logger.warning(
                    "%s failed (attempt %d/%d): %s. Retrying in %.1fs...",
                    operation_name,
                    attempt + 1,
                    config.max_retries + 1,
                    e,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    "%s failed after %d attempts: %s",
                    operation_name,
                    config.max_retries + 1,
                    e,
                )
    raise last_exception  # type: ignore[misc]
