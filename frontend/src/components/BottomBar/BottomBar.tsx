import { useState } from 'react';
import type { Commit } from '../../types';
import GitTimeline from './GitTimeline';

const TABS = ['Timeline', 'Tests', 'Board', 'Learn'] as const;

interface Props {
  commits: Commit[];
}

export default function BottomBar({ commits }: Props) {
  const [activeTab, setActiveTab] = useState<string>('Timeline');

  return (
    <div className="border-t border-gray-200 bg-white">
      <div className="flex items-center gap-1 px-4 py-1 bg-gray-100 border-b border-gray-200">
        {TABS.map((tab) => {
          const isTimeline = tab === 'Timeline';
          return (
            <button
              key={tab}
              disabled={!isTimeline}
              onClick={() => isTimeline && setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded ${
                activeTab === tab && isTimeline
                  ? 'bg-white text-gray-900 shadow-sm'
                  : isTimeline
                    ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>
      <div className="h-32 overflow-hidden">
        {activeTab === 'Timeline' && <GitTimeline commits={commits} />}
      </div>
    </div>
  );
}
