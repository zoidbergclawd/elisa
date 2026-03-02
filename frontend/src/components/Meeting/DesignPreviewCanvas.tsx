/** Design Preview canvas -- display-only design preview for Design Review meetings. */

import { useState, useEffect, useRef, useCallback } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface DesignElement {
  name: string;
  description: string;
  color?: string;
  draw?: string;
}

function parseElements(data: Record<string, unknown>): DesignElement[] {
  if (!Array.isArray(data.elements)) return [];
  return data.elements.map((e: unknown) => {
    const el = e as Record<string, unknown>;
    const result: DesignElement = {
      name: String(el.name ?? ''),
      description: String(el.description ?? ''),
    };
    if (typeof el.color === 'string' && el.color) result.color = el.color;
    if (typeof el.draw === 'string' && el.draw) result.draw = el.draw;
    return result;
  });
}

function parsePalette(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.palette)) return [];
  return data.palette.filter((c): c is string => typeof c === 'string');
}

/** Parse a CSS linear-gradient string and draw it on the canvas context. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  background: string,
): void {
  if (!background) return;

  if (background.startsWith('linear-gradient(')) {
    // Parse: linear-gradient(135deg, #0a0a2e, #1a1a4e)
    const inner = background.slice('linear-gradient('.length, -1);
    const parts = inner.split(',').map((s) => s.trim());
    if (parts.length < 2) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Parse angle
    let angleDeg = 180;
    let colorStart = 0;
    const angleMatch = parts[0].match(/^([\d.]+)deg$/);
    if (angleMatch) {
      angleDeg = parseFloat(angleMatch[1]);
      colorStart = 1;
    }

    const colors = parts.slice(colorStart);
    if (colors.length === 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // Convert CSS angle to canvas gradient coordinates
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const cx = w / 2;
    const cy = h / 2;
    const len = Math.max(w, h);
    const x0 = cx - Math.cos(rad) * len;
    const y0 = cy - Math.sin(rad) * len;
    const x1 = cx + Math.cos(rad) * len;
    const y1 = cy + Math.sin(rad) * len;

    try {
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      colors.forEach((c, i) => {
        // Handle CSS color stops like "#0a0a2e 0%" -- strip the percentage
        const colorOnly = c.split(/\s+/)[0];
        const stopMatch = c.match(/([\d.]+)%/);
        const position = stopMatch
          ? parseFloat(stopMatch[1]) / 100
          : i / Math.max(colors.length - 1, 1);
        grad.addColorStop(position, colorOnly);
      });
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } catch {
      // Fallback on gradient parse error
      ctx.fillStyle = colors[0]?.split(/\s+/)[0] || '#000';
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Draw a fallback circle with the element name. */
function drawFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  name: string,
  index: number,
  total: number,
): void {
  const radius = Math.min(w, h) * 0.08;
  // Distribute elements across the canvas
  const cols = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = w / cols;
  const cellH = h / Math.ceil(total / cols);
  const cx = cellW * col + cellW / 2;
  const cy = cellH * row + cellH / 2;

  ctx.fillStyle = color || '#888';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(10, Math.round(w * 0.02))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(name, cx, cy + radius + 4, cellW - 8);
}

interface SceneCompositionProps {
  elements: DesignElement[];
  background: string;
  palette: string[];
  sceneTitle: string;
}

function SceneComposition({ elements, background, palette, sceneTitle }: SceneCompositionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    // Only resize buffer if dimensions changed
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // Background
    if (background) {
      drawBackground(ctx, w, h, background);
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, w, h);
    }

    // Elements in order (first = bottom layer)
    elements.forEach((el, i) => {
      const color = el.color || palette[i % palette.length] || '#888';
      ctx.save();
      if (el.draw) {
        try {
          const fn = new Function('ctx', 'w', 'h', 'color', el.draw);
          fn(ctx, w, h, color);
        } catch {
          // Fallback on error
          drawFallback(ctx, w, h, color, el.name, i, elements.length);
        }
      } else {
        drawFallback(ctx, w, h, color, el.name, i, elements.length);
      }
      ctx.restore();
    });

    // Empty state
    if (elements.length === 0 && !background) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `${Math.round(w * 0.03)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Design elements will appear here', w / 2, h / 2);
    }

    // Scene title badge
    if (sceneTitle) {
      const fontSize = Math.max(12, Math.round(w * 0.025));
      ctx.font = `bold ${fontSize}px sans-serif`;
      const textMetrics = ctx.measureText(sceneTitle);
      const badgeW = textMetrics.width + 16;
      const badgeH = fontSize + 10;
      const badgeX = 8;
      const badgeY = 8;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sceneTitle, badgeX + 8, badgeY + badgeH / 2);
    }
  }, [elements, background, palette, sceneTitle]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="scene-canvas"
      className="w-full rounded-xl border border-border-subtle"
      style={{ aspectRatio: '16 / 9' }}
    />
  );
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
          {/* Scene canvas -- primary visual */}
          <SceneComposition
            elements={elements}
            background={background}
            palette={palette}
            sceneTitle={sceneTitle}
          />

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
                    <div className="flex items-center gap-2">
                      {el.color && (
                        <div
                          className="w-4 h-4 rounded-full border border-border-subtle shrink-0"
                          style={{ backgroundColor: el.color }}
                        />
                      )}
                      <p className="text-sm font-medium text-atelier-text">{el.name}</p>
                    </div>
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
