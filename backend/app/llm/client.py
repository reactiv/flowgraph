"""Anthropic client wrapper with retry logic."""

import asyncio
import logging
import os
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

# Default retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 1.0  # seconds
RETRY_MULTIPLIER = 2.0


class LLMClient:
    """Wrapper around Anthropic client with retry logic."""

    def __init__(self, api_key: str | None = None):
        """Initialize the client.

        Args:
            api_key: Anthropic API key. If not provided, uses ANTHROPIC_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Anthropic API key required. Set ANTHROPIC_API_KEY environment variable "
                "or pass api_key parameter."
            )
        self._client = anthropic.Anthropic(api_key=self.api_key)

    async def generate_json(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate JSON response from Claude.

        Args:
            prompt: The user prompt
            system: Optional system prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0-1)

        Returns:
            Parsed JSON response

        Raises:
            ValueError: If response is not valid JSON
            anthropic.APIError: If API call fails after retries
        """
        messages = [{"role": "user", "content": prompt}]

        response = await self._call_with_retry(
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        # Extract text content
        text = response.content[0].text

        # Parse JSON - Claude sometimes wraps in markdown code blocks
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        import json

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {text[:500]}...")
            raise ValueError(f"Invalid JSON in response: {e}") from e

    async def generate_text(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        """Generate text response from Claude.

        Args:
            prompt: The user prompt
            system: Optional system prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0-1)

        Returns:
            Text response
        """
        messages = [{"role": "user", "content": prompt}]

        response = await self._call_with_retry(
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        return response.content[0].text

    async def _call_with_retry(
        self,
        messages: list[dict[str, str]],
        system: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> anthropic.types.Message:
        """Call Claude API with exponential backoff retry.

        Args:
            messages: Conversation messages
            system: Optional system prompt
            max_tokens: Maximum tokens
            temperature: Sampling temperature

        Returns:
            API response

        Raises:
            anthropic.APIError: If all retries fail
        """
        last_error: Exception | None = None
        delay = RETRY_DELAY

        for attempt in range(MAX_RETRIES):
            try:
                kwargs: dict[str, Any] = {
                    "model": "claude-opus-4-5-20251101",
                    "max_tokens": max_tokens,
                    "messages": messages,
                    "temperature": temperature,
                }
                if system:
                    kwargs["system"] = system

                # Run sync client in thread pool
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None, lambda: self._client.messages.create(**kwargs)
                )
                return response

            except anthropic.RateLimitError as e:
                last_error = e
                logger.warning(
                    f"Rate limited (attempt {attempt + 1}/{MAX_RETRIES}), "
                    f"retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
                delay *= RETRY_MULTIPLIER

            except anthropic.APIStatusError as e:
                if e.status_code >= 500:
                    last_error = e
                    logger.warning(
                        f"Server error {e.status_code} (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s..."
                    )
                    await asyncio.sleep(delay)
                    delay *= RETRY_MULTIPLIER
                else:
                    raise

        raise last_error or RuntimeError("Unexpected retry failure")


# Global client instance (lazy initialization)
_client: LLMClient | None = None


def get_client() -> LLMClient:
    """Get or create the global LLM client instance."""
    global _client
    if _client is None:
        _client = LLMClient()
    return _client
