import { useRef, useEffect } from 'react';
import type { SerialLine } from '../../hooks/useBuildSession';
import type { BoardInfo } from '../../hooks/useBoardDetect';

interface Props {
  serialLines: SerialLine[];
  boardInfo: BoardInfo | null;
}

export default function BoardOutput({ serialLines, boardInfo }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serialLines]);

  return (
    <div className="h-full flex flex-col">
      {/* Board identity card */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-subtle">
        <span className={`inline-block w-2 h-2 rounded-full ${boardInfo ? 'bg-green-400' : 'bg-gray-500'}`} />
        {boardInfo ? (
          <>
            <span className="text-xs font-medium text-atelier-text">{boardInfo.boardType}</span>
            <span className="text-xs text-atelier-text-muted">{boardInfo.port}</span>
          </>
        ) : (
          <>
            <span className="text-xs text-atelier-text-muted">No board detected</span>
            <span className="text-xs text-atelier-text-muted/60">-- plug in a USB device</span>
          </>
        )}
      </div>

      {/* Serial output */}
      {serialLines.length > 0 ? (
        <div ref={scrollRef} className="flex-1 overflow-y-auto terminal-panel font-mono text-xs p-3">
          {serialLines.map((entry, i) => {
            const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
            return (
              <div key={i} className="whitespace-pre-wrap">
                <span className="text-atelier-text-muted">{ts} </span>
                {entry.line}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-atelier-text-muted">
          {boardInfo ? 'Waiting for serial output...' : 'Connect your board to see its output'}
        </div>
      )}
    </div>
  );
}
