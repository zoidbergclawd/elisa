/** Live Preview canvas -- embeds iframe pointing to local web preview, auto-refreshes. */

import { useEffect, useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

function LivePreviewCanvas({ canvasState }: CanvasProps) {
  const previewUrl = (canvasState.data.previewUrl as string) || '';
  const refreshToken = (canvasState.data.refreshToken as number) || 0;
  const [iframeKey, setIframeKey] = useState(0);

  // Auto-refresh when refreshToken changes
  useEffect(() => {
    if (refreshToken > 0) {
      setIframeKey(prev => prev + 1); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [refreshToken]);

  return (
    <div className="flex flex-col h-full" data-testid="live-preview-canvas">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Live Preview
        </h3>
        {previewUrl && (
          <button
            onClick={() => setIframeKey(prev => prev + 1)}
            className="px-3 py-1 rounded-lg text-xs cursor-pointer border border-border-subtle text-atelier-text-secondary hover:text-atelier-text transition-colors"
          >
            Refresh
          </button>
        )}
      </div>

      <div className="flex-1 rounded-xl overflow-hidden border border-border-subtle bg-white">
        {previewUrl ? (
          <iframe
            key={iframeKey}
            src={previewUrl}
            title="Live web preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-atelier-text-muted bg-atelier-surface">
            <p className="text-sm">Waiting for web preview URL...</p>
          </div>
        )}
      </div>
    </div>
  );
}

registerCanvas('live-preview', LivePreviewCanvas);

export default LivePreviewCanvas;
