/** Reusable chat panel: message list, auto-scroll, typing indicator, input form. */

import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface ChatMessage {
  role: 'agent' | 'kid';
  content: string;
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  isAgentThinking?: boolean;
  agentName: string;
  onSendMessage: (content: string) => void;
}

export default function ChatPanel({
  messages,
  isAgentThinking = false,
  agentName,
  onSendMessage,
}: ChatPanelProps) {
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

  return (
    <div className="flex flex-col h-full">
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
        {isAgentThinking && (
          <div className="flex justify-start" data-testid="agent-thinking-indicator">
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-atelier-surface text-atelier-text-secondary">
              <p className="text-xs font-semibold text-accent-sky mb-1">{agentName}</p>
              <p className="flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse" />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse [animation-delay:150ms]" />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-sky animate-pulse [animation-delay:300ms]" />
                <span className="ml-2 text-atelier-text-secondary/60 text-xs">thinking...</span>
              </p>
            </div>
          </div>
        )}
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
  );
}
