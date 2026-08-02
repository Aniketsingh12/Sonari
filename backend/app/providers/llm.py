"""LLM providers: mock (rule-based), Ollama (open-source), Anthropic & OpenAI (paid).

The agent prompts (see ``app.agent.prompts``) begin with a machine-readable
``TASK: <name>`` line. Real models simply treat it as part of the system
prompt; the ``MockLLM`` switches on it to produce plausible structured output,
so the agent runs end-to-end with no API key.
"""
from __future__ import annotations

import importlib.util
import json
import re

from app.config import settings
from app.providers.base import LLMProvider


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _task_of(system: str) -> str:
    m = re.match(r"\s*TASK:\s*(\w+)", system)
    return m.group(1) if m else "chat"


def _last_user(messages: list[dict]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            return str(m.get("content", ""))
    return ""


# --------------------------------------------------------------------------- Mock
_INTENT_KEYWORDS = {
    "book_appointment": [
        "book", "appointment", "schedule", "reserve", "slot", "availability",
        "come in", "opening", "tomorrow", "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday", "sunday", "am", "pm", "o'clock",
    ],
    "faq": [
        "how much", "price", "cost", "hours", "open", "close", "where",
        "located", "address", "park", "insurance", "offer", "do you", "what",
        "accept", "long", "take", "walk in",
    ],
    "take_message": [
        "message", "call me back", "tell him", "tell her", "let them know",
        "pass along", "leave a message",
    ],
    "escalate": [
        "human", "person", "manager", "owner", "speak to someone", "real person",
        "representative", "agent", "complaint",
    ],
}


class MockLLM(LLMProvider):
    """Deterministic, dependency-free stand-in used for demos and tests."""

    name = "mock"
    mode = "mock"

    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        task = _task_of(system)
        text = _last_user(messages).lower()

        if task == "classify_intent":
            return self._classify(text)
        if task == "extract_booking":
            return self._extract_booking(text)
        if task == "summarize_call":
            return self._summarize(messages)
        # Default: a short, safe generic reply.
        return "Sure — I can help with that. Could you tell me a little more?"

    def _classify(self, text: str) -> str:
        scores: dict[str, int] = {}
        for intent, kws in _INTENT_KEYWORDS.items():
            scores[intent] = sum(1 for kw in kws if kw in text)
        best = max(scores, key=scores.get)
        hits = scores[best]
        if hits == 0:
            best, conf = "faq", 0.5
        else:
            conf = min(0.95, 0.55 + 0.12 * hits)
        return json.dumps({"intent": best, "confidence": round(conf, 2)})

    def _extract_booking(self, text: str) -> str:
        day = None
        for d in ["monday", "tuesday", "wednesday", "thursday", "friday",
                  "saturday", "sunday", "today", "tomorrow"]:
            if d in text:
                day = d
                break
        tm = re.search(r"(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)", text)
        time_str = tm.group(0) if tm else None
        name = None
        nm = re.search(r"(?:my name is|this is|it's|i'm)\s+([a-z]+)", text)
        if nm:
            name = nm.group(1).title()
        return json.dumps({"day": day, "time": time_str, "name": name})

    def _summarize(self, messages: list[dict]) -> str:
        caller_turns = [m["content"] for m in messages if m.get("role") == "user"]
        joined = " ".join(caller_turns).lower()
        if "book" in joined or "appointment" in joined:
            outcome, sentiment = "booked", "positive"
        elif "message" in joined:
            outcome, sentiment = "message", "neutral"
        elif any(w in joined for w in ("human", "manager", "complaint")):
            outcome, sentiment = "escalated", "negative"
        else:
            outcome, sentiment = "answered", "neutral"
        summary = "Caller " + (
            "booked an appointment." if outcome == "booked"
            else "left a message for the owner." if outcome == "message"
            else "asked to speak with a person." if outcome == "escalated"
            else "had their question answered."
        )
        return json.dumps(
            {"outcome": outcome, "sentiment": sentiment, "summary": summary}
        )

    def is_available(self) -> tuple[bool, str]:
        return True, "Rule-based; no external model."


# --------------------------------------------------------------------------- Ollama
class OllamaLLM(LLMProvider):
    """Local, open-source models served by Ollama."""

    name = "ollama"
    mode = "open-source"

    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        import httpx

        sys_prompt = system
        if json_mode:
            sys_prompt += "\n\nRespond with ONLY a single valid JSON object."

        # /api/chat takes the system prompt as the first *message*. A top-level
        # "system" key is silently ignored here (that's /api/generate), which
        # makes the model answer off-schema.
        payload = {
            "model": model or settings.ollama_model,
            "messages": [{"role": "system", "content": sys_prompt}, *messages],
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if json_mode:
            payload["format"] = "json"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/chat", json=payload
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"].strip()

    def is_available(self) -> tuple[bool, str]:
        return True, f"{settings.ollama_base_url} · {settings.ollama_model}"


# --------------------------------------------------------------------------- Anthropic
class AnthropicLLM(LLMProvider):
    """Paid: Claude models via the Anthropic API."""

    name = "anthropic"
    mode = "paid"

    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        from anthropic import AsyncAnthropic  # type: ignore

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        sys = system
        if json_mode:
            sys += "\n\nRespond with a single valid JSON object and nothing else."
        resp = await client.messages.create(
            model=model or settings.llm_fast_model,
            system=sys,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": m["role"], "content": m["content"]} for m in messages
            ],
        )
        return "".join(
            block.text for block in resp.content if block.type == "text"
        ).strip()

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("anthropic"):
            return False, "pip install anthropic"
        if not settings.anthropic_api_key:
            return False, "set ANTHROPIC_API_KEY"
        return True, f"model={settings.llm_fast_model}"


# --------------------------------------------------------------------------- OpenAI
class OpenAILLM(LLMProvider):
    """Paid: GPT models via the OpenAI API."""

    name = "openai"
    mode = "paid"

    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        from openai import AsyncOpenAI  # type: ignore

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        kwargs: dict = {}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        resp = await client.chat.completions.create(
            model=model or "gpt-4o-mini",
            temperature=temperature,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, *messages],
            **kwargs,
        )
        return (resp.choices[0].message.content or "").strip()

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("openai"):
            return False, "pip install openai"
        if not settings.openai_api_key:
            return False, "set OPENAI_API_KEY"
        return True, "model=gpt-4o-mini"


# --------------------------------------------------------------------------- Gemini
class GeminiLLM(LLMProvider):
    """Free-tier: Google Gemini via the Generative Language REST API.

    Uses httpx directly (no SDK dependency). Gemini roles are user/model, and
    the system prompt goes in its own ``system_instruction`` field.
    """

    name = "gemini"
    mode = "free-api"  # hosted API with a usable free tier

    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        import httpx

        model = model or settings.gemini_model
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent"
        )
        contents = [
            {
                # Gemini uses "model" where OpenAI/Anthropic use "assistant".
                "role": "model" if m["role"] == "assistant" else "user",
                "parts": [{"text": str(m["content"])}],
            }
            for m in messages
        ]
        gen_config: dict = {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
        if json_mode:
            gen_config["responseMimeType"] = "application/json"
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": gen_config,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                url, params={"key": settings.gemini_api_key}, json=payload
            )
            resp.raise_for_status()
            data = resp.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError):
            return ""  # safety-blocked or empty candidate

    def is_available(self) -> tuple[bool, str]:
        if not settings.gemini_api_key:
            return False, "set GEMINI_API_KEY (free: aistudio.google.com/apikey)"
        return True, f"model={settings.gemini_model}"


def build_llm(provider: str) -> LLMProvider:
    return {
        "mock": MockLLM,
        "ollama": OllamaLLM,
        "anthropic": AnthropicLLM,
        "openai": OpenAILLM,
        "gemini": GeminiLLM,
    }.get(provider, MockLLM)()
