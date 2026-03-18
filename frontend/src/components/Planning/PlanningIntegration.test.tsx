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
    { id: 's1', type: 'Skill', category: 'primitive', content: 'Charts', position: { x: 50, y: 350 } },
    { id: 'pt1', type: 'Portal', category: 'primitive', content: 'OpenWeather', position: { x: 50, y: 450 }, subtype: 'api' },
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
    it('converts a full CanvasBlockSpec to Blockly workspace with all block types', () => {
      const ws = planToWorkspaceJson(fullBlockSpec);
      expect(ws.blocks.blocks).toHaveLength(6);

      const types = ws.blocks.blocks.map(b => b.type);
      expect(types).toEqual([
        'nugget_goal',
        'feature',
        'feature',
        'use_skill',
        'portal_tell',
        'deploy_web',
      ]);

      // Goal has content
      expect(ws.blocks.blocks[0].fields?.GOAL).toBe('Weather dashboard');

      // Promise has nested proof
      const promise = ws.blocks.blocks[1];
      expect(promise.inputs?.test_checks?.block.type).toBe('proof');
      expect(promise.inputs?.test_checks?.block.fields?.PROOF).toBe('Displays Celsius');

      // Positions preserved
      expect(ws.blocks.blocks[0].x).toBe(50);
      expect(ws.blocks.blocks[0].y).toBe(50);
    });

    it('merge mode appends blocks with offset', () => {
      const loadWorkspace = vi.fn();
      const existing = {
        blocks: {
          languageVersion: 0,
          blocks: [
            { type: 'nugget_goal', id: 'existing', x: 50, y: 50, fields: { GOAL: 'Existing app' } },
          ],
        },
      };

      populateCanvasFromPlan(loadWorkspace, existing, fullBlockSpec, true);

      const result = loadWorkspace.mock.calls[0][0] as {
        blocks: { blocks: Array<{ type: string; y?: number }> };
      };

      // Existing + 6 new = 7
      expect(result.blocks.blocks).toHaveLength(7);
      // New blocks offset below existing
      const newBlocks = result.blocks.blocks.slice(1);
      newBlocks.forEach(b => {
        expect((b.y ?? 0)).toBeGreaterThan(50);
      });
    });

    it('blank mode replaces entire workspace', () => {
      const loadWorkspace = vi.fn();
      populateCanvasFromPlan(loadWorkspace, null, fullBlockSpec, false);

      const result = loadWorkspace.mock.calls[0][0] as {
        blocks: { blocks: unknown[] };
      };
      expect(result.blocks.blocks).toHaveLength(6);
    });
  });
});
