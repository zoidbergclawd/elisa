/** Whiteboard canvas -- free-form HTML5 Canvas drawing with agent annotations. */

import { useRef, useState, useEffect, useCallback } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

type Tool = 'pen' | 'line' | 'rectangle' | 'circle' | 'eraser' | 'text';

interface Annotation {
  x: number;
  y: number;
  text: string;
}

function parseAnnotations(data: Record<string, unknown>): Annotation[] {
  if (!Array.isArray(data.annotations)) return [];
  return data.annotations.map((a: Record<string, unknown>) => ({
    x: Number(a.x ?? 0),
    y: Number(a.y ?? 0),
    text: String(a.text ?? ''),
  }));
}

const TOOL_LABELS: Record<Tool, string> = {
  pen: 'Pen',
  line: 'Line',
  rectangle: 'Rect',
  circle: 'Circle',
  eraser: 'Eraser',
  text: 'Text',
};

const COLORS = ['#FFFFFF', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

function WhiteboardCanvas({ canvasState }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [activeColor, setActiveColor] = useState('#FFFFFF');
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const annotations = parseAnnotations(canvasState.data);
  const background = (canvasState.data.background as string) || '#1a1a2e';

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to fill container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Fill background
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw annotations
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#60A5FA';
    for (const ann of annotations) {
      ctx.fillText(ann.text, ann.x, ann.y);
    }
  }, [background, annotations]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    lastPosRef.current = pos;
    setIsDrawing(true);

    if (activeTool === 'text') {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const text = prompt('Enter text:');
      if (text) {
        ctx.font = '14px sans-serif';
        ctx.fillStyle = activeColor;
        ctx.fillText(text, pos.x, pos.y);
      }
      setIsDrawing(false);
    }
  }, [activeTool, activeColor, getPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPosRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);

    if (activeTool === 'pen' || activeTool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = activeTool === 'eraser' ? background : activeColor;
      ctx.lineWidth = activeTool === 'eraser' ? 20 : 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      lastPosRef.current = pos;
    }
  }, [isDrawing, activeTool, activeColor, background, getPos]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPosRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) { setIsDrawing(false); return; }

    const pos = getPos(e);
    const start = lastPosRef.current;

    if (activeTool === 'line') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (activeTool === 'rectangle') {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(start.x, start.y, pos.x - start.x, pos.y - start.y);
    } else if (activeTool === 'circle') {
      const rx = Math.abs(pos.x - start.x) / 2;
      const ry = Math.abs(pos.y - start.y) / 2;
      const cx = (start.x + pos.x) / 2;
      const cy = (start.y + pos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    setIsDrawing(false);
    lastPosRef.current = null;
  }, [isDrawing, activeTool, activeColor, getPos]);

  return (
    <div className="flex flex-col h-full" data-testid="whiteboard-canvas">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {(Object.keys(TOOL_LABELS) as Tool[]).map(tool => (
          <button
            key={tool}
            onClick={() => setActiveTool(tool)}
            className={`px-2 py-1 rounded-lg text-xs transition-colors ${
              activeTool === tool
                ? 'bg-accent-sky/20 text-accent-sky font-medium'
                : 'text-atelier-text-muted hover:text-atelier-text'
            }`}
          >
            {TOOL_LABELS[tool]}
          </button>
        ))}
        <div className="w-px h-4 bg-border-subtle mx-1" />
        {COLORS.map(color => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            className={`w-5 h-5 rounded-full border-2 transition-colors ${
              activeColor === color ? 'border-accent-sky' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 rounded-xl overflow-hidden border border-border-subtle">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDrawing(false); lastPosRef.current = null; }}
        />
      </div>
    </div>
  );
}

registerCanvas('whiteboard', WhiteboardCanvas);

export default WhiteboardCanvas;
