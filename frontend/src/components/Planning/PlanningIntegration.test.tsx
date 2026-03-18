/** Integration test: Planning Mode widget flow and canvas population. */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PlanningPanel from './PlanningPanel';
import { planToWorkspaceJson, populateCanvasFromPlan } from '../BlockCanvas/planToBlocks';
import type { PlanState, PlanningMessage, QuestionWidget, CanvasBlockSpec } from '../../types';

const emptyPlan: PlanState = {
  idea: '',
  goal: { description: null, confidence: 'vague' },
  promises: [],
  skills: [],
  portals: [],
  deploy: { target: null, constraints: [] },
  open_questions: [],
  ready: false,
  conversation_turn: 0,
};

const readyPlan: PlanState = {
  ...emptyPlan,
  goal: { description: 'Weather dashboard', confidence: 'solid' },
  promises: [
    { description: 'Shows temperature', category: 'behavior', proofs: [{ description: 'Displays Celsius' }] },
    { description: 'Fast loading', category: 'performance', proofs: [] },
  ],
  skills: [{ name: 'Charts', description: 'Visualization library' }],
  portals: [{ name: 'OpenWeather', subtype: 'api', description: 'Weather API' }],
  deploy: { target: 'web', constraints: [] },
  ready: true,
};

// Matches what the backend now produces: Goal, Promises (with Proofs), Deploy.
// Skills and Portals are plan metadata -- they inform the MetaPlanner, not the canvas.
const fullBlockSpec: CanvasBlockSpec = {
  blocks: [
    { id: 'g1', type: 'Goal', category: 'primitive', content: 'Weather dashboard', position: { x: 50, y: 50 } },
    {
      id: 'p1',
      type: 'Promise',
      category: 'primitive',
      content: 'Shows temperature',
      position: { x: 50, y: 150 },
      children: [
        { id: 'pr1', type: 'Proof', category: 'primitive', content: 'Displays Celsius' },
      ],
    },
    { id: 'p2', type: 'Promise', category: 'primitive', content: 'Fast loading', position: { x: 50, y: 250 } },
    { id: 'd1', type: 'Deploy', category: 'primitive', content: 'Web', position: { x: 50, y: 550 }, subtype: 'web' },
  ],
};

describe('Planning Mode Integration', () => {
  describe('widget flow: question -> answer -> next question', () => {
    it('renders question, answers it, and question clears', () => {
      const onSubmitAnswer = vi.fn();
      const question: QuestionWidget = {
        text: 'What platform?',
        type: 'single_select',
        options: [
          { label: 'Web', value: 'web' },
          { label: 'Mobile', value: 'mobile' },
        ],
      };

      const messages: PlanningMessage[] = [
        { role: 'agent', content: 'What platform do you want?', timestamp: 1000 },
      ];

      const { rerender } = render(
        <PlanningPanel
          status="active"
          plan={emptyPlan}
          conversationHistory={messages}
          currentQuestion={question}
          isAgentThinking={false}
          error={null}
          onSubmitAnswer={onSubmitAnswer}
          onSubmitMessage={vi.fn()}
          onGenerateCanvas={vi.fn()}
        />,
      );

      // Question widget is visible
      expect(screen.getByText('What platform?')).toBeInTheDocument();
      expect(screen.getByText('Web')).toBeInTheDocument();

      // Click an answer
      fireEvent.click(screen.getByText('Web'));
      expect(onSubmitAnswer).toHaveBeenCalledWith('web');

      // Simulate question clearing (parent updates props)
      rerender(
        <PlanningPanel
          status="active"
          plan={emptyPlan}
          conversationHistory={[
            ...messages,
            { role: 'kid', content: 'web', timestamp: 2000 },
          ]}
          currentQuestion={null}
          isAgentThinking={true}
          error={null}
          onSubmitAnswer={vi.fn()}
          onSubmitMessage={vi.fn()}
          onGenerateCanvas={vi.fn()}
        />,
      );

      // Question widget is gone, kid message shown
      expect(screen.queryByTestId('question-widget-area')).not.toBeInTheDocument();
      expect(screen.getByText('web')).toBeInTheDocument();
    });

    it('renders multi-select question and submits multiple values', () => {
      const onSubmitAnswer = vi.fn();
      const question: QuestionWidget = {
        text: 'Which features?',
        type: 'multi_select',
        options: [
          { label: 'Dark mode', value: 'dark' },
          { label: 'Sounds', value: 'sounds' },
          { label: 'Animations', value: 'animations' },
        ],
      };

      render(
        <PlanningPanel
          status="active"
          plan={emptyPlan}
          conversationHistory={[]}
          currentQuestion={question}
          isAgentThinking={false}
          error={null}
          onSubmitAnswer={onSubmitAnswer}
          onSubmitMessage={vi.fn()}
          onGenerateCanvas={vi.fn()}
        />,
      );

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // Dark mode
      fireEvent.click(checkboxes[2]); // Animations
      fireEvent.click(screen.getByText('Confirm (2)'));
      expect(onSubmitAnswer).toHaveBeenCalledWith(['dark', 'animations']);
    });
  });

  describe('plan state updates in real-time', () => {
    it('shows plan state evolving from empty to full', () => {
      const { rerender } = render(
        <PlanningPanel
          status="active"
          plan={emptyPlan}
          conversationHistory={[]}
          currentQuestion={null}
          isAgentThinking={false}
          error={null}
          onSubmitAnswer={vi.fn()}
          onSubmitMessage={vi.fn()}
          onGenerateCanvas={vi.fn()}
        />,
      );

      // Initially empty
      expect(screen.getByText('Not yet defined')).toBeInTheDocument();
      expect(screen.getByText('No promises yet')).toBeInTheDocument();

      // Rerender with populated plan
      rerender(
        <PlanningPanel
          status="active"
          plan={readyPlan}
          conversationHistory={[]}
          currentQuestion={null}
          isAgentThinking={false}
          error={null}
          onSubmitAnswer={vi.fn()}
          onSubmitMessage={vi.fn()}
          onGenerateCanvas={vi.fn()}
        />,
      );

      // Plan state shows content
      expect(screen.getByText('Weather dashboard')).toBeInTheDocument();
      expect(screen.getByText('Shows temperature')).toBeInTheDocument();
      expect(screen.getByText('Charts')).toBeInTheDocument();
      expect(screen.getByText('OpenWeather')).toBeInTheDocument();
    });
  });

  describe('canvas population: full spec -> all blocks', () => {
    /** Walk the next-chain starting from a block. */
    function walkChain(block: Record<string, unknown>): Array<Record<string, unknown>> {
      const chain: Array<Record<string, unknown>> = [block];
      let current = block;
      while ((current as { next?: { block: Record<string, unknown> } }).next?.block) {
        current = (current as { next: { block: Record<string, unknown> } }).next.block;
        chain.push(current);
      }
      return chain;
    }

    it('converts a full CanvasBlockSpec to a chained Blockly workspace', () => {
      const ws = planToWorkspaceJson(fullBlockSpec);
      // Single top-level block, rest chained via next
      expect(ws.blocks.blocks).toHaveLength(1);

      const chain = walkChain(ws.blocks.blocks[0] as unknown as Record<string, unknown>);
      expect(chain).toHaveLength(4);

      const types = chain.map(b => (b as { type: string }).type);
      expect(types).toEqual([
        'nugget_goal',
        'feature',
        'feature',
        'deploy_web',
      ]);

      // Goal has content with correct field name
      expect(ws.blocks.blocks[0].fields?.GOAL_TEXT).toBe('Weather dashboard');

      // Promise has nested proof
      const promise = chain[1] as { inputs?: Record<string, { block: { type: string; fields?: Record<string, string> } }> };
      expect(promise.inputs?.TEST_SOCKET?.block.type).toBe('proof');
      expect(promise.inputs?.TEST_SOCKET?.block.fields?.GIVEN_WHEN).toBe('Displays Celsius');

      // Only first block has position
      expect(ws.blocks.blocks[0].x).toBe(50);
      expect(ws.blocks.blocks[0].y).toBe(50);
    });

    it('merge mode appends new chain to existing workspace', () => {
      const loadWorkspace = vi.fn();
      const existing = {
        blocks: {
          languageVersion: 0,
          blocks: [
            { type: 'nugget_goal', id: 'existing', x: 50, y: 50, fields: { GOAL_TEXT: 'Existing app' } },
          ],
        },
      };

      populateCanvasFromPlan(loadWorkspace, existing, fullBlockSpec, true);

      const result = loadWorkspace.mock.calls[0][0] as {
        blocks: { blocks: Array<{ type: string; y?: number }> };
      };

      // Existing + 1 new chain root = 2 top-level blocks
      expect(result.blocks.blocks).toHaveLength(2);
      // New chain root should be offset below existing
      expect((result.blocks.blocks[1].y ?? 0)).toBeGreaterThan(50);
    });

    it('blank mode replaces entire workspace', () => {
      const loadWorkspace = vi.fn();
      populateCanvasFromPlan(loadWorkspace, null, fullBlockSpec, false);

      const result = loadWorkspace.mock.calls[0][0] as {
        blocks: { blocks: unknown[] };
      };
      // Single chain root
      expect(result.blocks.blocks).toHaveLength(1);
    });
  });
});
