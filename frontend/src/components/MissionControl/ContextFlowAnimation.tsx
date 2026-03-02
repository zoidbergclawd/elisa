import { useEffect, useState } from 'react';
import type { ContextFlow } from '../../hooks/useBuildSession';

/** Duration in ms for a single flow animation */
const ANIMATION_DURATION = 2000;

/** How long to keep a flow visible after animation starts */
const FLOW_LIFETIME = ANIMATION_DURATION + 500;

interface ActiveFlow {
  id: string;
  from_task_id: string;
  to_task_ids: string[];
  summary_preview: string;
  startTime: number;
}

interface ContextFlowAnimationProps {
  flows: ContextFlow[];
}

/**
 * Renders animated dots that travel along DAG edges when context flows
 * from a completed task to its dependent tasks.
 *
 * This is an overlay rendered on top of the ReactFlow canvas. The actual
 * animation uses CSS-only transitions -- a small colored dot pulses at
 * the position of the source task to indicate context has been written.
 */
export default function ContextFlowAnimation({ flows }: ContextFlowAnimationProps) {
  const [activeFlows, setActiveFlows] = useState<ActiveFlow[]>([]);

  // Track new flows arriving
  useEffect(() => {
    if (flows.length === 0) return;

    const latest = flows[flows.length - 1];
    const id = `${latest.from_task_id}-${latest.timestamp}`;

    setActiveFlows(prev => { // eslint-disable-line react-hooks/set-state-in-effect
      // Prevent duplicates
      if (prev.some(f => f.id === id)) return prev;
      return [...prev, {
        id,
        from_task_id: latest.from_task_id,
        to_task_ids: latest.to_task_ids,
        summary_preview: latest.summary_preview,
        startTime: Date.now(),
      }];
    });
  }, [flows]);

  // Clean up expired flows
  useEffect(() => {
    if (activeFlows.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveFlows(prev => prev.filter(f => now - f.startTime < FLOW_LIFETIME));
    }, 500);
    return () => clearInterval(timer);
  }, [activeFlows.length]);

  if (activeFlows.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      data-testid="context-flow-animation"
      aria-hidden="true"
    >
      <style>{`
        @keyframes context-flow-pulse {
          0% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.8); opacity: 0.4; }
          100% { transform: scale(1); opacity: 0; }
        }
        .context-flow-dot {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #3D8FD6;
          animation: context-flow-pulse ${ANIMATION_DURATION}ms ease-out forwards;
          box-shadow: 0 0 8px rgba(61, 143, 214, 0.6);
        }
      `}</style>
      {activeFlows.map(flow => (
        <div key={flow.id} className="context-flow-dot" data-testid="context-flow-dot" />
      ))}
    </div>
  );
}
