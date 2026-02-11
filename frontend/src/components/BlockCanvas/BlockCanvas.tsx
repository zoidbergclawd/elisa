import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as Blockly from 'blockly';
import { registerBlocks } from './blockDefinitions';
import { toolbox } from './toolbox';
import { updateSkillOptions, updateRuleOptions } from '../Skills/skillsRegistry';
import { updatePortalOptions } from '../Portals/portalRegistry';
import type { Skill, Rule } from '../Skills/types';
import type { Portal } from '../Portals/types';

registerBlocks();

export interface BlockCanvasHandle {
  loadWorkspace: (json: Record<string, unknown>) => void;
}

interface BlockCanvasProps {
  onWorkspaceChange: (json: Record<string, unknown>) => void;
  readOnly?: boolean;
  skills?: Skill[];
  rules?: Rule[];
  portals?: Portal[];
  initialWorkspace?: Record<string, unknown> | null;
}

const BlockCanvas = forwardRef<BlockCanvasHandle, BlockCanvasProps>(
  function BlockCanvas({ onWorkspaceChange, readOnly = false, skills = [], rules = [], portals = [], initialWorkspace }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const initialWorkspaceRef = useRef(initialWorkspace);
    const onWorkspaceChangeRef = useRef(onWorkspaceChange);

    // Keep stable references so the inject effect can read the latest values
    initialWorkspaceRef.current = initialWorkspace;
    onWorkspaceChangeRef.current = onWorkspaceChange;

    const handleChange = useCallback(() => {
      if (!workspaceRef.current) return;
      const json = Blockly.serialization.workspaces.save(workspaceRef.current);
      onWorkspaceChangeRef.current(json);
    }, []);

    useImperativeHandle(ref, () => ({
      loadWorkspace(json: Record<string, unknown>) {
        if (!workspaceRef.current) return;
        Blockly.serialization.workspaces.load(json, workspaceRef.current);
      },
    }));

    useEffect(() => {
      if (!containerRef.current || workspaceRef.current) return;

      const workspace = Blockly.inject(containerRef.current, {
        toolbox,
        grid: {
          spacing: 20,
          length: 3,
          colour: '#ccc',
          snap: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 1.0,
          maxScale: 3,
          minScale: 0.3,
          scaleSpeed: 1.2,
        },
        trashcan: true,
      });

      workspaceRef.current = workspace;

      // Restore saved workspace before attaching the change listener
      // to avoid triggering an immediate save of potentially stale data
      if (initialWorkspaceRef.current) {
        try {
          Blockly.serialization.workspaces.load(initialWorkspaceRef.current, workspace);
        } catch (e) {
          console.warn('Failed to restore workspace from localStorage:', e);
        }
      }

      workspace.addChangeListener(handleChange);

      return () => {
        workspace.removeChangeListener(handleChange);
        workspace.dispose();
        workspaceRef.current = null;
      };
    }, [handleChange]);

    useEffect(() => {
      updateSkillOptions(skills);
      updateRuleOptions(rules);
      updatePortalOptions(portals);
    }, [skills, rules, portals]);

    useEffect(() => {
      if (!workspaceRef.current) return;
      const workspace = workspaceRef.current;
      if (readOnly) {
        workspace.options.readOnly = true;
      } else {
        workspace.options.readOnly = false;
      }
    }, [readOnly]);

    return (
      <div className="w-full h-full relative">
        <div ref={containerRef} className="w-full h-full" />
        {readOnly && (
          <div className="absolute inset-0 bg-white/30 z-10 flex items-start justify-center pt-4">
            <span className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full font-medium">
              Building in progress...
            </span>
          </div>
        )}
      </div>
    );
  },
);

export default BlockCanvas;
