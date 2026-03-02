import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from './specValidator.js';

describe('NuggetSpecSchema portal config validation', () => {
  const basePortal = {
    name: 'TestPortal',
    description: 'A test portal',
    mechanism: 'mcp',
    capabilities: [],
    interactions: [],
  };

  it('accepts valid mcpConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'abc123' },
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects mcpConfig with shell metacharacters in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'npx',
            args: ['server.js; rm -rf /'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with backtick command substitution in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['`whoami`'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with $() substitution in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['$(cat /etc/passwd)'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig with unknown extra fields (strict mode)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            command: 'node',
            args: ['server.js'],
            evil: 'injection',
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid cliConfig', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mechanism: 'cli',
          cliConfig: {
            command: 'python3',
            args: ['script.py', '--flag'],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects cliConfig with shell metacharacters in args', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mechanism: 'cli',
          cliConfig: {
            command: 'python3',
            args: ['script.py && rm -rf /'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects portal with unrecognized config fields', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          arbitraryField: 'should-not-be-here',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects mcpConfig without required command field', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [
        {
          ...basePortal,
          mcpConfig: {
            args: ['server.js'],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('NuggetSpecSchema basic validation', () => {
  it('accepts minimal valid spec', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = NuggetSpecSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects goal exceeding max length', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'x'.repeat(2001) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields at root level (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
      unknownField: 'should-be-rejected',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in nugget object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game', extraProp: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in agents array items (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      agents: [{ name: 'builder', role: 'builder', evil: 'injection' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in requirements array items (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      requirements: [{ type: 'functional', description: 'test', extra: 'bad' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in style object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      style: { visual: 'modern', unknownStyleProp: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in deployment object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'web', badField: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts auto_flash in deployment', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'esp32', auto_flash: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields in workflow object (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { human_gates: ['before_deploy'], hacked: true },
    });
    expect(result.success).toBe(false);
  });

  it('accepts review_enabled and testing_enabled in workflow', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { review_enabled: true, testing_enabled: false, human_gates: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields in capability schema (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test',
        description: 'desc',
        mechanism: 'serial',
        capabilities: [{ id: 'cap', name: 'Cap', extraCap: 'bad' }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in interaction schema (#70)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{ type: 'tell', capabilityId: 'cap', extraField: true }],
      }],
    });
    expect(result.success).toBe(false);
  });
});

describe('NuggetSpecSchema behavioral_tests validation (#105)', () => {
  it('accepts valid behavioral_tests in workflow', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [
          { when: 'the user clicks play', then: 'the game starts' },
          { when: 'the user presses escape', then: 'the menu opens' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty behavioral_tests array', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { behavioral_tests: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects behavioral_tests with unknown fields', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [
          { when: 'click', then: 'response', extra: 'bad' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects behavioral_tests exceeding max array size (20)', () => {
    const tests = Array.from({ length: 21 }, (_, i) => ({
      when: `trigger ${i}`, then: `result ${i}`,
    }));
    const result = NuggetSpecSchema.safeParse({
      workflow: { behavioral_tests: tests },
    });
    expect(result.success).toBe(false);
  });

  it('rejects behavioral_test with when exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [
          { when: 'x'.repeat(501), then: 'response' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects behavioral_test with then exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [
          { when: 'trigger', then: 'x'.repeat(501) },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('portal interaction params', () => {
  it('accepts interaction without params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{ type: 'tell', capabilityId: 'led-on' }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with string params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { color: 'red', message: 'hello' },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with number params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'mcp',
        interactions: [{
          type: 'ask',
          capabilityId: 'read-temp',
          params: { interval: 5, threshold: 25.5 },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with boolean params', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'cli',
        interactions: [{
          type: 'tell',
          capabilityId: 'toggle',
          params: { enabled: true, verbose: false },
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts interaction with mixed param types', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Mixed Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { color: 'blue', brightness: 80, blinking: true },
        }],
      }],
    });
    expect(result.success).toBe(true);
    const parsed = result.data!;
    const params = parsed.portals![0].interactions![0].params!;
    expect(params.color).toBe('blue');
    expect(params.brightness).toBe(80);
    expect(params.blinking).toBe(true);
  });

  it('accepts empty params object', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: {},
        }],
      }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects param value exceeding max string length', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { data: 'x'.repeat(2001) },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects param key exceeding max length', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { ['k'.repeat(201)]: 'value' },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-primitive param values (object)', () => {
    const result = NuggetSpecSchema.safeParse({
      portals: [{
        name: 'Test Portal',
        description: 'desc',
        mechanism: 'serial',
        interactions: [{
          type: 'tell',
          capabilityId: 'led-on',
          params: { nested: { bad: true } },
        }],
      }],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// New schema expansion tests (Systems Thinking / PRD-001 / PRD-002)
// ============================================================

describe('backward compatibility', () => {
  it('existing specs without new fields still validate', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
      requirements: [{ type: 'feature', description: 'drag and drop' }],
      agents: [{ name: 'Builder', role: 'builder', persona: 'careful' }],
      deployment: { target: 'web', auto_flash: false },
      workflow: {
        review_enabled: true,
        testing_enabled: true,
        human_gates: ['before deploy'],
        behavioral_tests: [{ when: 'click play', then: 'game starts' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('empty object still validates', () => {
    const result = NuggetSpecSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('requirement-test traceability (Systems Thinking)', () => {
  it('accepts requirement with test_id', () => {
    const result = NuggetSpecSchema.safeParse({
      requirements: [{ type: 'feature', description: 'login', test_id: 'bt-1' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts requirement without test_id', () => {
    const result = NuggetSpecSchema.safeParse({
      requirements: [{ type: 'feature', description: 'login' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects test_id exceeding max length (200)', () => {
    const result = NuggetSpecSchema.safeParse({
      requirements: [{ type: 'feature', description: 'login', test_id: 'x'.repeat(201) }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts behavioral_test with id and requirement_id', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [{
          id: 'bt-1',
          when: 'user clicks login',
          then: 'user is authenticated',
          requirement_id: 'req-1',
        }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts behavioral_test without id and requirement_id', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [{ when: 'click', then: 'response' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects behavioral_test id exceeding max length (200)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [{
          id: 'x'.repeat(201),
          when: 'click',
          then: 'response',
        }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects behavioral_test requirement_id exceeding max length (200)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: {
        behavioral_tests: [{
          when: 'click',
          then: 'response',
          requirement_id: 'x'.repeat(201),
        }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('feedback_loops (Systems Thinking)', () => {
  const validLoop = {
    id: 'loop-1',
    trigger: 'test_failure' as const,
    exit_condition: 'all tests pass',
    max_iterations: 3,
    connects_from: 'req-1',
    connects_to: 'task-1',
  };

  it('accepts valid feedback_loops in workflow', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [validLoop] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty feedback_loops array', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid trigger values', () => {
    for (const trigger of ['test_failure', 'review_rejection', 'custom']) {
      const result = NuggetSpecSchema.safeParse({
        workflow: { feedback_loops: [{ ...validLoop, trigger }] },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid trigger value', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, trigger: 'invalid' }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects max_iterations below 1', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, max_iterations: 0 }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects max_iterations above 10', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, max_iterations: 11 }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer max_iterations', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, max_iterations: 2.5 }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects feedback_loops exceeding max array size (10)', () => {
    const loops = Array.from({ length: 11 }, (_, i) => ({ ...validLoop, id: `loop-${i}` }));
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: loops },
    });
    expect(result.success).toBe(false);
  });

  it('rejects feedback_loop with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, extra: 'bad' }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects feedback_loop missing required id', () => {
    const { id, ...noId } = validLoop;
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [noId] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects exit_condition exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { feedback_loops: [{ ...validLoop, exit_condition: 'x'.repeat(501) }] },
    });
    expect(result.success).toBe(false);
  });
});

describe('system_level (Systems Thinking)', () => {
  it('accepts valid system_level values', () => {
    for (const level of ['explorer', 'builder', 'architect']) {
      const result = NuggetSpecSchema.safeParse({
        workflow: { system_level: level },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts workflow without system_level', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { review_enabled: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid system_level value', () => {
    const result = NuggetSpecSchema.safeParse({
      workflow: { system_level: 'master' },
    });
    expect(result.success).toBe(false);
  });
});

describe('runtime config (PRD-001)', () => {
  it('accepts valid runtime config with all fields', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: {
        agent_name: 'Coach Bot',
        greeting: 'Welcome!',
        fallback_response: 'I cannot help with that.',
        voice: 'alloy',
        display_theme: 'sporty',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts runtime config with partial fields', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { agent_name: 'Helper' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty runtime config', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts spec without runtime config', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects agent_name exceeding max length (100)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { agent_name: 'x'.repeat(101) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects greeting exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { greeting: 'x'.repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects fallback_response exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { fallback_response: 'x'.repeat(501) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects voice exceeding max length (50)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { voice: 'x'.repeat(51) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects display_theme exceeding max length (50)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { display_theme: 'x'.repeat(51) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects runtime config with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { agent_name: 'Bot', evil: 'injection' },
    });
    expect(result.success).toBe(false);
  });
});

describe('knowledge config (PRD-001)', () => {
  describe('backpack_sources', () => {
    const validSource = {
      id: 'src-1',
      type: 'pdf' as const,
      title: 'Physics Textbook',
    };

    it('accepts valid backpack source with all fields', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: {
          backpack_sources: [{
            ...validSource,
            uri: 'https://example.com/physics.pdf',
            config: { pages: '1-10' },
          }],
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts backpack source without optional uri and config', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [validSource] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid source types', () => {
      const types = ['pdf', 'url', 'youtube', 'drive', 'topic_pack', 'sports_feed', 'news_feed', 'custom_feed'];
      for (const type of types) {
        const result = NuggetSpecSchema.safeParse({
          knowledge: { backpack_sources: [{ ...validSource, type }] },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid source type', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ ...validSource, type: 'invalid' }] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects source id exceeding max length (100)', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ ...validSource, id: 'x'.repeat(101) }] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects source title exceeding max length (200)', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ ...validSource, title: 'x'.repeat(201) }] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects source uri exceeding max length (2000)', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ ...validSource, uri: 'x'.repeat(2001) }] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects backpack_sources exceeding max array size (50)', () => {
      const sources = Array.from({ length: 51 }, (_, i) => ({ ...validSource, id: `src-${i}` }));
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: sources },
      });
      expect(result.success).toBe(false);
    });

    it('rejects backpack source with unknown fields (strict)', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ ...validSource, extra: 'bad' }] },
      });
      expect(result.success).toBe(false);
    });

    it('rejects backpack source missing required id', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { backpack_sources: [{ type: 'pdf', title: 'Test' }] },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('study_mode', () => {
    const validStudyMode = {
      enabled: true,
      style: 'quiz_me' as const,
      difficulty: 'medium' as const,
      quiz_frequency: 5,
    };

    it('accepts valid study_mode', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: validStudyMode },
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid style values', () => {
      for (const style of ['explain', 'quiz_me', 'flashcards', 'socratic']) {
        const result = NuggetSpecSchema.safeParse({
          knowledge: { study_mode: { ...validStudyMode, style } },
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid difficulty values', () => {
      for (const difficulty of ['easy', 'medium', 'hard']) {
        const result = NuggetSpecSchema.safeParse({
          knowledge: { study_mode: { ...validStudyMode, difficulty } },
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid style value', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, style: 'invalid' } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid difficulty value', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, difficulty: 'impossible' } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects quiz_frequency below 1', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, quiz_frequency: 0 } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects quiz_frequency above 20', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, quiz_frequency: 21 } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer quiz_frequency', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, quiz_frequency: 3.5 } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects study_mode with unknown fields (strict)', () => {
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: { ...validStudyMode, extra: 'bad' } },
      });
      expect(result.success).toBe(false);
    });

    it('rejects study_mode missing required enabled field', () => {
      const { enabled, ...noEnabled } = validStudyMode;
      const result = NuggetSpecSchema.safeParse({
        knowledge: { study_mode: noEnabled },
      });
      expect(result.success).toBe(false);
    });
  });

  it('accepts empty knowledge config', () => {
    const result = NuggetSpecSchema.safeParse({
      knowledge: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts knowledge with unknown fields rejected (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      knowledge: { evil: 'injection' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts spec without knowledge config', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
    });
    expect(result.success).toBe(true);
  });
});

describe('deployment runtime fields (PRD-002)', () => {
  it('accepts deployment with runtime_url', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'web', runtime_url: 'https://runtime.example.com' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts deployment with provision_runtime', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'web', provision_runtime: true },
    });
    expect(result.success).toBe(true);
  });

  it('accepts deployment with both runtime fields', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: {
        target: 'web',
        auto_flash: false,
        runtime_url: 'https://runtime.example.com',
        provision_runtime: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts deployment without runtime fields', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { target: 'web', auto_flash: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects runtime_url exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      deployment: { runtime_url: 'x'.repeat(501) },
    });
    expect(result.success).toBe(false);
  });
});

describe('composition fields (Spec Graph)', () => {
  it('accepts composition with provides', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [
          { name: 'weather-data', type: 'data-stream' },
          { name: 'location-api', type: 'rest-api', description: 'GPS coordinates' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts composition with requires', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [
          { name: 'auth-token', type: 'credential' },
          { name: 'user-profile', type: 'data-stream', from_node_id: 'node-auth', description: 'User info' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts composition with both provides and requires', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'output', type: 'data-stream' }],
        requires: [{ name: 'input', type: 'data-stream' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts composition with parent_graph_id and node_id', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        parent_graph_id: 'graph-abc-123',
        node_id: 'node-42',
        provides: [{ name: 'api', type: 'rest-api' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects provides name exceeding max length (200)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'x'.repeat(201), type: 'data-stream' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects provides type exceeding max length (100)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'api', type: 'x'.repeat(101) }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects provides description exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'api', type: 'rest-api', description: 'x'.repeat(501) }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects requires array exceeding max size (20)', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      name: `iface-${i}`,
      type: 'data-stream',
    }));
    const result = NuggetSpecSchema.safeParse({
      composition: { requires: items },
    });
    expect(result.success).toBe(false);
  });

  it('rejects provides array exceeding max size (20)', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({
      name: `iface-${i}`,
      type: 'data-stream',
    }));
    const result = NuggetSpecSchema.safeParse({
      composition: { provides: items },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in composition (strict mode)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'api', type: 'rest-api' }],
        evil: 'injection',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in provides items (strict mode)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'api', type: 'rest-api', extra: 'bad' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields in requires items (strict mode)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [{ name: 'api', type: 'rest-api', extra: 'bad' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects parent_graph_id exceeding max length (100)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: { parent_graph_id: 'x'.repeat(101) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects node_id exceeding max length (100)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: { node_id: 'x'.repeat(101) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects from_node_id exceeding max length (100)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [{ name: 'api', type: 'rest-api', from_node_id: 'x'.repeat(101) }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects requires description exceeding max length (500)', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [{ name: 'api', type: 'rest-api', description: 'x'.repeat(501) }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty composition object', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {},
    });
    expect(result.success).toBe(true);
  });

  it('accepts spec without composition (backward compat)', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a game' },
      requirements: [{ type: 'feature', description: 'fun gameplay' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts provides missing optional description', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ name: 'api', type: 'rest-api' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts requires missing optional from_node_id and description', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [{ name: 'input', type: 'data-stream' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects provides item missing required name', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        provides: [{ type: 'rest-api' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects requires item missing required type', () => {
    const result = NuggetSpecSchema.safeParse({
      composition: {
        requires: [{ name: 'input' }],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('face_descriptor (PRD-002)', () => {
  const validFace = {
    base_shape: 'round' as const,
    eyes: { style: 'circles' as const, size: 'medium' as const, color: '#4361ee' },
    mouth: { style: 'smile' as const },
    expression: 'happy' as const,
    colors: { face: '#f0f0f0', accent: '#ffb3ba' },
  };

  it('accepts valid face_descriptor in runtime config', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: validFace },
    });
    expect(result.success).toBe(true);
  });

  it('DEFAULT_FACE passes validation', () => {
    // Mirrors the DEFAULT_FACE constant from display.ts
    const DEFAULT_FACE = {
      base_shape: 'round',
      eyes: { style: 'circles', size: 'medium', color: '#4361ee' },
      mouth: { style: 'smile' },
      expression: 'happy',
      colors: { face: '#f0f0f0', accent: '#ffb3ba' },
    };
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: DEFAULT_FACE },
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid base_shape values', () => {
    for (const base_shape of ['round', 'square', 'oval']) {
      const result = NuggetSpecSchema.safeParse({
        runtime: { face_descriptor: { ...validFace, base_shape } },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid eye styles', () => {
    for (const style of ['dots', 'circles', 'anime', 'pixels', 'sleepy']) {
      const result = NuggetSpecSchema.safeParse({
        runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, style } } },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid eye sizes', () => {
    for (const size of ['small', 'medium', 'large']) {
      const result = NuggetSpecSchema.safeParse({
        runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, size } } },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid mouth styles', () => {
    for (const style of ['line', 'smile', 'zigzag', 'open', 'cat']) {
      const result = NuggetSpecSchema.safeParse({
        runtime: { face_descriptor: { ...validFace, mouth: { style } } },
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid expression values', () => {
    for (const expression of ['happy', 'neutral', 'excited', 'shy', 'cool']) {
      const result = NuggetSpecSchema.safeParse({
        runtime: { face_descriptor: { ...validFace, expression } },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid base_shape', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, base_shape: 'triangle' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid eye style', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, style: 'laser' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid eye size', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, size: 'huge' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid mouth style', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, mouth: { style: 'frown' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid expression', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, expression: 'angry' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color for eyes', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, color: 'blue' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects 3-digit hex color shorthand', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, color: '#abc' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color for face background', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, colors: { face: 'not-hex', accent: '#ffb3ba' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid hex color for accent', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, colors: { face: '#f0f0f0', accent: 'rgb(255,0,0)' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects hex color without # prefix', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, color: '4361ee' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, extra: 'bad' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects eyes with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, eyes: { ...validFace.eyes, sparkle: true } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects mouth with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, mouth: { style: 'smile', teeth: true } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects colors with unknown fields (strict)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: { ...validFace, colors: { face: '#f0f0f0', accent: '#ffb3ba', glow: '#00ff00' } } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor missing required base_shape', () => {
    const { base_shape, ...noBaseShape } = validFace;
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: noBaseShape },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor missing required eyes', () => {
    const { eyes, ...noEyes } = validFace;
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: noEyes },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor missing required mouth', () => {
    const { mouth, ...noMouth } = validFace;
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: noMouth },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor missing required expression', () => {
    const { expression, ...noExpression } = validFace;
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: noExpression },
    });
    expect(result.success).toBe(false);
  });

  it('rejects face_descriptor missing required colors', () => {
    const { colors, ...noColors } = validFace;
    const result = NuggetSpecSchema.safeParse({
      runtime: { face_descriptor: noColors },
    });
    expect(result.success).toBe(false);
  });

  it('accepts runtime config without face_descriptor (backward compat)', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: { agent_name: 'Bot', voice: 'nova' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts face_descriptor alongside other runtime fields', () => {
    const result = NuggetSpecSchema.safeParse({
      runtime: {
        agent_name: 'Friendly Bot',
        greeting: 'Hi there!',
        voice: 'nova',
        display_theme: 'candy',
        face_descriptor: validFace,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('combined new fields validation', () => {
  it('accepts a spec with all new fields present', () => {
    const result = NuggetSpecSchema.safeParse({
      nugget: { goal: 'Build a study agent' },
      requirements: [
        { type: 'feature', description: 'quiz mode', test_id: 'bt-1' },
      ],
      deployment: {
        target: 'web',
        auto_flash: false,
        runtime_url: 'https://runtime.example.com',
        provision_runtime: true,
      },
      workflow: {
        review_enabled: true,
        testing_enabled: true,
        human_gates: [],
        behavioral_tests: [
          { id: 'bt-1', when: 'quiz starts', then: 'question shown', requirement_id: 'req-1' },
        ],
        feedback_loops: [{
          id: 'loop-1',
          trigger: 'test_failure',
          exit_condition: 'all tests pass',
          max_iterations: 5,
          connects_from: 'req-1',
          connects_to: 'task-1',
        }],
        system_level: 'architect',
      },
      runtime: {
        agent_name: 'Study Coach',
        greeting: 'Ready to learn?',
        fallback_response: 'Let me think about that.',
        voice: 'nova',
        display_theme: 'academic',
      },
      knowledge: {
        backpack_sources: [
          { id: 'src-1', type: 'pdf', title: 'Textbook', uri: 'https://example.com/book.pdf' },
          { id: 'src-2', type: 'youtube', title: 'Video Lesson' },
        ],
        study_mode: {
          enabled: true,
          style: 'socratic',
          difficulty: 'hard',
          quiz_frequency: 3,
        },
      },
      composition: {
        parent_graph_id: 'graph-main',
        node_id: 'node-study',
        provides: [
          { name: 'quiz-results', type: 'data-stream', description: 'Quiz scores and progress' },
        ],
        requires: [
          { name: 'curriculum', type: 'config', from_node_id: 'node-planner' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
