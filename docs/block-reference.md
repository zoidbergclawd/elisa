# Block Reference

Complete guide to Elisa's block palette. Blocks snap together on the canvas to produce a [ProjectSpec](api-reference.md#projectspec-schema) that drives the build.

Categories: [Goals](#goals) | [Requirements](#requirements) | [Style](#style) | [Skills](#skills) | [Rules](#rules) | [Skill Flow](#skill-flow) | [Portals](#portals) | [Minions](#minions) | [Flow](#flow) | [Deploy](#deploy)

---

## Goals

Define what you're building. Every project needs at least one goal block.

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Project Goal** | `GOAL_TEXT` (text input) | `project.goal`, `project.description` |
| **Project Template** | `TEMPLATE_TYPE` (dropdown) | `project.type` |

**Template types**: `game`, `website`, `hardware`, `story`, `tool`

---

## Requirements

Describe what the project should do.

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Feature** | `FEATURE_TEXT` (text) | `requirements[]` with `type: "feature"` |
| **Constraint** | `CONSTRAINT_TEXT` (text) | `requirements[]` with `type: "constraint"` |
| **When/Then** | `TRIGGER_TEXT`, `ACTION_TEXT` (text) | `requirements[]` with `type: "when_then"` |
| **Has Data** | `DATA_TEXT` (text) | `requirements[]` with `type: "data"` |

**Example**: A "Feature" block with "multiplayer support" produces `{ type: "feature", description: "multiplayer support" }`.

---

## Style

Control the look and personality of the output.

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Look Like** | `STYLE_PRESET` (dropdown) | `style.visual` |
| **Personality** | `PERSONALITY_TEXT` (text) | `style.personality` |

**Style presets**: `fun_colorful`, `clean_simple`, `dark_techy`, `nature`, `space`

---

## Skills

Reusable prompt snippets that extend agent capabilities. Created in the Skills modal (wrench icon in sidebar).

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Use Skill** | `SKILL_ID` (dropdown, dynamically populated) | `skills[]` |

Each skill has a name, prompt, and category (`agent`, `feature`, or `style`). Simple skills contain a prompt template. Composite skills use the flow editor (see [Skill Flow](#skill-flow)).

---

## Rules

Guardrails that trigger automatically during builds. Created in the Rules modal (shield icon in sidebar).

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Apply Rule** | `RULE_ID` (dropdown, dynamically populated) | `rules[]` |

Each rule has a name, prompt, and trigger: `always`, `on_task_complete`, `on_test_fail`, or `before_deploy`.

---

## Skill Flow

Visual flow editor for composite skills. Chain steps together to create multi-step agent workflows. Open the flow editor inside the Skills modal.

All 7 flow blocks connect top-to-bottom starting from "Skill Flow".

| Block | Fields | Behavior |
|-------|--------|----------|
| **Skill Flow** | *(none)* | Entry point. Must be the first block in every flow. |
| **Ask User** | `QUESTION` (text), `HEADER` (text), `OPTIONS` (comma-separated text), `STORE_AS` (key name) | Pauses execution and presents a choice to the user. Stores the selected answer in context under `STORE_AS`. |
| **If** | `CONTEXT_KEY` (key name), `MATCH_VALUE` (text), `THEN_BLOCKS` (statement slot) | Branch on a context value. Runs `THEN_BLOCKS` only if the value of `CONTEXT_KEY` equals `MATCH_VALUE`. No else branch -- use multiple If blocks for each case. |
| **Run Skill** | `SKILL_ID` (dropdown), `STORE_AS` (key name) | Invokes another skill by ID. Stores the skill's output in context. Supports nesting up to 10 levels deep with cycle detection. |
| **Run Agent** | `PROMPT` (multiline text), `STORE_AS` (key name) | Spawns a Claude agent with the given prompt template. Stores the agent's result summary in context. |
| **Set Context** | `KEY` (key name), `VALUE` (text) | Sets a context variable. Useful for combining or transforming values. |
| **Output** | `TEMPLATE` (text) | Produces the final output of the skill flow. Terminal block (no next connector). |

### Context Variables

Use `{{key}}` syntax in any text field to reference context values:

```
Ask User -> store as "topic"
Run Agent -> prompt "Build a {{topic}} app" -> store as "result"
Output -> template "Done: {{result}}"
```

Context resolution walks the current context first, then parent contexts (for nested skill invocations).

### Branch Behavior

`If` blocks have no else branch. To handle multiple cases, chain multiple `If` blocks:

```
If answer equals "Game"    -> [Run Agent: build a game]
If answer equals "Website" -> [Run Agent: build a website]
```

First match wins per block. All `If` blocks are evaluated independently (not mutually exclusive).

---

## Portals

Connect to external hardware and services. Portal dropdowns are dynamically populated from configured portals.

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Tell** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to actions), plus dynamic `PARAM_*` fields | `portals[]` with `command: "tell"` |
| **When** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to events), `ACTION_BLOCKS` (statement slot), plus dynamic `PARAM_*` fields | `portals[]` with `command: "when"` |
| **Ask** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to queries), plus dynamic `PARAM_*` fields | `portals[]` with `command: "ask"` |

**Tell** sends a one-shot command to a portal (e.g., "Tell LED Strip to set_color"). **When** reacts to portal events (e.g., "When Button pressed, do..."). **Ask** queries a portal for data (e.g., "Ask Sensor for temperature"). Parameter fields are added dynamically based on the selected capability.

---

## Minions

Configure the AI minions that will build your project. If no minion blocks are placed, defaults are used.

| Block | Fields | Role | ProjectSpec Output |
|-------|--------|------|--------------------|
| **Builder Minion** | `AGENT_NAME`, `AGENT_PERSONA` (text) | `builder` | `agents[]` |
| **Tester Minion** | `AGENT_NAME`, `AGENT_PERSONA` (text) | `tester` | `agents[]` |
| **Reviewer Minion** | `AGENT_NAME`, `AGENT_PERSONA` (text) | `reviewer` | `agents[]` |
| **Custom Minion** | `AGENT_NAME`, `AGENT_PERSONA` (text) | `custom` | `agents[]` |

The persona field shapes the minion's behavior. Example: a Builder named "SpeedBot" with persona "writes minimal, fast code" will be prompted accordingly.

---

## Flow

Control execution order. These are container blocks that hold other blocks inside them.

| Block | Inputs | ProjectSpec Output |
|-------|--------|--------------------|
| **First/Then** | `FIRST_BLOCKS`, `THEN_BLOCKS` (statement slots) | `workflow.flow_hints[]` with `type: "sequential"` |
| **At Same Time** | `PARALLEL_BLOCKS` (statement slot) | `workflow.flow_hints[]` with `type: "parallel"` |
| **Keep Improving** | `CONDITION_TEXT` (text) | `workflow.iteration_conditions[]` |
| **Check With Me** | `GATE_DESCRIPTION` (text) | `workflow.human_gates[]` |
| **Timer Every** | `INTERVAL` (number, default 5), `ACTION_BLOCKS` (statement slot) | `workflow.timers[]` |

**First/Then** runs blocks in the first slot before blocks in the second. **At Same Time** runs contained blocks concurrently. **Keep Improving** loops until a condition is met. **Check With Me** pauses the build and asks the user for approval. **Timer Every** runs contained blocks on a recurring interval.

---

## Deploy

Choose where the built project gets deployed.

| Block | ProjectSpec Output |
|-------|--------------------|
| **Deploy Web** | `deployment.target: "web"` |
| **Deploy ESP32** | `deployment.target: "esp32"` |
| **Deploy Both** | `deployment.target: "both"` |

If no deploy block is placed, defaults to `"preview"`.

---

## Example Composition

A simple game project might use:

1. **Project Goal**: "A space invaders game"
2. **Project Template**: `game`
3. **Feature**: "Three lives and a score counter"
4. **Feature**: "Increasing difficulty each wave"
5. **Look Like**: `space`
6. **Builder Minion**: name "GameDev", persona "writes clean HTML5 canvas games"
7. **Tester Minion**: name "QA", persona "tests edge cases thoroughly"
8. **First/Then**: Builder in first slot, Tester in then slot
9. **Check With Me**: "Review the game before deploying"
10. **Deploy Web**

This produces a ProjectSpec with sequential flow, a human gate before deploy, two minions, and a web deployment target.
