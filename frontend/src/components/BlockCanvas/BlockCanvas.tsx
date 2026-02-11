import { useRef, useEffect, useCallback } from 'react';
import * as Blockly from 'blockly';
import { registerBlocks } from './blockDefinitions';
import { toolbox } from './toolbox';

registerBlocks();

interface BlockCanvasProps {
  onWorkspaceChange: (json: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export default function BlockCanvas({ onWorkspaceChange, readOnly = false }: BlockCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  const handleChange = useCallback(() => {
    if (!workspaceRef.current) return;
    const json = Blockly.serialization.workspaces.save(workspaceRef.current);
    onWorkspaceChange(json);
  }, [onWorkspaceChange]);

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
    workspace.addChangeListener(handleChange);

    return () => {
      workspace.removeChangeListener(handleChange);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [handleChange]);

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
}
