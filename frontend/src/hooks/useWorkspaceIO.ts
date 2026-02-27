import { useState, useCallback, useRef } from 'react';
import type { BlockCanvasHandle } from '../components/BlockCanvas/BlockCanvas';
import { interpretWorkspace, migrateWorkspace, type NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import { saveNuggetFile, loadNuggetFile, downloadBlob } from '../lib/nuggetFile';
import { authFetch } from '../lib/apiClient';
import { EXAMPLE_NUGGETS } from '../lib/examples';
import type { Skill } from '../components/Skills/types';
import type { Rule } from '../components/Skills/types';
import type { Portal } from '../components/Portals/types';
import type { DeviceManifest } from '../lib/deviceBlocks';

const LS_WORKSPACE = 'elisa:workspace';
const LS_SKILLS = 'elisa:skills';
const LS_RULES = 'elisa:rules';
const LS_PORTALS = 'elisa:portals';
const LS_WORKSPACE_PATH = 'elisa:workspace-path';

function readLocalStorageJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // corrupted data -- ignore
  }
  return null;
}

/**
 * Sync design state (workspace, skills, rules, portals) to localStorage.
 * Call after any operation that bulk-updates design state.
 */
function syncDesignToStorage(
  workspace: Record<string, unknown>,
  skills: Skill[],
  rules: Rule[],
  portals: Portal[],
) {
  try {
    localStorage.setItem(LS_WORKSPACE, JSON.stringify(workspace));
    localStorage.setItem(LS_SKILLS, JSON.stringify(skills));
    localStorage.setItem(LS_RULES, JSON.stringify(rules));
    localStorage.setItem(LS_PORTALS, JSON.stringify(portals));
  } catch {
    // localStorage full or unavailable -- ignore
  }
}

export interface UseWorkspaceIOOptions {
  blockCanvasRef: React.RefObject<BlockCanvasHandle | null>;
  sessionId: string | null;
  deviceManifests: DeviceManifest[];
}

export function useWorkspaceIO({ blockCanvasRef, sessionId, deviceManifests }: UseWorkspaceIOOptions) {
  // Skills, rules, portals
  const [skills, setSkills] = useState<Skill[]>(() => readLocalStorageJson<Skill[]>(LS_SKILLS) ?? []);
  const [rules, setRules] = useState<Rule[]>(() => readLocalStorageJson<Rule[]>(LS_RULES) ?? []);
  const [portals, setPortals] = useState<Portal[]>(() => readLocalStorageJson<Portal[]>(LS_PORTALS) ?? []);

  // Workspace state
  const [workspacePath, setWorkspacePath] = useState<string | null>(
    () => localStorage.getItem(LS_WORKSPACE_PATH),
  );
  const [workspaceJson, setWorkspaceJson] = useState<Record<string, unknown> | null>(null);
  const [spec, setSpec] = useState<NuggetSpec | null>(null);

  // Saved workspace loaded from localStorage (read once on mount, passed to BlockCanvas)
  const [initialWorkspace] = useState<Record<string, unknown> | null>(
    () => {
      const ws = readLocalStorageJson<Record<string, unknown>>(LS_WORKSPACE);
      if (ws) migrateWorkspace(ws);
      return ws;
    },
  );

  // Directory picker state
  const [dirPickerOpen, setDirPickerOpen] = useState(false);
  const dirPickerResolveRef = useRef<((value: string | null) => void) | null>(null);

  // Example picker (open on first launch when no saved workspace)
  const [examplePickerOpen, setExamplePickerOpen] = useState(!initialWorkspace);

  // -- Directory picker --
  const pickDirectory = async (): Promise<string | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as unknown as Record<string, any>).elisaAPI;
    if (api?.pickDirectory) {
      return api.pickDirectory();
    }
    return new Promise((resolve) => {
      setDirPickerOpen(true);
      dirPickerResolveRef.current = resolve;
    });
  };

  const handleDirPickerSelect = useCallback((dir: string) => {
    setDirPickerOpen(false);
    dirPickerResolveRef.current?.(dir);
    dirPickerResolveRef.current = null;
  }, []);

  const handleDirPickerCancel = useCallback(() => {
    setDirPickerOpen(false);
    dirPickerResolveRef.current?.(null);
    dirPickerResolveRef.current = null;
  }, []);

  // -- Workspace change handler --
  const handleWorkspaceChange = useCallback((json: Record<string, unknown>) => {
    setSpec(interpretWorkspace(json, skills, rules, portals, deviceManifests));
    setWorkspaceJson(json);
    try {
      localStorage.setItem(LS_WORKSPACE, JSON.stringify(json));
    } catch {
      // localStorage full or unavailable -- ignore
    }
  }, [skills, rules, portals, deviceManifests]);

  // -- Re-interpret workspace when skills/rules/portals/deviceManifests change --
  const reinterpretWorkspace = useCallback(() => {
    if (workspaceJson) {
      setSpec(interpretWorkspace(workspaceJson, skills, rules, portals, deviceManifests));
    }
  }, [workspaceJson, skills, rules, portals, deviceManifests]);

  // -- Save Nugget --
  const handleSaveNugget = useCallback(async () => {
    if (!workspaceJson) return;

    if (workspacePath) {
      try {
        await authFetch('/api/workspace/save', {
          method: 'POST',
          body: JSON.stringify({
            workspace_path: workspacePath,
            workspace_json: workspaceJson,
            skills,
            rules,
            portals,
          }),
        });
      } catch {
        // Fall through to zip download
      }
      return;
    }

    let outputArchive: Blob | undefined;
    if (sessionId) {
      try {
        const resp = await authFetch(`/api/sessions/${sessionId}/export`);
        if (resp.ok) {
          outputArchive = await resp.blob();
        }
      } catch {
        // no generated code available -- that's fine
      }
    }

    const blob = await saveNuggetFile(workspaceJson, skills, rules, portals, outputArchive);
    const name = spec?.nugget.goal
      ? spec.nugget.goal.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '')
      : 'nugget';
    downloadBlob(blob, `${name}.elisa`);
  }, [workspaceJson, workspacePath, skills, rules, portals, sessionId, spec]);

  // -- Open Nugget --
  const handleOpenNugget = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await loadNuggetFile(file);
      migrateWorkspace(data.workspace);

      setSkills(data.skills);
      setRules(data.rules);
      setPortals(data.portals);
      setWorkspaceJson(data.workspace);
      blockCanvasRef.current?.loadWorkspace(data.workspace);

      syncDesignToStorage(data.workspace, data.skills, data.rules, data.portals);
    } catch (err) {
      console.error('Failed to open nugget file:', err);
    }

    e.target.value = '';
  }, [blockCanvasRef]);

  // -- Open Folder --
  const handleOpenFolder = useCallback(async () => {
    const dir = await pickDirectory();
    if (!dir) return;

    try {
      const resp = await authFetch('/api/workspace/load', {
        method: 'POST',
        body: JSON.stringify({ workspace_path: dir }),
      });
      if (!resp.ok) return;
      const data = await resp.json();

      if (data.workspace && Object.keys(data.workspace).length > 0) {
        const ws = data.workspace;
        migrateWorkspace(ws);
        setWorkspaceJson(ws);
        blockCanvasRef.current?.loadWorkspace(ws);
        localStorage.setItem(LS_WORKSPACE, JSON.stringify(ws));
      }
      if (data.skills) {
        setSkills(data.skills);
        localStorage.setItem(LS_SKILLS, JSON.stringify(data.skills));
      }
      if (data.rules) {
        setRules(data.rules);
        localStorage.setItem(LS_RULES, JSON.stringify(data.rules));
      }
      if (data.portals) {
        setPortals(data.portals);
        localStorage.setItem(LS_PORTALS, JSON.stringify(data.portals));
      }

      setWorkspacePath(dir);
      localStorage.setItem(LS_WORKSPACE_PATH, dir);
    } catch (err) {
      console.error('Failed to load workspace from folder:', err);
    }
  }, [blockCanvasRef]);

  // -- Select Example --
  const handleSelectExample = useCallback((example: typeof EXAMPLE_NUGGETS[number]) => {
    setSkills(example.skills);
    setRules(example.rules);
    setPortals(example.portals);
    setWorkspaceJson(example.workspace);
    blockCanvasRef.current?.loadWorkspace(example.workspace);
    syncDesignToStorage(example.workspace, example.skills, example.rules, example.portals);
    setExamplePickerOpen(false);
  }, [blockCanvasRef]);

  // -- Ensure workspace path for build --
  const ensureWorkspacePath = async (): Promise<string | null> => {
    if (workspacePath) return workspacePath;
    const wp = await pickDirectory();
    if (!wp) return null;
    setWorkspacePath(wp);
    localStorage.setItem(LS_WORKSPACE_PATH, wp);
    return wp;
  };

  return {
    // Design state
    skills,
    setSkills,
    rules,
    setRules,
    portals,
    setPortals,
    spec,
    workspacePath,
    workspaceJson,
    initialWorkspace,

    // UI state
    dirPickerOpen,
    examplePickerOpen,
    setExamplePickerOpen,

    // Handlers
    handleWorkspaceChange,
    handleSaveNugget,
    handleOpenNugget,
    handleOpenFolder,
    handleSelectExample,
    handleDirPickerSelect,
    handleDirPickerCancel,
    ensureWorkspacePath,
    reinterpretWorkspace,
  };
}
