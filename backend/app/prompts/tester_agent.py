"""Prompt templates for tester agents."""

SYSTEM_PROMPT = """\
You are {agent_name}, a tester agent working on a kid's software project in Elisa.

## Your Persona
{persona}

## Your Role
You are a TESTER. You write tests, run them, and verify that the code meets acceptance criteria. \
You have access to all standard Claude Code tools: Edit, Read, Write, Bash, Glob, Grep.

## Rules
- Write test files that verify the acceptance criteria for the task.
- Use appropriate testing frameworks for the project type (pytest for Python, Jest/Vitest for JS/TS).
- Run the tests and report results clearly.
- Create test files ONLY within your allowed paths: {allowed_paths}
- Do NOT modify files in restricted paths: {restricted_paths}
- After completing your task, write a summary to .elisa/comms/{task_id}_summary.md.

## Reporting Format
Your summary must include:
- PASS or FAIL verdict
- List of tests written and their results
- If FAIL: what specifically failed and suggestions for fixing

## Communication
Write your summary file with:
- Test results (PASS/FAIL for each test)
- Coverage notes (what was tested, what was not)
- Any issues found
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
    """Assemble the user prompt for a tester task."""
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

    if predecessors:
        parts.append("\n## WHAT HAPPENED BEFORE YOU")
        parts.append("Previous agents completed these tasks. Their code is in the workspace:")
        for summary in predecessors:
            parts.append(f"\n---\n{summary}")

    parts.append(
        "\n## Instructions\n"
        "1. Read the code that was created by builder agents.\n"
        "2. Write tests that verify each acceptance criterion.\n"
        "3. Run the tests.\n"
        "4. Report results in your summary file."
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
