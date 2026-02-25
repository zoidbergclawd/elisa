# Plugin Architecture Design

## Goal

Define a well-structured plugin module architecture for ELISA so that third-party integrations (like OpenClaw) can be distributed as npm packages that users install and remove independently.

## Architecture

Plugins are npm packages named `elisa-plugin-*`. Each package exports a manifest object conforming to the `ElisaPlugin` interface. A core `PluginManager` service discovers installed plugins, validates their manifests, and wires their contributions into typed registries (blocks, schemas, commands, UI items). Plugins are full-stack — a single package can contribute frontend blocks, backend schema extensions, CLI commands, agent prompts, sidebar items, and modals.

## Tech Stack

TypeScript 5.9, React 19 (lazy-loaded plugin components), Blockly 12, Zod 4 (manifest + config validation), Commander 13 (CLI command registration), npm (distribution)

---

## 1. ElisaPlugin Manifest Interface

Every plugin's default export conforms to this interface:

```typescript
export interface ElisaPlugin {
  id: string;                    // Unique ID, matches npm suffix (e.g., "openclaw")
  name: string;                  // Human-readable name
  description: string;           // Short description
  version: string;               // SemVer
  elisaVersion: string;          // Minimum ELISA version (e.g., ">=0.2.0")
  dependencies?: string[];       // Plugin IDs this plugin depends on

  frontend?: {
    blockDefinitions?: unknown[];              // Blockly JSON block defs
    toolboxCategories?: ToolboxCategory[];     // Toolbox categories to append
    blockPrefix?: string;                      // Block type prefix (e.g., "oc_")
    blockHue?: number;                         // Visual grouping hue
    interpretBlocks?: (workspace: Record<string, unknown>) => unknown | null;
    sidebarItems?: SidebarItemDef[];           // Sidebar buttons/toggles
    modals?: ModalDef[];                       // Lazy-loaded React modal components
  };

  backend?: {
    configSchema?: ZodType;                    // Zod schema for spec.plugins[id]
    portalCommands?: string[];                 // CLI tools allowed in portal service
    promptTemplates?: Record<string, string>;  // Agent prompt templates by role
    validateSpec?: (spec: unknown) => ValidationResult;
  };

  cli?: {
    commands?: CliCommandDef[];                // Commander command definitions
  };

  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
}
```

### Sub-type definitions

```typescript
interface SidebarItemDef {
  key: string;                   // Unique key
  label: string;                 // Button label
  color: string;                 // Tailwind color fragment (e.g., "orange-500")
  type: 'toggle' | 'button';    // Toggle enables/disables; button opens modal
  opensModal?: string;           // Modal key to open (if type is 'button')
}

interface ModalDef {
  key: string;                   // Matches sidebarItem.opensModal
  title: string;                 // Modal title bar text
  component: () => Promise<{ default: React.ComponentType<PluginModalProps> }>;
}

interface PluginModalProps {
  pluginConfig: unknown;
  onConfigChange: (config: unknown) => void;
  onClose: () => void;
}

interface CliCommandDef {
  command: string;               // Commander pattern (e.g., "skill <description>")
  description: string;
  options?: Array<{ flags: string; description: string; default?: string }>;
  handler: () => Promise<{ default: (args: unknown, options: unknown) => Promise<void> }>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

---

## 2. Plugin Manager — Discovery, Loading, Lifecycle

### Discovery

On startup, PluginManager scans `node_modules` for `elisa-plugin-*` packages and imports each default export. A state file (`~/.elisa/plugins.json`) tracks enabled/disabled status.

### Loading order

Plugins are topologically sorted by `dependencies`. Circular dependencies are rejected at load time.

### Lifecycle

```
install (npm install elisa-plugin-foo)
    |
discover (scan node_modules on startup)
    |
validate (manifest shape, elisaVersion compat, dependencies)
    |
enable (register contributions into registries)
    |
  [running -- blocks/commands/schemas active]
    |
disable (unregister contributions, call onDisable)
    |
uninstall (npm uninstall elisa-plugin-foo)
```

### State file (`~/.elisa/plugins.json`)

```json
{
  "enabled": {
    "openclaw": { "version": "1.0.0", "enabledAt": "2026-02-25T..." }
  },
  "disabled": {}
}
```

### Key behaviors

- **Enable** registers block definitions, merges toolbox categories, extends portal allowlist, registers CLI commands, adds Zod schema to spec validator, calls `onEnable()`.
- **Disable** reverses all registrations, calls `onDisable()`. Existing blocks on workspace become grey "unknown block" stubs (no data loss).
- **Hot toggle** in UI updates the Blockly toolbox live via `workspace.updateToolbox()`.
- **Validation on load** skips plugins with incompatible `elisaVersion` or missing dependencies (warning, not crash).
- **New plugins default to disabled** until explicitly enabled by the user.

---

## 3. NuggetSpec Integration — The `plugins` Field

### Schema change

Replace hardcoded `openclawConfig` with a generic extension point:

```typescript
{
  nugget: { goal, type, description },
  // ... core fields ...
  plugins?: Record<string, unknown>   // Each plugin owns its namespace
}
```

OpenClaw data moves from `spec.openclawConfig` to `spec.plugins.openclaw`.

### Validation flow

1. Core Zod schema validates core fields + `plugins: z.record(z.string(), z.unknown()).optional()`
2. PluginManager iterates enabled plugins and validates `spec.plugins[pluginId]` against each plugin's `configSchema`
3. Errors attributed with plugin name: `"[openclaw] primaryEnv not in requires.env"`

### Interpretation flow (frontend)

1. `blockInterpreter.ts` interprets core blocks (unchanged)
2. PluginManager calls each plugin's `interpretBlocks(workspace)`
3. Results merged into `spec.plugins[pluginId]`
4. Combined spec sent to backend on build

### Backward compatibility

Workspace migration converts `spec.openclawConfig` to `spec.plugins.openclaw`. Workspaces with `oc_*` blocks work if plugin is installed; otherwise blocks render as grey stubs with a warning.

---

## 4. Frontend UI Contributions

### Sidebar items

Plugin sidebar items render below a separator in WorkspaceSidebar, grouped by plugin. Toggle items enable/disable the plugin's blocks. Button items open the plugin's modal.

### Modals

Plugin modals are lazy-loaded via `React.lazy()` wrapping the component factory. ELISA core provides the modal shell (backdrop, title, close button); the plugin renders inner content. Plugin modal components receive `PluginModalProps` (config, onChange, onClose).

### App.tsx orchestration

```typescript
const [activePluginModal, setActivePluginModal] = useState<string | null>(null);
const pluginSidebarItems = pluginManager.getSidebarItems();
const activeModal = pluginManager.getModal(activePluginModal);

// WorkspaceSidebar receives plugin items generically
// Generic PluginModalShell + Suspense renders any plugin modal
```

### Plugin management UI

A "Plugins" button in WorkspaceSidebar (core) opens a PluginsModal showing all installed plugins with name, version, description, and an enable/disable toggle. No restart required.

---

## 5. CLI and Portal Service Extensions

### CLI commands

Plugins declare `CliCommandDef` objects. On CLI startup, `createProgram()` asks PluginManager for all registered commands and registers them with Commander. Commands are namespaced in help output with plugin ID.

### Portal commands

`ALLOWED_COMMANDS` becomes dynamic. Core commands are a static set; plugin commands are added from enabled plugins' `portalCommands` arrays. `getAllowedCommands()` builds the merged set on each call. Disabling a plugin removes its commands from the allowlist.

### Prompt templates

Plugins that define `promptTemplates` make them available by role name. The session service looks up templates via `pluginManager.getPromptTemplate(role)`.

---

## 6. Plugin Installation and Management

### User workflow

```bash
npm install elisa-plugin-openclaw    # Install
npm uninstall elisa-plugin-openclaw  # Remove

elisa plugins                        # List installed + status
elisa plugins enable openclaw        # Enable
elisa plugins disable openclaw       # Disable
```

### Workspace portability

Saved `.elisa` nugget files include required plugin IDs + versions in metadata. Loading a nugget with missing plugins shows a warning.

---

## 7. Error Handling and Security

### Error isolation

- **Load failure** — Plugin skipped with console warning; others load normally.
- **Interpreter failure** — Caught; plugin config omitted; notification shown.
- **Schema validation failure** — Surfaced in build validation, attributed to plugin.
- **Modal render failure** — ErrorBoundary catches; shows "plugin encountered an error."
- **CLI handler failure** — Caught; clean error message with plugin name.

### Security

- **Trust boundary is npm** — Installing a package means trusting its code (standard Electron/Node model).
- **Portal allowlist** — Plugin commands only active while plugin is enabled.
- **Block prefix enforcement** — PluginManager rejects plugins whose block types don't match their declared `blockPrefix`. Prevents overriding core or other plugins' blocks.

---

## 8. OpenClaw Extraction

OpenClaw becomes `elisa-plugin-openclaw`, a separate npm package.

### New package structure

```
packages/elisa-plugin-openclaw/
  src/
    index.ts               # ElisaPlugin manifest (default export)
    frontend/
      blocks.ts            # Block definitions (24 blocks, 6 categories)
      interpreter.ts       # Workspace JSON -> OpenClawConfig compiler
      toolboxCategories.ts # Toolbox category definitions
    backend/
      configSchema.ts      # Zod schemas for OpenClaw config
      skillValidator.ts    # SKILL.md frontmatter validator
      prompts.ts           # Skill Forge agent prompt template
    cli/
      skillCommand.ts      # `elisa skill` command handler
  tests/
    ...
```

### Core removals

| File | Action |
|------|--------|
| `frontend/.../openclawBlocks.ts` | Delete (moved to plugin) |
| `frontend/.../openclawInterpreter.ts` | Delete (moved to plugin) |
| `frontend/.../openclawRegistry.ts` | Delete (replaced by PluginManager) |
| `backend/.../openclawSkillValidator.ts` | Delete (moved to plugin) |
| `backend/.../skillForgeAgent.ts` | Delete (moved to plugin) |
| `backend/.../specValidator.ts` | Modify (remove OC schemas, add generic `plugins` field) |
| `backend/.../portalService.ts` | Modify (dynamic allowlist) |
| `cli/.../skill.ts` | Delete (moved to plugin) |
| `cli/.../cli.ts` | Modify (remove `skill` cmd, add plugin command loop) |
| `App.tsx` | Modify (generic plugin state replaces `openclawEnabled`) |
| `BlockCanvas.tsx` | Modify (PluginManager for toolbox, not OC imports) |
| `WorkspaceSidebar.tsx` | Modify (generic plugin items, not OC toggle) |

### Core additions

| File | Purpose |
|------|---------|
| `shared/src/pluginTypes.ts` | `ElisaPlugin` interface and sub-types |
| `shared/src/pluginManager.ts` | Discovery, validation, lifecycle, registries |
| `shared/src/pluginValidator.ts` | Manifest validation (Zod) |
| `frontend/.../PluginsModal.tsx` | Plugin management UI |
| `cli/src/commands/plugins.ts` | `elisa plugins` CLI command |

---

## Architecture Diagram

```
+--------------------------------------------------+
|                    ELISA Core                     |
|                                                   |
|  PluginManager  <-- discovers -->  node_modules   |
|       |              elisa-plugin-*               |
|       |                                           |
|  +----v--------------------------------------+    |
|  |         Plugin Registries                 |    |
|  |  Block Registry    | Spec Schema         |    |
|  |  Toolbox Registry  | Portal Allowlist     |    |
|  |  Sidebar Registry  | Prompt Templates     |    |
|  |  Modal Registry    | CLI Commands         |    |
|  +-------------------------------------------+    |
|                                                   |
|  BlockCanvas <- block/toolbox registries          |
|  App.tsx <- sidebar/modal registries              |
|  specValidator <- schema registry                 |
|  portalService <- allowlist registry              |
|  cli.ts <- command registry                       |
+--------------------------------------------------+

+------------------------+  +------------------------+
| elisa-plugin-openclaw  |  | elisa-plugin-foo       |
|  blocks (24, oc_*)     |  |  blocks (N, foo_*)     |
|  interpreter           |  |  interpreter           |
|  config schema         |  |  config schema         |
|  portal cmds           |  |  modals                |
|  prompt templates      |  |  ...                   |
|  CLI: skill cmd        |  |                        |
+------------------------+  +------------------------+
```

## Testing Strategy

- **PluginManager unit tests** — Discovery, validation, lifecycle, dependency resolution, error isolation.
- **Contract validation utility** — `validatePluginManifest(manifest)` for plugin authors.
- **Integration test fixture** — Mock `elisa-plugin-test-fixture` used in core tests.
- **Plugin authoring guide** — `docs/plugin-authoring.md` with interface, example, and testing instructions.
