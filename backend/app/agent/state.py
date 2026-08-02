"""CallState — the state object threaded through the agent graph each turn."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CallState:
    # Identity / context.
    business_id: str
    call_id: str
    caller_number: str | None = None

    # Business config snapshot (name, greeting, services, hours, owner_phone...).
    business: dict[str, Any] = field(default_factory=dict)

    # Rolling conversation history: [{"role": "caller"|"agent", "content": str}].
    history: list[dict[str, str]] = field(default_factory=list)

    # This turn.
    utterance: str = ""            # latest caller text
    intent: str = "faq"            # book_appointment | faq | take_message | escalate
    confidence: float = 0.0
    slots: dict[str, Any] = field(default_factory=dict)  # extracted booking slots

    # Output of this turn.
    reply: str = ""
    outcome: str | None = None     # booked | answered | message | escalated
    escalated: bool = False

    # Side-effect payloads the caller (API layer) should persist.
    booking: dict[str, Any] | None = None
    message: dict[str, Any] | None = None

    def as_messages(self, limit: int = 12) -> list[dict[str, str]]:
        """History mapped to LLM roles (caller→user, agent→assistant)."""
        role_map = {"caller": "user", "agent": "assistant"}
        msgs = [
            {"role": role_map.get(h["role"], "user"), "content": h["content"]}
            for h in self.history[-limit:]
        ]
        return msgs
