# Workspace

The Workspace tab is where you design your project by snapping blocks together.

## Layout

The workspace has three parts:

- **Toolbox** (left edge) -- Block categories you can drag from. Click a category name to expand it, then drag a block onto the canvas.
- **Canvas** (center) -- The main editing area where you arrange blocks. Blocks snap together vertically.
- **Sidebar** (right edge) -- Buttons for file operations, skills, rules, portals, examples, and help.

## Canvas controls

| Action | How |
|--------|-----|
| Pan | Click and drag on empty canvas space |
| Zoom | Mouse wheel, or use the +/- controls in the bottom-right corner |
| Snap to grid | Blocks automatically snap to a 20px grid |
| Delete a block | Drag it to the trashcan in the bottom-right, or select it and press Delete |
| Undo/Redo | Ctrl+Z / Ctrl+Y (Cmd+Z / Cmd+Shift+Z on Mac) |

Zoom range is 0.3x to 3x.

## Sidebar buttons

| Button | What it does |
|--------|-------------|
| **Folder** | Open a workspace from a folder on your computer. The button turns green when a folder is selected. |
| **Open** | Open a `.elisa` nugget file |
| **Save** | Save your project. If a workspace folder is set, saves design files there. Otherwise, downloads a `.elisa` file. |
| **Skills** | Open the Skills editor to create reusable prompt snippets |
| **Rules** | Open the Rules editor to set guardrails for agents |
| **Portals** | Open the Portals editor to connect external tools and hardware |
| **Examples** | Browse and load pre-built example projects |
| **Help** | Quick reference for how to use Elisa |

## Main tabs

The header has two main tabs:

- **Workspace** -- The block editor (always available)
- **Mission Control** -- Task graph, minion squad, and narrator feed (activates during a build)

When you press GO, the view automatically switches to Mission Control. You can switch back to Workspace at any time, but the canvas is read-only during a build (it shows a "Building in progress..." overlay).

## Auto-save

Your workspace, skills, rules, and portals are automatically saved to your browser's localStorage on every change. When you reopen Elisa, everything is restored exactly as you left it.

LocalStorage keys used: `elisa:workspace`, `elisa:skills`, `elisa:rules`, `elisa:portals`, `elisa:workspace-path`.
