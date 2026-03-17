import type { DeviceManifest } from '../../lib/deviceBlocks';

interface ToolboxItem { kind: string; name?: string; colour?: string; type?: string; contents?: ToolboxItem[] }

/**
 * Build dynamic Portal sub-categories for device plugin blocks.
 * Device blocks are now Portal subtypes (PRD-003).
 */
export function buildDeviceCategories(manifests: DeviceManifest[]): ToolboxItem[] {
  if (!manifests.length) return [];
  return [{
    kind: 'category',
    name: 'Devices',
    colour: '260',
    contents: manifests.flatMap(m =>
      m.blocks.map(b => ({ kind: 'block', type: b.type }))
    ),
  }];
}

/**
 * PRD-003: 6-primitive toolbox structure.
 *
 * Primitives: Goal, Promise, Proof, Skill, Portal, Deploy
 * IDE Tools: non-primitive workspace concerns
 */
export const toolbox = {
  kind: 'categoryToolbox',
  contents: [
    // --- Primitives ---
    {
      kind: 'category',
      name: 'Goal',
      colour: '210',
      contents: [
        { kind: 'block', type: 'nugget_goal' },
        { kind: 'block', type: 'nugget_template' },
        { kind: 'block', type: 'write_guide' },
      ],
    },
    {
      kind: 'category',
      name: 'Promise',
      colour: '135',
      contents: [
        { kind: 'block', type: 'feature' },
        { kind: 'block', type: 'constraint' },
        { kind: 'block', type: 'when_then' },
        { kind: 'block', type: 'has_data' },
      ],
    },
    {
      kind: 'category',
      name: 'Proof',
      colour: '30',
      contents: [
        { kind: 'block', type: 'proof' },
      ],
    },
    {
      kind: 'category',
      name: 'Skill',
      colour: '315',
      contents: [
        { kind: 'block', type: 'use_skill' },
      ],
    },
    {
      kind: 'category',
      name: 'Portal',
      colour: '260',
      contents: [
        { kind: 'block', type: 'portal_tell' },
        { kind: 'block', type: 'portal_when' },
        { kind: 'block', type: 'portal_ask' },
      ],
    },
    {
      kind: 'category',
      name: 'Deploy',
      colour: '50',
      contents: [
        { kind: 'block', type: 'deploy_web' },
        { kind: 'block', type: 'deploy_esp32' },
        { kind: 'block', type: 'deploy_both' },
      ],
    },
  ],
};
