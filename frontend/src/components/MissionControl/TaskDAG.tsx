import { useEffect, useMemo, useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';
import type { Task, Agent, SystemLevel } from '../../types';
import type { ContextFlow } from '../../hooks/useBuildSession';
import ContextFlowAnimation from './ContextFlowAnimation';

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

/** Color palette for requirement-based node coloring */
const REQUIREMENT_COLORS = [
  '#7C3AED', // violet
  '#2563EB', // blue
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#DB2777', // pink
  '#0891B2', // cyan
  '#4F46E5', // indigo
];

export interface TaskDAGProps {
  tasks: Task[];
  agents?: Agent[];
  className?: string;
  systemLevel?: SystemLevel;
  contextFlows?: ContextFlow[];
  requirements?: Array<{ type: string; description: string }>;
  isComplete?: boolean;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

/** Get the requirement color for a task based on its first requirement_id */
function getRequirementColor(task: Task): string | null {
  if (!task.requirement_ids || task.requirement_ids.length === 0) return null;
  const reqId = task.requirement_ids[0];
  const match = reqId.match(/req-(\d+)/);
  if (!match) return null;
  const index = parseInt(match[1], 10);
  return REQUIREMENT_COLORS[index % REQUIREMENT_COLORS.length];
}

/** Determine which tasks to show based on system level */
function filterTasksForLevel(tasks: Task[], agents: Agent[] | undefined, systemLevel?: SystemLevel): Task[] {
  if (!systemLevel || systemLevel === 'builder' || systemLevel === 'architect') {
    return tasks; // Show all tasks
  }
  // Explorer mode: group tasks by agent, show one node per agent
  if (!agents || agents.length === 0) return tasks;

  const agentTasks = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.agent_name || '__no_agent__';
    if (!agentTasks.has(key)) agentTasks.set(key, []);
    agentTasks.get(key)!.push(task);
  }

  // Create a simplified task per agent
  const simplifiedTasks: Task[] = [];
  for (const [agentName, agentTaskList] of agentTasks) {
    const agent = agents?.find(a => a.name === agentName);
    const roleName = agent?.role === 'builder' ? 'Builder Bot'
      : agent?.role === 'tester' ? 'Test Bot'
      : agent?.role === 'reviewer' ? 'Review Bot'
      : agentName || 'Agent';

    // Determine aggregate status
    const statuses = agentTaskList.map(t => t.status);
    let status: Task['status'] = 'pending';
    if (statuses.some(s => s === 'failed')) status = 'failed';
    else if (statuses.some(s => s === 'in_progress')) status = 'in_progress';
    else if (statuses.every(s => s === 'done')) status = 'done';

    // Collect all dependencies from outside this agent's tasks
    const ownIds = new Set(agentTaskList.map(t => t.id));
    const externalDeps = new Set<string>();
    for (const task of agentTaskList) {
      for (const dep of task.dependencies) {
        if (!ownIds.has(dep)) {
          // Map external dep to its agent's simplified task ID
          const depTask = tasks.find(t => t.id === dep);
          if (depTask) externalDeps.add(`__agent_${depTask.agent_name}__`);
        }
      }
    }

    simplifiedTasks.push({
      id: `__agent_${agentName}__`,
      name: roleName,
      description: `${agentTaskList.length} tasks`,
      status,
      agent_name: agentName,
      dependencies: [...externalDeps].filter(d => d !== `__agent_${agentName}__`),
    });
  }

  return simplifiedTasks;
}

/** Build a mapping of unique requirement IDs to their descriptions */
function buildRequirementLegend(
  tasks: Task[],
  requirements?: Array<{ type: string; description: string }>,
): Array<{ id: string; color: string; description: string }> {
  if (!requirements || requirements.length === 0) return [];

  const usedReqIds = new Set<string>();
  for (const task of tasks) {
    if (task.requirement_ids) {
      for (const rid of task.requirement_ids) usedReqIds.add(rid);
    }
  }

  return [...usedReqIds]
    .sort()
    .map(rid => {
      const match = rid.match(/req-(\d+)/);
      if (!match) return null;
      const index = parseInt(match[1], 10);
      const req = requirements[index];
      if (!req) return null;
      return {
        id: rid,
        color: REQUIREMENT_COLORS[index % REQUIREMENT_COLORS.length],
        description: truncate(req.description, 40),
      };
    })
    .filter((r): r is { id: string; color: string; description: string } => r !== null);
}

function TaskDAGInner({
  tasks,
  agents,
  className,
  systemLevel,
  contextFlows,
  requirements,
  isComplete,
}: TaskDAGProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hoveredReqId, setHoveredReqId] = useState<string | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<{
    x: number;
    y: number;
    sourceTask: Task;
    targetTask: Task;
  } | null>(null);
  const { fitView } = useReactFlow();
  const isFullSize = !!className;

  // Filter tasks for explorer mode
  const displayTasks = useMemo(
    () => filterTasksForLevel(tasks, agents, systemLevel),
    [tasks, agents, systemLevel],
  );

  // Detect parallel tasks: tasks sharing at least one common dependency and both in_progress
  const parallelTaskIds = useMemo(() => {
    const inProgressIds = displayTasks.filter(t => t.status === 'in_progress').map(t => t.id);
    if (inProgressIds.length < 2) return new Set<string>();
    return new Set(inProgressIds);
  }, [displayTasks]);

  // Requirement legend
  const legend = useMemo(
    () => buildRequirementLegend(displayTasks, requirements),
    [displayTasks, requirements],
  );

  /** Generate a human-readable explanation for why targetTask depends on sourceTask */
  const buildEdgeExplanation = useCallback((sourceTask: Task, targetTask: Task): string => {
    // Use backend-provided why_blocked_by if available
    if (targetTask.why_blocked_by) {
      return targetTask.why_blocked_by;
    }
    // Fallback: generate a simple explanation
    const criteria = targetTask.acceptance_criteria;
    if (criteria && criteria.length > 0) {
      return `"${targetTask.name}" needs "${sourceTask.name}" to finish first because it depends on its output.`;
    }
    return `"${targetTask.name}" depends on "${sourceTask.name}" completing first.`;
  }, []);

  const handleEdgeClick = useCallback((_event: ReactMouseEvent, edge: Edge) => {
    const sourceTask = displayTasks.find(t => t.id === edge.source);
    const targetTask = displayTasks.find(t => t.id === edge.target);
    if (!sourceTask || !targetTask) return;

    const rect = (_event.currentTarget as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
    const x = _event.clientX - (rect?.left ?? 0);
    const y = _event.clientY - (rect?.top ?? 0);

    setEdgeTooltip(prev =>
      prev?.sourceTask.id === sourceTask.id && prev?.targetTask.id === targetTask.id
        ? null  // Toggle off if clicking the same edge
        : { x, y, sourceTask, targetTask }
    );
  }, [displayTasks]);

  // Auto-dismiss edge tooltip after 5 seconds
  useEffect(() => {
    if (!edgeTooltip) return;
    const timer = setTimeout(() => setEdgeTooltip(null), 5000);
    return () => clearTimeout(timer);
  }, [edgeTooltip]);

  const elkGraph = useMemo(() => ({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '20',
      'elk.layered.spacing.nodeNodeBetweenLayers': '30',
    },
    children: displayTasks.map(t => ({
      id: t.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: displayTasks.flatMap(t =>
      t.dependencies
        .filter(dep => displayTasks.some(dt => dt.id === dep))
        .map(dep => ({
          id: `${dep}->${t.id}`,
          sources: [dep],
          targets: [t.id],
        }))
    ),
  }), [displayTasks]);

  const layoutNodes = useCallback(async () => {
    if (displayTasks.length === 0) return;
    try {
      const layout = await elk.layout(elkGraph);
      const layoutNodes: Node[] = (layout.children || []).map(node => {
        const task = displayTasks.find(t => t.id === node.id)!;
        const isParallel = parallelTaskIds.has(task.id);
        const reqColor = getRequirementColor(task);
        const isHighlighted = hoveredReqId
          ? task.requirement_ids?.includes(hoveredReqId)
          : true;

        // Determine border with requirement coloring
        let border = STATUS_BORDERS[task.status] || STATUS_BORDERS.pending;
        if (reqColor && task.status === 'pending') {
          border = `2px solid ${reqColor}40`;
        }

        return {
          id: node.id,
          position: { x: node.x || 0, y: node.y || 0 },
          data: {
            label: truncate(task.name, 25),
            agentName: task.agent_name,
            status: task.status,
            agentRole: agents?.find(a => a.name === task.agent_name)?.role,
            isParallel,
            isComplete,
            description: task.description,
          },
          style: {
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            background: STATUS_COLORS[task.status] || STATUS_COLORS.pending,
            color: task.status === 'pending' ? '#2D2B29' : '#FFFFFF',
            border,
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
            opacity: hoveredReqId && !isHighlighted ? 0.3 : 1,
            transition: 'opacity 0.2s ease',
            animation: task.status === 'in_progress' ? 'taskdag-pulse 1.5s infinite' : undefined,
          },
        };
      });

      const layoutEdges: Edge[] = displayTasks.flatMap(t =>
        t.dependencies
          .filter(dep => displayTasks.some(dt => dt.id === dep))
          .map(dep => ({
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
  }, [displayTasks, agents, elkGraph, fitView, parallelTaskIds, hoveredReqId, isComplete]);

  useEffect(() => {
    layoutNodes(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [layoutNodes]);

  return (
    <div className={`relative ${className ?? ''}`} style={className ? undefined : { height: 200 }}>
      <style>{`
        @keyframes taskdag-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes taskdag-flow-dot {
          0% { offset-distance: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .react-flow__background {
          background: transparent !important;
        }
        .taskdag-parallel-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #F59E0B;
          color: #fff;
          font-size: 8px;
          font-weight: 700;
          padding: 1px 4px;
          border-radius: 6px;
          line-height: 1.2;
          pointer-events: none;
        }
      `}</style>

      {/* Blueprint mode label */}
      {isComplete && (
        <div className="absolute top-2 left-2 z-10" data-testid="blueprint-label">
          <span className="text-xs font-semibold px-2 py-1 rounded-md bg-accent-lavender/20 text-accent-lavender border border-accent-lavender/30">
            Blueprint
          </span>
        </div>
      )}

      {/* Requirement legend */}
      {legend.length > 0 && (
        <div className="absolute top-2 right-2 z-10" data-testid="requirement-legend">
          <div className="glass-panel rounded-lg p-2 text-xs space-y-1 max-w-[200px]">
            {legend.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 cursor-pointer"
                onMouseEnter={() => setHoveredReqId(item.id)}
                onMouseLeave={() => setHoveredReqId(null)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: item.color }}
                />
                <span className="text-atelier-text-secondary truncate">
                  {item.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        onEdgeClick={handleEdgeClick}
        onPaneClick={() => setEdgeTooltip(null)}
      />

      {/* "Why This Order?" edge tooltip */}
      {edgeTooltip && (
        <div
          data-testid="edge-tooltip"
          className="absolute z-20 max-w-[240px] glass-panel rounded-lg p-3 text-xs shadow-lg"
          style={{ left: edgeTooltip.x, top: edgeTooltip.y + 8 }}
        >
          <div className="font-semibold text-atelier-text-primary mb-1">
            Why this order?
          </div>
          <p className="text-atelier-text-secondary leading-relaxed">
            {buildEdgeExplanation(edgeTooltip.sourceTask, edgeTooltip.targetTask)}
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-atelier-text-muted">
            <span className="font-mono">{truncate(edgeTooltip.sourceTask.name, 20)}</span>
            <span>&rarr;</span>
            <span className="font-mono">{truncate(edgeTooltip.targetTask.name, 20)}</span>
          </div>
        </div>
      )}

      {/* Context flow animations */}
      {contextFlows && contextFlows.length > 0 && (
        <ContextFlowAnimation flows={contextFlows} />
      )}
    </div>
  );
}

export default function TaskDAG({
  tasks,
  agents,
  className,
  systemLevel,
  contextFlows,
  requirements,
  isComplete,
}: TaskDAGProps) {
  if (tasks.length === 0) return null;
  return (
    <ReactFlowProvider>
      <TaskDAGInner
        tasks={tasks}
        agents={agents}
        className={className}
        systemLevel={systemLevel}
        contextFlows={contextFlows}
        requirements={requirements}
        isComplete={isComplete}
      />
    </ReactFlowProvider>
  );
}
