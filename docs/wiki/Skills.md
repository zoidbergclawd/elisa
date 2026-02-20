# Skills

Skills are reusable prompt snippets that give your AI agents detailed instructions beyond what blocks can express.

## What Skills Do

A block like "It should be able to... play sound effects" is a short instruction. A skill lets you give much more detail: "Use the Web Audio API. Preload all sounds on page load. Play a coin sound when the player collects an item. Keep volume at 0.7..."

Skills are attached to your project by dragging a "Use Skill" [block](Block-Reference#skills) onto the canvas.

## Creating a Skill

1. Click the **Skills** button in the sidebar.
2. Click **+ New Skill**.
3. Enter a **name** (e.g., "Pixel Art Style").
4. Choose a **category**:
   - **Agent behavior** — Controls how an agent communicates and works.
   - **Feature details** — Describes a specific feature in depth.
   - **Style details** — Sets visual style, colors, and aesthetics.
   - **Composite flow** — Chains multiple steps together visually (see below).
5. Write the **instructions** — a detailed prompt the agent will follow.
6. Click **Done**.

## Editing and Deleting Skills

In the Skills modal, each skill shows its name, category, and a preview of its instructions. Click **Edit** to change it or **Delete** to remove it.

## Template Library

The Skills modal has a **Templates** tab with pre-built skills you can add with one click:

| Template | Category | What It Does |
|----------|----------|-------------|
| Explain everything | Agent | Agent explains each step in simple words |
| Kid-friendly code | Agent | Simple names, lots of comments, no clever tricks |
| Detailed game mechanics | Feature | Physics, collision, scoring, and difficulty progression |
| Responsive layout | Feature | Mobile-first layout with flexbox/grid |
| Accessibility first | Feature | ARIA labels, keyboard nav, semantic HTML |
| Dark mode | Style | Dark backgrounds with vibrant accent colors |
| Pixel art | Style | Retro 8-bit aesthetic with limited palette |
| Presentation builder | Composite | Asks for topic and format, then builds a presentation |
| Code review checklist | Composite | Asks what to focus on, then runs targeted review |

After adding a template, drag a "Use Skill" block onto your canvas to activate it.

## Composite Skills

Composite skills chain multiple steps together using a visual flow editor. Instead of a single prompt, they define a multi-step workflow.

### Opening the Flow Editor

1. Create a new skill and set the category to **Composite flow**.
2. Give it a name and optionally a description.
3. Click **Open Flow Editor**.

### Flow Blocks

The flow editor has its own set of blocks (see [Block Reference — Skill Flow](Block-Reference#skill-flow) for the full list):

| Block | What It Does |
|-------|-------------|
| **Skill Flow** | Entry point. Must be the first block in every flow. |
| **Ask User** | Pauses and asks the user a question with options. Stores the answer in a context variable. |
| **If** | Branches on a context value. Runs nested blocks only if the value matches. No else branch. |
| **Run Skill** | Invokes another skill and stores its output. Supports nesting up to 10 levels. |
| **Run Agent** | Spawns a Claude agent with a prompt template and stores the result. |
| **Set Context** | Sets a context variable to a value. |
| **Output** | Produces the final output of the flow. Terminal block. |

### Context Variables

Use `{{key}}` syntax in any text field to reference values stored by previous steps:

```
Ask User → store as "topic"
Run Agent → prompt "Build a {{topic}} app" → store as "result"
Output → template "Done: {{result}}"
```

Context resolution walks the current context first, then parent contexts (for nested skill invocations).

### Branching

If blocks have no else branch. To handle multiple cases, chain multiple If blocks:

```
If answer equals "Game"    → [Run Agent: build a game]
If answer equals "Website" → [Run Agent: build a website]
```

Each If block is evaluated independently. First match per block wins.

> **Try it**: Create a composite skill called "Project Starter". Add an Ask User block that asks "What kind of project?" with options "Game, Website, Tool". Add If blocks for each option, each with a Run Agent block that gives specific instructions. Add an Output block at the end.
