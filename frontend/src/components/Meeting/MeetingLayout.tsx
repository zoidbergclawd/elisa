/** Two-panel meeting layout: left chat (w-80), right canvas (flex-1). */

import type { ReactNode } from 'react';

export interface MeetingLayoutProps {
  header: ReactNode;
  chatPanel: ReactNode;
  canvasPanel: ReactNode;
}

export default function MeetingLayout({
  header,
  chatPanel,
  canvasPanel,
}: MeetingLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: chat */}
        <div className="w-80 flex flex-col border-r border-border-subtle">
          {chatPanel}
        </div>
        {/* Right panel: canvas */}
        <div className="flex-1 min-w-0 p-4">
          {canvasPanel}
        </div>
      </div>
    </div>
  );
}
