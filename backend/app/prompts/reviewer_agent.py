"""Prompt templates for reviewer agents."""

SYSTEM_PROMPT = """\
You are {agent_name}, a code reviewer agent working on a kid's software project in Elisa.

## Your Persona
{persona}

## Your Role
You are a REVIEWER. You review code quality, check for issues, and suggest improvements. \
You have access to all standard Claude Code tools: Edit, Read, Write, Bash, Glob, Grep.

## Rules
- Review all code created by builder agents for quality and correctness.
- Check that acceptance criteria are met.
- Look for: bugs, missing error handling, unclear code, style issues.
- Be constructive and encouraging -- this is a kid's project.
- You MAY make small fixes directly (typos, obvious bugs).
- Create review files ONLY within your allowed paths: {allowed_paths}
- Do NOT modify files in restricted paths: {restricted_paths}
- After completing your review, write a summary to .elisa/comms/{task_id}_summary.md.

## Review Checklist
1. Does the code fulfill the task description?
2. Are all acceptance criteria met?
3. Is the code readable and well-organized?
4. Are there any bugs or edge cases?
5. Does it follow the project's style preferences?

## Reporting Format
Your summary must include:
- VERDICT: APPROVED or NEEDS_CHANGES
- SUMMARY: 1-2 sentence overview
- DETAILS: Specific findings (what's good, what could improve)

## Communication
Write your summary file with the verdict, summary, and details.
"""


def format_task_prompt(
    agent_name: str,
    role: str,
    persona: str,
    task: dict,
    spec: dict,
    predecessors: list[str],
    style: dict | None = None,
) -> str:
    """Assemble the user prompt for a reviewer task."""
    parts = [
        f"# Task: {task['name']}",
        f"\n## Description\n{task['description']}",
    ]

    if task.get("acceptance_criteria"):
        parts.append("\n## Acceptance Criteria to Verify")
        for criterion in task["acceptance_criteria"]:
            parts.append(f"- {criterion}")

    project = spec.get("project", {})
    parts.append(f"\n## Project Context\nGoal: {project.get('goal', 'Not specified')}")

    if style:
        parts.append(f"\n## Style Preferences")
        if style.get("colors"):
            parts.append(f"Colors: {style['colors']}")
        if style.get("theme"):
            parts.append(f"Theme: {style['theme']}")

    if predecessors:
        parts.append("\n## WHAT HAPPENED BEFORE YOU")
        parts.append("Previous agents completed these tasks:")
        for summary in predecessors:
            parts.append(f"\n---\n{summary}")

    parts.append(
        "\n## Instructions\n"
        "1. Read all code in the workspace created by previous agents.\n"
        "2. Check each acceptance criterion.\n"
        "3. Review code quality using the checklist.\n"
        "4. Make small fixes if needed.\n"
        "5. Write your review verdict and details in the summary file."
    )

    # Feature skills
    feature_skills = [s for s in spec.get("skills", []) if s.get("category") == "feature"]
    if feature_skills:
        parts.append("\n## Detailed Feature Instructions (kid's skills)")
        for s in feature_skills:
            parts.append(f"### {s['name']}\n{s['prompt']}")

    # Style skills
    style_skills = [s for s in spec.get("skills", []) if s.get("category") == "style"]
    if style_skills:
        parts.append("\n## Detailed Style Instructions (kid's skills)")
        for s in style_skills:
            parts.append(f"### {s['name']}\n{s['prompt']}")

    # Trigger-specific rules for this context
    on_complete_rules = [r for r in spec.get("rules", []) if r.get("trigger") == "on_task_complete"]
    if on_complete_rules:
        parts.append("\n## Validation Rules (kid's rules)")
        for r in on_complete_rules:
            parts.append(f"### {r['name']}\n{r['prompt']}")

    return "\n".join(parts)
