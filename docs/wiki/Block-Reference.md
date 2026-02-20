# Block Reference

Blocks are the building pieces of your Elisa project. Drag them from the toolbox onto the canvas and snap them together to describe what you want to build. The toolbox has 10 categories.

## Goals

Define what you're building. Every project needs at least one Goal block.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Nugget Goal** | `GOAL_TEXT` (text input) | Sets the main goal for your project. This is the only required block. |
| **Nugget Template** | `TEMPLATE_TYPE` (dropdown) | Picks a project type: Game, Website, Hardware Nugget, Story, Tool. |

## Requirements

Describe what the project should do.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Feature** | `FEATURE_TEXT` (text) | Adds a feature your project needs. "It should be able to..." |
| **Constraint** | `CONSTRAINT_TEXT` (text) | Adds something your project should avoid. "Make sure it doesn't..." |
| **When/Then** | `TRIGGER_TEXT`, `ACTION_TEXT` (text) | Describes cause-and-effect behavior. "When ___ happens, ___ should happen" |
| **Has Data** | `DATA_TEXT` (text) | Tells agents about data your project needs. "It needs to know about..." |

## Style

Control the look and personality of the output.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Look Like** | `STYLE_PRESET` (dropdown) | Picks a visual style: Fun & Colorful, Clean & Simple, Dark & Techy, Nature, Space |
| **Personality** | `PERSONALITY_TEXT` (text) | Sets the tone and personality of your project |

## Skills

Reusable prompt snippets that extend agent capabilities. Created in the [Skills](Skills) modal.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Use Skill** | `SKILL_ID` (dropdown) | Includes a skill from your library. Shows "(no skills yet)" if none exist. |

## Rules

Guardrails that trigger automatically during builds. Created in the [Rules](Rules) modal.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Apply Rule** | `RULE_ID` (dropdown) | Includes a rule from your library. Shows "(no rules yet)" if none exist. |

## Portals

Connect to external hardware and services. Dropdowns are populated from configured [portals](Portals).

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Tell** | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns) + dynamic params | Sends a one-shot command to a portal. "Tell LED Strip to set_color" |
| **When** | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns), `ACTION_BLOCKS` (slot) + dynamic params | Reacts to portal events. "When Button pressed, do..." |
| **Ask** | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns) + dynamic params | Queries a portal for data. "Ask Sensor for temperature" |

Parameter fields appear dynamically based on the selected capability.

## Minions

Configure the AI agents that will build your project. If no minion blocks are placed, defaults are used.

| Block | Role | Fields | What It Does |
|-------|------|--------|-------------|
| **Builder Minion** | builder | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a builder agent that writes code |
| **Tester Minion** | tester | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a tester agent that checks code works |
| **Reviewer Minion** | reviewer | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a reviewer agent that checks code quality |
| **Custom Minion** | custom | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a custom agent with any role you describe |

The persona field shapes the minion's behavior. Example: a Builder named "SpeedBot" with persona "writes minimal, fast code" will code differently than one with persona "a careful coder who adds lots of comments".

## Flow

Control execution order. These are container blocks that hold other blocks inside them.

| Block | Inputs | What It Does |
|-------|--------|-------------|
| **First/Then** | `FIRST_BLOCKS`, `THEN_BLOCKS` (statement slots) | Runs first group before second group |
| **At Same Time** | `PARALLEL_BLOCKS` (statement slot) | Runs all contained blocks concurrently |
| **Keep Improving** | `CONDITION_TEXT` (text) | Loops until a condition is met |
| **Check With Me** | `GATE_DESCRIPTION` (text) | Pauses the build and asks for your approval |
| **Timer Every** | `INTERVAL` (number), `ACTION_BLOCKS` (statement slot) | Runs contained blocks on a recurring interval |

## Deploy

Choose where the built project gets deployed.

| Block | What It Does |
|-------|-------------|
| **Deploy Web** | Opens your project in a web browser preview |
| **Deploy ESP32** | Compiles and flashes MicroPython code to a connected ESP32 board |
| **Deploy Both** | Web preview and hardware flash |

If no deploy block is placed, defaults to local preview.

## Skill Flow

Visual flow editor for composite [skills](Skills). These blocks are used inside the Skill Flow Editor, not on the main canvas.

| Block | Fields | What It Does |
|-------|--------|-------------|
| **Skill Flow** | *(none)* | Entry point. Must be first block in every flow. |
| **Ask User** | `QUESTION`, `HEADER`, `OPTIONS`, `STORE_AS` | Pauses and asks user a question. Stores answer in context. |
| **If** | `CONTEXT_KEY`, `MATCH_VALUE`, `THEN_BLOCKS` | Branch on context value. Runs nested blocks only if value matches. |
| **Run Skill** | `SKILL_ID`, `STORE_AS` | Invokes another skill. Stores output in context. |
| **Run Agent** | `PROMPT`, `STORE_AS` | Spawns a Claude agent. Stores result in context. |
| **Set Context** | `KEY`, `VALUE` | Sets a context variable |
| **Output** | `TEMPLATE` | Produces final output of the flow. Terminal block. |

Use `{{key}}` syntax in text fields to reference context values from previous steps.

## Example Composition

A simple game project might use these blocks snapped together:

1. **Goal**: "A space invaders game"
2. **Template**: Game
3. **Feature**: "Three lives and a score counter"
4. **Feature**: "Increasing difficulty each wave"
5. **Look Like**: Space
6. **Builder Minion**: name "GameDev", persona "writes clean HTML5 canvas games"
7. **Tester Minion**: name "QA", persona "tests edge cases thoroughly"
8. **Check With Me**: "Review the game before deploying"
9. **Deploy Web**
