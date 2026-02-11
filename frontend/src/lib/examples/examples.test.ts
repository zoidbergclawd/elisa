import { describe, it, expect } from 'vitest';
import { EXAMPLE_NUGGETS, type ExampleNugget } from './index';
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
});
