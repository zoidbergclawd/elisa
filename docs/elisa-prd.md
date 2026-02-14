# Elisa — Product Requirements Document

## A Kid-Friendly IDE for Orchestrating AI Agents

**Version:** 1.0
**Author:** Jon (with Claude)
**Date:** February 10, 2026
**Hackathon:** Built with Opus 4.6 — Claude Code Hackathon (Feb 10–16, 2026)

---

## 1. Vision & Problem Statement

### The Problem

Natural language programming is often described as "democratized" — but it isn't. When an experienced engineer uses Claude Code, they're unconsciously applying decades of mental models: decomposition, sequencing, specification, iteration, architecture, testing, and quality control. A 12-year-old doesn't have these mental models yet.

Meanwhile, tools like Scratch proved that block-based visual programming can teach kids real computer science concepts (loops, conditionals, variables) by abstracting away syntax and making the building blocks visible and tangible.

**No one has built the Scratch equivalent for AI agent orchestration.** The two worlds remain separate:

- Kid-friendly tools (Scratch, Teachable Machine, PictoBlox) teach kids *about* AI concepts using traditional programming as the medium.
- No-code agent builders (Flowise, n8n, Langflow, Lindy) let adults orchestrate LLM agents visually, but with enterprise UX — node graphs, API configurations, JSON schemas.

Kids are either coding traditionally (with AI as a feature) or passively consuming AI (as a chatbot). Nobody is putting kids in the **director's chair** — letting them orchestrate AI agent teams to build real things.

### The Vision

**Elisa** is a kid-friendly IDE where children orchestrate AI agent teams using a Scratch-style block interface. Kids snap together visual blocks that describe *what* they want to build and *how* they want their agent team to work. Behind the scenes, these blocks translate into structured prompts that drive Claude Code agent execution. The output is real, working software — deployed to a website or flashed to an ESP32 microcontroller.

Elisa is simultaneously a **teaching tool** and a **doing tool**. At every step, it explains engineering concepts (source control, testing, decomposition, code review) in kid-friendly language — not as a separate lesson, but woven into the act of building.

### Hackathon Problem Statement Alignment

**Problem Statement Two: Break the Barriers** — Expert knowledge, essential tools, AI's benefits — take something powerful that's locked behind expertise, cost, language, or infrastructure and put it in everyone's hands.

Elisa takes the power of multi-agent AI orchestration — currently accessible only to experienced engineers — and puts it in the hands of children.

---

## 2. Target Users

### Primary: Kids (Ages 8–14)

- Familiar with Scratch or similar block-based coding
- Curious about making things (games, websites, hardware projects)
- May have zero programming experience beyond Scratch
- Learn best by doing, not reading

### Secondary: Parents & Educators

- Want to introduce kids to AI, engineering concepts, and maker culture
- May not be engineers themselves
- Value tools that are safe, educational, and produce tangible results

---

## 3. Core Concepts & Architecture

### 3.1 The Three Pillars

#### Pillar 1: Build (The Block Canvas)

The primary interface. Kids drag blocks from a palette and snap them together to describe their project. Block compositions are internally translated into structured agent instructions.

**This is NOT traditional block-based programming.** Kids are not writing loops and conditionals. They are composing high-level *intent*, *constraints*, and *workflow patterns* that get translated into prompts for AI agents. The blocks represent **prompting patterns and agentic workflows** — delegation, specification, iteration, quality control.

#### Pillar 2: Learn (The Teaching Layer)

At every stage of the build process, Elisa explains what's happening and why using kid-friendly language, analogies, and visuals. Concepts are introduced *when they become relevant* — not as separate lessons but as contextual teaching moments woven into the workflow.

#### Pillar 3: Ship (Deployment Targets)

The output isn't just code on a screen. It goes somewhere real:
- A **website** the kid can share with friends/family
- An **ESP32 microcontroller** that does something physical — LEDs blink, sensors read, LoRa messages transmit

This closes the loop from idea → agents → working thing.

### 3.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Block    │  │  Agent       │  │  Output           │  │
│  │  Canvas   │  │  Dashboard   │  │  Preview          │  │
│  │ (Blockly) │  │  (Status,    │  │  (iframe /        │  │
│  │          │  │   Comms,      │  │   hardware        │  │
│  │          │  │   Metrics)    │  │   status)         │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Teaching Sidebar (contextual explainers)         │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  GitHub Timeline (simplified commit history)      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │ WebSocket
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND (Express 5)                      │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │  Block        │  │  Agent         │  │  GitHub      │  │
│  │  Interpreter  │  │  Orchestrator  │  │  Integration │  │
│  │  (blocks →    │  │  (manages      │  │  (commits,   │  │
│  │   prompts)    │  │   Claude Code  │  │   history)   │  │
│  │              │  │   subprocesses)│  │              │  │
│  └──────────────┘  └────────────────┘  └─────────────┘  │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐  │
│  │  Teaching     │  │  Test          │  │  Hardware    │  │
│  │  Engine       │  │  Runner        │  │  Deployer    │  │
│  │  (contextual  │  │  (pytest,      │  │  (ESP32      │  │
│  │   explainers) │  │   coverage)    │  │   flash)     │  │
│  └──────────────┘  └────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow: Blocks → Agents → Output

```
Kid snaps blocks together
        │
        ▼
Block Interpreter converts block tree to JSON spec:
{
  "goal": "Build a LoRa doorbell",
  "requirements": ["when button pressed, send message", "receiver blinks LED"],
  "style": "fun and colorful",
  "hardware_target": "esp32_lora",
  "agent_team": {
    "builder": { "persona": "friendly coder" },
    "tester": { "persona": "careful checker" }
  },
  "testing": ["test button triggers message", "test LED blinks on receive"],
  "review": true
}
        │
        ▼
Meta-Planner (Opus 4.6) decomposes into task DAG:
- Task 1: Set up LoRa communication (no deps)
- Task 2: Implement button handler (depends on 1)
- Task 3: Implement LED blink on receive (depends on 1)
- Task 4: Integration test (depends on 2, 3)
        │
        ▼
Agent Orchestrator assigns tasks to agents, manages execution via
Claude Code subprocesses, streams status to frontend via WebSocket
        │
        ▼
Each agent commit goes to GitHub → kid sees simplified timeline
Tests run → kid sees green/red checks
Code compiles → flashes to ESP32 → LED blinks in real life
```

---

## 4. Block System Design

### 4.1 Block Categories

Blocks are organized into categories with distinct colors (following Scratch's color-coding convention). Each block has a friendly icon, a simple label, and optional configuration fields.

#### 🎯 Goal Blocks (Blue) — "What do you want to make?"

The starting point of every project. Every project must have exactly one goal block.

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `project_goal` | "I want to build..." | Free text description + optional template selector | Top-level project description in the agent prompt |
| `project_template` | "Start from a template" | Dropdown: Game, Website, Hardware Project, Story, Tool | Pre-populated goal + requirements based on template |

**Templates** provide scaffolding for common project types:
- **Game:** "A browser game where..." (pre-adds testing blocks, web deploy target)
- **Website:** "A website about..." (pre-adds style blocks, web deploy target)
- **Hardware Project:** "An ESP32 project that..." (pre-adds hardware blocks, ESP32 deploy target)
- **Story Generator:** "A story about..." (pre-adds creative blocks)

#### 📝 Requirement Blocks (Green) — "Make sure it has..."

These snap onto a Goal block (or onto each other) to add specifications. Multiple can be chained.

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `feature` | "It should be able to..." | Free text description | Feature requirement in the spec |
| `constraint` | "Make sure it doesn't..." | Free text description | Negative constraint / guardrail |
| `when_then` | "When [X] happens, [Y] should happen" | Two text fields: trigger, action | Event-driven requirement |
| `has_data` | "It needs to know about..." | Text field + optional file upload | Data/content requirement |

#### 🎨 Style Blocks (Purple) — "Make it look/feel like..."

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `look_like` | "Make it look..." | Dropdown presets: Fun & Colorful, Clean & Simple, Dark & Techy, Nature, Space, Custom | Design direction in agent prompt |
| `personality` | "Give it a personality that's..." | Free text or presets: Friendly, Funny, Serious, Mysterious | Tone/voice for any generated content |

#### 🤖 Agent Blocks (Orange) — "Who does the work?"

These define the agent team composition. If no agent blocks are used, Elisa picks a default team.

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `agent_builder` | "Add a builder who..." | Name field, persona description, optional specialty | Agent definition with system prompt customization |
| `agent_tester` | "Add a tester who..." | Name field, testing style (careful, quick, thorough) | Test agent with persona |
| `agent_reviewer` | "Add a reviewer who..." | Name field, review focus (bugs, style, simplicity) | Review agent with persona |
| `agent_custom` | "Add a helper who..." | Name, role description, what they're responsible for | Custom agent role |

**Default team (if no agent blocks used):**
- Builder Bot (friendly, writes code)
- Test Bot (careful, checks everything)
- Review Bot (helpful, suggests improvements)

#### ⚡ Flow Blocks (Yellow) — "In what order?"

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `first_then` | "First... Then..." | Ordering container — blocks snapped inside execute sequentially | Sequential task dependencies |
| `at_same_time` | "Do these at the same time" | Parallel container — blocks inside execute concurrently | Parallel task execution |
| `keep_improving` | "Keep improving until..." | Stop condition (text field or preset: "all tests pass", "I'm happy with it") | Iteration loop with exit criteria |
| `check_with_me` | "Check with me before..." | What to check: "moving on", "deploying", "changing the design" | Human-in-the-loop gate |

#### 🔧 Hardware Blocks (Red) — "Make real things happen"

These are only available when the hardware target is ESP32.

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `led_control` | "Turn LED..." | On/Off/Blink, which LED (built-in or pin number), blink speed | GPIO output code generation |
| `button_input` | "When button is pressed..." | Which pin, what should happen (container for action blocks) | GPIO input + interrupt handler |
| `sensor_read` | "Read the..." | Sensor type dropdown: temperature, light, motion, custom | Sensor reading code |
| `lora_send` | "Send a message..." | Message content (text field or variable), channel | LoRa TX code |
| `lora_receive` | "When a message arrives..." | Channel, what to do (container for action blocks) | LoRa RX handler |
| `timer_every` | "Every [X] seconds..." | Interval, action container | Timer-based polling loop |
| `buzzer_play` | "Play a sound..." | Tone presets or frequency, duration | Buzzer/piezo output |

#### 🚀 Deploy Blocks (Teal) — "Where does it go?"

| Block | Label | Configuration | Translates To |
|-------|-------|---------------|---------------|
| `deploy_web` | "Put it on the web" | Optional: custom name for the site | Web deployment target |
| `deploy_esp32` | "Flash it to my board" | Board type (ESP32 LoRa), COM port auto-detect | ESP32 compilation + flash |
| `deploy_both` | "Web dashboard + hardware" | Combines web + ESP32 | Full-stack IoT deployment |

### 4.2 Block Composition Rules

- Every project starts with exactly **one Goal block**
- Requirement, Style, Agent, Flow, Hardware, and Deploy blocks snap onto the Goal block or onto each other
- Flow blocks (first_then, at_same_time) are **containers** — other blocks snap inside them
- Hardware blocks are only available when the deploy target includes ESP32
- If no Agent blocks are used, Elisa auto-selects a default team
- If no Deploy block is used, output renders in the preview pane only
- If no Flow blocks are used, Elisa determines sequencing automatically
- Invalid combinations show a gentle error: "Hmm, that doesn't quite work — try this instead!" with a suggestion

### 4.3 Block-to-Prompt Translation Pipeline

This is the critical under-the-hood engineering. Each block tree gets serialized to a JSON spec, which then gets translated into structured prompts for the meta-planner and individual agents.

**Step 1: Block Tree → JSON Spec**

```javascript
// Example block tree:
// Goal: "Build a LoRa doorbell"
//   ├── Feature: "when button pressed, send message"
//   ├── Feature: "receiver blinks LED and buzzes"
//   ├── Style: "Fun & Colorful"
//   ├── Agent: Builder named "Sparky" who "loves hardware projects"
//   ├── Agent: Tester named "Checkers" who "is very thorough"
//   ├── Hardware: button_input on pin 12
//   ├── Hardware: led_control on built-in LED
//   ├── Hardware: lora_send "doorbell!"
//   ├── Hardware: lora_receive → buzzer_play
//   └── Deploy: deploy_esp32

// Translates to:
{
  "project": {
    "goal": "Build a LoRa doorbell",
    "description": "A two-device system where pressing a button on one ESP32 sends a LoRa message to another ESP32 which blinks an LED and plays a buzzer sound",
    "type": "hardware"
  },
  "requirements": [
    { "type": "feature", "description": "When button on pin 12 is pressed, send LoRa message 'doorbell!'" },
    { "type": "feature", "description": "When LoRa message received, blink built-in LED and play buzzer" }
  ],
  "style": {
    "visual": "fun_colorful",
    "personality": null
  },
  "agents": [
    { "name": "Sparky", "role": "builder", "persona": "Loves hardware projects, writes clean Arduino code" },
    { "name": "Checkers", "role": "tester", "persona": "Very thorough, tests every edge case" }
  ],
  "hardware": {
    "target": "esp32_lora",
    "components": [
      { "type": "button_input", "pin": 12 },
      { "type": "led_control", "target": "built_in" },
      { "type": "lora_send", "message": "doorbell!" },
      { "type": "lora_receive", "action": "buzzer_play" }
    ]
  },
  "deployment": {
    "target": "esp32",
    "auto_flash": true
  },
  "workflow": {
    "review_enabled": true,
    "testing_enabled": true,
    "human_gates": []
  }
}
```

**Step 2: JSON Spec → Meta-Planner Prompt**

The meta-planner prompt is sent to Opus 4.6 to decompose the spec into a task DAG and finalize agent assignments.

```
You are the project planner for Elisa, a kid-friendly AI building tool.

Given the following project specification, produce:
1. A DAG of implementation tasks with:
   - Unique task IDs
   - Clear, specific descriptions
   - Acceptance criteria (what "done" looks like)
   - Dependencies (which tasks must complete first)
   - Estimated complexity (simple, medium, complex)
   - Suggested agent assignment

2. A finalized agent team with:
   - Name and role for each agent
   - System prompt customization based on the kid's persona description
   - File/directory boundaries (which files each agent can touch)

3. A rationale (in kid-friendly language) explaining:
   - Why you broke the project into these pieces
   - Why you assigned tasks the way you did
   - What the critical path is (in simple terms: "this is the part that takes longest")

Rules:
- Tasks should be small enough that each takes 1-5 minutes for an agent to complete
- Every task must have at least one acceptance criterion
- Hardware tasks should include compilation verification
- Test tasks should produce runnable test cases
- The first task should always be project scaffolding / setup

Project Specification:
{json_spec}
```

**Step 3: Task Prompts → Individual Agents**

Each agent gets a task prompt constructed from:
- Their persona (from agent blocks)
- The task description and acceptance criteria
- Context about what predecessor agents did (summaries of their work)
- File boundaries (what they can and can't touch)
- The project's style/personality requirements

```
You are {agent_name}, a {agent_role} working on a kid's project in Elisa.

Your personality: {agent_persona}

PROJECT CONTEXT:
{project_summary}

YOUR TASK:
{task_description}

ACCEPTANCE CRITERIA:
{acceptance_criteria}

WHAT HAPPENED BEFORE YOU:
{predecessor_summaries}

FILES YOU CAN WORK WITH:
{file_boundaries}

RULES:
- Write clean, well-commented code
- Comments should be understandable by a beginner
- If you're unsure about something, note it clearly
- When you're done, write a brief summary of what you did and any decisions you made
- Commit your work with a clear, kid-friendly commit message

STYLE GUIDANCE:
{style_requirements}
```

---

## 5. Agent Orchestration System

### 5.1 Orchestration Architecture

The orchestrator manages the lifecycle of a build session:

```
┌─────────────────────────────────────────┐
│           Build Session                  │
│                                          │
│  State: idle → planning → executing      │
│         → testing → deploying → done     │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Task DAG (from Meta-Planner)    │   │
│  │  - TopologicalSorter manages     │   │
│  │    execution order               │   │
│  │  - Ready queue = tasks with      │   │
│  │    all deps satisfied            │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Agent Pool                      │   │
│  │  - Each agent = Claude Code      │   │
│  │    subprocess with custom        │   │
│  │    system prompt                 │   │
│  │  - Max parallel agents = 3      │   │
│  │    (configurable)               │   │
│  └──────────────────────────────────┘   │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Event Stream (WebSocket)        │   │
│  │  - task_started                  │   │
│  │  - agent_output (streaming)      │   │
│  │  - task_completed                │   │
│  │  - test_result                   │   │
│  │  - commit_created                │   │
│  │  - teaching_moment               │   │
│  │  - error                         │   │
│  │  - human_gate (pause for input) │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 5.2 Agent Execution Model

Each agent runs as a **Claude Code CLI subprocess**. The orchestrator:

1. Constructs the system prompt from persona + task + context
2. Spawns `claude` CLI process with the prompt
3. Captures stdout/stderr for streaming to the frontend
4. Monitors for completion (exit code + output analysis)
5. On completion: extracts summary, triggers git commit, marks task done, updates DAG
6. On failure: retries up to 2 times, then escalates to human gate

**Agent-to-Agent Communication:**

Agents communicate through structured files in the project workspace:

```
/project/
├── .elisa/
│   ├── comms/
│   │   ├── task_1_summary.md    # Written by completing agent
│   │   ├── task_2_summary.md
│   │   └── reviews/
│   │       └── task_2_review.md  # Written by reviewer agent
│   ├── context/
│   │   └── project_context.md    # Updated by orchestrator after each task
│   └── status/
│       └── current_state.json    # Machine-readable project state
├── src/
│   └── ...                       # Actual project code
├── tests/
│   └── ...                       # Test files
└── README.md
```

When Agent B starts a task that depends on Agent A's completed task, the orchestrator:
1. Reads Agent A's summary from `.elisa/comms/task_N_summary.md`
2. Injects it into Agent B's prompt as "WHAT HAPPENED BEFORE YOU"
3. Updates `.elisa/context/project_context.md` with cumulative state

### 5.3 Coordination Patterns

**Sequential:** Tasks execute one after another based on DAG ordering. Default for dependent tasks.

**Parallel:** Independent tasks (no shared dependencies) can run simultaneously. The orchestrator detects these automatically from the DAG. Max 3 parallel agents to manage cost/complexity.

**Review Loop:** When a review agent is defined:
1. Builder agent completes task
2. Reviewer agent gets the code + task spec
3. Reviewer writes feedback to `.elisa/comms/reviews/`
4. If reviewer finds issues → builder gets a revision task
5. If reviewer approves → task marked complete

**Human Gate:** When a `check_with_me` block is used:
1. Agent completes its work
2. Orchestrator pauses and sends `human_gate` event to frontend
3. Frontend shows the kid what was done, asks "Does this look good?"
4. Kid approves → execution continues
5. Kid requests changes → new task generated with kid's feedback

### 5.4 Error Handling

| Error Type | Response |
|-----------|----------|
| Agent times out (>5 min) | Retry with simplified prompt; if still fails, show kid: "Your helper got stuck. Want to try a different approach?" |
| Agent produces invalid code | Run linter/compiler, feed errors back to agent for self-correction (max 2 retries) |
| Circular dependency detected | Show kid: "Oops, some tasks depend on each other in a circle. Let's untangle this." |
| Agent exceeds file boundaries | Reject the change, notify kid: "Sparky tried to edit a file that belongs to Checkers. We kept things safe." |
| Hardware compilation fails | Show error in kid-friendly terms: "The code doesn't work on your board yet. Your builder is fixing it..." |
| All retries exhausted | Pause with human gate: "We're having trouble with this part. Can you help us figure it out?" |

---

## 6. Teaching Layer

### 6.1 Teaching Philosophy

- **Just-in-time, not just-in-case.** Concepts are introduced when they become relevant, not in a separate tutorial.
- **Show, don't lecture.** Visual demonstrations > text explanations.
- **Use analogies kids know.** LEGO, team sports, school projects, recipes.
- **Celebrate understanding.** When a kid interacts with a concept (clicks "show me more", answers a quiz), acknowledge it.
- **Never block progress.** Teaching moments are always optional — the kid can dismiss and keep building.

### 6.2 Concept Curriculum

These are the engineering concepts Elisa teaches, mapped to when they naturally arise:

#### Source Control (Git/GitHub)

**When it triggers:** When agents start committing code.

**Teaching moments:**

- *First commit:* "Your helpers are saving their work to a place called GitHub. Think of it like a shared notebook — everyone can see what changed and when. Each save is called a 'commit' — it's like a snapshot of your project at that moment."

- *Multiple commits:* "See how there are multiple saves? If something goes wrong, you can always go back to an earlier save. It's like having unlimited undos!"

- *Parallel agent work:* "Sparky and Checkers are working at the same time, so they each got their own copy to work on. When they're both done, we'll combine their work — that's called 'merging.' Sometimes their changes fit together perfectly, and sometimes we need to figure out which version to keep."

- *Commit messages:* "Notice how each save has a little note? 'Added LED blink code' or 'Fixed button timing.' These notes help everyone understand what changed. Good notes make it way easier to find things later."

**Visual:** Simplified GitHub timeline showing commits as colorful dots on a timeline, with agent avatars next to each commit and friendly commit messages.

#### Testing

**When it triggers:** When test agent runs, or when `keep_improving` block is used.

**Teaching moments:**

- *First test run:* "Before we send this to your board, let's make sure it works! Testing is like doing a practice run — you try everything in a safe place first so you don't break anything real."

- *Test passes:* "✅ Checkers confirmed: the LED turns on when you press the button! That's one less thing to worry about."

- *Test fails:* "❌ Hmm, Checkers found a problem: the LED stays on forever instead of blinking. Don't worry — that's exactly why we test! Sparky is fixing it now."

- *Test coverage:* "Right now, we've tested 4 out of 6 features. The more we test, the more confident we can be that everything works!"

**Visual:** Test results as a checklist with green checkmarks and red X's. Each item has a kid-friendly description. Coverage shown as a progress bar with a fun fill animation.

#### Decomposition

**When it triggers:** When the meta-planner breaks the project into tasks.

**Teaching moments:**

- *Task breakdown:* "Your project has a few parts — kind of like building with LEGO. You don't build the whole castle at once. You make the walls, then the towers, then the drawbridge, then you connect them all together. That's what your helpers are doing!"

- *Dependencies:* "Some parts need to be built before others. You can't put a roof on a house before the walls are up! See how Task 3 has to wait for Task 1? That's because it needs what Task 1 creates."

- *DAG visualization:* "This map shows all the pieces of your project and how they connect. The arrows mean 'this has to happen first.' Things on the same level can happen at the same time!"

**Visual:** The task DAG in the dashboard, with nodes representing tasks and arrows showing dependencies. Nodes light up as they progress.

#### Code Review

**When it triggers:** When a review agent examines another agent's work.

**Teaching moments:**

- *First review:* "Before we call this done, let's have someone double-check the work. It's like having a friend read your essay before you turn it in — they might catch things you missed!"

- *Review feedback:* "The reviewer found something: 'This code works, but it could be simpler.' Making code simpler is important because it's easier to fix later. Sparky is making the improvement now."

- *Review approval:* "The reviewer says it looks great! Getting a second opinion helps make sure everything is solid."

**Visual:** Review as a conversation between agent avatars — reviewer's comments shown as speech bubbles, builder's responses as replies.

#### Architecture & Design

**When it triggers:** When agents make structural decisions about the codebase.

**Teaching moments:**

- *File organization:* "Notice how your code is organized into different files? Each file has one job. It's like having different drawers in your desk — one for pencils, one for paper, one for art supplies. When everything has its place, it's easier to find what you need."

- *Separation of concerns:* "The code that handles the button is separate from the code that blinks the LED. That way, if you want to change how the LED blinks, you don't accidentally break the button!"

- *Interfaces:* "These two pieces of code need to talk to each other. They do it through a simple agreement: 'When I press the button, I'll send you this message. When you get it, blink the LED.' That agreement is called an interface."

#### Hardware Concepts (ESP32-specific)

**When it triggers:** When hardware blocks are used and code is deployed.

**Teaching moments:**

- *GPIO:* "GPIO stands for 'General Purpose Input/Output' — they're the pins on your board that can either send signals out (like turning on an LED) or read signals in (like checking if a button is pressed)."

- *LoRa:* "LoRa is a way for your boards to talk to each other wirelessly — even from really far away! It's like walkie-talkies for your electronics."

- *Compilation:* "Before your code can run on the ESP32, it needs to be translated into a language the chip understands. That's called compiling. It's like translating English into Spanish — same meaning, different language."

- *Flashing:* "Flashing means sending your compiled code to the board. It goes through the USB cable and gets stored in the board's memory. Once it's there, the board runs your code every time it turns on!"

### 6.3 Teaching UI Component

The teaching sidebar is a collapsible panel on the right side of the screen. It contains:

- **Current concept** — the active teaching moment with text, icon, and optional animation
- **"Tell me more" button** — expands with additional detail and analogies
- **"Show me" button** — highlights the relevant part of the dashboard
- **Concept log** — scrollable history of all teaching moments from this session
- **Mini-quiz** (optional) — simple "did you know?" style questions to reinforce concepts

Teaching moments appear with a gentle animation (slide in from right, soft chime sound) and auto-dismiss after 10 seconds if not interacted with. They never block the main workflow.

---

## 7. GitHub Integration

### 7.1 Repository Management

When a build session starts:

1. Elisa creates a new GitHub repository (or uses an existing one if provided)
2. Repository name is derived from the project goal: "elisa-lora-doorbell"
3. A README.md is auto-generated with the project description
4. The repo is initialized with a `.elisa/` directory for orchestration state

### 7.2 Commit Strategy

- Each agent commits after completing a task
- Commit messages are kid-friendly: "✨ Sparky added the LED blink code" not "feat: implement gpio output for led control"
- Commits are tagged with the agent name and task ID in metadata
- The orchestrator creates merge commits when parallel agent work is combined

### 7.3 Simplified GitHub View

The frontend shows a simplified version of the git history:

```
Timeline View:
────────────────────────────────────────────────
🔵 Sparky: "Set up the project files"          [2:14 PM]
🟢 Checkers: "Added tests for LoRa messages"   [2:15 PM]
🔵 Sparky: "Made the button work"               [2:16 PM]
🔵 Sparky: "Added LED blinking"                 [2:17 PM]
🟡 Reviewer: "Suggested simpler LED code"       [2:18 PM]
🔵 Sparky: "Made LED code simpler"              [2:18 PM]
🟢 Checkers: "All tests passing! ✅"            [2:19 PM]
────────────────────────────────────────────────
```

Each entry is clickable to show what files changed (as a simplified diff — "Added 12 lines to led.py, Changed 3 lines in main.py").

### 7.4 GitHub OAuth

For the hackathon, GitHub integration can work in two modes:

1. **Demo mode (default):** Elisa manages a local git repo and shows the timeline. No actual GitHub push required.
2. **Connected mode:** Kid (or parent) authenticates with GitHub OAuth. Repos are created under their account.

---

## 8. Hardware Integration (ESP32 LoRa)

### 8.1 Supported Board

For the hackathon, we support **one board**: Heltec WiFi LoRa 32 V3 (or similar ESP32 + LoRa dev board).

This board has:
- ESP32-S3 microcontroller
- LoRa SX1262 radio
- 0.96" OLED display
- Built-in LED
- USB-C for programming
- WiFi + Bluetooth

### 8.2 Hardware Abstraction Layer

Agents don't write raw register-level code. Instead, Elisa provides a curated library of abstractions that agents use:

```python
# elisa_hardware.py — simplified hardware library for kids' projects
# Agents are instructed to use these abstractions

from machine import Pin, SPI
from lora import LoRa

class ElisaBoard:
    def __init__(self):
        self.led = Pin(25, Pin.OUT)
        self.button = Pin(12, Pin.IN, Pin.PULL_UP)
        self.buzzer = Pin(13, Pin.OUT)
        self.lora = LoRa(spi=SPI(1), cs=Pin(18), reset=Pin(14))

    def led_on(self):
        self.led.value(1)

    def led_off(self):
        self.led.value(0)

    def led_blink(self, times=3, speed=0.5):
        for _ in range(times):
            self.led_on()
            time.sleep(speed)
            self.led_off()
            time.sleep(speed)

    def on_button_press(self, callback):
        self.button.irq(trigger=Pin.IRQ_FALLING, handler=callback)

    def send_message(self, message):
        self.lora.send(message.encode())

    def on_message(self, callback):
        self.lora.on_receive(callback)

    def play_tone(self, frequency=1000, duration=0.5):
        # PWM buzzer control
        ...

    def read_temperature(self):
        # If temp sensor attached
        ...
```

### 8.3 Build & Flash Pipeline

```
Agent writes MicroPython/Arduino code
        │
        ▼
Compilation check (platform-dependent):
  - MicroPython: syntax check + import validation
  - Arduino: arduino-cli compile
        │
        ▼
(Optional) Simulation / dry run
        │
        ▼
Flash to board:
  - MicroPython: ampy/mpremote upload
  - Arduino: arduino-cli upload
        │
        ▼
Verify: serial monitor check for expected output
        │
        ▼
Report to frontend: "Your code is running on the board! 🎉"
```

### 8.4 Serial Monitor Integration

The frontend includes a simplified serial monitor panel that shows output from the ESP32:

```
📡 Board Output:
────────────────
[2:20 PM] Board started! Running your code...
[2:20 PM] LoRa initialized on frequency 915MHz
[2:20 PM] Waiting for button press...
[2:21 PM] Button pressed! Sending message: "doorbell!"
[2:21 PM] Message sent ✅
```

This helps kids see that their code is actually running on real hardware.

---

## 9. Frontend Design

### 9.1 Layout

The UI is divided into a **three-panel layout** that can be resized:

```
┌─────────────────────────────────────────────────────────────────┐
│  Elisa ✨                    [My Projects] [Settings] [Help]    │
├────────────────┬──────────────────────────┬──────────────────────┤
│                │                          │                      │
│  BLOCK PALETTE │     BLOCK CANVAS         │   MISSION CONTROL    │
│                │                          │                      │
│  🎯 Goals      │   [Drag blocks here      │   ┌────────────────┐ │
│  📝 Features   │    to build your          │   │ Agent Team     │ │
│  🎨 Style      │    project!]              │   │ 🤖 Sparky: 💤  │ │
│  🤖 Agents     │                          │   │ 🧪 Checkers: 💤│ │
│  ⚡ Flow       │                          │   │ 👀 Review: 💤  │ │
│  🔧 Hardware   │                          │   └────────────────┘ │
│  🚀 Deploy     │                          │   ┌────────────────┐ │
│                │                          │   │ Task Map       │ │
│                │                          │   │  (mini DAG)    │ │
│                │                          │   └────────────────┘ │
│                │                          │   ┌────────────────┐ │
│                │                          │   │ Progress       │ │
│                │                          │   │ ████░░ 4/6     │ │
│                │                          │   └────────────────┘ │
│                │                          │   ┌────────────────┐ │
│                │                          │   │ Comms Feed     │ │
│                │                          │   │ 💬 💬 💬       │ │
│                │                          │   └────────────────┘ │
├────────────────┴──────────────────────────┴──────────────────────┤
│  [GitHub Timeline] [Test Results] [Board Output] [Learn 📚]     │
│  🔵 Sparky: "Set up project" → 🟢 Checkers: "Added tests" →    │
└─────────────────────────────────────────────────────────────────┘
                                    ┌──────────┐
                                    │ 🟢 GO!  │
                                    └──────────┘
```

### 9.2 State Machine

The UI has distinct visual states:

1. **Design Mode** — Block canvas is active. Mission Control shows agent team configuration and hardware settings. Big green GO button is prominent.

2. **Building Mode** — Block canvas is locked (read-only). Mission Control comes alive with real-time agent activity, task DAG with animated progress, communication feed, and metrics. Bottom bar shows GitHub timeline and test results streaming in.

3. **Review Mode** — Activated by human gates. Shows what the agent did, asks the kid for approval. "Looks good! ✅" and "Let's change something 🔄" buttons.

4. **Deploy Mode** — Shows deployment progress (compilation, flashing). Celebration animation when successful.

5. **Done Mode** — Project complete. Links to GitHub repo, deployed website, and/or hardware running. Teaching summary of concepts encountered. "Build something new" button.

### 9.3 Visual Design Principles

- **Color palette:** Bright, saturated colors similar to Scratch. Each block category has a distinct hue.
- **Typography:** Large, readable fonts. Minimum 14px. No jargon in the UI.
- **Animations:** Smooth, playful transitions. Agents have simple avatar animations (bouncing when working, sleeping when idle, celebrating when done).
- **Iconography:** Emoji-style icons throughout. Friendly, not corporate.
- **Sound design (optional):** Subtle sound effects — blocks snapping together, agents starting work, tests passing/failing, deployment success.
- **Dark mode:** Not needed for hackathon, but the color system should support it.

### 9.4 Responsive Design

For the hackathon, optimize for **desktop** (1280px+ width). Tablet/mobile is a stretch goal.

---

## 10. Prompt Engineering Deep Dive

This section details the prompt strategies that make Elisa's agents effective. This is the core intellectual property of the tool.

### 10.1 Meta-Planner Prompt

The meta-planner is the most important prompt in the system. It receives the JSON spec from the block interpreter and must produce a valid, executable task DAG with agent assignments.

**System Prompt:**
```
You are Elisa's Project Planner — an expert at breaking down kids' projects into
manageable pieces that AI agents can build.

Your job is to take a project specification and produce:
1. A task DAG (directed acyclic graph) — no cycles allowed
2. Agent assignments
3. A kid-friendly explanation of the plan

RULES FOR TASK DECOMPOSITION:
- Each task should take an agent 1-5 minutes to complete
- Every task MUST have clear acceptance criteria
- The first task is ALWAYS project scaffolding (file structure, dependencies)
- The last task is ALWAYS integration verification
- Hardware tasks must include compilation verification as acceptance criteria
- Test tasks should run independently and produce pass/fail results
- Keep the total number of tasks between 4-12 for a typical project
- Prefer more, smaller tasks over fewer, larger ones

RULES FOR AGENT ASSIGNMENT:
- Respect the agent roles defined in the spec
- A builder should never review their own work
- Testing tasks go to tester agents
- If no tester is defined, the builder self-tests (with a note about this)
- Assign tasks to minimize context switching (same agent handles related tasks)

RULES FOR DEPENDENCIES:
- Scaffolding has no dependencies (it's always first)
- Implementation depends on scaffolding
- Tests depend on the code they're testing
- Integration depends on all component tasks
- Deployment depends on integration and all tests passing
- NEVER create circular dependencies

OUTPUT FORMAT:
Respond with valid JSON only. No markdown, no explanation outside the JSON.
{
  "tasks": [...],
  "agents": [...],
  "plan_explanation": "kid-friendly string explaining the plan",
  "estimated_time_minutes": number,
  "critical_path": ["task_id_1", "task_id_2", ...]
}
```

### 10.2 Agent System Prompts

Each agent type gets a base system prompt that's augmented with the kid's persona configuration.

**Builder Agent Base Prompt:**
```
You are {agent_name}, a builder agent in Elisa — a tool that helps kids create
software and hardware projects.

Your personality: {persona_description}

IMPORTANT CONTEXT:
- You are building a project for a kid. They will see your code and learn from it.
- Write CLEAN, WELL-COMMENTED code. Comments should explain WHY, not just WHAT.
- Use simple variable names that a beginner could understand.
- Prefer clarity over cleverness. Simple code > elegant code.
- Keep functions short (under 20 lines when possible).
- Handle errors gracefully — no crashes, no cryptic messages.

COMMUNICATION:
- When you finish a task, write a summary to .elisa/comms/{task_id}_summary.md
- The summary should explain:
  1. What you built
  2. Key decisions you made and why
  3. Anything the next agent should know
  4. Files you created or modified
- Write commit messages that a kid would understand: "Added the button code 🔘" not "feat: impl gpio irq handler"

QUALITY:
- Always verify your code compiles/runs before marking complete
- If something doesn't work, fix it — don't leave broken code
- Follow the project's style requirements: {style_requirements}

FILE BOUNDARIES:
You may ONLY create or modify files in: {allowed_paths}
Do NOT touch: {restricted_paths}
```

**Tester Agent Base Prompt:**
```
You are {agent_name}, a tester agent in Elisa — a tool that helps kids create
software and hardware projects.

Your personality: {persona_description}

YOUR MISSION:
- Write tests that verify the project works correctly
- Run tests and report results clearly
- If tests fail, explain what went wrong in kid-friendly language

TEST WRITING RULES:
- Each test should verify ONE thing
- Test names should describe what they check: "test_button_press_sends_message"
- Include comments explaining what each test does
- Test both the "happy path" (things working) and edge cases
- For hardware projects, write tests that can run in simulation

REPORTING:
- Write test results to .elisa/comms/{task_id}_summary.md
- Format:
  ✅ PASS: [description of what works]
  ❌ FAIL: [description of what's broken + suggestion for fix]
- Include test coverage percentage if applicable

Be thorough but not perfectionist. Focus on the most important behaviors first.
```

**Reviewer Agent Base Prompt:**
```
You are {agent_name}, a code reviewer in Elisa — a tool that helps kids create
software and hardware projects.

Your personality: {persona_description}

YOUR MISSION:
- Review code written by other agents
- Check for bugs, unclear code, and potential improvements
- Provide feedback that is constructive and specific

REVIEW CHECKLIST:
1. Does the code meet the acceptance criteria for the task?
2. Is the code readable and well-commented?
3. Are there any bugs or edge cases not handled?
4. Could the code be simpler without losing functionality?
5. Does the code follow the project's style requirements?
6. For hardware: are pins correctly configured? Are there safety issues?

FEEDBACK FORMAT:
Write your review to .elisa/comms/reviews/{task_id}_review.md

Structure:
- VERDICT: APPROVED ✅ or NEEDS CHANGES 🔄
- SUMMARY: One sentence overall assessment
- DETAILS: Specific feedback items
  - 🐛 Bug: [description]
  - 💡 Suggestion: [description]
  - ✨ Nice: [something done well]
- If NEEDS CHANGES: specific instructions for the builder

Be encouraging! Point out what's good, not just what needs fixing.
```

### 10.3 Context Injection Strategy

As the build progresses, agents need increasing context about what's been built. The strategy:

**Level 1 — Scaffolding agent:** Gets only the project spec. Minimal context.

**Level 2 — First implementation agents:** Get the spec + scaffolding summary + file manifest.

**Level 3 — Dependent agents:** Get the spec + summaries from all predecessor tasks + updated file manifest.

**Level 4 — Integration/test agents:** Get the spec + all summaries + complete file manifest + any review feedback.

**Level 5 — Deployment agent:** Gets everything + test results + build artifacts.

**Context Window Management:**
- Summaries are capped at 500 words each
- File manifests show paths and first-line comments only
- If total context exceeds ~50% of context window, older summaries are compressed to one-line versions

### 10.4 Prompt Templates for Teaching Moments

The teaching engine uses prompt templates to generate kid-friendly explanations:

```
Given the following event in a kid's build session, generate a brief,
friendly teaching moment. Use analogies a 10-year-old would understand.
Keep it under 3 sentences. Make it fun, not boring.

Event type: {event_type}
Event details: {event_details}
Kid's age range: 8-14
Project type: {project_type}

Previously shown concepts: {concepts_already_shown}
(Don't repeat concepts unless asked)

Respond with:
{
  "concept": "name of the concept",
  "headline": "short catchy title (5-8 words)",
  "explanation": "2-3 sentence explanation with analogy",
  "tell_me_more": "optional expanded explanation for curious kids",
  "related_concepts": ["list of related concepts to queue"]
}
```

---

## 11. Technical Stack & Implementation

> **Note:** The original PRD specified Python/FastAPI. The implementation uses TypeScript/Express 5. References below reflect the original design; see ARCHITECTURE.md and docs/INDEX.md for current stack.

### 11.1 Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Frontend framework | React 18 | Ecosystem, Blockly integration support |
| Block editor | Google Blockly (via @blockly/react) | Battle-tested, Scratch-derived, custom block support |
| DAG visualization | React Flow + Elkjs auto-layout | Purpose-built for node graphs, great DX |
| Real-time comms | WebSocket (native) | Low latency for streaming agent output |
| Styling | Tailwind CSS | Rapid prototyping, consistent design |
| Backend framework | Express 5 (TypeScript) | WebSocket support, async, fast to build |
| Agent execution | Claude Agent SDK (@anthropic-ai/claude-agent-sdk) | Direct integration with hackathon tools |
| DAG management | Custom TaskDAG with Kahn's sort | Purpose-built for task scheduling |
| Database | None (in-memory with JSON persistence) | Simple, no external dependencies |
| Git operations | simple-git | Programmatic git from Node.js |
| Hardware flash | mpremote / arduino-cli | Standard ESP32 toolchain |
| Testing (backend) | Vitest | Vite-native, fast, same config as build |
| Testing (frontend) | Vitest + React Testing Library | Vite-native, fast, same config as build |

### 11.1.1 Test-Driven Development (Mandatory)

All future work **must** follow TDD: write failing tests before writing implementation code. PRs without corresponding test coverage will not be merged.

- **Backend:** pytest with `backend/tests/` mirroring `backend/app/`. Run: `pytest backend/tests/`.
- **Frontend:** Vitest with co-located `*.test.ts(x)` files. Run: `npm test` from `frontend/`.
- **Process:** Red (write failing test) -> Green (minimal implementation) -> Refactor.
- **Coverage target:** 80%+ on all new code. No merging PRs that decrease coverage.

### 11.2 Project Structure

```
elisa/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BlockCanvas/           # Blockly workspace wrapper
│   │   │   │   ├── BlockCanvas.tsx
│   │   │   │   ├── blockDefinitions.ts  # Custom block definitions
│   │   │   │   ├── toolbox.ts          # Block palette configuration
│   │   │   │   └── blockInterpreter.ts  # Block tree → JSON spec
│   │   │   ├── MissionControl/         # Right panel
│   │   │   │   ├── AgentTeamPanel.tsx
│   │   │   │   ├── TaskDAG.tsx          # React Flow DAG
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── CommsFeed.tsx
│   │   │   │   └── MetricsPanel.tsx
│   │   │   ├── BottomBar/
│   │   │   │   ├── GitTimeline.tsx
│   │   │   │   ├── TestResults.tsx
│   │   │   │   ├── BoardOutput.tsx
│   │   │   │   └── TeachingSidebar.tsx
│   │   │   ├── OutputPreview/
│   │   │   │   ├── WebPreview.tsx       # iframe for web projects
│   │   │   │   └── HardwareStatus.tsx   # ESP32 status & serial
│   │   │   └── shared/
│   │   │       ├── AgentAvatar.tsx
│   │   │       ├── GoButton.tsx
│   │   │       └── HumanGateModal.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useBuildSession.ts
│   │   │   └── useBlockInterpreter.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── server.ts                    # Express + WS composition root
│   │   ├── routes/
│   │   │   ├── sessions.ts              # /api/sessions/* endpoints
│   │   │   ├── hardware.ts              # /api/hardware/* endpoints
│   │   │   ├── skills.ts                # /api/skills/* endpoints
│   │   │   └── workspace.ts             # /api/workspace/* endpoints
│   │   ├── models/
│   │   │   └── session.ts               # Type definitions
│   │   ├── services/
│   │   │   ├── orchestrator.ts          # Phase coordination
│   │   │   ├── metaPlanner.ts           # Task decomposition via Claude
│   │   │   ├── agentRunner.ts           # Agent SDK query() runner
│   │   │   ├── gitService.ts            # Git operations
│   │   │   ├── testRunner.ts            # Test execution + coverage
│   │   │   ├── teachingEngine.ts        # Learning moments
│   │   │   └── hardwareService.ts       # ESP32 flash + serial
│   │   ├── prompts/                     # Agent role prompt templates
│   │   └── utils/                       # DAG, validation, logging, tokens
│   ├── package.json
│   └── vitest.config.ts
├── hardware/
│   ├── lib/
│   │   └── elisa_hardware.py            # Hardware abstraction library
│   ├── templates/
│   │   ├── blink.py                     # Minimal blink example
│   │   └── lora_hello.py               # Minimal LoRa example
│   └── platformio.ini                   # PlatformIO config (if using Arduino)
├── docs/
│   ├── ARCHITECTURE.md
│   └── PROMPTS.md                       # Prompt engineering documentation
├── README.md
├── docker-compose.yml                   # For easy dev setup
└── LICENSE                              # Open source license (MIT)
```

### 11.3 Key APIs

**WebSocket Events (Backend → Frontend):**

```typescript
type WSEvent =
  | { type: "session_started"; session_id: string }
  | { type: "planning_started" }
  | { type: "plan_ready"; tasks: Task[]; agents: Agent[]; explanation: string }
  | { type: "task_started"; task_id: string; agent_name: string }
  | { type: "agent_output"; task_id: string; agent_name: string; content: string }
  | { type: "agent_message"; from: string; to: string; content: string }
  | { type: "task_completed"; task_id: string; summary: string }
  | { type: "task_failed"; task_id: string; error: string; retry_count: number }
  | { type: "test_result"; test_name: string; passed: boolean; details: string }
  | { type: "coverage_update"; percentage: number; details: CoverageReport }
  | { type: "commit_created"; agent_name: string; message: string; sha: string }
  | { type: "teaching_moment"; concept: string; headline: string; explanation: string }
  | { type: "human_gate"; task_id: string; question: string; context: string }
  | { type: "deploy_started"; target: string }
  | { type: "deploy_progress"; step: string; progress: number }
  | { type: "deploy_complete"; target: string; url?: string }
  | { type: "session_complete"; summary: SessionSummary }
  | { type: "token_usage"; agent_name: string; input_tokens: number; output_tokens: number }
  | { type: "error"; message: string; recoverable: boolean };
```

**REST Endpoints:**

```
POST /api/sessions              # Create new build session
POST /api/sessions/{id}/start   # Start build (submit block spec)
POST /api/sessions/{id}/gate    # Respond to human gate
POST /api/sessions/{id}/stop    # Stop build
GET  /api/sessions/{id}         # Get session status
GET  /api/sessions/{id}/tasks   # Get task list with status
GET  /api/sessions/{id}/git     # Get git timeline
GET  /api/sessions/{id}/tests   # Get test results
GET  /api/templates             # Get project templates
POST /api/hardware/detect       # Detect connected ESP32
POST /api/hardware/flash/{id}   # Flash compiled code to board
GET  /api/hardware/serial/{id}  # Get serial monitor output (SSE)
```

---

## 12. Development Timeline

### Day 1 — Tuesday Feb 10 (Today)

**Goal:** Skeleton up, blocks rendering, basic plumbing.

- [x] Initialize repo (React + Vite + Express)
- [x] Set up Blockly workspace with 5-6 custom blocks (Goal, Feature, Agent, Deploy)
- [x] Block canvas renders and blocks snap together
- [x] Block interpreter serializes block tree to JSON
- [x] Express skeleton with WebSocket endpoint
- [x] Basic frontend-backend WebSocket connection

### Day 2 — Wednesday Feb 11

**Goal:** Meta-planner working, DAG rendering, agents executing.

- [ ] Meta-planner prompt engineered and tested
- [ ] JSON spec → Opus 4.6 → task DAG pipeline working
- [ ] Task DAG renders in React Flow with auto-layout
- [ ] Agent runner: spawn Claude Code subprocess, capture output
- [ ] Single agent can execute a task and stream output to frontend
- [ ] Basic agent status display (idle/working/done)

### Day 3 — Thursday Feb 12

**Goal:** Full orchestration loop working end-to-end.

- [ ] TopologicalSorter manages task ordering
- [ ] Multiple agents execute in sequence (parallel stretch goal)
- [ ] Agent communication files (.elisa/comms/) working
- [ ] Context injection: predecessor summaries fed to subsequent agents
- [ ] Git integration: agents commit after task completion
- [ ] Git timeline renders in frontend

### Day 4 — Friday Feb 13

**Goal:** Teaching layer, test visualization, polish.

- [ ] Teaching engine generates contextual teaching moments
- [ ] Teaching sidebar renders with concept explanations
- [ ] Test runner integration (pytest + coverage)
- [ ] Test results display (green/red checks)
- [ ] Communication feed showing agent messages
- [ ] Token usage tracking and display

### Day 5 — Saturday Feb 14

**Goal:** Hardware integration, full block palette, UX polish.

- [ ] ESP32 hardware blocks added to Blockly palette
- [ ] Hardware abstraction library finalized
- [ ] Compile + flash pipeline working (mpremote or PlatformIO)
- [ ] Serial monitor panel in frontend
- [ ] All block categories populated (full palette)
- [ ] Human gate modal working
- [ ] Agent avatars and status animations
- [ ] Progress bar and metrics panel

### Day 6 — Sunday Feb 15

**Goal:** Demo prep, bug fixes, video recording.

- [ ] End-to-end demo scenario working smoothly (LoRa doorbell)
- [ ] Second demo scenario (simple web game) working
- [ ] UI polish: colors, animations, responsive layout
- [ ] Bug fixes from testing
- [ ] Write README and project description
- [ ] Record 3-minute demo video

### Day 7 — Monday Feb 16 (Submission Day)

**Goal:** Submit by 3 PM EST.

- [ ] Final testing and bug fixes
- [ ] Edit demo video
- [ ] Write submission description (100-200 words)
- [ ] Push final code to GitHub
- [ ] Submit via CV platform

---

## 13. Demo Script (3-Minute Video)

### Opening (0:00 - 0:30)
"Hi, I'm Jon. I've been building AI agent systems for months — orchestrating Claude Code, managing multi-agent workflows, debugging coordination issues. Then my 12-year-old daughter asked if she could try. She couldn't. The tools aren't built for her. So I built Elisa."

### Block Building (0:30 - 1:15)
Show the block canvas. Drag blocks to build a LoRa doorbell:
- Goal: "Build a doorbell that works over LoRa radio"
- Feature: "When I press the button, the other board beeps and blinks"
- Agent: Builder named "Sparky" who "loves hardware projects"
- Agent: Tester named "Checkers" who "tests everything twice"
- Hardware blocks: button, LED, LoRa send, LoRa receive, buzzer
- Deploy: "Flash to my board"

Hit the big green GO button.

### Agents Working (1:15 - 2:15)
Show Mission Control coming alive:
- Meta-planner breaks project into 6 tasks, explains: "We're building this in parts — first the radio connection, then the button, then the buzzer, then we test it all together!"
- Sparky starts working — streaming output visible
- Teaching moment slides in: "Your code is being saved to GitHub — like a shared notebook..."
- Checkers runs tests — green checks appear
- Git timeline shows commits rolling in
- Reviewer provides feedback — Sparky makes an improvement

### Hardware Deploy (2:15 - 2:45)
Show code compiling, flashing to ESP32. Cut to physical board:
- Press button on Board A
- Board B's LED blinks, buzzer sounds
- "It works! Built by AI agents, directed by a kid."

### Closing (2:45 - 3:00)
"Elisa is Scratch for the AI age. Kids don't just learn about AI — they become the orchestrator. The director's chair isn't just for engineers anymore."

---

## 14. Success Criteria

### Hackathon Success (Minimum Viable Demo)
- [ ] Block canvas with at least 10 block types renders and is interactive
- [ ] Blocks translate to structured JSON spec
- [ ] Opus 4.6 meta-planner decomposes spec into task DAG
- [ ] At least 2 agents execute tasks via Claude Code
- [ ] Real-time agent status visible in dashboard
- [ ] Git commits happen automatically with kid-friendly messages
- [ ] At least 3 teaching moments display contextually
- [ ] Test results display as pass/fail
- [ ] At least one deployment target works (web OR ESP32)
- [ ] End-to-end flow completes: blocks → agents → working output

### Stretch Goals
- [ ] ESP32 LoRa two-board demo working
- [ ] Parallel agent execution
- [ ] Human gate / intervention working
- [ ] Agent-to-agent communication visible in feed
- [ ] Token usage metrics
- [ ] Multiple project templates
- [ ] Guided tutorial mode

---

## 15. Open Questions & Risks

### Technical Risks

1. **Claude Code CLI subprocess management** — How reliable is spawning multiple Claude Code instances? May need to fall back to API calls if subprocess approach is flaky.

2. **Context window management** — As projects grow, agent context may exceed limits. Need aggressive summarization strategy.

3. **ESP32 flash from web app** — Web Serial API can flash ESP32 from Chrome, but may require extra setup. Fallback: provide CLI command for manual flash.

4. **Blockly custom block complexity** — Custom Blockly blocks require careful definition. May take longer than expected.

5. **Real-time streaming** — WebSocket reliability over long build sessions. Need heartbeat/reconnection logic.

### Product Risks

1. **Scope creep** — This PRD describes a lot. Must be ruthless about what's in the demo vs. aspirational.

2. **Demo reliability** — Live demos fail. Pre-record the critical path, have fallback video.

3. **Agent quality** — Agents may produce poor code for hardware projects specifically. May need more constrained prompts for ESP32 code.

### Open Questions

1. **Agent execution: CLI vs API?** Claude Code CLI gives the authentic "Claude Code" experience for the hackathon judges, but API calls are more controllable. Recommend: CLI for demo, with API fallback.

2. **Framework for ESP32: MicroPython vs Arduino?** MicroPython is simpler for agents to write, Arduino has better library support. Recommend: MicroPython for the hackathon.

3. **How much prompt engineering can we pre-build vs. generate dynamically?** Balance between template prompts (reliable, tested) and dynamic generation (flexible, novel). Recommend: templates for agent system prompts, dynamic for teaching moments.

4. **Do we need a database?** SQLite could track sessions, but for the hackathon, in-memory state + file system may be sufficient. Recommend: start with in-memory, add SQLite if time permits on Day 3.

---

## 16. Appendix: Prompt Engineering Improvement Strategy

Jon noted that prompt engineering is an area for growth. Here are strategies to improve rapidly during the hackathon:

### Strategy 1: Iterative Prompt Testing

Use Claude Code itself to test prompts:
1. Write a prompt template
2. Feed it 3-5 different project specs
3. Evaluate the output quality
4. Refine the prompt based on failures
5. Repeat until consistent quality

### Strategy 2: Structured Output Enforcement

Always request JSON output with a schema. This makes parsing reliable and catches malformed responses:
```
Respond with valid JSON matching this schema. No additional text.
{
  "tasks": [{ "id": string, "name": string, ... }],
  ...
}
```

### Strategy 3: Few-Shot Examples

Include 1-2 examples in system prompts to anchor the model's behavior:
```
Here's an example of a good task decomposition:
INPUT: "Build a website about dinosaurs"
OUTPUT: { "tasks": [ ... example tasks ... ] }

Now decompose this project:
INPUT: {actual_spec}
```

### Strategy 4: Constraint-First Prompting

Lead with constraints before the task description:
```
CONSTRAINTS:
- Maximum 10 tasks
- Each task under 5 minutes of work
- No circular dependencies
- Kid-friendly language only

TASK:
Decompose this project specification...
```

### Strategy 5: Self-Correction Loops

Build validation into the pipeline:
1. Agent produces output
2. System validates (JSON schema, DAG validity, code compilation)
3. If invalid → feed error back to agent with specific fix instructions
4. Agent corrects
5. Re-validate

This is more reliable than trying to get perfect output on the first try.

### Strategy 6: Persona Grounding

When agents have personas defined by kids, anchor them:
```
The kid described you as: "{kid_persona_text}"
Interpret this as your working style, NOT as a character to role-play.
For example, if they said "loves space", reference space analogies in
comments but write normal, functional code.
```

---

*End of PRD — Let's build Elisa! 🚀*
