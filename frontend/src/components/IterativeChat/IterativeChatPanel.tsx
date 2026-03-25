/** Post-build iterative chat panel. Replaces the done modal with a two-panel layout:
 *  left panel for chat, right panel for preview iframe + test summary. */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBuildSessionContext } from '../../contexts/BuildSessionContext';
import { useMeetingContext } from '../../contexts/MeetingContext';
import { useIterativeChat } from '../../hooks/useIterativeChat';

export interface IterativeChatPanelProps {
  onBuildNew: () => void;
  onKeepWorking: () => void;
}

export default function IterativeChatPanel({ onBuildNew, onKeepWorking }: IterativeChatPanelProps) {
  const {
    testResults, deployUrls, nuggetDir,
    testGatePassed, isFixing, events,
    launchWorkspace, handleEvent,
  } = useBuildSessionContext();

  const {
    inviteQueue, acceptInvite, startDirectMeeting,
  } = useMeetingContext();

  const { messages, isAgentThinking, testSummary, previewRefreshKey, sendMessage } = useIterativeChat();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    // Read from DOM ref to avoid stale closure issues with React state batching
    const value = textareaRef.current?.value ?? '';
    const trimmed = value.trim();
    if (!trimmed || isAgentThinking) return;
    sendMessage(trimmed);
    setInputValue('');
  }, [isAgentThinking, sendMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const passing = testResults.filter(t => t.passed === true).length;
  const total = testResults.length;
  const sessionSummary = events.find(e => e.type === 'session_complete')?.type === 'session_complete'
    ? (events.find(e => e.type === 'session_complete') as { type: 'session_complete'; summary: string }).summary
    : null;

  const hasFailures = testResults.some(t => t.passed === false);
  const firstDeployUrl = Object.values(deployUrls)[0] ?? null;

  return (
    <div data-testid="iterative-chat-panel" className="fixed inset-0 z-40 flex flex-col bg-atelier-bg/95" role="dialog" aria-modal="true" aria-labelledby="chat-panel-title">
      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Chat */}
        <div className="w-96 flex flex-col border-r border-border-subtle glass-panel">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-subtle">
            <h2 id="chat-panel-title" className={`text-lg font-display font-bold ${testGatePassed === false ? 'text-amber-400' : 'gradient-text-warm'}`}>
              {testGatePassed === false ? 'Nugget Needs Work' : 'Chat with Roo'}
            </h2>
            {sessionSummary && (
              <p className="text-xs text-atelier-text-secondary mt-1 line-clamp-2">{sessionSummary}</p>
            )}
            {total > 0 && (
              <p className={`text-xs mt-1 ${testGatePassed === false ? 'text-amber-400' : 'text-green-400'}`}>
                {passing}/{total} tests passing
              </p>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-atelier-text-muted text-sm py-8">
                <p className="mb-2 font-medium">Your nugget is ready!</p>
                <p>Tell me what you'd like to change, fix, or add.</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'kid' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'kid'
                      ? 'bg-accent-sky/20 text-atelier-text'
                      : 'bg-atelier-surface text-atelier-text-secondary'
                  }`}
                >
                  {msg.role === 'agent' && (
                    <p className="text-xs font-semibold text-accent-sky mb-1">Roo</p>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.filesChanged && msg.filesChanged.length > 0 && (
                    <div className="mt-2 text-xs text-atelier-text-muted">
                      <span className="font-medium">Changed:</span>{' '}
                      {msg.filesChanged.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isAgentThinking && (
              <div className="flex justify-start" data-testid="chat-thinking-indicator">
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text-secondary">
                  <p className="text-xs font-semibold text-accent-sky mb-1">Roo</p>
                  <p className="flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse [animation-delay:150ms]" />
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse [animation-delay:300ms]" />
                    <span className="ml-2 text-atelier-text-secondary/60 text-xs">working on it...</span>
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-border-subtle">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                data-testid="chat-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Describe what to change..."
                rows={2}
                disabled={isAgentThinking}
                className="flex-1 rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none resize-none disabled:opacity-50"
                aria-label="Chat message input"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isAgentThinking}
                className="go-btn px-4 py-2 rounded-xl text-sm self-end disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Right panel: Preview + info */}
        <div className="flex-1 flex flex-col">
          {/* Preview iframe */}
          {firstDeployUrl ? (
            <div className="flex-1 relative">
              <iframe
                data-testid="preview-iframe"
                key={previewRefreshKey}
                src={firstDeployUrl}
                className="w-full h-full border-0"
                title="Nugget preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-atelier-text-muted">
              <div className="text-center">
                <p className="text-lg mb-2">No preview available</p>
                <p className="text-sm">Deploy URL not found</p>
              </div>
            </div>
          )}

          {/* Test summary badge */}
          {testSummary && (
            <div data-testid="chat-test-summary" className="px-4 py-2 border-t border-border-subtle flex items-center gap-3 text-sm">
              <span className={`font-medium ${testSummary.failed > 0 ? 'text-red-400' : 'text-green-400'}`}>
                Tests: {testSummary.passed}/{testSummary.total} passing
              </span>
              {testSummary.failed > 0 && (
                <span className="text-red-400/70">{testSummary.failed} failing</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-border-subtle glass-panel px-6 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            {/* Deploy URL links */}
            {Object.entries(deployUrls).map(([target, url]) => (
              <a
                key={target}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="go-btn px-4 py-2 rounded-xl text-sm text-center inline-block"
              >
                {Object.keys(deployUrls).length > 1 ? `Open ${target}` : 'Open in Browser'}
              </a>
            ))}
            {nuggetDir && (
              <button
                onClick={() => launchWorkspace(nuggetDir)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-border-subtle text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
              >
                {Object.keys(deployUrls).length > 0 ? 'Relaunch' : 'Launch Preview'}
              </button>
            )}

            {/* Fix It -- shown when tests are failing */}
            {hasFailures && !isFixing && (
              <button
                data-testid="fix-it-button"
                onClick={async () => {
                  try { await startDirectMeeting('debug-convergence'); }
                  catch { handleEvent({ type: 'error', message: 'Session expired. Please build again.', recoverable: false }); }
                }}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-red-500/30 bg-red-950/30 text-red-400 hover:bg-red-950/50 transition-colors"
              >
                Fix It
              </button>
            )}
            {/* Report a Bug -- shown when no failures */}
            {!hasFailures && !isFixing && (
              <button
                data-testid="report-bug-button"
                onClick={async () => {
                  try { await startDirectMeeting('debug-convergence'); }
                  catch { handleEvent({ type: 'error', message: 'Session expired. Please build again.', recoverable: false }); }
                }}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-amber-500/30 bg-amber-950/20 text-amber-400 hover:bg-amber-950/40 transition-colors"
              >
                Report a Bug
              </button>
            )}
            {isFixing && (
              <span className="px-4 py-2 rounded-xl text-sm border border-amber-500/30 bg-amber-950/20 text-amber-400">
                Fix in progress...
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Pending meeting invites */}
            {inviteQueue.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-accent-sky">Team wants to chat:</span>
                {inviteQueue.map(invite => (
                  <button
                    key={invite.meetingId}
                    onClick={() => acceptInvite(invite.meetingId)}
                    className="px-3 py-2 rounded-xl text-sm cursor-pointer border border-accent-sky/30 bg-accent-sky/10 text-accent-sky hover:bg-accent-sky/20 transition-colors"
                  >
                    {invite.agentName}
                  </button>
                ))}
              </div>
            )}

            <button
              data-testid="keep-working-button"
              onClick={onKeepWorking}
              className="px-4 py-2 rounded-xl text-sm cursor-pointer text-atelier-text-muted hover:text-atelier-text-secondary transition-colors"
            >
              Back to Design
            </button>
            <button
              data-testid="build-new-button"
              onClick={onBuildNew}
              className="px-4 py-2 rounded-xl text-sm cursor-pointer border border-border-subtle text-atelier-text-secondary hover:bg-atelier-surface/60 hover:text-atelier-text transition-colors"
            >
              Build Something New
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
