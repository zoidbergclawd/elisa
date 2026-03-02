import { createContext, useContext } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { BlockCanvasHandle } from '../components/BlockCanvas/BlockCanvas';
import { useWorkspaceIO } from '../hooks/useWorkspaceIO';
import { useSystemLevel } from '../hooks/useSystemLevel';
import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';
import type { Skill, Rule } from '../components/Skills/types';
import type { Portal } from '../components/Portals/types';
import type { DeviceManifest } from '../lib/deviceBlocks';
import type { SystemLevel } from '../types';
import type { EXAMPLE_NUGGETS } from '../lib/examples';

export interface WorkspaceContextValue {
  // State
  skills: Skill[];
  rules: Rule[];
  portals: Portal[];
  spec: NuggetSpec | null;
  workspacePath: string | null;
  workspaceJson: Record<string, unknown> | null;
  initialWorkspace: Record<string, unknown> | null;
  dirPickerOpen: boolean;
  examplePickerOpen: boolean;
  deviceManifests: DeviceManifest[];
  systemLevel: SystemLevel;

  // Actions
  setSkills: React.Dispatch<React.SetStateAction<Skill[]>>;
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
  setPortals: React.Dispatch<React.SetStateAction<Portal[]>>;
  setExamplePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleWorkspaceChange: (json: Record<string, unknown>) => void;
  handleSaveNugget: () => Promise<void>;
  handleOpenNugget: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleOpenFolder: () => Promise<void>;
  handleSelectExample: (example: typeof EXAMPLE_NUGGETS[number]) => void;
  handleDirPickerSelect: (dir: string) => void;
  handleDirPickerCancel: () => void;
  ensureWorkspacePath: () => Promise<string | null>;
  reinterpretWorkspace: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  children: ReactNode;
  blockCanvasRef: RefObject<BlockCanvasHandle | null>;
  deviceManifests: DeviceManifest[];
  sessionId: string | null;
}

export function WorkspaceProvider({
  children,
  blockCanvasRef,
  deviceManifests,
  sessionId,
}: WorkspaceProviderProps) {
  const workspace = useWorkspaceIO({ blockCanvasRef, sessionId, deviceManifests });
  const systemLevel = useSystemLevel(workspace.spec);

  const value: WorkspaceContextValue = {
    ...workspace,
    deviceManifests,
    systemLevel,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return ctx;
}
