/** Design Preview canvas -- p5.js-powered design preview for Design Review meetings. */

import { useState, useEffect, useRef } from 'react';
import p5 from 'p5';
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

/** Draw a fallback shape with label using p5. */
function drawFallbackP5(
  p: p5,
  w: number,
  h: number,
  color: string,
  name: string,
  index: number,
  total: number,
): void {
  const radius = Math.min(w, h) * 0.08;
  const cols = Math.ceil(Math.sqrt(total));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = w / cols;
  const cellH = h / Math.ceil(total / cols);
  const cx = cellW * col + cellW / 2;
  const cy = cellH * row + cellH / 2;

  p.fill(color || '#888');
  p.noStroke();
  p.ellipse(cx, cy, radius * 2);

  p.fill(255);
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(Math.max(10, Math.round(w * 0.02)));
  p.text(name, cx, cy + radius + 4);
}

interface SceneCompositionProps {
  elements: DesignElement[];
  background: string;
  palette: string[];
  sceneTitle: string;
}

function SceneComposition({ elements, background, palette, sceneTitle }: SceneCompositionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const p5Ref = useRef<p5 | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous sketch
    if (p5Ref.current) {
      p5Ref.current.remove();
      p5Ref.current = null;
    }

    const sketch = new p5((p: p5) => {
      p.setup = () => {
        const rect = container.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(w * 9 / 16);
        const canvas = p.createCanvas(w, h);
        canvas.style('display', 'block');
        canvas.style('border-radius', '0.75rem');
        p.pixelDensity(window.devicePixelRatio || 1);
        p.noLoop();
      };

      p.draw = () => {
        const w = p.width;
        const h = p.height;

        // Background
        if (background) {
          p.background(background);
        } else {
          p.background(26, 26, 46);
        }

        // Elements in order (first = bottom layer)
        elements.forEach((el, i) => {
          const color = el.color || palette[i % palette.length] || '#888';
          p.push();
          if (el.draw) {
            try {
              const fn = new Function('p', 'w', 'h', 'color', el.draw);
              fn(p, w, h, color);
            } catch {
              drawFallbackP5(p, w, h, color, el.name, i, elements.length);
            }
          } else {
            drawFallbackP5(p, w, h, color, el.name, i, elements.length);
          }
          p.pop();
        });

        // Empty state
        if (elements.length === 0 && !background) {
          p.fill(255, 255, 255, 77);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(Math.round(w * 0.03));
          p.text('Design elements will appear here', w / 2, h / 2);
        }

        // Scene title badge
        if (sceneTitle) {
          const fontSize = Math.max(12, Math.round(w * 0.025));
          p.textSize(fontSize);
          p.textStyle(p.BOLD);
          const tw = p.textWidth(sceneTitle);
          const badgeW = tw + 16;
          const badgeH = fontSize + 10;

          p.fill(0, 0, 0, 128);
          p.noStroke();
          p.rect(8, 8, badgeW, badgeH, 6);

          p.fill(255);
          p.textAlign(p.LEFT, p.CENTER);
          p.text(sceneTitle, 16, 8 + badgeH / 2);
          p.textStyle(p.NORMAL);
        }
      };

      // Redraw once setup is complete
      p.setup();
      p.redraw();
    }, container);

    p5Ref.current = sketch;

    return () => {
      sketch.remove();
      p5Ref.current = null;
    };
  }, [elements, background, palette, sceneTitle]);

  return (
    <div
      ref={containerRef}
      data-testid="scene-canvas"
      className="w-full rounded-xl border border-border-subtle overflow-hidden"
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
