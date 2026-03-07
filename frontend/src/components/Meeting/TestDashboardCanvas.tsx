/** Test Dashboard canvas -- live test results with pass/fail, error details, and fix buttons. */

import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface TestEntry {
  name: string;
  status: 'passed' | 'failed' | 'pending';
  expected?: string;
  actual?: string;
  error?: string;
}

interface ErrorEntry {
  task: string;
  message: string;
  stack?: string;
}

function parseTests(data: Record<string, unknown>): TestEntry[] {
  if (!Array.isArray(data.tests)) return [];
  return data.tests.map((t: Record<string, unknown>) => ({
    name: String(t.name ?? ''),
    status: (t.status as string) ?? (t.passed ? 'passed' : 'failed'),
    expected: t.expected ? String(t.expected) : undefined,
    actual: t.actual ? String(t.actual) : undefined,
    error: t.error ? String(t.error) : undefined,
  }));
}

function parseErrors(data: Record<string, unknown>): ErrorEntry[] {
  if (!Array.isArray(data.errors)) return [];
  return data.errors.map((e: Record<string, unknown>) => ({
    task: String(e.task ?? ''),
    message: String(e.message ?? ''),
    stack: e.stack ? String(e.stack) : undefined,
  }));
}

function TestDashboardCanvas({ canvasState, onCanvasUpdate }: CanvasProps) {
  const tests = parseTests(canvasState.data);
  const errors = parseErrors(canvasState.data);
  const passing = tests.filter(t => t.status === 'passed').length;
  const failing = tests.filter(t => t.status === 'failed').length;

  return (
    <div className="flex flex-col h-full" data-testid="test-dashboard-canvas">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Test Dashboard
        </h3>
        {tests.length > 0 && (
          <div className="flex gap-3 mt-2">
            <span className="text-sm text-green-400">{passing} passing</span>
            <span className="text-sm text-red-400">{failing} failing</span>
            <span className="text-sm text-atelier-text-muted">{tests.length} total</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {/* Test list */}
        {tests.length > 0 ? (
          <div className="space-y-2">
            {tests.map((test, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 border ${
                  test.status === 'passed'
                    ? 'bg-green-950/20 border-green-800/30'
                    : test.status === 'failed'
                    ? 'bg-red-950/20 border-red-800/30'
                    : 'bg-atelier-surface border-border-subtle'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${
                    test.status === 'passed' ? 'text-green-400' : test.status === 'failed' ? 'text-red-400' : 'text-atelier-text-muted'
                  }`}>
                    {test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : '...'}
                  </span>
                  <span className="text-sm font-medium text-atelier-text">{test.name}</span>
                </div>
                {test.error && (
                  <p className="text-xs text-red-300 mt-1 font-mono whitespace-pre-wrap">{test.error}</p>
                )}
                {test.expected && test.actual && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-green-950/30 p-2">
                      <p className="text-[10px] text-green-400 uppercase font-semibold">Expected</p>
                      <p className="text-xs text-green-300 mt-0.5">{test.expected}</p>
                    </div>
                    <div className="rounded-lg bg-red-950/30 p-2">
                      <p className="text-[10px] text-red-400 uppercase font-semibold">Actual</p>
                      <p className="text-xs text-red-300 mt-0.5">{test.actual}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-atelier-surface p-4 border border-border-subtle text-center">
            <p className="text-sm text-atelier-text-muted">
              Waiting for test results...
            </p>
          </div>
        )}

        {/* Error list */}
        {errors.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Task Errors</p>
            {errors.map((err, i) => (
              <div key={i} className="rounded-xl bg-red-950/20 p-3 border border-red-800/30">
                <p className="text-sm font-medium text-red-300">{err.task}</p>
                <p className="text-xs text-red-300/80 mt-1">{err.message}</p>
                {err.stack && (
                  <pre className="text-[10px] text-red-300/60 mt-1 overflow-x-auto">{err.stack}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fix buttons */}
      {failing > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle flex gap-3 justify-end">
          <button
            onClick={() => onCanvasUpdate({ type: 'request_fix', strategy: 'quick' })}
            className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer border border-accent-sky/30 text-accent-sky hover:bg-accent-sky/20 transition-colors"
          >
            Quick Fix
          </button>
          <button
            onClick={() => onCanvasUpdate({ type: 'request_fix', strategy: 'deep' })}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium"
          >
            Deep Fix
          </button>
        </div>
      )}
    </div>
  );
}

registerCanvas('test-dashboard', TestDashboardCanvas);

export default TestDashboardCanvas;
