/** Explain-It canvas -- collaborative document editor for README/help text creation. */

import { useState, useMemo } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface Suggestion {
  id: string;
  text: string;
}

function ExplainItCanvas({ canvasState, onCanvasUpdate }: CanvasProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // Agent suggestions come from canvasState.data
  const suggestions = useMemo<Suggestion[]>(() => {
    const raw = canvasState.data.suggestions;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s): s is Suggestion =>
        typeof s === 'object' && s !== null && typeof s.id === 'string' && typeof s.text === 'string',
    );
  }, [canvasState.data.suggestions]);

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [content]);

  const handleApplySuggestion = (suggestion: Suggestion) => {
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    setContent((prev) => prev + separator + suggestion.text);
  };

  const handleSave = () => {
    onCanvasUpdate({ type: 'document_saved', title, content });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Explain-It Editor
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Write a document that explains what you built. If you can explain it, you understand it!
        </p>
      </div>

      {/* Title input */}
      <div className="mb-3">
        <label htmlFor="doc-title" className="block text-xs font-medium text-atelier-text-secondary mb-1">
          Document Title
        </label>
        <input
          id="doc-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My Project README"
          className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
        />
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Main editing area */}
        <div className="flex-1 flex flex-col min-w-0">
          <label htmlFor="doc-content" className="block text-xs font-medium text-atelier-text-secondary mb-1">
            Content
          </label>
          <textarea
            id="doc-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your document here... Markdown is supported!"
            className="flex-1 w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none resize-none font-mono"
          />
        </div>

        {/* Suggestions sidebar */}
        {suggestions.length > 0 && (
          <div className="w-56 flex flex-col min-h-0">
            <p className="text-xs font-medium text-atelier-text-secondary mb-1">
              Suggestions
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-xl bg-atelier-surface p-2 border border-border-subtle">
                  <p className="text-xs text-atelier-text-secondary mb-2 line-clamp-3">
                    {s.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleApplySuggestion(s)}
                    className="text-xs text-accent-sky hover:text-accent-sky/80 font-medium cursor-pointer"
                    aria-label={`Apply suggestion: ${s.text.slice(0, 30)}`}
                  >
                    Apply Suggestion
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: word count + save */}
      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
        <p className="text-xs text-atelier-text-muted" data-testid="word-count">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!title.trim() || !content.trim()}
          className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Document
        </button>
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('explain-it', ExplainItCanvas);

export default ExplainItCanvas;
