import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { Commit } from '../../types';

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  builder: { bg: 'bg-accent-sky', border: 'border-accent-sky', text: 'text-accent-sky' },
  tester: { bg: 'bg-accent-mint', border: 'border-accent-mint', text: 'text-accent-mint' },
  reviewer: { bg: 'bg-accent-lavender', border: 'border-accent-lavender', text: 'text-accent-lavender' },
};

function getColor(agentName: string) {
  const lower = agentName.toLowerCase();
  for (const [role, colors] of Object.entries(ROLE_COLORS)) {
    if (lower.includes(role)) return colors;
  }
  return { bg: 'bg-accent-coral', border: 'border-accent-coral', text: 'text-accent-coral' };
}

interface Props {
  commits: Commit[];
}

export default function GitTimeline({ commits }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [animatingSet, setAnimatingSet] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(0);

  // Track newly added commits for slide-in animation
  useEffect(() => {
    if (commits.length > prevCountRef.current) {
      const newShas = commits
        .slice(prevCountRef.current)
        .map((c) => c.sha);
      setAnimatingSet(new Set(newShas));
      const timer = setTimeout(() => setAnimatingSet(new Set()), 500);
      prevCountRef.current = commits.length;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = commits.length;
  }, [commits]);

  // Auto-scroll to right when new commits arrive
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [commits.length]);

  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-atelier-text-muted">
        Commits will appear here as agents work
      </div>
    );
  }

  const hoveredCommit = hovered ? commits.find((c) => c.sha === hovered) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Railroad track area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden px-4"
        data-testid="railroad-scroll"
      >
        <div className="flex items-center h-full min-w-max relative">
          {/* The horizontal rail line */}
          <div
            className="absolute left-4 right-4 h-0.5 bg-atelier-text-muted/20"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
            data-testid="rail-line"
          />

          {commits.map((commit, i) => {
            const colors = getColor(commit.agent_name);
            const isExpanded = expanded === commit.sha;
            const isAnimating = animatingSet.has(commit.sha);

            return (
              <div
                key={commit.sha}
                className={`relative flex flex-col items-center ${i > 0 ? 'ml-6' : ''}`}
                style={{
                  animation: isAnimating ? 'railroad-slide-in 0.4s ease-out' : undefined,
                }}
              >
                {/* Agent initial label above */}
                <span className={`text-[10px] font-bold mb-1 ${colors.text} select-none`}>
                  {commit.agent_name.charAt(0).toUpperCase()}
                </span>

                {/* Commit node circle */}
                <button
                  type="button"
                  className={`relative z-10 w-4 h-4 rounded-full border-2 ${colors.border} ${
                    isExpanded ? colors.bg : 'bg-atelier-base'
                  } hover:${colors.bg} transition-all duration-200 cursor-pointer hover:scale-125`}
                  onClick={() => setExpanded(isExpanded ? null : commit.sha)}
                  onMouseEnter={() => setHovered(commit.sha)}
                  onMouseLeave={() => setHovered(null)}
                  aria-label={`Commit by ${commit.agent_name}: ${commit.message}`}
                  data-testid={`commit-node-${commit.sha}`}
                />

                {/* Connector line between circles */}
                {i < commits.length - 1 && (
                  <div
                    className="absolute w-6 h-0.5 bg-atelier-text-muted/30"
                    style={{ top: '50%', left: '100%', transform: 'translateY(-50%)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip on hover */}
      {hoveredCommit && expanded !== hoveredCommit.sha && (
        <div
          className="px-4 py-1.5 border-t border-border-subtle bg-atelier-surface/60"
          data-testid="commit-tooltip"
        >
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-semibold ${getColor(hoveredCommit.agent_name).text}`}>
              {hoveredCommit.agent_name}
            </span>
            <span className="text-atelier-text-secondary truncate">
              {hoveredCommit.message}
            </span>
            <span className="text-atelier-text-muted ml-auto flex-shrink-0">
              {hoveredCommit.files_changed.length} file{hoveredCommit.files_changed.length !== 1 ? 's' : ''} changed
            </span>
          </div>
        </div>
      )}

      {/* Expanded file list on click */}
      {expanded && (() => {
        const commit = commits.find((c) => c.sha === expanded);
        if (!commit || commit.files_changed.length === 0) return null;
        return (
          <div
            className="px-4 py-2 border-t border-border-subtle bg-atelier-surface/40 overflow-y-auto max-h-24"
            data-testid="commit-files"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-semibold ${getColor(commit.agent_name).text}`}>
                {commit.agent_name}
              </span>
              <span className="text-xs text-atelier-text-muted truncate">
                {commit.message}
              </span>
            </div>
            <div className="space-y-0.5">
              {commit.files_changed.map((f) => (
                <div key={f} className="text-xs font-mono text-atelier-text-muted">{f}</div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Slide-in animation keyframes */}
      <style>{`
        @keyframes railroad-slide-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
