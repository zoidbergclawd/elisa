/** Default placeholder canvas shown when no specialized canvas is registered. */

import type { CanvasProps } from './canvasRegistry';
import { getRegisteredCanvasTypes } from './canvasRegistry';

export default function DefaultCanvas({ canvasState }: CanvasProps) {
  console.warn(`[DefaultCanvas] Fallback for canvasType="${canvasState.type}". Registered: [${getRegisteredCanvasTypes().join(', ')}]`);
  return (
    <div className="flex items-center justify-center h-full text-atelier-text-secondary">
      <div className="text-center">
        <div className="text-4xl mb-3">*</div>
        <p className="text-sm font-medium">Canvas coming soon</p>
        <p className="text-xs text-atelier-text-muted mt-1">
          {canvasState.type} canvas is not yet available
        </p>
      </div>
    </div>
  );
}
