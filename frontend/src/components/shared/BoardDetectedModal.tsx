import type { BoardInfo } from '../../hooks/useBoardDetect';

interface Props {
  boardInfo: BoardInfo;
  hasExistingPortal: boolean;
  onCreatePortal: () => void;
  onDismiss: () => void;
}

export default function BoardDetectedModal({ boardInfo, hasExistingPortal, onCreatePortal, onDismiss }: Props) {
  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-detected-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center animate-float-in">
        {/* Chip icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center animate-pulse-glow-mint">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="8" y="8" width="16" height="16" rx="3" stroke="#10b981" strokeWidth="2" />
              <rect x="12" y="12" width="8" height="8" rx="1" fill="#10b981" opacity="0.5" />
              {/* Pins */}
              <line x1="6" y1="12" x2="8" y2="12" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="16" x2="8" y2="16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="20" x2="8" y2="20" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="12" x2="26" y2="12" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="16" x2="26" y2="16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="24" y1="20" x2="26" y2="20" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="6" x2="12" y2="8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="6" x2="16" y2="8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="20" y1="6" x2="20" y2="8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="24" x2="12" y2="26" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="24" x2="16" y2="26" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
              <line x1="20" y1="24" x2="20" y2="26" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h2 id="board-detected-title" className="text-2xl font-display font-bold mb-3 gradient-text-mint">
          Board Connected!
        </h2>

        {/* Board info badges */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            {boardInfo.boardType}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-atelier-elevated text-atelier-text-secondary">
            {boardInfo.port}
          </span>
        </div>

        <p className="text-sm text-atelier-text-secondary mb-6">
          {hasExistingPortal
            ? 'Your board is back! A Portal is already set up for it.'
            : 'Your board is ready! Create a Portal so your minions can talk to it.'}
        </p>

        {/* Actions */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onCreatePortal}
            className="go-btn go-btn-ready px-6 py-2.5 rounded-xl text-sm cursor-pointer"
          >
            {hasExistingPortal ? 'View Portals' : 'Create Portal'}
          </button>
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 rounded-xl text-sm cursor-pointer border border-atelier-text-muted/30 text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
