/** Full-screen meeting modal with agent chat panel and canvas area. */

import { useState, useRef, useEffect, useCallback } from 'react';
import { getCanvas } from './canvasRegistry';
import DefaultCanvas from './DefaultCanvas';
import type { CanvasProps } from './canvasRegistry';

// Import canvas modules to trigger their registerCanvas() side-effects
import './BlueprintCanvas';
import './BugDetectiveCanvas';
import './CampaignCanvas';
import './DesignPreviewCanvas';
import './ExplainItCanvas';
import './InterfaceDesignerCanvas';
import './LaunchPadCanvas';
import './ThemePickerCanvas';

export interface MeetingMessage {
  role: 'agent' | 'kid';
  content: string;
}

export interface MeetingModalProps {
  meetingId: string;
  agentName: string;
  canvasType: string;
  canvasState: { type: string; data: Record<string, unknown> };
  messages: MeetingMessage[];
  onSendMessage: (content: string) => void;
  onCanvasUpdate: (data: Record<string, unknown>) => void;
  onEndMeeting: () => void;
  onMaterialize?: (data: Record<string, unknown>) => Promise<{ files: string[]; primaryFile: string } | null>;
}

export default function MeetingModal({
  meetingId,
  agentName,
  canvasType,
  canvasState,
  messages,
  onSendMessage,
  onCanvasUpdate,
  onEndMeeting,
  onMaterialize,
}: MeetingModalProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputValue('');
  }, [inputValue, onSendMessage]);

  // Resolve canvas component
  const CanvasComponent: React.ComponentType<CanvasProps> = getCanvas(canvasType) ?? DefaultCanvas;

  return (
    <div
      className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-modal-title"
    >
      <div className="glass-elevated rounded-2xl shadow-2xl w-[90vw] h-[85vh] max-w-6xl mx-4 flex flex-col animate-float-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent-sky/20 flex items-center justify-center text-accent-sky font-bold text-sm">
              {agentName.charAt(0).toUpperCase()}
            </div>
            <h2 id="meeting-modal-title" className="text-lg font-display font-bold text-atelier-text">
              Meeting with {agentName}
            </h2>
          </div>
          <button
            onClick={onEndMeeting}
            className="px-4 py-1.5 rounded-xl text-sm cursor-pointer border border-red-500/30 text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
          >
            End Meeting
          </button>
        </div>

        {/* Body: chat + canvas */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel: chat */}
          <div className="w-80 flex flex-col border-r border-border-subtle">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                      <p className="text-xs font-semibold text-accent-sky mb-1">{agentName}</p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-border-subtle">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text border border-border-subtle focus:border-accent-sky focus:outline-none"
                  aria-label="Message input"
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="go-btn px-3 py-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </form>
          </div>

          {/* Right panel: canvas */}
          <div className="flex-1 min-w-0 p-4">
            <CanvasComponent
              meetingId={meetingId}
              canvasState={canvasState}
              onCanvasUpdate={onCanvasUpdate}
              onMaterialize={onMaterialize}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
