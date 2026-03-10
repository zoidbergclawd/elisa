import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CodeExplorerCanvas from './CodeExplorerCanvas';

const defaultProps = {
  meetingId: 'meeting-1',
  canvasState: { type: 'code-explorer', data: {} },
  onCanvasUpdate: vi.fn(),
};

describe('CodeExplorerCanvas', () => {
  it('renders empty state when no files', () => {
    render(<CodeExplorerCanvas {...defaultProps} />);
    expect(screen.getByText('Waiting for code to explore...')).toBeInTheDocument();
  });

  it('renders file content with line numbers', () => {
    const canvasState = {
      type: 'code-explorer',
      data: {
        files: [{
          path: 'src/main.py',
          content: 'print("hello")\nx = 42',
          annotations: [],
        }],
        activeFile: 'src/main.py',
      },
    };
    render(<CodeExplorerCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('print("hello")')).toBeInTheDocument();
    expect(screen.getByText('x = 42')).toBeInTheDocument();
  });

  it('renders inline annotations', () => {
    const canvasState = {
      type: 'code-explorer',
      data: {
        files: [{
          path: 'src/app.js',
          content: 'const x = 1;\nconst y = 2;',
          annotations: [{ line: 1, text: 'This initializes x' }],
        }],
      },
    };
    render(<CodeExplorerCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText(/This initializes x/)).toBeInTheDocument();
  });

  it('shows file path and annotation count', () => {
    const canvasState = {
      type: 'code-explorer',
      data: {
        files: [{
          path: 'src/utils.ts',
          content: 'export function add(a, b) { return a + b; }',
          annotations: [{ line: 1, text: 'Helper function' }],
        }],
      },
    };
    render(<CodeExplorerCanvas {...defaultProps} canvasState={canvasState} />);
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    expect(screen.getByText('1 annotation')).toBeInTheDocument();
  });
});
