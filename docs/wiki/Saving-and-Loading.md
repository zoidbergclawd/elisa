# Saving and Loading

Elisa saves your project design (blocks, skills, rules, and portals) so you can come back to it later.

## Auto-Save to Browser

Your workspace is automatically saved to your browser's localStorage every time you make a change. When you reopen Elisa, everything is restored. No manual save needed.

This includes:
- Block layout on the canvas
- All [skills](Skills)
- All [rules](Rules)
- All [portals](Portals)
- Your chosen workspace folder path

localStorage keys used: `elisa:workspace`, `elisa:skills`, `elisa:rules`, `elisa:portals`, `elisa:workspace-path`.

## Saving to a Workspace Folder

If you have set a workspace folder (via the Folder button in the sidebar or when first pressing GO), clicking **Save** writes your design files directly to that folder:

- `workspace.json` — Your block layout
- `skills.json` — Your skills
- `rules.json` — Your rules
- `portals.json` — Your portals

The workspace folder is also where Elisa puts the generated project code during a build.

## The .elisa File Format

If no workspace folder is set, clicking **Save** downloads a `.elisa` file. This is a zip archive containing:

```
workspace.json     — Block layout
skills.json        — Skills
rules.json         — Rules
portals.json       — Portals
output/            — Generated code (if a build was completed)
```

You can rename the file to `.zip` and open it with any archive tool to inspect its contents.

## Opening a .elisa File

Click **Open** in the sidebar and select a `.elisa` file. This restores:
- The block layout on the canvas
- All skills, rules, and portals
- Generated code (if present in the archive)

## Loading from a Workspace Folder

Click **Folder** in the sidebar and choose a directory. If the folder contains `workspace.json`, `skills.json`, `rules.json`, or `portals.json`, they are loaded. The folder becomes your active workspace for future saves and builds.

## Example Nuggets

Elisa ships with bundled example projects you can load from the Example Picker:

| Example | Category | What It Builds |
|---------|----------|---------------|
| Simple Web App | Web | A basic web application |
| Hardware Blink | Hardware | An ESP32 LED blink program |
| Team Build | Multi-agent | A project using multiple specialized agents |
| Space Dodge | Game | A space-themed dodge game |
| Skill Showcase | Web | Demonstrates skills with a feature-rich build |
| Rules Showcase | Web | Demonstrates rules with quality-focused agents |

The Example Picker opens automatically on first launch (when no saved workspace exists). You can also open it anytime by clicking **Examples** in the sidebar.

> **Try it**: Click **Save** in the sidebar to download your current project as a `.elisa` file. Close Elisa, reopen it, click **Open**, and select the file you just saved. Your entire design should be restored exactly as it was.
