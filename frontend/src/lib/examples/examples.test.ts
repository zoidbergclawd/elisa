/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { EXAMPLE_NUGGETS } from './index';
import { interpretWorkspace } from '../../components/BlockCanvas/blockInterpreter';

describe('bundled example nuggets', () => {
  it('exports at least one example', () => {
    expect(EXAMPLE_NUGGETS.length).toBeGreaterThanOrEqual(1);
  });

  for (const example of EXAMPLE_NUGGETS) {
    describe(example.name, () => {
      it('has required fields', () => {
        expect(example.id).toBeTruthy();
        expect(example.name).toBeTruthy();
        expect(example.description).toBeTruthy();
        expect(example.category).toBeTruthy();
        expect(example.color).toBeTruthy();
        expect(example.accentColor).toBeTruthy();
        expect(example.workspace).toBeDefined();
        expect(Array.isArray(example.skills)).toBe(true);
        expect(Array.isArray(example.rules)).toBe(true);
        expect(Array.isArray(example.portals)).toBe(true);
      });

      it('contains a nugget_goal block', () => {
        const ws = example.workspace as any;
        const blocks = ws.blocks?.blocks ?? [];
        const hasGoal = blocks.some((b: any) => b.type === 'nugget_goal');
        expect(hasGoal).toBe(true);
      });

      it('produces a valid NuggetSpec with a non-empty goal', () => {
        const spec = interpretWorkspace(
          example.workspace,
          example.skills,
          example.rules,
          example.portals,
        );
        expect(spec.nugget.goal).toBeTruthy();
      });
    });
  }

  // Regression tests for migrated hardwareBlink (now uses portal blocks)

  it('hardwareBlink example sets deployment target to esp32', () => {
    const hw = EXAMPLE_NUGGETS.find((e) => e.id === 'hardware-blink')!;
    const spec = interpretWorkspace(hw.workspace, hw.skills, hw.rules, hw.portals);
    expect(spec.deployment.target).toBe('esp32');
  });

  it('hardwareBlink example uses portal_tell for LED control', () => {
    const hw = EXAMPLE_NUGGETS.find((e) => e.id === 'hardware-blink')!;
    const spec = interpretWorkspace(hw.workspace, hw.skills, hw.rules, hw.portals);
    expect(spec.portals).toHaveLength(1);
    expect(spec.portals![0].name).toBe('ESP32 Board');
    expect(spec.portals![0].interactions).toContainEqual(
      expect.objectContaining({ type: 'tell', capabilityId: 'led-blink' }),
    );
  });

  it('teamBuild example includes tester and reviewer agents', () => {
    const team = EXAMPLE_NUGGETS.find((e) => e.id === 'team-build')!;
    const spec = interpretWorkspace(team.workspace, team.skills, team.rules, team.portals);
    const roles = spec.agents.map((a) => a.role);
    expect(roles).toContain('tester');
    expect(roles).toContain('reviewer');
  });

  it('teamBuild example enables testing and review workflow', () => {
    const team = EXAMPLE_NUGGETS.find((e) => e.id === 'team-build')!;
    const spec = interpretWorkspace(team.workspace, team.skills, team.rules, team.portals);
    expect(spec.workflow.testing_enabled).toBe(true);
    expect(spec.workflow.review_enabled).toBe(true);
  });

  // skillShowcase-specific tests

  it('skillShowcase example includes a simple skill and a composite skill', () => {
    const showcase = EXAMPLE_NUGGETS.find((e) => e.id === 'skill-showcase')!;
    expect(showcase).toBeDefined();
    const simpleSkill = showcase.skills.find(s => s.category === 'feature');
    const compositeSkill = showcase.skills.find(s => s.category === 'composite');
    expect(simpleSkill, 'Missing simple (feature) skill').toBeDefined();
    expect(compositeSkill, 'Missing composite skill').toBeDefined();
  });

  it('skillShowcase composite skill has valid workspace JSON', () => {
    const showcase = EXAMPLE_NUGGETS.find((e) => e.id === 'skill-showcase')!;
    const compositeSkill = showcase.skills.find(s => s.category === 'composite')!;
    expect(compositeSkill.workspace).toBeDefined();
    const ws = compositeSkill.workspace as any;
    expect(ws.blocks.blocks).toBeDefined();
    expect(ws.blocks.blocks[0].type).toBe('skill_flow_start');
  });

  it('skillShowcase example includes an always-trigger rule', () => {
    const showcase = EXAMPLE_NUGGETS.find((e) => e.id === 'skill-showcase')!;
    const alwaysRule = showcase.rules.find(r => r.trigger === 'always');
    expect(alwaysRule, 'Missing always-trigger rule').toBeDefined();
  });

  it('skillShowcase example uses use_skill and use_rule blocks on canvas', () => {
    const showcase = EXAMPLE_NUGGETS.find((e) => e.id === 'skill-showcase')!;
    const ws = showcase.workspace as any;
    const allBlocks: any[] = [];
    function collect(block: any) {
      if (!block) return;
      allBlocks.push(block);
      if (block.next?.block) collect(block.next.block);
      if (block.inputs) {
        for (const input of Object.values(block.inputs) as any[]) {
          if ((input as any)?.block) collect((input as any).block);
        }
      }
    }
    for (const b of ws.blocks.blocks) collect(b);
    const types = allBlocks.map(b => b.type);
    expect(types).toContain('use_skill');
    expect(types).toContain('use_rule');
  });

  // Ensure every skill/rule defined in an example has a corresponding workspace block
  describe('skill/rule block alignment', () => {
    function collectBlockTypes(block: any, results: Array<{ type: string; fields: Record<string, string> }> = []): typeof results {
      if (!block) return results;
      results.push({ type: block.type, fields: block.fields ?? {} });
      if (block.next?.block) collectBlockTypes(block.next.block, results);
      if (block.inputs) {
        for (const input of Object.values(block.inputs) as any[]) {
          if (input?.block) collectBlockTypes(input.block, results);
        }
      }
      return results;
    }

    for (const example of EXAMPLE_NUGGETS) {
      if (example.skills.length > 0) {
        it(`${example.name}: every skill has a use_skill block`, () => {
          const ws = example.workspace as any;
          const blocks = (ws.blocks?.blocks ?? []).flatMap((b: any) => collectBlockTypes(b));
          const skillBlockIds = blocks
            .filter((b) => b.type === 'use_skill')
            .map((b) => b.fields.SKILL_ID);

          for (const skill of example.skills) {
            expect(skillBlockIds, `Missing use_skill block for "${skill.name}" (${skill.id})`).toContain(skill.id);
          }
        });
      }

      if (example.rules.length > 0) {
        it(`${example.name}: every rule has a use_rule block`, () => {
          const ws = example.workspace as any;
          const blocks = (ws.blocks?.blocks ?? []).flatMap((b: any) => collectBlockTypes(b));
          const ruleBlockIds = blocks
            .filter((b) => b.type === 'use_rule')
            .map((b) => b.fields.RULE_ID);

          for (const rule of example.rules) {
            expect(ruleBlockIds, `Missing use_rule block for "${rule.name}" (${rule.id})`).toContain(rule.id);
          }
        });
      }
    }
  });
});
