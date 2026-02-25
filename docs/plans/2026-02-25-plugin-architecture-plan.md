# Plugin Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a manifest-driven plugin system for ELISA so integrations like OpenClaw ship as installable/removable npm packages (`elisa-plugin-*`).

**Architecture:** A `PluginManager` discovers `elisa-plugin-*` packages in `node_modules`, validates their manifests against an `ElisaPlugin` TypeScript interface, and wires contributions into typed registries (blocks, schemas, commands, sidebar items, modals). Core ELISA code queries these registries instead of importing plugin-specific modules directly. OpenClaw is extracted from core into `elisa-plugin-openclaw`.

**Tech Stack:** TypeScript 5.9, React 19, Blockly 12, Zod 4, Commander 13, Vitest

**Design doc:** `docs/plans/2026-02-25-plugin-architecture-design.md`

**Branch:** Create `feature/plugin-architecture` off `feature/openclaw-bridge`

---

## Task 1: Plugin Type Definitions

**Files:**
- Create: `frontend/src/lib/pluginTypes.ts`
- Test: `frontend/src/lib/pluginTypes.test.ts`

**Context:** The `ElisaPlugin` interface is the contract every plugin implements. It lives in `frontend/src/lib/` because the frontend is the primary consumer (block registration, UI items, modals). Backend and CLI will import a subset of these types. The interface must be serialization-friendly — no class instances, only plain objects and functions.

**Step 1: Write the failing test**

`frontend/src/lib/pluginTypes.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type {
  ElisaPlugin,
  SidebarItemDef,
  ModalDef,
  CliCommandDef,
  PluginModalProps,
  PluginValidationResult,
} from './pluginTypes';
import { validatePluginManifest } from './pluginTypes';

describe('validatePluginManifest', () => {
  const minimal: ElisaPlugin = {
    id: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    version: '1.0.0',
    elisaVersion: '>=0.1.0',
  };

  it('accepts a minimal valid manifest', () => {
    const result = validatePluginManifest(minimal);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing id', () => {
    const result = validatePluginManifest({ ...minimal, id: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('rejects missing name', () => {
    const result = validatePluginManifest({ ...minimal, name: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects missing version', () => {
    const result = validatePluginManifest({ ...minimal, version: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects missing elisaVersion', () => {
    const result = validatePluginManifest({ ...minimal, elisaVersion: '' });
    expect(result.valid).toBe(false);
  });

  it('accepts manifest with frontend contributions', () => {
    const result = validatePluginManifest({
      ...minimal,
      frontend: {
        blockDefinitions: [{ type: 'test_block', message0: 'Test', colour: 20 }],
        toolboxCategories: [{ kind: 'category', name: 'Test', colour: '20', contents: [] }],
        blockPrefix: 'test_',
        blockHue: 20,
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts manifest with backend contributions', () => {
    const result = validatePluginManifest({
      ...minimal,
      backend: {
        portalCommands: ['mytool'],
        promptTemplates: { builder: 'You are a builder...' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts manifest with CLI contributions', () => {
    const result = validatePluginManifest({
      ...minimal,
      cli: {
        commands: [{
          command: 'test <arg>',
          description: 'A test command',
          handler: () => Promise.resolve({ default: async () => {} }),
        }],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects blockDefinitions with wrong prefix', () => {
    const result = validatePluginManifest({
      ...minimal,
      frontend: {
        blockDefinitions: [{ type: 'wrong_block', message0: 'Test', colour: 20 }],
        blockPrefix: 'test_',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('prefix'))).toBe(true);
  });

  it('rejects id with spaces', () => {
    const result = validatePluginManifest({ ...minimal, id: 'bad id' });
    expect(result.valid).toBe(false);
  });

  it('accepts manifest with sidebar items', () => {
    const result = validatePluginManifest({
      ...minimal,
      frontend: {
        sidebarItems: [{
          key: 'test-toggle',
          label: 'Test',
          color: 'blue-500',
          type: 'toggle' as const,
        }],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts manifest with dependencies', () => {
    const result = validatePluginManifest({
      ...minimal,
      dependencies: ['other-plugin'],
    });
    expect(result.valid).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/pluginTypes.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`frontend/src/lib/pluginTypes.ts`:
```typescript
/** Plugin type definitions and manifest validator for the ELISA plugin system.
 *
 * Every plugin is an npm package (elisa-plugin-*) whose default export
 * conforms to the ElisaPlugin interface.
 */

import type { ComponentType } from 'react';

// --- UI contribution types ---

export interface SidebarItemDef {
  /** Unique key for this sidebar item */
  key: string;
  /** Label shown on the button */
  label: string;
  /** Tailwind color fragment (e.g., "orange-500") */
  color: string;
  /** Toggle enables/disables plugin; button opens a modal */
  type: 'toggle' | 'button';
  /** Modal key to open when clicked (if type is 'button') */
  opensModal?: string;
}

export interface PluginModalProps {
  pluginConfig: unknown;
  onConfigChange: (config: unknown) => void;
  onClose: () => void;
}

export interface ModalDef {
  /** Unique key matching sidebarItem.opensModal */
  key: string;
  /** Modal title bar text */
  title: string;
  /** Lazy-loadable React component factory */
  component: () => Promise<{ default: ComponentType<PluginModalProps> }>;
}

// --- CLI contribution types ---

export interface CliCommandDef {
  /** Commander command pattern (e.g., "skill <description>") */
  command: string;
  /** Help text */
  description: string;
  /** Command options */
  options?: Array<{ flags: string; description: string; default?: string }>;
  /** Lazy handler factory */
  handler: () => Promise<{ default: (...args: unknown[]) => Promise<void> }>;
}

// --- Toolbox category type (matches Blockly toolbox structure) ---

export interface ToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: Array<{ kind: 'block'; type: string }>;
}

// --- Validation result ---

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// --- Backend contribution types ---

export interface BackendContributions {
  /** Zod schema for this plugin's config (validated against spec.plugins[id]) */
  configSchema?: unknown;
  /** CLI commands allowed in portal service */
  portalCommands?: string[];
  /** Agent prompt templates keyed by role name */
  promptTemplates?: Record<string, string>;
  /** Custom spec validator */
  validateSpec?: (spec: unknown) => PluginValidationResult;
}

// --- The main plugin interface ---

export interface ElisaPlugin {
  /** Unique identifier — must be kebab-case, matches npm package suffix */
  id: string;
  /** Human-readable name shown in UI */
  name: string;
  /** Short description */
  description: string;
  /** SemVer version */
  version: string;
  /** Minimum ELISA version required (e.g., ">=0.2.0") */
  elisaVersion: string;
  /** Plugin IDs this plugin depends on */
  dependencies?: string[];

  /** Frontend contributions */
  frontend?: {
    blockDefinitions?: unknown[];
    toolboxCategories?: ToolboxCategory[];
    blockPrefix?: string;
    blockHue?: number;
    interpretBlocks?: (workspace: Record<string, unknown>) => unknown | null;
    sidebarItems?: SidebarItemDef[];
    modals?: ModalDef[];
  };

  /** Backend contributions */
  backend?: BackendContributions;

  /** CLI contributions */
  cli?: {
    commands?: CliCommandDef[];
  };

  /** Called when plugin is enabled */
  onEnable?: () => Promise<void>;
  /** Called when plugin is disabled */
  onDisable?: () => Promise<void>;
}

// --- Manifest validation ---

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function validatePluginManifest(manifest: ElisaPlugin): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required string fields
  if (!manifest.id) errors.push('id is required');
  else if (!KEBAB_CASE.test(manifest.id)) errors.push('id must be kebab-case (e.g., "my-plugin")');

  if (!manifest.name) errors.push('name is required');
  if (!manifest.description) errors.push('description is required');
  if (!manifest.version) errors.push('version is required');
  if (!manifest.elisaVersion) errors.push('elisaVersion is required');

  // Block prefix enforcement
  const prefix = manifest.frontend?.blockPrefix;
  const defs = manifest.frontend?.blockDefinitions;
  if (prefix && defs) {
    for (const def of defs) {
      const type = (def as { type?: string }).type;
      if (type && !type.startsWith(prefix)) {
        errors.push(
          `Block type "${type}" does not start with declared prefix "${prefix}"`,
        );
      }
    }
  }

  // Sidebar item validation
  for (const item of manifest.frontend?.sidebarItems ?? []) {
    if (!item.key) errors.push('Sidebar item missing key');
    if (!item.label) errors.push('Sidebar item missing label');
    if (item.type === 'button' && !item.opensModal) {
      warnings.push(`Sidebar item "${item.key}" is type "button" but has no opensModal`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/pluginTypes.test.ts`
Expected: PASS (12 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/pluginTypes.ts frontend/src/lib/pluginTypes.test.ts
git commit -m "feat: add ElisaPlugin interface and manifest validator"
```

---

## Task 2: Plugin Manager — Core Registry

**Files:**
- Create: `frontend/src/lib/pluginManager.ts`
- Test: `frontend/src/lib/pluginManager.test.ts`

**Context:** The PluginManager maintains registries for all plugin contributions and provides methods to enable/disable plugins. It does NOT handle npm discovery (that's Task 3) — it works with already-loaded manifests. This separation makes it testable without filesystem access.

**Step 1: Write the failing test**

`frontend/src/lib/pluginManager.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from './pluginManager';
import type { ElisaPlugin } from './pluginTypes';

const testPlugin: ElisaPlugin = {
  id: 'test',
  name: 'Test Plugin',
  description: 'A test',
  version: '1.0.0',
  elisaVersion: '>=0.1.0',
  frontend: {
    blockDefinitions: [
      { type: 'test_hello', message0: 'Hello', colour: 120, previousStatement: null, nextStatement: null, tooltip: 'Test', args0: [] },
    ],
    toolboxCategories: [
      { kind: 'category' as const, name: 'Test', colour: '120', contents: [{ kind: 'block' as const, type: 'test_hello' }] },
    ],
    blockPrefix: 'test_',
    blockHue: 120,
    sidebarItems: [
      { key: 'test-toggle', label: 'Test', color: 'green-500', type: 'toggle' as const },
    ],
  },
  backend: {
    portalCommands: ['testtool'],
    promptTemplates: { testRole: 'You are a test agent' },
  },
};

const secondPlugin: ElisaPlugin = {
  id: 'other',
  name: 'Other Plugin',
  description: 'Another',
  version: '0.1.0',
  elisaVersion: '>=0.1.0',
  frontend: {
    blockDefinitions: [
      { type: 'other_block', message0: 'Other', colour: 60, previousStatement: null, nextStatement: null, tooltip: 'Other', args0: [] },
    ],
    toolboxCategories: [
      { kind: 'category' as const, name: 'Other', colour: '60', contents: [{ kind: 'block' as const, type: 'other_block' }] },
    ],
    blockPrefix: 'other_',
    blockHue: 60,
  },
};

describe('PluginManager', () => {
  let pm: PluginManager;

  beforeEach(() => {
    pm = new PluginManager();
  });

  describe('register and enable', () => {
    it('registers a plugin', () => {
      pm.register(testPlugin);
      expect(pm.getAll()).toHaveLength(1);
      expect(pm.getAll()[0].id).toBe('test');
    });

    it('plugin starts disabled after registration', () => {
      pm.register(testPlugin);
      expect(pm.isEnabled('test')).toBe(false);
    });

    it('enables a registered plugin', () => {
      pm.register(testPlugin);
      pm.enable('test');
      expect(pm.isEnabled('test')).toBe(true);
    });

    it('disables an enabled plugin', () => {
      pm.register(testPlugin);
      pm.enable('test');
      pm.disable('test');
      expect(pm.isEnabled('test')).toBe(false);
    });

    it('throws when enabling unregistered plugin', () => {
      expect(() => pm.enable('nonexistent')).toThrow();
    });

    it('rejects plugin with invalid manifest', () => {
      const bad = { ...testPlugin, id: '' };
      expect(() => pm.register(bad)).toThrow();
    });

    it('rejects duplicate plugin IDs', () => {
      pm.register(testPlugin);
      expect(() => pm.register(testPlugin)).toThrow();
    });
  });

  describe('getEnabled', () => {
    it('returns only enabled plugins', () => {
      pm.register(testPlugin);
      pm.register(secondPlugin);
      pm.enable('test');
      expect(pm.getEnabled()).toHaveLength(1);
      expect(pm.getEnabled()[0].id).toBe('test');
    });
  });

  describe('toolbox categories', () => {
    it('returns no categories when no plugins enabled', () => {
      pm.register(testPlugin);
      expect(pm.getToolboxCategories()).toEqual([]);
    });

    it('returns categories from enabled plugins', () => {
      pm.register(testPlugin);
      pm.enable('test');
      const cats = pm.getToolboxCategories();
      expect(cats).toHaveLength(1);
      expect(cats[0].name).toBe('Test');
    });

    it('merges categories from multiple enabled plugins', () => {
      pm.register(testPlugin);
      pm.register(secondPlugin);
      pm.enable('test');
      pm.enable('other');
      expect(pm.getToolboxCategories()).toHaveLength(2);
    });

    it('removes categories when plugin is disabled', () => {
      pm.register(testPlugin);
      pm.enable('test');
      pm.disable('test');
      expect(pm.getToolboxCategories()).toEqual([]);
    });
  });

  describe('block definitions', () => {
    it('returns block defs from enabled plugins', () => {
      pm.register(testPlugin);
      pm.enable('test');
      expect(pm.getBlockDefinitions()).toHaveLength(1);
      expect(pm.getBlockDefinitions()[0].type).toBe('test_hello');
    });

    it('returns empty array when none enabled', () => {
      pm.register(testPlugin);
      expect(pm.getBlockDefinitions()).toEqual([]);
    });
  });

  describe('portal commands', () => {
    it('returns commands from enabled plugins', () => {
      pm.register(testPlugin);
      pm.enable('test');
      expect(pm.getPortalCommands()).toEqual(['testtool']);
    });

    it('returns empty when none enabled', () => {
      pm.register(testPlugin);
      expect(pm.getPortalCommands()).toEqual([]);
    });
  });

  describe('prompt templates', () => {
    it('returns template by role', () => {
      pm.register(testPlugin);
      pm.enable('test');
      expect(pm.getPromptTemplate('testRole')).toBe('You are a test agent');
    });

    it('returns undefined for unknown role', () => {
      pm.register(testPlugin);
      pm.enable('test');
      expect(pm.getPromptTemplate('unknown')).toBeUndefined();
    });
  });

  describe('sidebar items', () => {
    it('returns items from enabled plugins', () => {
      pm.register(testPlugin);
      pm.enable('test');
      const items = pm.getSidebarItems();
      expect(items).toHaveLength(1);
      expect(items[0].pluginId).toBe('test');
      expect(items[0].item.label).toBe('Test');
    });

    it('returns empty when none enabled', () => {
      pm.register(testPlugin);
      expect(pm.getSidebarItems()).toEqual([]);
    });
  });

  describe('plugin config in spec', () => {
    it('getBlockPrefixes returns prefixes of enabled plugins', () => {
      pm.register(testPlugin);
      pm.register(secondPlugin);
      pm.enable('test');
      pm.enable('other');
      expect(pm.getBlockPrefixes()).toEqual(new Set(['test_', 'other_']));
    });
  });

  describe('unregister', () => {
    it('removes a plugin completely', () => {
      pm.register(testPlugin);
      pm.unregister('test');
      expect(pm.getAll()).toHaveLength(0);
    });

    it('disables before unregistering', () => {
      pm.register(testPlugin);
      pm.enable('test');
      pm.unregister('test');
      expect(pm.getEnabled()).toHaveLength(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/pluginManager.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`frontend/src/lib/pluginManager.ts`:
```typescript
/** Plugin Manager — maintains registries for all plugin contributions.
 *
 * Does NOT handle npm discovery or filesystem scanning. Works with
 * already-loaded ElisaPlugin manifests.
 */

import {
  type ElisaPlugin,
  type SidebarItemDef,
  type ToolboxCategory,
  validatePluginManifest,
} from './pluginTypes';

interface PluginEntry {
  manifest: ElisaPlugin;
  enabled: boolean;
}

export interface PluginSidebarItem {
  pluginId: string;
  item: SidebarItemDef;
}

export class PluginManager {
  private plugins = new Map<string, PluginEntry>();

  /** Register a plugin manifest. Does NOT enable it. */
  register(manifest: ElisaPlugin): void {
    const result = validatePluginManifest(manifest);
    if (!result.valid) {
      throw new Error(
        `Invalid plugin manifest "${manifest.id || '(no id)'}": ${result.errors.join(', ')}`,
      );
    }
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already registered`);
    }
    this.plugins.set(manifest.id, { manifest, enabled: false });
  }

  /** Unregister a plugin, disabling it first if needed. */
  unregister(id: string): void {
    if (this.isEnabled(id)) this.disable(id);
    this.plugins.delete(id);
  }

  /** Enable a registered plugin. */
  enable(id: string): void {
    const entry = this.plugins.get(id);
    if (!entry) throw new Error(`Plugin "${id}" is not registered`);
    entry.enabled = true;
  }

  /** Disable an enabled plugin. */
  disable(id: string): void {
    const entry = this.plugins.get(id);
    if (!entry) return;
    entry.enabled = false;
  }

  isEnabled(id: string): boolean {
    return this.plugins.get(id)?.enabled ?? false;
  }

  getAll(): ElisaPlugin[] {
    return Array.from(this.plugins.values()).map(e => e.manifest);
  }

  getEnabled(): ElisaPlugin[] {
    return Array.from(this.plugins.values())
      .filter(e => e.enabled)
      .map(e => e.manifest);
  }

  /** Get merged toolbox categories from all enabled plugins. */
  getToolboxCategories(): ToolboxCategory[] {
    const cats: ToolboxCategory[] = [];
    for (const plugin of this.getEnabled()) {
      if (plugin.frontend?.toolboxCategories) {
        cats.push(...plugin.frontend.toolboxCategories);
      }
    }
    return cats;
  }

  /** Get all block definitions from enabled plugins. */
  getBlockDefinitions(): unknown[] {
    const defs: unknown[] = [];
    for (const plugin of this.getEnabled()) {
      if (plugin.frontend?.blockDefinitions) {
        defs.push(...plugin.frontend.blockDefinitions);
      }
    }
    return defs;
  }

  /** Get merged portal commands from all enabled plugins. */
  getPortalCommands(): string[] {
    const cmds: string[] = [];
    for (const plugin of this.getEnabled()) {
      if (plugin.backend?.portalCommands) {
        cmds.push(...plugin.backend.portalCommands);
      }
    }
    return cmds;
  }

  /** Look up a prompt template by role name across enabled plugins. */
  getPromptTemplate(role: string): string | undefined {
    for (const plugin of this.getEnabled()) {
      const template = plugin.backend?.promptTemplates?.[role];
      if (template) return template;
    }
    return undefined;
  }

  /** Get sidebar items from all enabled plugins, tagged with plugin ID. */
  getSidebarItems(): PluginSidebarItem[] {
    const items: PluginSidebarItem[] = [];
    for (const plugin of this.getEnabled()) {
      for (const item of plugin.frontend?.sidebarItems ?? []) {
        items.push({ pluginId: plugin.id, item });
      }
    }
    return items;
  }

  /** Get the set of block prefixes from all enabled plugins. */
  getBlockPrefixes(): Set<string> {
    const prefixes = new Set<string>();
    for (const plugin of this.getEnabled()) {
      if (plugin.frontend?.blockPrefix) {
        prefixes.add(plugin.frontend.blockPrefix);
      }
    }
    return prefixes;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/pluginManager.test.ts`
Expected: PASS (20+ tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/pluginManager.ts frontend/src/lib/pluginManager.test.ts
git commit -m "feat: add PluginManager with typed registries"
```

---

## Task 3: Plugin Discovery Service

**Files:**
- Create: `frontend/src/lib/pluginDiscovery.ts`
- Test: `frontend/src/lib/pluginDiscovery.test.ts`

**Context:** Discovers installed `elisa-plugin-*` packages and loads their manifests. In Electron, this scans `node_modules` via Node.js APIs exposed through the preload bridge. In tests, we mock the discovery mechanism. Also manages the `~/.elisa/plugins.json` state file that tracks enabled/disabled state.

**Step 1: Write the failing test**

`frontend/src/lib/pluginDiscovery.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  parsePluginState,
  serializePluginState,
  mergeDiscoveredPlugins,
  type PluginState,
} from './pluginDiscovery';

describe('parsePluginState', () => {
  it('parses valid state JSON', () => {
    const json = '{"enabled":{"test":{"version":"1.0.0"}},"disabled":{}}';
    const state = parsePluginState(json);
    expect(state.enabled.test.version).toBe('1.0.0');
  });

  it('returns empty state for null/undefined', () => {
    const state = parsePluginState(null);
    expect(state.enabled).toEqual({});
    expect(state.disabled).toEqual({});
  });

  it('returns empty state for invalid JSON', () => {
    const state = parsePluginState('not json');
    expect(state.enabled).toEqual({});
  });
});

describe('serializePluginState', () => {
  it('serializes state to JSON string', () => {
    const state: PluginState = {
      enabled: { test: { version: '1.0.0', enabledAt: '2026-01-01' } },
      disabled: {},
    };
    const json = serializePluginState(state);
    expect(JSON.parse(json).enabled.test.version).toBe('1.0.0');
  });
});

describe('mergeDiscoveredPlugins', () => {
  it('marks new plugins as disabled by default', () => {
    const state: PluginState = { enabled: {}, disabled: {} };
    const discovered = ['openclaw', 'home-auto'];
    const merged = mergeDiscoveredPlugins(state, discovered);
    expect(merged.disabled).toHaveProperty('openclaw');
    expect(merged.disabled).toHaveProperty('home-auto');
  });

  it('preserves enabled state for known plugins', () => {
    const state: PluginState = {
      enabled: { openclaw: { version: '1.0.0', enabledAt: '2026-01-01' } },
      disabled: {},
    };
    const merged = mergeDiscoveredPlugins(state, ['openclaw', 'new-one']);
    expect(merged.enabled).toHaveProperty('openclaw');
    expect(merged.disabled).toHaveProperty('new-one');
  });

  it('removes uninstalled plugins from state', () => {
    const state: PluginState = {
      enabled: { removed: { version: '1.0.0', enabledAt: '2026-01-01' } },
      disabled: {},
    };
    const merged = mergeDiscoveredPlugins(state, []);
    expect(merged.enabled).not.toHaveProperty('removed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/pluginDiscovery.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`frontend/src/lib/pluginDiscovery.ts`:
```typescript
/** Plugin discovery — state file management and plugin reconciliation.
 *
 * Actual filesystem scanning for elisa-plugin-* packages is done by
 * the Electron main process and exposed via the preload bridge.
 * This module handles the state file logic.
 */

export interface PluginStateEntry {
  version: string;
  enabledAt?: string;
}

export interface PluginState {
  enabled: Record<string, PluginStateEntry>;
  disabled: Record<string, PluginStateEntry>;
}

const EMPTY_STATE: PluginState = { enabled: {}, disabled: {} };

const LS_PLUGIN_STATE = 'elisa:plugins';

/** Parse plugin state from JSON string (localStorage or file). */
export function parsePluginState(json: string | null | undefined): PluginState {
  if (!json) return { ...EMPTY_STATE, enabled: {}, disabled: {} };
  try {
    const parsed = JSON.parse(json);
    return {
      enabled: parsed.enabled ?? {},
      disabled: parsed.disabled ?? {},
    };
  } catch {
    return { ...EMPTY_STATE, enabled: {}, disabled: {} };
  }
}

/** Serialize plugin state to JSON string. */
export function serializePluginState(state: PluginState): string {
  return JSON.stringify(state, null, 2);
}

/** Reconcile discovered plugin IDs with persisted state.
 *
 * - New plugins (discovered but not in state) are added as disabled.
 * - Removed plugins (in state but not discovered) are pruned.
 * - Existing plugins keep their enabled/disabled status.
 */
export function mergeDiscoveredPlugins(
  state: PluginState,
  discoveredIds: string[],
): PluginState {
  const discovered = new Set(discoveredIds);
  const merged: PluginState = { enabled: {}, disabled: {} };

  // Keep plugins that are still installed
  for (const [id, entry] of Object.entries(state.enabled)) {
    if (discovered.has(id)) {
      merged.enabled[id] = entry;
    }
  }
  for (const [id, entry] of Object.entries(state.disabled)) {
    if (discovered.has(id)) {
      merged.disabled[id] = entry;
    }
  }

  // Add new plugins as disabled
  for (const id of discoveredIds) {
    if (!merged.enabled[id] && !merged.disabled[id]) {
      merged.disabled[id] = { version: '' };
    }
  }

  return merged;
}

/** Load plugin state from localStorage. */
export function loadPluginState(): PluginState {
  return parsePluginState(localStorage.getItem(LS_PLUGIN_STATE));
}

/** Save plugin state to localStorage. */
export function savePluginState(state: PluginState): void {
  localStorage.setItem(LS_PLUGIN_STATE, serializePluginState(state));
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/pluginDiscovery.test.ts`
Expected: PASS (7 tests)

**Step 5: Commit**

```bash
git add frontend/src/lib/pluginDiscovery.ts frontend/src/lib/pluginDiscovery.test.ts
git commit -m "feat: add plugin state management and discovery reconciliation"
```

---

## Task 4: NuggetSpec `plugins` Field

**Files:**
- Modify: `backend/src/utils/specValidator.ts`
- Test: `backend/src/tests/behavioral/pluginsField.test.ts`

**Context:** Replace the hardcoded `openclawConfig` field with a generic `plugins: Record<string, unknown>` field. The core schema accepts any plugin data under `plugins.*`; individual plugin schemas are validated separately by the PluginManager. This must be backward compatible — `openclawConfig` is kept temporarily as a deprecated alias.

**Step 1: Write the failing test**

`backend/src/tests/behavioral/pluginsField.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';

describe('NuggetSpec plugins field', () => {
  const base = {
    nugget: { goal: 'test', type: 'general', description: 'test' },
  };

  it('accepts spec without plugins field (backward compatible)', () => {
    const result = NuggetSpecSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts spec with empty plugins object', () => {
    const result = NuggetSpecSchema.safeParse({ ...base, plugins: {} });
    expect(result.success).toBe(true);
  });

  it('accepts spec with arbitrary plugin data', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      plugins: {
        openclaw: { agents: [], channels: {} },
        'home-auto': { devices: [{ id: 'esp32', type: 'sensor' }] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('still accepts openclawConfig for backward compatibility', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      openclawConfig: { agents: [], channels: {}, bindings: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts both plugins and openclawConfig simultaneously', () => {
    const result = NuggetSpecSchema.safeParse({
      ...base,
      plugins: { 'home-auto': { devices: [] } },
      openclawConfig: { agents: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-object plugins value', () => {
    const result = NuggetSpecSchema.safeParse({ ...base, plugins: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects non-string plugin keys', () => {
    const result = NuggetSpecSchema.safeParse({ ...base, plugins: { 123: {} } });
    // Record<string, unknown> accepts numeric keys as strings in JS, so this should still parse
    // The key validation is done by PluginManager, not the schema
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/pluginsField.test.ts`
Expected: FAIL — `plugins` key rejected by `.strict()` on NuggetSpecSchema

**Step 3: Write implementation**

In `backend/src/utils/specValidator.ts`, add the `plugins` field to the `NuggetSpecSchema` object (near line 235, next to `openclawConfig`):

```typescript
  plugins: z.record(z.string(), z.unknown()).optional(),
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/pluginsField.test.ts`
Expected: PASS (7 tests)

Also run existing tests to verify no regressions:
Run: `cd backend && npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add backend/src/utils/specValidator.ts backend/src/tests/behavioral/pluginsField.test.ts
git commit -m "feat(backend): add generic plugins field to NuggetSpec schema"
```

---

## Task 5: Dynamic Portal Command Allowlist

**Files:**
- Modify: `backend/src/services/portalService.ts`
- Test: `backend/src/tests/behavioral/dynamicPortalCommands.test.ts`

**Context:** The static `ALLOWED_COMMANDS` set becomes a core set plus dynamically registered plugin commands. Export a `registerPortalCommands()` function and a `getAllowedCommands()` getter. The existing `ALLOWED_COMMANDS` export is preserved for backward compatibility but now returns the dynamic set.

**Step 1: Write the failing test**

`backend/src/tests/behavioral/dynamicPortalCommands.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CORE_COMMANDS,
  registerPluginCommands,
  unregisterPluginCommands,
  getAllowedCommands,
  validateCommand,
} from '../../services/portalService.js';

describe('dynamic portal commands', () => {
  beforeEach(() => {
    // Clean up any registered plugin commands between tests
    unregisterPluginCommands('test-plugin');
    unregisterPluginCommands('other-plugin');
  });

  it('CORE_COMMANDS contains base commands', () => {
    expect(CORE_COMMANDS.has('node')).toBe(true);
    expect(CORE_COMMANDS.has('npx')).toBe(true);
    expect(CORE_COMMANDS.has('python')).toBe(true);
  });

  it('CORE_COMMANDS does not contain openclaw (moved to plugin)', () => {
    expect(CORE_COMMANDS.has('openclaw')).toBe(false);
    expect(CORE_COMMANDS.has('clawhub')).toBe(false);
  });

  it('getAllowedCommands returns core commands when no plugins registered', () => {
    const cmds = getAllowedCommands();
    expect(cmds.has('node')).toBe(true);
    expect(cmds.has('openclaw')).toBe(false);
  });

  it('registerPluginCommands adds commands', () => {
    registerPluginCommands('test-plugin', ['mytool', 'othertool']);
    const cmds = getAllowedCommands();
    expect(cmds.has('mytool')).toBe(true);
    expect(cmds.has('othertool')).toBe(true);
  });

  it('unregisterPluginCommands removes commands', () => {
    registerPluginCommands('test-plugin', ['mytool']);
    unregisterPluginCommands('test-plugin');
    expect(getAllowedCommands().has('mytool')).toBe(false);
  });

  it('validateCommand accepts plugin-registered commands', () => {
    registerPluginCommands('test-plugin', ['mytool']);
    expect(() => validateCommand('mytool')).not.toThrow();
  });

  it('validateCommand rejects unregistered commands', () => {
    expect(() => validateCommand('hacktool')).toThrow();
  });

  it('multiple plugins can register commands independently', () => {
    registerPluginCommands('test-plugin', ['tool-a']);
    registerPluginCommands('other-plugin', ['tool-b']);
    const cmds = getAllowedCommands();
    expect(cmds.has('tool-a')).toBe(true);
    expect(cmds.has('tool-b')).toBe(true);
  });

  it('unregistering one plugin does not affect another', () => {
    registerPluginCommands('test-plugin', ['tool-a']);
    registerPluginCommands('other-plugin', ['tool-b']);
    unregisterPluginCommands('test-plugin');
    expect(getAllowedCommands().has('tool-a')).toBe(false);
    expect(getAllowedCommands().has('tool-b')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/dynamicPortalCommands.test.ts`
Expected: FAIL — `CORE_COMMANDS`, `registerPluginCommands`, `unregisterPluginCommands`, `getAllowedCommands` not exported

**Step 3: Write implementation**

In `backend/src/services/portalService.ts`, replace the static `ALLOWED_COMMANDS` with a dynamic system:

```typescript
/** Core commands always available (no plugin needed). */
export const CORE_COMMANDS: ReadonlySet<string> = new Set([
  'node', 'npx', 'python', 'python3', 'uvx',
  'docker', 'deno', 'bun', 'bunx', 'gcloud', 'firebase',
]);

/** Plugin-registered commands, keyed by plugin ID. */
const pluginCommands = new Map<string, string[]>();

/** Register portal commands contributed by a plugin. */
export function registerPluginCommands(pluginId: string, commands: string[]): void {
  pluginCommands.set(pluginId, commands);
}

/** Unregister portal commands when a plugin is disabled. */
export function unregisterPluginCommands(pluginId: string): void {
  pluginCommands.delete(pluginId);
}

/** Get the full set of allowed commands (core + all enabled plugins). */
export function getAllowedCommands(): ReadonlySet<string> {
  const all = new Set(CORE_COMMANDS);
  for (const cmds of pluginCommands.values()) {
    for (const cmd of cmds) all.add(cmd);
  }
  return all;
}

/** @deprecated Use getAllowedCommands() instead. Kept for backward compatibility. */
export const ALLOWED_COMMANDS: ReadonlySet<string> = new Proxy(CORE_COMMANDS, {
  get(target, prop) {
    if (prop === 'has') {
      return (value: string) => getAllowedCommands().has(value);
    }
    if (prop === 'size') {
      return getAllowedCommands().size;
    }
    return Reflect.get(target, prop);
  },
});
```

Update `validateCommand()` to use `getAllowedCommands()` instead of `ALLOWED_COMMANDS`:

```typescript
export function validateCommand(command: string): void {
  if (!command || typeof command !== 'string') {
    throw new Error('Portal command must be a non-empty string');
  }
  const base = command.replace(/\\/g, '/').split('/').pop()!;
  const normalized = base.replace(/\.(exe|cmd|bat)$/i, '');
  if (!getAllowedCommands().has(normalized)) {
    throw new Error(`Portal command "${command}" is not allowed. Allowed: ${[...getAllowedCommands()].join(', ')}`);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/dynamicPortalCommands.test.ts`
Expected: PASS (9 tests)

Also run all backend tests for regressions:
Run: `cd backend && npx vitest run`
Expected: All tests pass (the existing `openclawPortalCommands.test.ts` may need updating since `openclaw`/`clawhub` are removed from CORE_COMMANDS — update that test or remove it)

**Step 5: Commit**

```bash
git add backend/src/services/portalService.ts backend/src/tests/behavioral/dynamicPortalCommands.test.ts
git commit -m "feat(backend): make portal command allowlist dynamic for plugin registration"
```

---

## Task 6: Plugins Modal UI

**Files:**
- Create: `frontend/src/components/shared/PluginsModal.tsx`
- Test: `frontend/src/components/shared/PluginsModal.test.tsx`

**Context:** A modal that lists all installed plugins with enable/disable toggles. Follows the same modal pattern as `SkillsModal.tsx` — fixed positioning with backdrop overlay. Receives the PluginManager instance (or plugin list + callbacks) as props.

**Step 1: Write the failing test**

`frontend/src/components/shared/PluginsModal.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PluginsModal from './PluginsModal';

const plugins = [
  { id: 'openclaw', name: 'OpenClaw Bridge', description: 'Visual blocks for OpenClaw', version: '1.0.0', enabled: true },
  { id: 'home-auto', name: 'Home Automation', description: 'ESP32 + MQTT blocks', version: '0.3.1', enabled: false },
];

describe('PluginsModal', () => {
  it('renders plugin list', () => {
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('OpenClaw Bridge')).toBeInTheDocument();
    expect(screen.getByText('Home Automation')).toBeInTheDocument();
  });

  it('shows version for each plugin', () => {
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v0.3.1')).toBeInTheDocument();
  });

  it('shows description for each plugin', () => {
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Visual blocks for OpenClaw')).toBeInTheDocument();
  });

  it('calls onToggle when toggle is clicked', () => {
    const onToggle = vi.fn();
    render(<PluginsModal plugins={plugins} onToggle={onToggle} onClose={vi.fn()} />);
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[1]); // Toggle home-auto (disabled)
    expect(onToggle).toHaveBeenCalledWith('home-auto');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows install hint text', () => {
    render(<PluginsModal plugins={plugins} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/npm install/)).toBeInTheDocument();
  });

  it('renders empty state when no plugins installed', () => {
    render(<PluginsModal plugins={[]} onToggle={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/No plugins installed/)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/shared/PluginsModal.test.tsx`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`frontend/src/components/shared/PluginsModal.tsx`:
```typescript
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
}

interface PluginsModalProps {
  plugins: PluginInfo[];
  onToggle: (pluginId: string) => void;
  onClose: () => void;
}

export default function PluginsModal({ plugins, onToggle, onClose }: PluginsModalProps) {
  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugins-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 animate-float-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="plugins-modal-title" className="text-lg font-display font-bold gradient-text-warm">
            Plugins
          </h2>
          <button
            onClick={onClose}
            className="text-atelier-text-secondary hover:text-atelier-text cursor-pointer"
            aria-label="Close"
          >
            x
          </button>
        </div>

        {plugins.length === 0 ? (
          <div className="text-center py-8 text-atelier-text-secondary text-sm">
            <p>No plugins installed.</p>
            <p className="mt-2 text-xs text-atelier-text-muted">
              Install plugins with: <code className="bg-atelier-surface px-1 rounded">npm install elisa-plugin-&lt;name&gt;</code>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plugins.map(plugin => (
              <div
                key={plugin.id}
                className="flex items-start justify-between p-3 rounded-xl border border-border-subtle bg-atelier-surface/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-atelier-text">{plugin.name}</span>
                    <span className="text-xs text-atelier-text-muted">v{plugin.version}</span>
                  </div>
                  <p className="text-xs text-atelier-text-secondary mt-0.5">{plugin.description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={plugin.enabled}
                  onClick={() => onToggle(plugin.id)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ml-3 mt-0.5 ${
                    plugin.enabled ? 'bg-green-500' : 'bg-atelier-text-muted/30'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      plugin.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}

            <p className="text-xs text-atelier-text-muted text-center pt-2">
              Install: <code className="bg-atelier-surface px-1 rounded">npm install elisa-plugin-&lt;name&gt;</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/shared/PluginsModal.test.tsx`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add frontend/src/components/shared/PluginsModal.tsx frontend/src/components/shared/PluginsModal.test.tsx
git commit -m "feat(frontend): add PluginsModal for plugin management UI"
```

---

## Task 7: Wire PluginManager into App.tsx and BlockCanvas

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/BlockCanvas/BlockCanvas.tsx`
- Modify: `frontend/src/components/BlockCanvas/WorkspaceSidebar.tsx`
- Test: Verified by running existing test suites

**Context:** Replace the OpenClaw-specific `openclawEnabled` state with a PluginManager instance. The sidebar gets a "Plugins" button that opens PluginsModal. BlockCanvas reads toolbox categories from the PluginManager instead of openclawRegistry. Plugin sidebar items are rendered generically. This is the core wiring task.

**Step 1: Read the current state of all files to modify**

Read: `frontend/src/App.tsx`, `frontend/src/components/BlockCanvas/BlockCanvas.tsx`, `frontend/src/components/BlockCanvas/WorkspaceSidebar.tsx`

**Step 2: Modify BlockCanvas.tsx**

Replace the OpenClaw-specific imports and effect with generic plugin support:

- Remove: `import { getToolboxWithOpenClaw, setOpenClawEnabled } from './openclawRegistry'`
- Remove: `import { registerOpenClawBlocks } from './openclawBlocks'`
- Add: Import `toolbox` from `'./toolbox'` (restore original import)
- Replace prop `openclawEnabled?: boolean` with `pluginToolboxCategories?: ToolboxCategory[]`
- Replace the OpenClaw effect with a generic effect that merges `toolbox.contents` with `pluginToolboxCategories` and calls `workspace.updateToolbox()`

```typescript
import { toolbox } from './toolbox';
import type { ToolboxCategory } from '../../lib/pluginTypes';

// In props:
pluginToolboxCategories?: ToolboxCategory[];

// Replace the OpenClaw effect:
useEffect(() => {
  const ws = workspaceRef.current;
  if (!ws || !ws.updateToolbox) return;
  const merged = {
    ...toolbox,
    contents: [
      ...toolbox.contents,
      ...(pluginToolboxCategories ?? []),
    ],
  };
  ws.updateToolbox(merged);
}, [pluginToolboxCategories]);
```

Also update the initial `Blockly.inject` call to use the merged toolbox.

**Step 3: Modify WorkspaceSidebar.tsx**

Replace OpenClaw-specific props with generic plugin props:

- Remove: `openclawEnabled?: boolean`, `onToggleOpenclaw?: () => void`
- Add: `onPlugins?: () => void` (opens PluginsModal)
- Add: `pluginSidebarItems?: Array<{ pluginId: string; item: SidebarItemDef; enabled: boolean }>`, `onPluginToggle?: (pluginId: string) => void`
- Replace the OpenClaw toggle with a "Plugins" button and dynamic plugin sidebar items

**Step 4: Modify App.tsx**

- Remove: `openclawEnabled` state and `setOpenclawEnabled`
- Add: `PluginManager` instance created once via `useState(() => new PluginManager())`
- Add: `pluginsModalOpen` state
- Add: Plugin enable/disable handlers that call `pm.enable()`/`pm.disable()` and trigger re-render
- Pass `pluginToolboxCategories={pm.getToolboxCategories()}` to BlockCanvas
- Pass `onPlugins={() => setPluginsModalOpen(true)}` to WorkspaceSidebar
- Render PluginsModal when open

**Step 5: Update tests**

Update `BlockCanvas.test.tsx` to remove openclawRegistry/openclawBlocks mocks, add pluginTypes mock if needed.
Update `WorkspaceSidebar.test.tsx` if needed for new props.

**Step 6: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/BlockCanvas/BlockCanvas.tsx frontend/src/components/BlockCanvas/WorkspaceSidebar.tsx frontend/src/components/BlockCanvas/BlockCanvas.test.tsx
git commit -m "feat(frontend): wire PluginManager into App, BlockCanvas, and WorkspaceSidebar"
```

---

## Task 8: CLI `plugins` Command

**Files:**
- Create: `cli/src/commands/plugins.ts`
- Modify: `cli/src/cli.ts`
- Test: `cli/src/__tests__/plugins.test.ts`

**Context:** Adds `elisa plugins`, `elisa plugins enable <id>`, and `elisa plugins disable <id>` commands. Follows the same pattern as `build` and `skill` commands in `cli.ts`. Reads/writes the plugin state file.

**Step 1: Write the failing test**

`cli/src/__tests__/plugins.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createProgram } from '../cli.js';

describe('CLI plugins command registration', () => {
  it('has a "plugins" command', () => {
    const program = createProgram();
    const cmd = program.commands.find(c => c.name() === 'plugins');
    expect(cmd).toBeDefined();
  });

  it('plugins command has enable subcommand', () => {
    const program = createProgram();
    const cmd = program.commands.find(c => c.name() === 'plugins');
    const sub = cmd?.commands.find(c => c.name() === 'enable');
    expect(sub).toBeDefined();
  });

  it('plugins command has disable subcommand', () => {
    const program = createProgram();
    const cmd = program.commands.find(c => c.name() === 'plugins');
    const sub = cmd?.commands.find(c => c.name() === 'disable');
    expect(sub).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run src/__tests__/plugins.test.ts`
Expected: FAIL — no `plugins` command found

**Step 3: Write implementation**

`cli/src/commands/plugins.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PLUGIN_STATE_PATH = path.join(os.homedir(), '.elisa', 'plugins.json');

interface PluginState {
  enabled: Record<string, { version: string; enabledAt?: string }>;
  disabled: Record<string, { version: string }>;
}

function loadState(): PluginState {
  try {
    const raw = fs.readFileSync(PLUGIN_STATE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { enabled: {}, disabled: {} };
  }
}

function saveState(state: PluginState): void {
  const dir = path.dirname(PLUGIN_STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLUGIN_STATE_PATH, JSON.stringify(state, null, 2));
}

export function listPlugins(): void {
  const state = loadState();
  const allEnabled = Object.entries(state.enabled);
  const allDisabled = Object.entries(state.disabled);

  if (allEnabled.length === 0 && allDisabled.length === 0) {
    console.log('No plugins installed.');
    console.log('Install with: npm install elisa-plugin-<name>');
    return;
  }

  console.log('Installed plugins:\n');
  for (const [id, entry] of allEnabled) {
    console.log(`  ${id}  ${entry.version || '?'}  enabled`);
  }
  for (const [id, entry] of allDisabled) {
    console.log(`  ${id}  ${entry.version || '?'}  disabled`);
  }
}

export function enablePlugin(id: string): void {
  const state = loadState();
  const entry = state.disabled[id];
  if (!entry && !state.enabled[id]) {
    console.error(`Plugin "${id}" is not installed.`);
    process.exitCode = 1;
    return;
  }
  if (state.enabled[id]) {
    console.log(`Plugin "${id}" is already enabled.`);
    return;
  }
  state.enabled[id] = { ...entry, enabledAt: new Date().toISOString() };
  delete state.disabled[id];
  saveState(state);
  console.log(`Plugin "${id}" enabled.`);
}

export function disablePlugin(id: string): void {
  const state = loadState();
  const entry = state.enabled[id];
  if (!entry && !state.disabled[id]) {
    console.error(`Plugin "${id}" is not installed.`);
    process.exitCode = 1;
    return;
  }
  if (state.disabled[id]) {
    console.log(`Plugin "${id}" is already disabled.`);
    return;
  }
  state.disabled[id] = { version: entry.version };
  delete state.enabled[id];
  saveState(state);
  console.log(`Plugin "${id}" disabled.`);
}
```

Add to `cli/src/cli.ts` (after the `skill` command registration):

```typescript
  const pluginsCmd = program
    .command('plugins')
    .description('Manage installed plugins');

  pluginsCmd
    .command('list', { isDefault: true })
    .description('List installed plugins')
    .action(async () => {
      const { listPlugins } = await import('./commands/plugins.js');
      listPlugins();
    });

  pluginsCmd
    .command('enable <id>')
    .description('Enable a plugin')
    .action(async (id) => {
      const { enablePlugin } = await import('./commands/plugins.js');
      enablePlugin(id);
    });

  pluginsCmd
    .command('disable <id>')
    .description('Disable a plugin')
    .action(async (id) => {
      const { disablePlugin } = await import('./commands/plugins.js');
      disablePlugin(id);
    });
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run src/__tests__/plugins.test.ts`
Expected: PASS (3 tests)

Run: `cd cli && npx vitest run`
Expected: All CLI tests pass

**Step 5: Commit**

```bash
git add cli/src/commands/plugins.ts cli/src/cli.ts cli/src/__tests__/plugins.test.ts
git commit -m "feat(cli): add elisa plugins command for plugin management"
```

---

## Task 9: Extract OpenClaw into Plugin Package

**Files:**
- Create: `packages/elisa-plugin-openclaw/package.json`
- Create: `packages/elisa-plugin-openclaw/tsconfig.json`
- Create: `packages/elisa-plugin-openclaw/src/index.ts`
- Move: frontend OpenClaw files into plugin package
- Move: backend OpenClaw files into plugin package
- Move: CLI skill command into plugin package
- Delete: `frontend/src/components/BlockCanvas/openclawRegistry.ts` (replaced by PluginManager)
- Modify: `backend/src/utils/specValidator.ts` (remove OpenClaw schemas)
- Modify: `backend/src/services/portalService.ts` (remove `openclaw`/`clawhub` from CORE_COMMANDS)

**Context:** This is the largest task. The goal is to move all OpenClaw-specific code into a self-contained npm package while keeping all tests passing. The plugin's `index.ts` exports an `ElisaPlugin` manifest that wires everything together.

**Step 1: Create the plugin package directory**

```bash
mkdir -p packages/elisa-plugin-openclaw/src/frontend
mkdir -p packages/elisa-plugin-openclaw/src/backend
mkdir -p packages/elisa-plugin-openclaw/src/cli
mkdir -p packages/elisa-plugin-openclaw/tests
```

**Step 2: Create package.json**

`packages/elisa-plugin-openclaw/package.json`:
```json
{
  "name": "elisa-plugin-openclaw",
  "version": "1.0.0",
  "description": "OpenClaw integration plugin for ELISA — visual blocks for gateway configuration, skill generation, and deployment",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "keywords": ["elisa", "plugin", "openclaw"],
  "peerDependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0",
    "zod": "^4.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

`packages/elisa-plugin-openclaw/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 4: Move OpenClaw files**

Move (copy then delete originals):
- `frontend/src/components/BlockCanvas/openclawBlocks.ts` → `packages/elisa-plugin-openclaw/src/frontend/blocks.ts`
- `frontend/src/components/BlockCanvas/openclawInterpreter.ts` → `packages/elisa-plugin-openclaw/src/frontend/interpreter.ts`
- `backend/src/utils/openclawSkillValidator.ts` → `packages/elisa-plugin-openclaw/src/backend/skillValidator.ts`
- `backend/src/prompts/skillForgeAgent.ts` → `packages/elisa-plugin-openclaw/src/backend/prompts.ts`
- `cli/src/commands/skill.ts` → `packages/elisa-plugin-openclaw/src/cli/skillCommand.ts`

Move tests:
- `frontend/src/components/BlockCanvas/openclawBlocks.test.ts` → `packages/elisa-plugin-openclaw/tests/blocks.test.ts`
- `frontend/src/components/BlockCanvas/openclawInterpreter.test.ts` → `packages/elisa-plugin-openclaw/tests/interpreter.test.ts`
- `backend/src/tests/behavioral/openclawSkillValidator.test.ts` → `packages/elisa-plugin-openclaw/tests/skillValidator.test.ts`
- `backend/src/tests/behavioral/skillForgeAgent.test.ts` → `packages/elisa-plugin-openclaw/tests/prompts.test.ts`

Update import paths in moved files as needed.

**Step 5: Create the plugin manifest**

`packages/elisa-plugin-openclaw/src/index.ts`:
```typescript
import { OPENCLAW_BLOCK_DEFS, OPENCLAW_TOOLBOX_CATEGORIES, OC_HUE } from './frontend/blocks.js';
import { interpretOpenClawBlocks } from './frontend/interpreter.js';
import { SKILL_FORGE_PROMPT } from './backend/prompts.js';
import type { ElisaPlugin } from '../../../frontend/src/lib/pluginTypes.js';

const openclawPlugin: ElisaPlugin = {
  id: 'openclaw',
  name: 'OpenClaw Bridge',
  description: 'Visual blocks for OpenClaw gateway configuration, skill generation, and deployment',
  version: '1.0.0',
  elisaVersion: '>=0.2.0',

  frontend: {
    blockDefinitions: OPENCLAW_BLOCK_DEFS,
    toolboxCategories: OPENCLAW_TOOLBOX_CATEGORIES,
    blockPrefix: 'oc_',
    blockHue: OC_HUE,
    interpretBlocks: interpretOpenClawBlocks,
    sidebarItems: [
      { key: 'openclaw-toggle', label: 'OpenClaw', color: 'orange-500', type: 'toggle' },
    ],
  },

  backend: {
    portalCommands: ['openclaw', 'clawhub'],
    promptTemplates: { skillForge: SKILL_FORGE_PROMPT },
  },

  cli: {
    commands: [{
      command: 'skill <description>',
      description: 'Generate, validate, and deploy an OpenClaw skill',
      options: [
        { flags: '--deploy <path>', description: 'Deploy skills to directory' },
        { flags: '--stream', description: 'Stream events as NDJSON' },
        { flags: '--json', description: 'Output final result as JSON' },
        { flags: '--timeout <seconds>', description: 'Max generation time', default: '300' },
        { flags: '--model <model>', description: 'Override agent model' },
      ],
      handler: () => import('./cli/skillCommand.js'),
    }],
  },
};

export default openclawPlugin;
```

**Step 6: Remove OpenClaw from core**

- Delete `frontend/src/components/BlockCanvas/openclawRegistry.ts` and its test
- Remove OpenClaw schemas (lines 82-203) from `backend/src/utils/specValidator.ts`
- Remove `openclawConfig` field from `NuggetSpecSchema` (keep `plugins` field)
- Remove `'openclaw'` and `'clawhub'` from `CORE_COMMANDS` in `portalService.ts`
- Remove `skill` command from `cli/src/cli.ts` (now comes from plugin)
- Delete `cli/src/commands/skill.ts` and its test
- Delete `backend/src/tests/behavioral/openclawPortalCommands.test.ts` (replaced by dynamic test)
- Delete `backend/src/tests/behavioral/openclawSpecExtension.test.ts` (schema moved to plugin)

**Step 7: Run all tests**

```bash
cd packages/elisa-plugin-openclaw && npm install && npx vitest run  # Plugin tests
cd frontend && npx vitest run                                       # Frontend tests
cd backend && npx vitest run                                        # Backend tests
cd cli && npx vitest run                                            # CLI tests
```

Expected: All tests pass

**Step 8: Commit**

```bash
git add packages/elisa-plugin-openclaw/
git add frontend/ backend/ cli/
git commit -m "refactor: extract OpenClaw into elisa-plugin-openclaw package"
```

---

## Task 10: Architecture Docs Update

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/INDEX.md`
- Modify: `.claude/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `frontend/src/components/CLAUDE.md`
- Modify: `backend/CLAUDE.md`

**Step 1: Update all architecture docs**

- **ARCHITECTURE.md**: Add Plugin System section to topology diagram. Document PluginManager, registries, and `elisa-plugin-*` convention. Remove OpenClaw from core module descriptions. Add `packages/` directory.
- **docs/INDEX.md**: Add plugin system files to key source files. Add `packages/` to directory map. Remove OpenClaw files from core file lists.
- **.claude/CLAUDE.md**: Add `elisa plugins` to CLI section. Add plugin system description.
- **frontend/CLAUDE.md**: Add `pluginTypes.ts`, `pluginManager.ts`, `pluginDiscovery.ts` to lib section. Add `PluginsModal.tsx` to shared components. Remove OpenClaw files.
- **frontend/src/components/CLAUDE.md**: Remove OpenClaw from BlockCanvas subsystem. Add PluginsModal to shared.
- **backend/CLAUDE.md**: Document dynamic portal allowlist. Remove OpenClaw-specific files.

**Step 2: Commit**

```bash
git add ARCHITECTURE.md docs/INDEX.md .claude/CLAUDE.md frontend/CLAUDE.md frontend/src/components/CLAUDE.md backend/CLAUDE.md
git commit -m "docs: update architecture documentation for plugin system"
```

---

## Execution Order and Dependencies

```
Task 1 (Plugin Types)            -- frontend, independent
  └──► Task 2 (Plugin Manager)   -- depends on types
       └──► Task 7 (Wire into App) -- depends on manager + modal
            └──► Task 9 (Extract OpenClaw) -- depends on wiring

Task 3 (Discovery Service)       -- frontend, independent (uses types)

Task 4 (NuggetSpec plugins field) -- backend, independent

Task 5 (Dynamic Portal Commands)  -- backend, independent

Task 6 (Plugins Modal)            -- frontend, independent
  └──► Task 7 (Wire into App)

Task 8 (CLI plugins command)      -- cli, independent

Task 10 (Docs)                    -- after all code tasks
```

**Parallelizable groups:**
1. Tasks 1, 3, 4, 5, 6, 8 (all independent)
2. Task 2 (depends on Task 1)
3. Task 7 (depends on Tasks 2, 6)
4. Task 9 (depends on Task 7, also needs Tasks 4, 5, 8)
5. Task 10 (after all)

## Verification

After all tasks, run the full test suites:

```bash
cd packages/elisa-plugin-openclaw && npx vitest run  # Plugin tests
cd backend && npx vitest run                          # Backend tests
cd frontend && npx vitest run                         # Frontend tests
cd cli && npx vitest run                              # CLI tests
```

Expected: All tests pass with no regressions.

Manual verification:
1. `npm install` at root installs plugin package
2. Launch Electron app — click "Plugins" in sidebar — see OpenClaw listed
3. Enable OpenClaw — 6 block categories appear in Blockly toolbox
4. Disable OpenClaw — categories disappear, existing blocks become stubs
5. `node cli/dist/cli.js plugins` — lists installed plugins
6. `node cli/dist/cli.js plugins enable openclaw` — enables the plugin
