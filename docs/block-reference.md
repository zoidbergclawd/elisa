# Block Reference

Complete guide to Elisa's 8-category block palette. Blocks snap together on the canvas to produce a [ProjectSpec](api-reference.md#projectspec-schema) that drives the build.

Categories: [Goals](#goals) | [Requirements](#requirements) | [Style](#style) | [Skills](#skills) | [Portals](#portals) | [Minions](#minions) | [Flow](#flow) | [Deploy](#deploy)

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

Reusable prompt snippets and rules that extend agent capabilities. Both blocks are in the Skills toolbox category.

| Block | Fields | ProjectSpec Output |
|-------|--------|--------------------|
| **Use Skill** | `SKILL_ID` (dropdown, dynamically populated) | `skills[]` |
| **Apply Rule** | `RULE_ID` (dropdown, dynamically populated) | `rules[]` |

Skills are created in the Skills & Rules modal. Each skill has a name, prompt, and category (`agent`, `feature`, or `style`). Rules have a name, prompt, and trigger (`always`, `on_task_complete`, `on_test_fail`, `before_deploy`).

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
