import { useState, useRef, useEffect } from 'react';
import type { NarratorMessage, WSEvent } from '../../types';
import MinionAvatar from '../shared/MinionAvatar';
import CommsFeed from './CommsFeed';

interface NarratorFeedProps {
  narratorMessages: NarratorMessage[];
  events: WSEvent[];
  isPlanning?: boolean;
}

const MOOD_STYLES: Record<string, string> = {
  excited: 'bg-accent-sky/10 border-accent-sky/20',
  encouraging: 'bg-accent-mint/10 border-accent-mint/20',
  concerned: 'bg-accent-coral/10 border-accent-coral/20',
  celebrating: 'bg-accent-lavender/10 border-accent-lavender/30 shadow-sm shadow-accent-lavender/10',
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function NarratorFeed({ narratorMessages, events, isPlanning = false }: NarratorFeedProps) {
  const [mode, setMode] = useState<'story' | 'raw'>('story');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current && mode === 'story') {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [narratorMessages.length, mode]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <h3 className="text-xs font-semibold text-atelier-text-muted uppercase tracking-wider">Narrator</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setMode('story')}
            className={`px-2 py-0.5 text-xs rounded ${mode === 'story' ? 'bg-accent-lavender/20 text-accent-lavender' : 'text-atelier-text-muted hover:text-atelier-text-secondary'}`}
          >
            Story Mode
          </button>
          <button
            onClick={() => setMode('raw')}
            className={`px-2 py-0.5 text-xs rounded ${mode === 'raw' ? 'bg-accent-lavender/20 text-accent-lavender' : 'text-atelier-text-muted hover:text-atelier-text-secondary'}`}
          >
            Raw Output
          </button>
        </div>
      </div>

      {mode === 'story' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Story messages */}
          <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {narratorMessages.length === 0 ? (
              <div className="text-sm text-atelier-text-muted text-center py-4">
                {isPlanning ? (
                  <div className="flex flex-col items-center gap-2">
                    <MinionAvatar name="Elisa" role="narrator" status="working" size="sm" />
                    <p>Elisa is reading your design and hatching a plan...</p>
                  </div>
                ) : (
                  <p>Elisa will narrate your build adventure here...</p>
                )}
              </div>
            ) : (
              narratorMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${MOOD_STYLES[msg.mood] || MOOD_STYLES.encouraging}`}
                >
                  <MinionAvatar name="Elisa" role="narrator" status="working" size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-atelier-text">{msg.text}</p>
                    <p className="text-[10px] text-atelier-text-muted mt-0.5">{timeAgo(msg.timestamp)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Collapsible technical details */}
          <div className="border-t border-border-subtle">
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="w-full px-3 py-1.5 text-xs text-atelier-text-muted hover:text-atelier-text-secondary flex items-center gap-1"
            >
              <span className={`transition-transform ${detailsOpen ? 'rotate-90' : ''}`}>&#9656;</span>
              Technical Details
            </button>
            {detailsOpen && (
              <div className="max-h-32 overflow-hidden">
                <CommsFeed events={events} fullHeight />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <CommsFeed events={events} fullHeight />
        </div>
      )}
    </div>
  );
}
