/** Reusable canvas panel: resolves canvas component from registry and renders it. */

import React, { useMemo } from 'react';
import { getCanvas } from './canvasRegistry';
import DefaultCanvas from './DefaultCanvas';

export interface CanvasPanelProps {
  meetingId: string;
  canvasType: string;
  canvasState: { type: string; data: Record<string, unknown> };
  onCanvasUpdate: (data: Record<string, unknown>) => void;
  onMaterialize?: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
}

export default function CanvasPanel({
  meetingId,
  canvasType,
  canvasState,
  onCanvasUpdate,
  onMaterialize,
}: CanvasPanelProps) {
  const resolvedCanvas = useMemo(
    () => getCanvas(canvasType) ?? DefaultCanvas,
    [canvasType],
  );

  return (
    <div className="h-full">
      {React.createElement(resolvedCanvas, {
        meetingId,
        canvasState,
        onCanvasUpdate,
        onMaterialize,
      })}
    </div>
  );
}
