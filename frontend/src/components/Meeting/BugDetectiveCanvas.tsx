/** Bug Detective canvas -- helps kids diagnose failing tests with expected vs actual. */

import { useState } from 'react';
import { registerCanvas, type CanvasProps } from './canvasRegistry';

interface FailingTest {
  name: string;
  when: string;
  then_expected: string;
  then_actual: string;
}

function parseFailingTest(data: Record<string, unknown>): FailingTest | null {
  if (!data.test_name) return null;
  return {
    name: String(data.test_name ?? ''),
    when: String(data.when ?? ''),
    then_expected: String(data.then_expected ?? ''),
    then_actual: String(data.then_actual ?? ''),
  };
}

function parseDiagnosisNotes(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.diagnosis_notes)) return [];
  return data.diagnosis_notes.map(String);
}

function BugDetectiveCanvas({ canvasState, onCanvasUpdate }: CanvasProps) {
  const [fixDecision, setFixDecision] = useState('');

  const failingTest = parseFailingTest(canvasState.data);
  const diagnosisNotes = parseDiagnosisNotes(canvasState.data);

  const handleSubmitFix = () => {
    const trimmed = fixDecision.trim();
    if (!trimmed) return;
    onCanvasUpdate({ type: 'fix_decision', fix: trimmed });
  };

  return (
    <div className="flex flex-col h-full" data-testid="bug-detective-canvas">
      <div className="mb-4">
        <h3 className="text-lg font-display font-bold text-atelier-text">
          Bug Detective
        </h3>
        <p className="text-sm text-atelier-text-secondary mt-1">
          Let's figure out what went wrong and how to fix it!
        </p>
      </div>

      {/* Split view: expected/actual on left, diagnosis on right */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Failing test details */}
          <div className="space-y-3">
            {failingTest ? (
              <>
                <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle">
                  <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-1">
                    Failing Test
                  </p>
                  <p className="text-sm font-medium text-atelier-text">
                    {failingTest.name}
                  </p>
                </div>

                {failingTest.when && (
                  <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle">
                    <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-1">
                      When
                    </p>
                    <p className="text-sm text-atelier-text">{failingTest.when}</p>
                  </div>
                )}

                <div className="rounded-xl bg-green-950/30 p-3 border border-green-800/30">
                  <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-1">
                    Expected
                  </p>
                  <p className="text-sm text-green-300">
                    {failingTest.then_expected || 'No expected value provided'}
                  </p>
                </div>

                <div className="rounded-xl bg-red-950/30 p-3 border border-red-800/30">
                  <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">
                    Actual
                  </p>
                  <p className="text-sm text-red-300">
                    {failingTest.then_actual || 'No actual value provided'}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-atelier-surface p-4 border border-border-subtle text-center">
                <p className="text-sm text-atelier-text-muted">
                  Waiting for test details...
                </p>
                <p className="text-xs text-atelier-text-muted mt-1">
                  The Bug Detective will share the failing test info here.
                </p>
              </div>
            )}
          </div>

          {/* Right: Diagnosis notes */}
          <div className="space-y-3">
            <div className="rounded-xl bg-atelier-surface p-3 border border-border-subtle">
              <p className="text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2">
                Diagnosis Notes
              </p>
              {diagnosisNotes.length > 0 ? (
                <ul className="space-y-2">
                  {diagnosisNotes.map((note, i) => (
                    <li key={i} className="flex gap-2 text-sm text-atelier-text">
                      <span className="text-accent-sky shrink-0">*</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-atelier-text-muted">
                  The detective is investigating...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fix Decision area */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <label
          htmlFor="fix-decision"
          className="block text-xs font-semibold text-atelier-text-secondary uppercase tracking-wide mb-2"
        >
          What do you think should change?
        </label>
        <textarea
          id="fix-decision"
          value={fixDecision}
          onChange={(e) => setFixDecision(e.target.value)}
          placeholder="Describe the fix you think will work..."
          className="w-full rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none resize-none"
          rows={3}
          aria-label="Fix decision"
        />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={handleSubmitFix}
            disabled={!fixDecision.trim()}
            className="go-btn px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit Fix
          </button>
        </div>
      </div>
    </div>
  );
}

// Register in the canvas registry
registerCanvas('bug-detective', BugDetectiveCanvas);

export default BugDetectiveCanvas;
