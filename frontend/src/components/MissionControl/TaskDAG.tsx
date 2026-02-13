import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';
import type { Task, Agent } from '../../types';

const elk = new ELK();

const NODE_WIDTH = 170;
const NODE_HEIGHT = 60;

const STATUS_COLORS: Record<string, string> = {
  pending: '#F5F2EE',
  in_progress: '#3D8FD6',
  done: '#2D9F3E',
  failed: '#DA7756',
};

const STATUS_BORDERS: Record<string, string> = {
  pending: '1px solid rgba(0,0,0,0.08)',
  in_progress: '1px solid rgba(61,143,214,0.4)',
  done: '1px solid rgba(45,159,62,0.4)',
  failed: '1px solid rgba(218,119,86,0.4)',
};

interface TaskDAGProps {
  tasks: Task[];
  agents?: Agent[];
  className?: string;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

function TaskDAGInner({ tasks, agents, className }: TaskDAGProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();
  const isFullSize = !!className;

  const elkGraph = useMemo(() => ({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': '30',
    },
    children: tasks.map(t => ({
      id: t.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: tasks.flatMap(t =>
      t.dependencies.map(dep => ({
        id: `${dep}->${t.id}`,
        sources: [dep],
        targets: [t.id],
      }))
    ),
  }), [tasks]);

  const layoutNodes = useCallback(async () => {
    if (tasks.length === 0) return;
    try {
      const layout = await elk.layout(elkGraph);
      const layoutNodes: Node[] = (layout.children || []).map(node => {
        const task = tasks.find(t => t.id === node.id)!;
        return {
          id: node.id,
          position: { x: node.x || 0, y: node.y || 0 },
          data: {
            label: truncate(task.name, 25),
            agentName: task.agent_name,
            status: task.status,
            agentRole: agents?.find(a => a.name === task.agent_name)?.role,
          },
          style: {
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            background: STATUS_COLORS[task.status] || STATUS_COLORS.pending,
            color: task.status === 'pending' ? '#2D2B29' : '#FFFFFF',
            border: STATUS_BORDERS[task.status] || STATUS_BORDERS.pending,
            borderRadius: 10,
            fontSize: 11,
            fontFamily: "'Outfit', system-ui, sans-serif",
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 8px',
            boxShadow: task.status === 'in_progress'
              ? '0 2px 12px rgba(61, 143, 214, 0.25)'
              : task.status === 'done'
                ? '0 2px 12px rgba(45, 159, 62, 0.20)'
                : task.status === 'pending'
                  ? '0 1px 3px rgba(0, 0, 0, 0.06)'
                  : 'none',
            animation: task.status === 'in_progress' ? 'pulse 1.5s infinite' : undefined,
          },
        };
      });

      const layoutEdges: Edge[] = tasks.flatMap(t =>
        t.dependencies.map(dep => ({
          id: `${dep}->${t.id}`,
          source: dep,
          target: t.id,
          markerEnd: { type: 'arrowclosed' as const, color: '#C4BDB5' },
          style: { stroke: '#C4BDB5', strokeWidth: 1.5 },
        }))
      );

      setNodes(layoutNodes);
      setEdges(layoutEdges);
      setTimeout(() => fitView({ padding: 0.1 }), 50);
    } catch {
      // Layout failed, skip
    }
  }, [tasks, elkGraph, fitView]);

  useEffect(() => {
    layoutNodes();
  }, [layoutNodes]);

  return (
    <div className={className} style={className ? undefined : { height: 200 }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .react-flow__background {
          background: transparent !important;
        }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodesDraggable={isFullSize}
        nodesConnectable={false}
        panOnDrag={isFullSize}
        zoomOnScroll={isFullSize}
        zoomOnDoubleClick={isFullSize}
        preventScrolling={!isFullSize}
        fitView
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

export default function TaskDAG({ tasks, agents, className }: TaskDAGProps) {
  if (tasks.length === 0) return null;
  return (
    <ReactFlowProvider>
      <TaskDAGInner tasks={tasks} agents={agents} className={className} />
    </ReactFlowProvider>
  );
}
