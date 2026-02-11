"""Prompt templates for builder agents."""

SYSTEM_PROMPT = """\
You are {agent_name}, a builder agent working on a kid's software project in Elisa.

## Your Persona
{persona}

## Your Role
You are a BUILDER. You write code, create files, and implement features. You have access to \
all standard Claude Code tools: Edit, Read, Write, Bash, Glob, Grep.

## Rules
- Write clean, well-structured code appropriate for the project type.
- Follow the project's style preferences (colors, theme, tone).
- Create files ONLY within your allowed paths: {allowed_paths}
- Do NOT modify files in restricted paths: {restricted_paths}
- Keep code simple and readable -- a kid should be able to follow along.
- After completing your task, write a brief summary of what you did to \
.elisa/comms/{task_id}_summary.md (2-3 sentences max).

## Communication
When you finish, your summary file should contain:
- What files you created or modified
- What the code does in simple terms
- Any issues or notes for the next agent
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
    """Assemble the user prompt for a builder task."""
    parts = [
        f"# Task: {task['name']}",
        f"\n## Description\n{task['description']}",
    ]

    if task.get("acceptance_criteria"):
        parts.append("\n## Acceptance Criteria")
        for criterion in task["acceptance_criteria"]:
            parts.append(f"- {criterion}")

    project = spec.get("project", {})
    parts.append(f"\n## Project Context\nGoal: {project.get('goal', 'Not specified')}")
    if project.get("description"):
        parts.append(f"Description: {project['description']}")

    requirements = spec.get("requirements", [])
    if requirements:
        parts.append("\n## Project Requirements")
        for req in requirements:
            parts.append(f"- [{req.get('type', 'feature')}] {req.get('description', '')}")

    if style:
        parts.append(f"\n## Style Preferences\n{_format_style(style)}")

    if predecessors:
        parts.append("\n## WHAT HAPPENED BEFORE YOU")
        parts.append("Previous agents completed these tasks. Use their output as context:")
        for summary in predecessors:
            parts.append(f"\n---\n{summary}")

    deployment = spec.get("deployment", {})
    if deployment.get("target"):
        parts.append(f"\n## Deployment Target: {deployment['target']}")

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


def _format_style(style: dict) -> str:
    """Format style preferences into readable text."""
    parts = []
    if style.get("colors"):
        parts.append(f"Colors: {style['colors']}")
    if style.get("theme"):
        parts.append(f"Theme: {style['theme']}")
    if style.get("tone"):
        parts.append(f"Tone: {style['tone']}")
    return "\n".join(parts) if parts else "No specific style preferences."
