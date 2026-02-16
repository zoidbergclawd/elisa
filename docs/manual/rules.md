# Rules

Rules are guardrails that tell your AI agents what they must (or must not) do. Unlike skills, which add capabilities, rules add constraints.

## What rules do

Rules fire automatically at specific points during a build. For example, a rule with the trigger "before deploy" will be checked right before your project is deployed -- you do not have to remember to run it.

Rules are attached to your project by dragging an "Apply Rule" block onto the canvas.

## Creating a rule

1. Click the **Rules** button in the sidebar.
2. Click **+ New Rule**.
3. Enter a **name** (e.g., "Always Add Comments").
4. Choose **when to apply** (the trigger):
   - **Always on** -- The rule applies throughout the entire build.
   - **On task complete** -- Checked when an agent finishes a task.
   - **On test fail** -- Applied when a test fails.
   - **Before deploy** -- Checked right before deployment.
5. Write the **rule instructions** -- what the agents must do or check.
6. Click **Done**.

## Editing and deleting rules

In the Rules modal, each rule shows its name, trigger badge, and a preview of its instructions. Click **Edit** to change it or **Delete** to remove it.

## Template library

Click **From Template** to browse pre-built rules:

| Template | Trigger | What it does |
|----------|---------|-------------|
| Always add comments | Always | Comment every function in plain language |
| Test every feature | Always | Minimum one test per feature |
| No console.log | On task complete | Remove debug logs before finishing |
| Check for broken links | On task complete | Verify all links and image sources work |
| Fix one thing at a time | On test fail | Focused minimal fixes, no refactoring |
| Read the error first | On test fail | Analyze error message before changing code |
| Must compile cleanly | Before deploy | No errors or warnings before deploy |
| All tests must pass | Before deploy | Green test suite required before deploy |

Click **Add** to include a template in your rules library.

## How rules affect agents

When a rule fires, its instructions are added to the agent's context for the relevant task. The agent sees the rule as a requirement it must follow.

- **Always** rules are included in every agent prompt.
- **On task complete** rules are checked after each task finishes.
- **On test fail** rules guide the agent when it needs to fix a failing test.
- **Before deploy** rules are checked during the deploy phase.

> **Try it**: Open the Rules modal, click "From Template", and add the "Always add comments" rule. Then drag an "Apply Rule" block onto your canvas and select it from the dropdown. Your next build will have detailed comments in every function.
