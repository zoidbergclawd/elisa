/** Theme Picker canvas — lets kids pick a display theme for their BOX-3 device. */

import { useState, useEffect } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';
import DisplayThemePreview from '../shared/DisplayThemePreview';
import type { DisplayTheme } from '../shared/DisplayThemePreview';

/**
 * Default themes mirroring backend/src/models/display.ts DEFAULT_THEMES.
 * Duplicated here to avoid cross-package imports.
 */
const DEFAULT_THEMES: DisplayTheme[] = [
  {
    id: 'default',
    name: 'Elisa Blue',
    background_color: '#1a1a2e',
    text_color: '#ffffff',
    accent_color: '#4361ee',
    avatar_style: 'expressive',
  },
  {
    id: 'forest',
    name: 'Forest',
    background_color: '#1b4332',
    text_color: '#d8f3dc',
    accent_color: '#95d5b2',
    avatar_style: 'minimal',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    background_color: '#3d0000',
    text_color: '#ffccd5',
    accent_color: '#ff6b6b',
    avatar_style: 'expressive',
  },
  {
    id: 'pixel',
    name: 'Pixel Art',
    background_color: '#0f0f0f',
    text_color: '#00ff00',
    accent_color: '#ff00ff',
    avatar_style: 'pixel',
  },
];

function ThemePickerCanvas({ canvasState, onCanvasUpdate, onMaterialize }: CanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    typeof canvasState.data.currentTheme === 'string' ? canvasState.data.currentTheme : null
  );

  // Sync from canvasState.data (agent-driven updates)
  /* eslint-disable react-hooks/set-state-in-effect -- syncing external canvas state to local state */
  useEffect(() => {
    const incoming = canvasState.data.currentTheme;
    if (typeof incoming === 'string' && incoming !== selectedId) {
      setSelectedId(incoming);
    }
  }, [canvasState.data.currentTheme]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedTheme = DEFAULT_THEMES.find((t) => t.id === selectedId);

  const handleSelect = (themeId: string) => {
    setSelectedId(themeId);
  };

  const [materializeMsg, setMaterializeMsg] = useState('');

  const handleApply = async () => {
    if (!selectedId) return;
    const data = { type: 'theme_selected', theme_id: selectedId, currentTheme: selectedId };
    onCanvasUpdate(data);

    if (onMaterialize) {
      const result = await onMaterialize(data);
      if (result) {
        setMaterializeMsg(`Saved to ${result.primaryFile}!`);
        setTimeout(() => setMaterializeMsg(''), 4000);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Pick a look for your BOX-3!
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Choose a color theme that matches your style. You can always change it later.
        </p>
      </div>

      {/* Theme grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {DEFAULT_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              className={`rounded-xl p-3 transition-all cursor-pointer text-left ${
                selectedId === theme.id
                  ? 'ring-2 ring-accent-sky bg-accent-sky/10'
                  : 'hover:bg-atelier-surface/50'
              }`}
              aria-pressed={selectedId === theme.id}
              aria-label={`Select ${theme.name} theme`}
            >
              <DisplayThemePreview theme={theme} agentName="Pixel" size="sm" />
              <p className="text-sm font-medium text-atelier-text mt-2">
                {theme.name}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Selected theme info + apply button */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        {selectedTheme ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-atelier-text">
                Selected: {selectedTheme.name}
              </p>
              <p className="text-xs text-atelier-text-secondary">
                {selectedTheme.avatar_style} style
              </p>
            </div>
            <div className="flex items-center gap-3">
              {materializeMsg && (
                <p className="text-xs text-green-400">{materializeMsg}</p>
              )}
              <button
                type="button"
                onClick={handleApply}
                className="go-btn px-4 py-2 rounded-xl text-sm font-medium"
              >
                Apply Theme
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-atelier-text-muted text-center">
            Tap a theme above to see how it looks!
          </p>
        )}
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('theme-picker', ThemePickerCanvas);

export default ThemePickerCanvas;
export { DEFAULT_THEMES };
