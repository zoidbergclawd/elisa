import { useState } from 'react';
import type { TestResult } from '../../types';

interface Props {
  testResults: TestResult[];
}

export default function TestList({ testResults }: Props) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  if (testResults.length === 0) {
    return (
      <p className="text-sm text-atelier-text-muted px-4 py-6 text-center">
        No tests yet. Tests will appear here during the build.
      </p>
    );
  }

  const toggleExpanded = (testName: string) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(testName)) {
        next.delete(testName);
      } else {
        next.add(testName);
      }
      return next;
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-1 px-4">
      {testResults.map((r) => {
        const isExpanded = expandedTests.has(r.test_name);
        const hasExpandableDetails = !r.passed && r.details && r.details !== 'FAILED';

        return (
          <div key={r.test_name}>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-atelier-surface/50 rounded-lg border border-border-subtle text-left text-xs hover:bg-atelier-surface/80"
              aria-expanded={hasExpandableDetails ? isExpanded : undefined}
              onClick={() => hasExpandableDetails && toggleExpanded(r.test_name)}
            >
              {/* Status icon */}
              {r.passed ? (
                <svg className="w-3.5 h-3.5 text-accent-mint flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-accent-coral flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              )}
              <span className="font-mono text-atelier-text-secondary truncate">{r.test_name}</span>
              {hasExpandableDetails && (
                <span className={`ml-auto transition-transform text-atelier-text-muted ${isExpanded ? 'rotate-90' : ''}`}>&#9656;</span>
              )}
            </button>
            {isExpanded && hasExpandableDetails && (
              <div className="text-[10px] font-mono text-accent-coral/80 bg-red-950/20 border border-red-500/20 rounded-lg px-3 py-1.5 mt-0.5 whitespace-pre-wrap">
                {r.details}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
