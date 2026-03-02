import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceIO } from './useWorkspaceIO';

// ---- Mocks ----

vi.mock('../components/BlockCanvas/blockInterpreter', () => ({
  interpretWorkspace: vi.fn(() => ({
    nugget: { goal: 'Test goal', description: '', type: 'web' },
    requirements: [],
  })),
  migrateWorkspace: vi.fn((ws: Record<string, unknown>) => ws),
}));

vi.mock('../lib/nuggetFile', () => ({
  saveNuggetFile: vi.fn(async () => new Blob(['zip'])),
  loadNuggetFile: vi.fn(async () => ({
    workspace: { blocks: { blocks: [] } },
    skills: [{ id: 's1', name: 'Skill', prompt: 'Do stuff', category: 'agent' }],
    rules: [{ id: 'r1', name: 'Rule', prompt: 'Check it', trigger: 'always' }],
    portals: [],
  })),
  downloadBlob: vi.fn(),
}));

vi.mock('../lib/apiClient', () => ({
  authFetch: vi.fn(async () => ({
    ok: true,
    json: async () => ({
      workspace: { blocks: { blocks: [] } },
      skills: [],
      rules: [],
      portals: [],
    }),
    blob: async () => new Blob(['archive']),
  })),
}));

vi.mock('../lib/examples', () => ({
  EXAMPLE_NUGGETS: [
    {
      id: 'ex1',
      name: 'Example',
      description: 'An example',
      category: 'web',
      color: '#000',
      accentColor: '#fff',
      workspace: { blocks: { blocks: [{ type: 'goal_block' }] } },
      skills: [{ id: 'es1', name: 'ExSkill', prompt: 'example', category: 'agent' }],
      rules: [],
      portals: [],
    },
  ],
}));

// ---- Helpers ----

function makeRef() {
  return {
    current: {
      loadWorkspace: vi.fn(),
      getWorkspace: vi.fn(() => ({})),
    },
  };
}

function defaultOptions() {
  return {
    blockCanvasRef: makeRef() as never,
    sessionId: null,
    deviceManifests: [],
  };
}

// ---- Tests ----

describe('useWorkspaceIO', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('starts with empty skills, rules, portals', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.skills).toEqual([]);
      expect(result.current.rules).toEqual([]);
      expect(result.current.portals).toEqual([]);
    });

    it('starts with null spec and workspaceJson', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.spec).toBeNull();
      expect(result.current.workspaceJson).toBeNull();
    });

    it('starts with null workspacePath when localStorage is empty', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.workspacePath).toBeNull();
    });

    it('opens example picker when no saved workspace', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.examplePickerOpen).toBe(true);
    });

    it('restores workspacePath from localStorage', () => {
      localStorage.setItem('elisa:workspace-path', '/my/project');
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.workspacePath).toBe('/my/project');
    });

    it('restores skills from localStorage', () => {
      localStorage.setItem('elisa:skills', JSON.stringify([{ id: 's1', name: 'Saved', prompt: 'p', category: 'agent' }]));
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].name).toBe('Saved');
    });

    it('restores rules from localStorage', () => {
      localStorage.setItem('elisa:rules', JSON.stringify([{ id: 'r1', name: 'SavedRule', prompt: 'p', trigger: 'always' }]));
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.rules).toHaveLength(1);
      expect(result.current.rules[0].name).toBe('SavedRule');
    });

    it('restores portals from localStorage', () => {
      localStorage.setItem('elisa:portals', JSON.stringify([{ id: 'p1', name: 'Portal', description: 'd', mechanism: 'cli', status: 'ready', capabilities: [] }]));
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.portals).toHaveLength(1);
    });

    it('does not open example picker when saved workspace exists', () => {
      localStorage.setItem('elisa:workspace', JSON.stringify({ blocks: {} }));
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.examplePickerOpen).toBe(false);
    });

    it('gracefully handles corrupted localStorage data', () => {
      localStorage.setItem('elisa:skills', 'not-valid-json');
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.skills).toEqual([]);
    });
  });

  describe('handleWorkspaceChange', () => {
    it('sets workspaceJson and spec', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      const ws = { blocks: { blocks: [{ type: 'goal_block' }] } };
      act(() => result.current.handleWorkspaceChange(ws));
      expect(result.current.workspaceJson).toEqual(ws);
      expect(result.current.spec).not.toBeNull();
    });

    it('persists workspace to localStorage', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      const ws = { blocks: { blocks: [] } };
      act(() => result.current.handleWorkspaceChange(ws));
      expect(localStorage.getItem('elisa:workspace')).toBe(JSON.stringify(ws));
    });
  });

  describe('handleSelectExample', () => {
    it('loads example workspace, skills, rules, portals and closes picker', async () => {
      const { EXAMPLE_NUGGETS } = await import('../lib/examples');
      const ref = makeRef();
      const { result } = renderHook(() =>
        useWorkspaceIO({ blockCanvasRef: ref as never, sessionId: null, deviceManifests: [] }),
      );

      act(() => result.current.handleSelectExample(EXAMPLE_NUGGETS[0]));

      expect(result.current.skills).toEqual(EXAMPLE_NUGGETS[0].skills);
      expect(result.current.rules).toEqual(EXAMPLE_NUGGETS[0].rules);
      expect(result.current.portals).toEqual(EXAMPLE_NUGGETS[0].portals);
      expect(result.current.workspaceJson).toEqual(EXAMPLE_NUGGETS[0].workspace);
      expect(result.current.examplePickerOpen).toBe(false);
      expect(ref.current.loadWorkspace).toHaveBeenCalledWith(EXAMPLE_NUGGETS[0].workspace);
    });

    it('syncs example state to localStorage', async () => {
      const { EXAMPLE_NUGGETS } = await import('../lib/examples');
      const ref = makeRef();
      const { result } = renderHook(() =>
        useWorkspaceIO({ blockCanvasRef: ref as never, sessionId: null, deviceManifests: [] }),
      );

      act(() => result.current.handleSelectExample(EXAMPLE_NUGGETS[0]));

      expect(localStorage.getItem('elisa:workspace')).toBe(
        JSON.stringify(EXAMPLE_NUGGETS[0].workspace),
      );
      expect(localStorage.getItem('elisa:skills')).toBe(
        JSON.stringify(EXAMPLE_NUGGETS[0].skills),
      );
    });
  });

  describe('directory picker state', () => {
    it('dirPickerOpen starts false', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.dirPickerOpen).toBe(false);
    });
  });

  describe('reinterpretWorkspace', () => {
    it('re-interprets when called after workspace change', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      const ws = { blocks: { blocks: [] } };
      act(() => result.current.handleWorkspaceChange(ws));
      const prevSpec = result.current.spec;
      act(() => result.current.reinterpretWorkspace());
      expect(result.current.spec).not.toBeNull();
      expect(result.current.spec).toEqual(prevSpec);
    });

    it('does nothing when workspaceJson is null', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      act(() => result.current.reinterpretWorkspace());
      expect(result.current.spec).toBeNull();
    });
  });

  describe('setters', () => {
    it('setSkills updates skills', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      act(() => result.current.setSkills([{ id: 'new', name: 'New', prompt: 'p', category: 'agent' }]));
      expect(result.current.skills).toHaveLength(1);
      expect(result.current.skills[0].id).toBe('new');
    });

    it('setRules updates rules', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      act(() => result.current.setRules([{ id: 'r', name: 'R', prompt: 'p', trigger: 'always' }]));
      expect(result.current.rules).toHaveLength(1);
    });

    it('setPortals updates portals', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      act(() => result.current.setPortals([{ id: 'p', name: 'P', description: 'd', mechanism: 'cli', status: 'ready', capabilities: [] }]));
      expect(result.current.portals).toHaveLength(1);
    });
  });

  describe('setExamplePickerOpen', () => {
    it('can close example picker', () => {
      const { result } = renderHook(() => useWorkspaceIO(defaultOptions()));
      expect(result.current.examplePickerOpen).toBe(true);
      act(() => result.current.setExamplePickerOpen(false));
      expect(result.current.examplePickerOpen).toBe(false);
    });
  });
});
