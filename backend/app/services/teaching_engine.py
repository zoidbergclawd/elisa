"""Generates kid-friendly explanations of engineering concepts."""

import json
import logging
from typing import Any

from app.prompts.teaching import (
    CONCEPT_CURRICULUM,
    TEACHING_SYSTEM_PROMPT,
    get_curriculum_moment,
    teaching_user_prompt,
)

logger = logging.getLogger(__name__)

# Maps orchestrator event types to (concept, sub_concept) pairs
_TRIGGER_MAP: dict[str, tuple[str, str]] = {
    "plan_ready": ("decomposition", "task_breakdown"),
    "first_commit": ("source_control", "first_commit"),
    "subsequent_commit": ("source_control", "multiple_commits"),
    "test_result_pass": ("testing", "test_pass"),
    "test_result_fail": ("testing", "test_fail"),
    "coverage_update": ("testing", "coverage"),
    "tester_task_completed": ("testing", "first_test_run"),
    "reviewer_task_completed": ("code_review", "first_review"),
    "hardware_compile": ("hardware", "compilation"),
    "hardware_flash": ("hardware", "flashing"),
    "hardware_led": ("hardware", "gpio"),
    "hardware_lora": ("hardware", "lora"),
    "skill_used": ("prompt_engineering", "first_skill"),
    "rule_used": ("prompt_engineering", "first_rule"),
}


class TeachingEngine:
    """Produces teaching moments during the build process.

    Uses a hardcoded curriculum as the primary source of teaching content.
    Falls back to Anthropic API only for novel situations not in the curriculum.
    """

    def __init__(self) -> None:
        self._shown_concepts: set[str] = set()
        self._commit_count: int = 0
        self._client: Any = None  # Lazy-loaded anthropic.AsyncAnthropic

    async def get_moment(
        self, event_type: str, event_details: str = "", project_type: str = ""
    ) -> dict | None:
        """Get a teaching moment for the given event, if appropriate.

        Returns a dict with concept, headline, explanation, tell_me_more
        or None if no teaching moment should be shown.
        """
        # Handle commit counting to distinguish first vs subsequent
        actual_event = event_type
        if event_type == "commit_created":
            self._commit_count += 1
            actual_event = "first_commit" if self._commit_count == 1 else "subsequent_commit"

        # Look up trigger mapping
        mapping = _TRIGGER_MAP.get(actual_event)
        if not mapping:
            return None

        concept, sub_concept = mapping

        # Dedup: don't repeat concepts
        dedup_key = f"{concept}:{sub_concept}"
        if dedup_key in self._shown_concepts:
            return None

        # Try curriculum first (fast path, no I/O)
        moment = get_curriculum_moment(concept, sub_concept)
        if moment:
            self._shown_concepts.add(dedup_key)
            return dict(moment)  # Return a copy

        # API fallback for novel situations
        try:
            result = await self._api_fallback(event_type, event_details, project_type)
            if result:
                self._shown_concepts.add(dedup_key)
                return result
        except Exception:
            logger.debug("Teaching API fallback failed", exc_info=True)

        return None

    def mark_shown(self, concept: str) -> None:
        """Manually mark a concept as shown to prevent repeats."""
        self._shown_concepts.add(concept)

    def get_shown_concepts(self) -> list[str]:
        """Return list of concept keys that have been shown."""
        return list(self._shown_concepts)

    async def _api_fallback(
        self, event_type: str, event_details: str, project_type: str
    ) -> dict | None:
        """Call Anthropic API as fallback for unknown teaching moments."""
        try:
            import anthropic
        except ImportError:
            return None

        if self._client is None:
            self._client = anthropic.AsyncAnthropic()

        prompt = teaching_user_prompt(event_type, event_details, project_type or "software")

        response = await self._client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            system=TEACHING_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text
        try:
            return json.loads(text)
        except (json.JSONDecodeError, IndexError):
            return None
