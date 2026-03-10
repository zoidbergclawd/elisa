/** Code Explorer canvas -- syntax-highlighted code viewer with agent annotations. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface FileEntry {
  path: string;
  content: string;
  annotations: Array<{ line: number; text: string }>;
}

function parseFiles(data: Record<string, unknown>): FileEntry[] {
  if (!Array.isArray(data.files)) return [];
  return data.files.map((f: Record<string, unknown>) => ({
    path: String(f.path ?? ''),
    content: String(f.content ?? ''),
    annotations: Array.isArray(f.annotations)
      ? f.annotations.map((a: Record<string, unknown>) => ({
          line: Number(a.line ?? 0),
          text: String(a.text ?? ''),
        }))
      : [],
  }));
}

function CodeExplorerCanvas({ canvasState }: CanvasProps) {
  const files = parseFiles(canvasState.data);
  const activeFilePath = (canvasState.data.activeFile as string) || files[0]?.path || '';
  const [selectedFile, setSelectedFile] = useState(activeFilePath);

  const currentFile = files.find(f => f.path === selectedFile) || files[0];
  const lines = currentFile?.content.split('\n') ?? [];
  const annotationMap = new Map(
    (currentFile?.annotations ?? []).map(a => [a.line, a.text]),
  );

  return (
    <div className="flex flex-col h-full" data-testid="code-explorer-canvas">
      <div className="mb-3">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Code Explorer
        </h3>
      </div>

      {/* File tabs */}
      {files.length > 1 && (
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {files.map(f => (
            <button
              key={f.path}
              onClick={() => setSelectedFile(f.path)}
              className={`px-3 py-1 rounded-lg text-xs shrink-0 transition-colors ${
                selectedFile === f.path
                  ? 'bg-accent-sky/20 text-accent-sky font-medium'
                  : 'text-atelier-text-muted hover:text-atelier-text'
              }`}
            >
              {f.path.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Code viewer */}
      <div className="flex-1 overflow-auto rounded-xl border border-border-subtle bg-[#1a1a2e] font-mono text-xs">
        {currentFile ? (
          <table className="w-full">
            <tbody>
              {lines.map((line, i) => {
                const lineNum = i + 1;
                const annotation = annotationMap.get(lineNum);
                return (
                  <tr key={i} className={annotation ? 'bg-accent-sky/10' : ''}>
                    <td className="px-2 py-0.5 text-right text-atelier-text-muted/40 select-none w-10 align-top">
                      {lineNum}
                    </td>
                    <td className="px-2 py-0.5 text-gray-300 whitespace-pre">
                      {line}
                      {annotation && (
                        <span className="ml-4 text-accent-sky text-[10px]">
                          {'// '}{annotation}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full text-atelier-text-muted p-4">
            <p>Waiting for code to explore...</p>
          </div>
        )}
      </div>

      {/* File path */}
      {currentFile && (
        <p className="text-[10px] text-atelier-text-muted mt-1 truncate">
          {currentFile.path}
          {currentFile.annotations.length > 0 && (
            <span className="ml-2 text-accent-sky">
              {currentFile.annotations.length} annotation{currentFile.annotations.length > 1 ? 's' : ''}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

registerCanvas('code-explorer', CodeExplorerCanvas);

export default CodeExplorerCanvas;
