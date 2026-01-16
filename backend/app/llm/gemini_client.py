"""Gemini client wrapper for fast data generation."""

import asyncio
import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

# Default retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 1.0  # seconds
RETRY_MULTIPLIER = 2.0

# Model to use
GEMINI_MODEL = "gemini-3.0-flash-preview"


class GeminiClient:
    """Wrapper around Google GenAI client for fast data generation."""

    def __init__(self, api_key: str | None = None):
        """Initialize the client.

        Args:
            api_key: Google API key. If not provided, uses GOOGLE_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Google API key required. Set GOOGLE_API_KEY environment variable "
                "or pass api_key parameter."
            )
        self._client = genai.Client(api_key=self.api_key)

    async def generate_json(
        self,
        prompt: str,
        schema: dict[str, Any] | None = None,
        system: str | None = None,
        temperature: float = 0.8,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Generate JSON response from Gemini.

        Args:
            prompt: The user prompt
            schema: Optional JSON schema for structured output
            system: Optional system instruction
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens in response

        Returns:
            Parsed JSON response

        Raises:
            ValueError: If response is not valid JSON
        """
        last_error: Exception | None = None
        delay = RETRY_DELAY
        response_text = ""

        for attempt in range(MAX_RETRIES):
            try:
                config = types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    response_mime_type="application/json" if schema else None,
                    response_schema=schema,
                    system_instruction=system,
                )

                response = await self._client.aio.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                    config=config,
                )

                response_text = response.text or ""
                text = response_text.strip()

                # Handle markdown code blocks
                if text.startswith("```json"):
                    text = text[7:]
                if text.startswith("```"):
                    text = text[3:]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

                return json.loads(text)

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {response_text[:500]}...")
                raise ValueError(f"Invalid JSON in response: {e}") from e

            except Exception as e:
                # Check if it's a retryable error
                error_str = str(e).lower()
                if "rate" in error_str or "limit" in error_str or "500" in error_str:
                    last_error = e
                    logger.warning(
                        f"Gemini error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                    delay *= RETRY_MULTIPLIER
                else:
                    raise

        raise last_error or RuntimeError("Unexpected retry failure")

    async def generate_text(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.8,
        max_tokens: int = 1024,
    ) -> str:
        """Generate text response from Gemini.

        Args:
            prompt: The user prompt
            system: Optional system instruction
            temperature: Sampling temperature (0-2)
            max_tokens: Maximum tokens in response

        Returns:
            Text response
        """
        last_error: Exception | None = None
        delay = RETRY_DELAY

        for attempt in range(MAX_RETRIES):
            try:
                config = types.GenerateContentConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    system_instruction=system,
                )

                response = await self._client.aio.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                    config=config,
                )

                return response.text or ""

            except Exception as e:
                error_str = str(e).lower()
                if "rate" in error_str or "limit" in error_str or "500" in error_str:
                    last_error = e
                    logger.warning(
                        f"Gemini error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                    delay *= RETRY_MULTIPLIER
                else:
                    raise

        raise last_error or RuntimeError("Unexpected retry failure")


# Global client instance (lazy initialization)
_gemini_client: GeminiClient | None = None


def get_gemini_client() -> GeminiClient | None:
    """Get or create the global Gemini client instance.

    Returns None if GOOGLE_API_KEY is not set (allows graceful fallback).
    """
    global _gemini_client
    if _gemini_client is None:
        try:
            _gemini_client = GeminiClient()
        except ValueError:
            # No API key, return None for fallback
            return None
    return _gemini_client


def gemini_available() -> bool:
    """Check if Gemini is available (API key is set)."""
    return bool(os.getenv("GOOGLE_API_KEY"))
