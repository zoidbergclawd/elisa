# Block Reference

Complete guide to Elisa's block palette. Blocks snap together on the canvas to produce a [NuggetSpec](api-reference.md#nuggetspec-schema) that drives the build.

**6 Primitives**: [Goal](#goal) | [Promise](#promise) | [Proof](#proof) | [Skill](#skill) | [Portal](#portal) | [Deploy](#deploy)

**Other**: [Skill Flow](#skill-flow) | [Devices](#devices)

---

## Goal

Define what you're building. Every project needs at least one Goal block.

| Block | Fields | NuggetSpec Output |
|-------|--------|--------------------|
| **Nugget Goal** | `GOAL_TEXT` (text input) | `nugget.goal`, `nugget.description` |
| **Nugget Template** | `TEMPLATE_TYPE` (dropdown) | `nugget.type` |
| **Write Guide** | `GUIDE_FOCUS` (dropdown) | `documentation.generate`, `documentation.focus` |

**Template types**: `game`, `website`, `hardware`, `story`, `tool`

**Guide focus options**: `how_it_works`, `setup`, `parts`, `all`

---

## Promise

The commitments and constraints the agent must honor. Promises are "always-true" rules.

| Block | Fields | NuggetSpec Output |
|-------|--------|--------------------|
| **Feature** | `FEATURE_TEXT` (text), `TEST_SOCKET` (proof receptacle) | `requirements[]` with `type: "feature"` |
| **Constraint** | `CONSTRAINT_TEXT` (text) | `requirements[]` with `type: "constraint"` |
| **When/Then** | `TRIGGER_TEXT`, `ACTION_TEXT` (text), `TEST_SOCKET` (proof receptacle) | `requirements[]` with `type: "when_then"` |
| **Has Data** | `DATA_TEXT` (text), `TEST_SOCKET` (proof receptacle) | `requirements[]` with `type: "data"` |

Feature, When/Then, and Has Data blocks contain receptacles where Proof blocks nest inside them to verify the promise.

---

## Proof

Verifiable assertions that a Promise was kept. Proof blocks nest inside Promise blocks via the `TEST_SOCKET` receptacle.

| Block | Fields | NuggetSpec Output |
|-------|--------|--------------------|
| **Proof** | `GIVEN_WHEN` (text), `THEN` (text) | `workflow.behavioral_tests[]` with `when`, `then`, `requirement_id` |

When a Proof is attached to a Promise block, its `requirement_id` links it to that promise's entry in the spec.

**Example**: Attaching a Proof with "the user clicks play" / "the game starts" to a Feature block produces `{ id: "test_0", when: "the user clicks play", then: "the game starts", requirement_id: "req_0" }`.

---

## Skill

Reusable multi-step behaviors. Created in the Skills modal (wrench icon in sidebar). Includes shipped style skills (Fun & Colorful, Clean & Simple, Dark & Techy, Nature, Space).

| Block | Fields | NuggetSpec Output |
|-------|--------|--------------------|
| **Use Skill** | `SKILL_ID` (dropdown, dynamically populated) | `skills[]` |

Each skill has a name, prompt, and category (`agent`, `feature`, `style`, or `composite`). Simple skills contain a prompt template. Composite skills use the flow editor (see [Skill Flow](#skill-flow)).

---

## Portal

The agent's interface to the outside world -- tools, APIs, hardware, knowledge bases, and devices. Portal dropdowns are dynamically populated from configured portals.

| Block | Fields | NuggetSpec Output |
|-------|--------|--------------------|
| **Tell** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to actions), plus dynamic `PARAM_*` fields | `portals[]` with interaction `type: "tell"` |
| **When** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to events), `ACTION_BLOCKS` (statement slot), plus dynamic `PARAM_*` fields | `portals[]` with interaction `type: "when"` |
| **Ask** | `PORTAL_ID` (dropdown), `CAPABILITY_ID` (dropdown, filtered to queries), plus dynamic `PARAM_*` fields | `portals[]` with interaction `type: "ask"` |

**Tell** sends a one-shot command to a portal. **When** reacts to portal events. **Ask** queries a portal for data. Parameter fields are added dynamically based on the selected capability.

---

## Deploy

Where and how the agent ships.

| Block | NuggetSpec Output |
|-------|--------------------|
| **Deploy Web** | `deployment.target: "web"` |
| **Deploy ESP32** | `deployment.target: "esp32"` |
| **Deploy Both** | `deployment.target: "both"` |

If no deploy block is placed, defaults to `"preview"`.

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

### Branch Behavior

`If` blocks have no else branch. To handle multiple cases, chain multiple `If` blocks. All `If` blocks are evaluated independently (not mutually exclusive).

---

## Devices

Device blocks are loaded dynamically from plugins in the `devices/` folder. They are a Portal sub-type (hardware interfaces).

| Block | Plugin | Fields |
|-------|--------|--------|
| **Heltec Blink** | heltec-blink | Speed: Normal / Fast / Slow |
| **Sensor Node** | heltec-sensor-node | DHT22 (checkbox), Reed Switch (checkbox), PIR (checkbox), OLED (checkbox), LoRa Channel (number), Interval in seconds (number) |
| **Gateway Node** | heltec-gateway | LoRa Channel (number), WiFi SSID (text), WiFi Password (text) |
| **Cloud Dashboard** | cloud-dashboard | GCP Project ID (text) |
| **S3 BOX Voice Agent** | esp32-s3-box3-agent | Agent Name (text), Wake Word (dropdown), Voice (dropdown), WiFi Network (text), WiFi Password (text) |
| **BOX Display** | esp32-s3-box3-agent | Theme (dropdown), Show listening indicator (checkbox), Show transcription (checkbox) |

Device blocks produce `devices` entries in the NuggetSpec, which are processed by the corresponding plugin during the deploy phase.

For details on each plugin, see the [Device Plugins guide](device-plugins.md). To create your own plugins, see [Creating Device Plugins](creating-device-plugins.md).

---

## Example Composition

A simple game project might use:

1. **Nugget Goal**: "A space invaders game"
2. **Nugget Template**: `game`
3. **Feature**: "Three lives and a score counter"
4. **Feature**: "Increasing difficulty each wave"
5. **Use Skill**: retro arcade style (shipped skill)
6. **Proof** (nested in Feature): "when all lives are lost" / "game over screen shows"
7. **Deploy Web**

This produces a NuggetSpec with two promises (features), a proof, a skill, and a web deployment target.
