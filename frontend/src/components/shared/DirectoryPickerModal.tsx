import { useState } from 'react';

interface DirectoryPickerModalProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
}

/** Fallback directory picker for non-Electron environments (browser dev mode). */
export default function DirectoryPickerModal({ onSelect, onCancel }: DirectoryPickerModalProps) {
  const [dirPath, setDirPath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = dirPath.trim();
    if (trimmed) onSelect(trimmed);
  };

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dir-picker-title"
      onClick={onCancel}
    >
      <div
        className="glass-elevated rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-float-in"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="dir-picker-title" className="text-lg font-display font-bold gradient-text-warm mb-3">
          Choose Project Folder
        </h2>
        <p className="text-sm text-atelier-text-secondary mb-4">
          Enter the full path where you want your project files saved.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={dirPath}
            onChange={e => setDirPath(e.target.value)}
            placeholder="C:\Users\you\Projects\my-nugget"
            className="w-full px-3 py-2 rounded-lg bg-atelier-surface border border-border-subtle text-atelier-text text-sm placeholder:text-atelier-text-muted focus:outline-none focus:ring-2 focus:ring-accent-lavender/40"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-atelier-text-secondary hover:bg-atelier-elevated cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!dirPath.trim()}
              className="go-btn px-4 py-2 rounded-lg text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
