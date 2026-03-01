/** Design Preview canvas -- display-only design preview for Design Review meetings. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface DesignElement {
  name: string;
  description: string;
}

function parseElements(data: Record<string, unknown>): DesignElement[] {
  if (!Array.isArray(data.elements)) return [];
  return data.elements.map((e: unknown) => {
    const el = e as Record<string, unknown>;
    return {
      name: String(el.name ?? ''),
      description: String(el.description ?? ''),
    };
  });
}

function parsePalette(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.palette)) return [];
  return data.palette.filter((c): c is string => typeof c === 'string');
}

function DesignPreviewCanvas({ canvasState, onMaterialize }: CanvasProps) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const { data } = canvasState;
  const sceneTitle = typeof data.scene_title === 'string' ? data.scene_title : '';
  const description = typeof data.description === 'string' ? data.description : '';
  const background = typeof data.background === 'string' ? data.background : '';
  const palette = parsePalette(data);
  const elements = parseElements(data);

  const hasContent = sceneTitle || description || background || palette.length > 0 || elements.length > 0;

  return (
    <div className="flex flex-col h-full" data-testid="design-preview-canvas">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Design Preview
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          {hasContent
            ? 'Your design is taking shape!'
            : 'Start chatting -- the preview updates as you talk!'}
        </p>
      </div>

      {hasContent ? (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Scene preview */}
          {(sceneTitle || description || background) && (
            <div
              className="rounded-xl p-6 border border-border-subtle min-h-[120px] flex flex-col justify-end"
              style={{
                background: background || 'var(--color-atelier-surface)',
              }}
              data-testid="scene-preview"
            >
              {sceneTitle && (
                <h4 className="text-xl font-bold text-white drop-shadow-md">
                  {sceneTitle}
                </h4>
              )}
              {description && (
                <p className="text-sm text-white/80 drop-shadow-sm mt-1">
                  {description}
                </p>
              )}
            </div>
          )}

          {/* Color palette */}
          {palette.length > 0 && (
            <div data-testid="color-palette">
              <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
                Color Palette
              </p>
              <div className="flex gap-2 flex-wrap">
                {palette.map((color, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className="w-10 h-10 rounded-lg border border-border-subtle shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                    <span className="text-xs text-atelier-text-muted font-mono">
                      {color}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Design elements */}
          {elements.length > 0 && (
            <div data-testid="design-elements">
              <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
                Design Elements
              </p>
              <div className="space-y-2">
                {elements.map((el, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-atelier-surface p-3 border border-border-subtle"
                  >
                    <p className="text-sm font-medium text-atelier-text">{el.name}</p>
                    {el.description && (
                      <p className="text-xs text-atelier-text-secondary mt-1">{el.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save button */}
          {onMaterialize && (
            <button
              type="button"
              disabled={saveStatus === 'saving'}
              onClick={async () => {
                setSaveStatus('saving');
                try {
                  const result = await onMaterialize(data);
                  setSaveStatus(result ? 'saved' : 'error');
                } catch {
                  setSaveStatus('error');
                }
                setTimeout(() => setSaveStatus('idle'), 3000);
              }}
              className={`w-full px-4 py-2 rounded-xl text-sm cursor-pointer border transition-colors ${
                saveStatus === 'saved'
                  ? 'border-green-500/30 text-green-400 bg-green-950/20'
                  : saveStatus === 'error'
                    ? 'border-red-500/30 text-red-400 bg-red-950/20'
                    : 'border-accent-sky/30 text-accent-sky hover:bg-accent-sky/10'
              } ${saveStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {saveStatus === 'saving' ? 'Saving...'
                : saveStatus === 'saved' ? 'Saved!'
                : saveStatus === 'error' ? 'Save failed -- try again'
                : 'Save Design Spec'}
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="rounded-xl bg-atelier-surface p-6 border border-border-subtle text-center max-w-xs">
            <p className="text-sm text-atelier-text-muted">
              Start chatting -- the preview updates as you talk!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Register in the canvas registry
registerCanvas('design-preview', DesignPreviewCanvas);

export default DesignPreviewCanvas;
