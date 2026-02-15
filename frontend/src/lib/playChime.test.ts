import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockOsc { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }

function createMockAudioContext(initialState = 'running') {
  const oscillators: MockOsc[] = [];
  const resumeFn = vi.fn();

  class MockAudioContext {
    currentTime = 0;
    state = initialState;
    destination = {};
    resume = resumeFn;

    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
  }

  return { MockAudioContext, oscillators, resumeFn };
}

describe('playChime', () => {
  let mock: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    vi.resetModules();
    mock = createMockAudioContext();
    vi.stubGlobal('AudioContext', mock.MockAudioContext);
  });

  it('creates AudioContext and plays two oscillators', async () => {
    const { playChime } = await import('./playChime');
    playChime();
    expect(mock.oscillators).toHaveLength(2);
    mock.oscillators.forEach(osc => {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  it('reuses AudioContext on subsequent calls', async () => {
    const { playChime } = await import('./playChime');
    playChime();
    const firstCount = mock.oscillators.length;
    playChime();
    // Should have 4 total oscillators (2 per call), all from the same context
    expect(mock.oscillators).toHaveLength(firstCount + 2);
  });

  it('resumes suspended AudioContext', async () => {
    mock = createMockAudioContext('suspended');
    vi.stubGlobal('AudioContext', mock.MockAudioContext);
    const { playChime } = await import('./playChime');
    playChime();
    expect(mock.resumeFn).toHaveBeenCalled();
  });

  it('silently handles errors', async () => {
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('not supported'); } });
    const { playChime } = await import('./playChime');
    expect(() => playChime()).not.toThrow();
  });
});
