# Systems Thinking in Elisa

**Date:** 2026-02-25
**Status:** Design (ideation complete, not yet planned for implementation)
**Related issues:** #107 (Spec Graph), #112 (Composable Nuggets)

## Motivation

Feedback from multiple users: Elisa would be more powerful if it inherently taught Systems Thinking. Today Elisa has strong spec-driven development, optional behavioral testing, and an optional tester agent — but the systems thinking happens behind the scenes. Kids press GO and watch agents work. They are spectators of the system, not participants in it.

**The opportunity:** Surface the machinery. Make the invisible visible. Then progressively hand kids the controls.

## Design Principles

- **Progressive disclosure.** Kids first *see* systems concepts in action (automatic, narrated), then *understand* them (interactive), then *design* them (full control).
- **Never idle.** During builds, kids are always engaged — collaborating with agents on different facets of the system.
- **Product lifecycle, not just code.** The "system" includes design, testing, documentation, launch, and marketing — not just source code.
- **Composition over complexity.** Kids build small things and compose them into big things, rather than specifying everything up front.

## Systems Thinking Concepts Covered

| Concept | Where kids learn it |
|---------|-------------------|
| Decomposition | Narrated planning, system map |
| Interconnectedness | Dependency arrows, context flow, impact analysis |
| Feedback loops | Correction cycles, convergence visualization |
| Verification | Requirement-test traceability, proof meter |
| Composition | Nugget composition, Spec Graph |
| Interfaces | Cross-nugget contracts, system boundaries |
| Emergence | Post-composition behavior recognition |
| Stakeholder perspectives | Agent Meetings with different lenses |
| Product lifecycle | Art, Build, Test, Document, Launch, Market |
| System health | Dashboard, coverage metrics, convergence tracking |
| Multiple valid views | System map vs. traceability vs. health vs. lifecycle |
| Progressive mastery | Explorer, Builder, Architect levels |

---

## Feature 1: Requirement-Test Traceability

**Problem:** `when_then` requirement blocks and `behavioral_test` blocks are disconnected concepts. Kids don't see that a test *proves* a requirement works. After execution, there is no visibility into which requirements were verified and which were not.

**What it teaches:** Verification, interconnectedness, system completeness.

### 1a. Test Sockets on Requirement Blocks

Every `when_then` block gets a visual "test plug" — an empty socket that glows amber (unverified). When the kid attaches a `behavioral_test` block to it (or Elisa auto-pairs it at Explorer level), the socket links up. After execution, the socket turns green (proved) or red (failed).

At Explorer level, every `when_then` automatically generates a paired behavioral test. Elisa narrates: "I noticed you want the game to start when the user clicks play. I'll make sure to test that!" At Builder and Architect levels, the kid manually creates and wires the pairings.

### 1b. Post-Execution Traceability View

After the run, show a visual map connecting requirements to the tasks that built them, the tests that verified them, and the pass/fail results:

```
Requirement                    Task that built it       Test           Result
----------------------------------------------------------------------
"When user clicks play,        "Implement play button"  "test_play"    PASS
 game starts"
"When snake hits wall,         "Add collision logic"    "test_collide" FAIL
 game ends"
"It should keep score"         "Add scoring system"     (no test)      ???
```

The uncovered requirement with no test (the `???` row) is pedagogically valuable. The kid sees a gap in their system — nobody checked whether scoring works.

### 1c. Proof Meter

A simple coverage indicator: X of Y requirements are verified by tests. Kids naturally want to fill the bar. Gamifies the connection between requirements and tests.

---

## Feature 2: Visible Feedback Loops

**Problem:** The pipeline is linear: plan, execute, test, deploy. When a test fails, the kid sees a red result and nothing else. There is no correction cycle. The most important concept in systems thinking — feedback loops — is absent.

**What it teaches:** Feedback loops, self-correction, convergence.

### 2a. Automatic Correction Cycle (Explorer Level)

When a behavioral test fails, Elisa does not just report it. It loops back visibly:

1. **Show the failure clearly.** "Test Bot found that when the snake hits the wall, the game does NOT end."
2. **Show the diagnosis.** "Builder Bot is reading the test failure and figuring out what went wrong..."
3. **Show a new fix task entering the DAG.** A new node appears in the system map, connected back to the failed task. The kid sees the loop.
4. **Show the retest.** "Test Bot is checking again... When the snake hits the wall, the game ends. Fixed!"
5. **Show convergence.** "Attempt 1: 3/5 tests passing. Attempt 2: 5/5 tests passing."

The whole cycle is narrated and animated. The kid experiences a system that detects problems and corrects itself.

### 2b. Loop Visualization

When correction happens, the pipeline view shifts from linear to circular. The arrow bends back. Attempt counts are displayed. The loop is visual and spatial, not just narrated.

### 2c. Convergence vs. Divergence Teaching Moments

After a successful correction cycle: "Notice how each attempt got closer to working? That's called convergence — the system gets better each time it loops."

After 2-3 failed attempts: "The system isn't getting better on its own. Sometimes a feedback loop needs human help. What would you like to change?" This transitions naturally into a Test Agent Meeting (see Feature 5).

### 2d. Designed Feedback Loops (Architect Level)

The `keep_improving` block already exists but only adds strings to `iteration_conditions[]`. At Architect level, make it create real feedback loops with:

- Exit conditions the kid defines ("keep improving until all tests pass" or "until the reviewer approves")
- Visible loop counters
- The kid choosing what feeds back into what — connecting test results to specific builder tasks

The kid goes from watching a feedback loop to designing one.

---

## Feature 3: Live System Map

**Problem:** The task DAG exists internally but kids never see it. The decomposition, dependencies, and context flow between agents are invisible.

**What it teaches:** Seeing the whole machine, decomposition, dependencies, data flow.

### 3a. Animated DAG During Execution

Show the task graph as an interactive node diagram during execution:

- Nodes represent tasks. They light up when agents start working, turn green on completion, red on failure, amber on retry.
- Dependency arrows are visible. The kid sees why Task 4 is waiting — Task 2 isn't done yet.
- Parallel tasks appear side-by-side. The kid sees concurrency as a system property.

Progressive: Explorer level sees a simplified view (agent-level nodes: "Builder Bot, Test Bot, Review Bot"). Builder and Architect levels see the full task-level DAG.

### 3b. Context Flow Animation

When an agent finishes and its summary flows to the next agent, animate a "message" traveling along the dependency arrow. The kid sees: "Builder Bot finished and passed information to Test Bot." The context chain becomes tangible.

### 3c. Requirement Tracing on the Map

Color-code or label each task node with the requirement it serves. The kid can visually trace: "My 'keep score' requirement turned into these three tasks."

### 3d. Post-Execution Blueprint

After the run, the DAG stays visible as a "blueprint" — a map of how the project was built. Kids can revisit it and understand the architecture.

---

## Feature 4: Impact Analysis

**Problem:** Kids don't experience that changes propagate through systems. They modify specs without understanding the ripple effects.

**What it teaches:** Interconnectedness, unintended consequences, change propagation.

### 4a. Pre-Execution Impact Preview

Before hitting GO, let kids hover over a requirement block and see: "This requirement will generate ~3 tasks and needs 1 test." Remove a requirement and see tasks disappear from a preview DAG. Add a constraint and see which tasks get affected.

### 4b. Change Ripple Visualization

When a kid modifies their spec and re-runs, show what changed: "You added collision detection. Watch how that changes the plan..." New tasks appear, new dependencies form.

### 4c. Dependency Awareness Prompts

When a kid adds a requirement that creates a long dependency chain, Elisa notes: "This feature needs 4 other things to be built first. It's the most connected part of your system." Teaches critical path thinking naturally.

---

## Feature 5: Agent Meetings

**Problem:** During builds, kids are passive spectators. They watch a progress bar. Builds can take minutes, and the kid is disengaged. Additionally, kids never interact with stakeholder perspectives beyond "build the code."

**What it teaches:** Stakeholder perspectives, collaboration as a system property, product lifecycle thinking, iterative design.

### Core Concept

Agent Meetings are real-time collaborative sessions where a specialized agent invites the kid to work together on a specific aspect of the system. Each agent type brings a specialized canvas — a co-creation workspace with the right tools for that domain.

The metaphor is a video call (Zoom-like), not a physical room. The agent has a unique avatar and personality. The kid interacts like they would with a real stakeholder.

### Meeting Invite Pattern

The system invites the kid proactively when a meeting is relevant. This is itself a systems thinking lesson — well-designed systems surface needs proactively.

```
+---------------------------------------------+
|  Pixel, your Art Director, wants to          |
|  meet about designing your spaceship!        |
|                                              |
|  [Join Meeting]          [Maybe Later]       |
+---------------------------------------------+
```

Meetings can be accepted or deferred. At Explorer level, invites appear automatically at natural moments. At Builder/Architect levels, kids can also summon agents or configure which meetings happen.

### Meeting Types and Canvases

**Test Agent Meeting — "Bug Detective Canvas"**

- Triggers when a behavioral test fails or convergence stalls.
- Canvas shows the failing test: expected vs. actual behavior.
- Agent walks through diagnosis with the kid. "Let's look at what happens when we click play."
- Kid and agent decide on a fix together. The fix goes back into the DAG as a new task.
- Lesson: diagnosing problems requires understanding how parts connect.

**Artwork Agent Meeting — "Design Studio Canvas"**

- Triggers during build for visual projects (games, websites).
- Canvas supports image generation and iterative design.
- Agent generates options: "Here are three spaceship designs." Kid picks, remixes, gives feedback.
- Mini feedback loop within the meeting — the kid experiences iterative refinement.
- Final assets are saved into the project; builder agents reference them.
- Lesson: design is iterative, visual identity is part of the system.

**Documentation Agent Meeting — "Explain-It Canvas"**

- Triggers after build, before deploy.
- Collaborative document editor where agent drafts and kid refines.
- Agent might ask: "How would you explain what your game does to a friend?"
- Can show the system map and ask the kid to annotate it in their own words.
- Produces a README, help text, or in-app tutorial.
- Lesson: if you can't explain the system, you don't fully understand it.

**Web Designer Agent Meeting — "Launch Pad Canvas"**

- Triggers pre-deploy.
- Wireframe and live preview canvas.
- Agent proposes layouts. Kid rearranges elements, picks colors, writes the tagline.
- Result is a real deployable launch page that wraps their project.
- Lesson: systems need interfaces to the outside world — this is yours.

**Media Agent Meeting — "Campaign Canvas"**

- Triggers post-build.
- Storyboard, poster, and social media template canvas.
- Agent: "Who do you want to play your game? What would make them excited about it?"
- Kid designs a poster, trailer storyboard, or social media posts.
- Lesson: systems exist within larger systems (markets, communities, audiences).

**Architecture Agent Meeting — "Blueprint Canvas"**

- Triggers when the build completes.
- The live system map as an interactive walkthrough canvas.
- Agent narrates: "Let me show you how your game was built. See these three pieces?"
- Kid can ask questions, zoom in, see traceability links.
- Capstone meeting: understanding the whole system you just built.
- Lesson: complex systems can be understood by examining their structure.

### Parallel Tracks: Build + Meetings

Meetings happen during the build, keeping kids engaged and productive:

```
Build Track:    [scaffold] [features] [scoring] [tests] [deploy]
                     |           |          |        |
Meeting Track:       v           v          v        v
                  Art         Debug      Arch     Launch
                  meeting     meeting    meeting  meeting
```

The kid is working on the system the entire time, just from different stakeholder perspectives. While builder agents handle code, the kid handles design, debugging, documentation, and launch.

### Meeting Outcomes Feed Back Into the Build

- Art meeting: assets saved to project, builder agents can reference them.
- Test meeting: fix decision becomes a new task injected into the DAG.
- Doc meeting: README created, included in the deployed project.
- Web designer meeting: launch page becomes the deploy target.
- Media meeting: marketing materials the kid can share.

This creates cross-cutting feedback loops between the kid's meetings and the agent build process.

---

## Feature 6: Decomposition Transparency

**Problem:** MetaPlanner decomposes goals into tasks, but the kid doesn't see how or why. Decomposition is a black box.

**What it teaches:** Decomposition, abstraction, the "why" behind structure.

### 6a. Narrated Planning Phase

Instead of MetaPlanner being invisible, narrate the decomposition: "Your goal is 'Build a snake game.' Let me break that into pieces... First we need a game board. Then a snake that moves. Then food. Then collision. Then scoring." Show the goal splitting into sub-tasks visually.

### 6b. "Why This Order?" Explanations

On the system map, let kids tap a dependency arrow and see: "Collision detection needs snake movement to exist first — you can't check if the snake hit a wall if the snake can't move yet."

---

## Feature 7: Nugget Composition

**Problem:** Each nugget is a standalone spec-build cycle. There is no concept of "the application" as a persistent, growing thing. Kids can't build complex systems incrementally from simpler subsystems.

**What it teaches:** Composition, modularity, interfaces, emergence, incremental complexity.

**Related issues:** #107 (Spec Graph), #112 (Composable Nuggets). This feature builds on both.

### 7a. Composition as Systems Thinking

A kid builds a "snake movement" nugget. Then a "food spawner" nugget. Then composes them. They experience firsthand that complex things are built from simpler, connected parts.

When two nuggets compose, they need to communicate. The login nugget produces a "user" that the score tracker needs. This interface — this contract between subsystems — is something the kid has to think about. That's interface design as systems thinking.

### 7b. Emergence Through Composition

When you combine "snake movement" + "food spawner" + "collision detector," a *game* emerges that none of them are individually. The kid didn't spec "a game" — they specced three simple systems and a game emerged from their composition.

Post-composition, Elisa can highlight emergent behaviors: "You built movement and food separately. Together, these create a chase mechanic — the player has to hunt for food! That behavior emerged from your simpler requirements."

### 7c. Nested System Map

The system map (Feature 3) scales to composition. Zoom out: nuggets are nodes with interface edges. Zoom in: tasks within a nugget. The kid sees systems within systems.

### 7d. Cross-Nugget Feedback Loops

Changing Nugget A might break Nugget B's tests. The kid sees ripple effects across subsystem boundaries. Impact analysis (Feature 4) extends across nuggets: "If you change this nugget, these other nuggets that depend on it will be affected."

### 7e. Integration Meetings

A specialized Agent Meeting (Feature 5) that helps kids think about how nuggets connect: "Your login nugget produces a user ID. Your score tracker needs a user ID. Let's design the connection." The kid designs interfaces between subsystems with agent guidance.

---

## Feature 8: System Health Dashboard

**Problem:** Kids have no sense of their system's overall health or how it changes over time.

**What it teaches:** Monitoring, system state, resource awareness.

### 8a. Vital Signs During Execution

Real-time panel: tasks completed, tests passing, tokens used (resource consumption).

### 8b. Post-Execution Report Card

Requirement coverage percentage, test pass rate, correction cycles needed, and overall health score.

### 8c. Health Over Time (Architect Level)

For kids who iterate on their nuggets, show how system health changes across runs: "Version 1: 60% tests passing. Version 2: 80%. Version 3: 100%."

---

## Feature 9: System Boundaries

**Problem:** Kids don't have a clear sense of what's "inside" their system vs. what's "outside."

**What it teaches:** Boundaries, inputs/outputs, interfaces with the external world.

### 9a. Explicit Inputs/Outputs View

Show kids what their system takes in (user input, portal data, hardware signals) and what it produces (display output, hardware commands, data). Draw a boundary box. Everything inside is "your system." Everything outside is "the world." Portals sit on the boundary line.

### 9b. Contract Blocks (Architect Level)

Let kids define interfaces between components: "The scoring module receives a 'point scored' event and displays the updated score." Teaches that system components communicate through defined interfaces.

---

## Progressive System

The progression itself teaches systems thinking — the learning system adapts to the learner's state.

### Explorer Level — "See Systems"

- Tests auto-paired to requirements.
- Feedback loops automatic and narrated.
- Simplified system map (agent-level nodes).
- Full narration of everything.
- Agent Meeting invites appear automatically.
- Single-nugget projects only.

### Builder Level — "Understand Systems"

- Manual test creation and pairing.
- Explicit feedback loop blocks (`keep_improving` with real behavior).
- Full task-level system map.
- Impact warnings shown on spec changes.
- Traceability view available.
- Can summon or skip Agent Meetings.
- Can compose 2-3 nuggets together.

### Architect Level — "Design Systems"

- Nothing automatic — every systems thinking feature is a conscious choice.
- Custom iteration conditions with visible loop design.
- System health monitoring and trending.
- What-if analysis for change impact.
- Interface/contract design between subsystems.
- Full nugget composition with registry access.
- Designs which Agent Meetings happen and when they trigger.

### Level Progression

Could be driven by: nugget count, spec complexity milestones, deliberate "level up" challenges ("Can you build a nugget where all requirements have tests?"), or a manual toggle.

---

## Product Lifecycle Arc

Agent Meetings (Feature 5) extend the "system" beyond code into a full product lifecycle:

```
Design --> Decompose --> Build --> Test --> Fix --> Document --> Design assets --> Launch --> Market
  |                                                                                          |
  +------------------------------- "The System" is ALL of this --------------------------------+
```

Kids learn that building software is a lifecycle, not a moment.

---

## Architectural Sketch

```
+---------------------------------------------------------------------+
|                        THE SPEC GRAPH                                |
|            (living map of the whole application)                     |
|                                                                     |
|    +-----------+     +-----------+     +-----------+                |
|    | Nugget A  |---->| Nugget B  |---->| Nugget C  | COMPOSITION   |
|    | (Login)   |     | (Scores)  |     | (Game)    | & INTERFACES  |
|    +-----+-----+     +-----+-----+     +-----+-----+              |
|          |                 |                 |                       |
|    +-----+-----+     +-----+-----+     +-----+-----+              |
|    | Req->Test  |     | Req->Test  |     | Req->Test  | TRACEABILITY|
|    | Proof Map  |     | Proof Map  |     | Proof Map  |            |
|    +-----+-----+     +-----+-----+     +-----+-----+              |
|          |                 |                 |                       |
|    +-----+-----------------+-----------------+-----+               |
|    |           LIVE SYSTEM MAP (DAG)               | VISIBILITY    |
|    |    tasks, dependencies, context flow          |               |
|    +-----+-----------------------------+-----+-----+               |
|          |                             |                            |
|    +-----+-----+              +--------+--------+                  |
|    | FEEDBACK   |              | AGENT MEETINGS  |                 |
|    | LOOPS      |<------------>| test, art, docs | STAKEHOLDERS & |
|    | test->fix  |              | media, launch,  | LIFECYCLE      |
|    | ->retest   |              | architecture    |                 |
|    +-----------+              +-----------------+                  |
|                                                                     |
|    +-----------------------------------------------+               |
|    |          PROGRESSIVE SYSTEM                    |               |
|    |  Explorer --> Builder --> Architect             | GROWTH       |
|    |  (see)        (understand)  (design)           |              |
|    +-----------------------------------------------+               |
+---------------------------------------------------------------------+
```

## Implementation Priority (Suggested)

Features roughly ordered by a combination of impact and proximity to existing infrastructure:

1. **Requirement-Test Traceability** (Feature 1) — closest to existing infrastructure (behavioral tests and when_then blocks already exist), fixes the most immediate black box.
2. **Visible Feedback Loops** (Feature 2) — the single most important missing systems thinking concept; builds on existing retry logic in ExecutePhase.
3. **Live System Map** (Feature 3) — the DAG already exists in the backend; this is about surfacing it in the frontend.
4. **Agent Meetings** (Feature 5) — largest new feature surface, but highest engagement and lifecycle value. Could start with Test Agent meetings (most natural trigger: failing tests) and expand to other agent types.
5. **Decomposition Transparency** (Feature 6) — narrating MetaPlanner output is relatively low-effort and high-impact.
6. **Progressive System** (Feature 9) — provides structure for everything above; could be implemented incrementally as each feature lands.
7. **Impact Analysis** (Feature 4) — powerful but requires more infrastructure (preview DAG generation, change diffing).
8. **System Health Dashboard** (Feature 8) — valuable polish; data is already available, just needs UI.
9. **System Boundaries** (Feature 9) — deepens understanding; builds on portal infrastructure.
10. **Nugget Composition** (Feature 7) — the deepest systems thinking feature but the largest architectural change; depends on #107 and #112 groundwork.
