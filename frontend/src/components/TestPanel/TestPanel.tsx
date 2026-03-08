import { useCallback } from 'react';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import TestList from './TestList';
import AddTestForm from './AddTestForm';

export default function TestPanel() {
  const { testResults } = useBuildSessionContext();

  const passedCount = testResults.filter(r => r.status === 'passed').length;
  const failedCount = testResults.filter(r => r.status === 'failed').length;
  const pendingCount = testResults.filter(r => r.status === 'pending').length;
  const totalCount = testResults.length;

  const handleAddTest = useCallback((when: string, then: string) => {
    // TODO: Wire to workspace blockCanvasRef to add a behavioral_test block
    console.log('Add behavioral test:', { when, then });
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Summary stats bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-medium text-atelier-text mr-2">Tests</h2>
        {totalCount > 0 ? (
          <>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-mint/20 text-accent-mint">
              {passedCount} passing
            </span>
            {failedCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-coral/20 text-accent-coral">
                {failedCount} failing
              </span>
            )}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-400/20 text-gray-400">
                {pendingCount} pending
              </span>
            )}
            <span className="text-[10px] text-atelier-text-muted">
              {totalCount} total
            </span>
          </>
        ) : (
          <span className="text-[10px] text-atelier-text-muted">No results</span>
        )}
      </div>

      {/* Test list */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        <TestList testResults={testResults} />
      </div>

      {/* Add test form */}
      <div className="border-t border-border-subtle pt-2">
        <AddTestForm onAddTest={handleAddTest} />
      </div>
    </div>
  );
}
