/** PRD-001 Phase 2 integration tests: services wired together. */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentStore } from '../../services/runtime/agentStore.js';
import { ConversationManager } from '../../services/runtime/conversationManager.js';
import { TurnPipeline, UsageTracker } from '../../services/runtime/turnPipeline.js';
import { KnowledgeBackpack } from '../../services/runtime/knowledgeBackpack.js';
import { StudyMode } from '../../services/runtime/studyMode.js';
import { LocalRuntimeProvisioner } from '../../services/runtimeProvisioner.js';

// ── Mock Anthropic Client ────────────────────────────────────────────

function createMockClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

function makeSpec(): Record<string, any> {
  return {
    nugget: { goal: 'Help kids learn about dinosaurs' },
    runtime: {
      agent_name: 'Dino Bot',
      greeting: 'Roar! Hello!',
      fallback_response: "Hmm, I'm not sure about that fossil...",
    },
  };
}

// ── KnowledgeBackpack + TurnPipeline integration ─────────────────────

describe('KnowledgeBackpack + TurnPipeline integration', () => {
  let agentStore: AgentStore;
  let conversationManager: ConversationManager;
  let knowledgeBackpack: KnowledgeBackpack;
  let mockClient: ReturnType<typeof createMockClient>;
  let pipeline: TurnPipeline;

  beforeEach(() => {
    agentStore = new AgentStore();
    conversationManager = new ConversationManager();
    knowledgeBackpack = new KnowledgeBackpack();
    mockClient = createMockClient();

    pipeline = new TurnPipeline(
      {
        agentStore,
        conversationManager,
        getClient: () => mockClient,
        knowledgeBackpack,
      },
      new UsageTracker(),
    );
  });

  it('includes backpack context in the system prompt sent to Claude', async () => {
    const { agent_id } = agentStore.provision(makeSpec());

    // Add a backpack source about T-Rex
    knowledgeBackpack.addSource(agent_id, {
      title: 'T-Rex Facts',
      content: 'The Tyrannosaurus Rex was one of the largest land predators ever. It had tiny arms and powerful jaws.',
      source_type: 'manual',
    });

    // Send a turn that should trigger backpack retrieval
    await pipeline.receiveTurn(agent_id, { text: 'Tell me about the T-Rex' });

    expect(mockClient.messages.create).toHaveBeenCalledOnce();
    const callArgs = mockClient.messages.create.mock.calls[0][0];

    // The system prompt should contain the backpack context
    expect(callArgs.system).toContain('Knowledge Backpack');
    expect(callArgs.system).toContain('T-Rex Facts');
  });

  it('does not include backpack context when backpack is empty', async () => {
    const { agent_id } = agentStore.provision(makeSpec());

    await pipeline.receiveTurn(agent_id, { text: 'Hello there' });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).not.toContain('Knowledge Backpack');
  });

  it('does not include backpack context when query has no matching terms', async () => {
    const { agent_id } = agentStore.provision(makeSpec());

    knowledgeBackpack.addSource(agent_id, {
      title: 'Quantum Physics',
      content: 'Quantum entanglement is a phenomenon where particles become correlated.',
      source_type: 'manual',
    });

    // Query about something completely unrelated with no keyword overlap
    await pipeline.receiveTurn(agent_id, { text: 'xyz abc' });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    // buildContext returns '' when search finds no results, so no backpack header
    expect(callArgs.system).not.toContain('Knowledge Backpack');
  });
});

// ── StudyMode quiz lifecycle ─────────────────────────────────────────

describe('StudyMode quiz lifecycle', () => {
  let knowledgeBackpack: KnowledgeBackpack;
  let studyMode: StudyMode;
  let agentId: string;

  beforeEach(() => {
    knowledgeBackpack = new KnowledgeBackpack();
    studyMode = new StudyMode(knowledgeBackpack);

    // Use a fixed agent ID for study mode tests (no need for full store)
    agentId = 'test-agent-study';
  });

  it('completes a full quiz lifecycle: enable, add sources, quiz, answer, check progress', () => {
    // 1. Enable study mode
    studyMode.enable(agentId, {
      enabled: true,
      style: 'quiz',
      difficulty: 'easy',
      quiz_frequency: 5,
    });

    expect(studyMode.isEnabled(agentId)).toBe(true);

    // 2. Add backpack sources
    knowledgeBackpack.addSource(agentId, {
      title: 'Dinosaurs',
      content: 'Dinosaurs were the dominant terrestrial vertebrates for over 160 million years.',
      source_type: 'manual',
    });
    knowledgeBackpack.addSource(agentId, {
      title: 'Volcanoes',
      content: 'Volcanoes are openings in the Earth\'s crust where magma erupts as lava.',
      source_type: 'manual',
    });

    // 3. Generate quiz
    const question = studyMode.generateQuiz(agentId);
    expect(question).not.toBeNull();
    expect(question!.options.length).toBeGreaterThanOrEqual(2);
    expect(question!.correct_index).toBeGreaterThanOrEqual(0);
    expect(question!.correct_index).toBeLessThan(question!.options.length);

    // 4. Submit correct answer
    const correct = studyMode.submitAnswer(agentId, question!.id, question!.correct_index);
    expect(correct).toBe(true);

    // 5. Check progress
    const progress = studyMode.getProgress(agentId);
    expect(progress.total_questions).toBe(1);
    expect(progress.correct_answers).toBe(1);
    expect(progress.accuracy).toBe(1);
    expect(progress.sources_covered).toBeGreaterThanOrEqual(1);
  });

  it('returns null when generating quiz without sources', () => {
    studyMode.enable(agentId, {
      enabled: true,
      style: 'quiz',
      difficulty: 'medium',
      quiz_frequency: 5,
    });

    const question = studyMode.generateQuiz(agentId);
    expect(question).toBeNull();
  });

  it('tracks incorrect answers in progress', () => {
    studyMode.enable(agentId, {
      enabled: true,
      style: 'quiz',
      difficulty: 'medium',
      quiz_frequency: 5,
    });

    knowledgeBackpack.addSource(agentId, {
      title: 'Stars',
      content: 'Stars are luminous spheres of plasma held together by gravity.',
      source_type: 'manual',
    });

    const question = studyMode.generateQuiz(agentId)!;

    // Submit a wrong answer (pick an index that is not the correct one)
    const wrongIndex = (question.correct_index + 1) % question.options.length;
    const correct = studyMode.submitAnswer(agentId, question.id, wrongIndex);
    expect(correct).toBe(false);

    const progress = studyMode.getProgress(agentId);
    expect(progress.total_questions).toBe(1);
    expect(progress.correct_answers).toBe(0);
    expect(progress.accuracy).toBe(0);
  });
});

// ── Agent deletion cascades ──────────────────────────────────────────

describe('Agent deletion cascades', () => {
  it('cleans up backpack and study mode when agent is deleted', () => {
    const agentStore = new AgentStore();
    const conversationManager = new ConversationManager();
    const knowledgeBackpack = new KnowledgeBackpack();
    const studyMode = new StudyMode(knowledgeBackpack);

    // Provision an agent
    const { agent_id } = agentStore.provision(makeSpec());

    // Add backpack sources
    knowledgeBackpack.addSource(agent_id, {
      title: 'Dinosaurs',
      content: 'Dinosaurs ruled the Earth.',
      source_type: 'manual',
    });
    knowledgeBackpack.addSource(agent_id, {
      title: 'Volcanoes',
      content: 'Volcanoes erupt with lava.',
      source_type: 'manual',
    });

    // Enable study mode
    studyMode.enable(agent_id, {
      enabled: true,
      style: 'quiz',
      difficulty: 'medium',
      quiz_frequency: 5,
    });

    // Create a conversation session
    conversationManager.createSession(agent_id);

    // Verify everything exists
    expect(knowledgeBackpack.getSources(agent_id)).toHaveLength(2);
    expect(studyMode.isEnabled(agent_id)).toBe(true);
    expect(conversationManager.getSessions(agent_id)).toHaveLength(1);

    // Cascade delete (mimics what the DELETE /v1/agents/:id handler does)
    conversationManager.deleteAgentSessions(agent_id);
    knowledgeBackpack.deleteAgent(agent_id);
    studyMode.deleteAgent(agent_id);
    agentStore.delete(agent_id);

    // Verify everything is cleaned up
    expect(knowledgeBackpack.getSources(agent_id)).toHaveLength(0);
    expect(studyMode.isEnabled(agent_id)).toBe(false);
    expect(studyMode.getConfig(agent_id)).toBeNull();
    expect(conversationManager.getSessions(agent_id)).toHaveLength(0);
    expect(agentStore.has(agent_id)).toBe(false);
  });
});

// ── LocalRuntimeProvisioner provisions via AgentStore ─────────────────

describe('LocalRuntimeProvisioner provisions via AgentStore', () => {
  it('provisions an agent through the AgentStore', async () => {
    const agentStore = new AgentStore();
    const provisioner = new LocalRuntimeProvisioner(agentStore);

    const result = await provisioner.provision(makeSpec());

    expect(result.agent_id).toBeDefined();
    expect(result.api_key).toMatch(/^eart_/);
    expect(result.runtime_url).toBeDefined();

    // Verify the agent exists in the store
    const identity = agentStore.get(result.agent_id);
    expect(identity).toBeDefined();
    expect(identity!.agent_name).toBe('Dino Bot');
  });

  it('updates agent config through the AgentStore', async () => {
    const agentStore = new AgentStore();
    const provisioner = new LocalRuntimeProvisioner(agentStore);

    const { agent_id } = await provisioner.provision(makeSpec());

    const updatedSpec = makeSpec();
    updatedSpec.runtime.agent_name = 'Rex Bot';

    await provisioner.updateConfig(agent_id, updatedSpec);

    const identity = agentStore.get(agent_id);
    expect(identity!.agent_name).toBe('Rex Bot');
  });

  it('shares agent data between provisioner and direct store access', async () => {
    const agentStore = new AgentStore();
    const provisioner = new LocalRuntimeProvisioner(agentStore);

    // Provision via provisioner
    const { agent_id, api_key } = await provisioner.provision(makeSpec());

    // Validate API key directly through store
    expect(agentStore.validateApiKey(agent_id, api_key)).toBe(true);
    expect(agentStore.validateApiKey(agent_id, 'wrong_key')).toBe(false);

    // Delete directly through store
    agentStore.delete(agent_id);
    expect(agentStore.has(agent_id)).toBe(false);
  });
});
