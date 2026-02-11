import { useState } from 'react';
import type { Commit, TestResult, TeachingMoment } from '../../types';
import type { SerialLine } from '../../hooks/useBuildSession';
import GitTimeline from './GitTimeline';
import TestResults from './TestResults';
import TeachingSidebar from './TeachingSidebar';
import BoardOutput from './BoardOutput';

const TABS = ['Timeline', 'Tests', 'Board', 'Learn'] as const;

interface Props {
  commits: Commit[];
  testResults: TestResult[];
  coveragePct: number | null;
  teachingMoments: TeachingMoment[];
  serialLines: SerialLine[];
}

export default function BottomBar({ commits, testResults, coveragePct, teachingMoments, serialLines }: Props) {
  const [activeTab, setActiveTab] = useState<string>('Timeline');

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="flex items-center gap-1 px-4 py-1 bg-gray-100 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-xs rounded ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="h-32 overflow-hidden">
        {activeTab === 'Timeline' && <GitTimeline commits={commits} />}
        {activeTab === 'Tests' && <TestResults results={testResults} coveragePct={coveragePct} />}
        {activeTab === 'Board' && <BoardOutput serialLines={serialLines} />}
        {activeTab === 'Learn' && <TeachingSidebar moments={teachingMoments} />}
      </div>
    </div>
  );
}
