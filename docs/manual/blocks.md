# Blocks

Blocks are the building pieces of your Elisa project. Drag them from the toolbox onto the canvas and snap them together to describe what you want to build. The toolbox has 9 categories.

---

## Goals

Define what you are building. Every project needs at least one Goal block.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Goal** | "I want to build..." | `GOAL_TEXT` (text) | Sets the main goal for your project. This is the only required block. |
| **Template** | "Start from a template:" | `TEMPLATE_TYPE` (dropdown) | Picks a project type to start from. Options: Game, Website, Hardware Nugget, Story, Tool. |

---

## Requirements

Describe what your project should do and what it should not do.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Feature** | "It should be able to..." | `FEATURE_TEXT` (text) | Adds a feature your project needs. |
| **Constraint** | "Make sure it doesn't..." | `CONSTRAINT_TEXT` (text) | Adds something your project should avoid. |
| **When/Then** | "When ___ happens, ___ should happen" | `TRIGGER_TEXT`, `ACTION_TEXT` (text) | Describes a cause-and-effect behavior. |
| **Has Data** | "It needs to know about..." | `DATA_TEXT` (text) | Tells the agents about data your project needs. |

---

## Style

Control how your project looks and feels.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Look Like** | "Make it look..." | `STYLE_PRESET` (dropdown) | Picks a visual style. Options: Fun & Colorful, Clean & Simple, Dark & Techy, Nature, Space. |
| **Personality** | "Give it a personality that's..." | `PERSONALITY_TEXT` (text) | Sets the tone and personality of your project. |

---

## Skills

Use skills you have created in the Skills editor.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Use Skill** | "Use skill:" | `SKILL_ID` (dropdown) | Includes a skill from your library. The dropdown lists all skills you have created. Shows "(no skills yet)" if none exist. |

Create skills first using the Skills button in the sidebar. See [Skills](skills.md).

---

## Rules

Apply rules you have created in the Rules editor.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Apply Rule** | "Apply rule:" | `RULE_ID` (dropdown) | Includes a rule from your library. The dropdown lists all rules you have created. Shows "(no rules yet)" if none exist. |

Create rules first using the Rules button in the sidebar. See [Rules](rules.md).

---

## Portals

Connect to external tools and hardware. The dropdowns are populated from portals you have configured.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Tell** | "Tell ___ to ___" | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns), plus dynamic parameter fields | Sends a one-shot command to a portal. Example: "Tell LED Strip to set_color". |
| **When** | "When ___ ___" | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns), `ACTION_BLOCKS` (slot for nested blocks), plus dynamic parameter fields | Reacts to a portal event. Example: "When Button pressed, do...". |
| **Ask** | "Ask ___ for ___" | `PORTAL_ID`, `CAPABILITY_ID` (dropdowns), plus dynamic parameter fields | Queries a portal for data. Example: "Ask Sensor for temperature". |

Parameter fields appear dynamically based on the selected capability. Configure portals first using the Portals button in the sidebar. See [Portals](portals.md).

---

## Minions

Configure the AI agents that will build your project. If you do not add any Minion blocks, Elisa uses default agents.

| Block | What it says | Fields | What it does |
|-------|-------------|--------|-------------|
| **Builder Minion** | "Add a Builder Minion named ___ who is ___" | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a builder agent. Builders write code. |
| **Tester Minion** | "Add a Tester Minion named ___ who is ___" | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a tester agent. Testers check that code works. |
| **Reviewer Minion** | "Add a Reviewer Minion named ___ who focuses on ___" | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a reviewer agent. Reviewers check code quality. |
| **Custom Minion** | "Add a Custom Minion named ___ who ___" | `AGENT_NAME`, `AGENT_PERSONA` (text) | Adds a custom agent with any role you describe. |

The persona field shapes how the minion behaves. For example, a Builder named "SpeedBot" with persona "writes minimal, fast code" will code differently than one with persona "a careful coder who adds lots of comments".

---

## Flow

Control the order in which things happen. These are container blocks -- they hold other blocks inside them.

| Block | What it says | Inputs | What it does |
|-------|-------------|--------|-------------|
| **First/Then** | "First do ___ Then do ___" | Two statement slots | Runs the first group of blocks before the second group. |
| **At Same Time** | "Do these at the same time" | One statement slot | Runs all contained blocks in parallel (at the same time). |
| **Keep Improving** | "Keep improving until..." | `CONDITION_TEXT` (text) | Loops until a condition is met. |
| **Check With Me** | "Check with me before..." | `GATE_DESCRIPTION` (text) | Pauses the build and asks you for approval before continuing. |
| **Timer Every** | "Every ___ seconds" | `INTERVAL` (number, default 5), `ACTION_BLOCKS` (statement slot) | Runs contained blocks on a recurring timer. |

---

## Deploy

Choose where your finished project goes.

| Block | What it says | What it does |
|-------|-------------|-------------|
| **Deploy Web** | "Put it on the web" | Opens your project in a web browser preview. |
| **Deploy ESP32** | "Flash it to my board" | Compiles and flashes MicroPython code to a connected ESP32 board. |
| **Deploy Both** | "Web dashboard + hardware" | Does both: web preview and hardware flash. |

If you do not add a Deploy block, Elisa defaults to a local preview.

---

## Example composition

A simple game project might use these blocks snapped together from top to bottom:

1. **Goal**: "A space invaders game"
2. **Template**: Game
3. **Feature**: "Three lives and a score counter"
4. **Feature**: "Increasing difficulty each wave"
5. **Look Like**: Space
6. **Builder Minion**: name "GameDev", persona "writes clean HTML5 canvas games"
7. **Tester Minion**: name "QA", persona "tests edge cases thoroughly"
8. **Check With Me**: "Review the game before deploying"
9. **Deploy Web**
