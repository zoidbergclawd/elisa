import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSEvent } from '../types';
import { authFetch, getAuthToken } from '../lib/apiClient';

interface MeetingSnapshot {
  id: string;
  meetingTypeId: string;
  status: 'invited' | 'active' | 'completed' | 'declined';
  agentName: string;
  title: string;
  description: string;
  canvas: { type: string; data: Record<string, unknown> };
  messages: Array<{ role: 'agent' | 'kid'; content: string }>;
  outcomes: Array<{ type: string; data: Record<string, unknown> }>;
}

interface UseWebSocketOptions {
  sessionId: string | null;
  onEvent: (event: WSEvent) => void;
}

export const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export function useWebSocket({ sessionId, onEvent }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const connectRef = useRef<() => void>();
  const [connected, setConnected] = useState(false);
  // Holds resolve callbacks for waitForOpen callers
  const openResolversRef = useRef<Array<() => void>>([]);
  // Track whether this is a reconnection (not the first connect)
  const hasConnectedRef = useRef(false);

  useEffect(() => { onEventRef.current = onEvent; });

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getAuthToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${protocol}//${window.location.host}/ws/session/${sessionId}${tokenParam}`;
    const ws = new WebSocket(url);
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      const isReconnect = hasConnectedRef.current;
      retriesRef.current = 0;
      hasConnectedRef.current = true;
      setConnected(true);
      // Resolve any pending waitForOpen promises
      for (const resolve of openResolversRef.current) resolve();
      openResolversRef.current = [];
      onEventRef.current({ type: 'session_started', session_id: sessionId });

      // Start periodic keepalive ping to prevent idle proxy timeouts
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 30_000);

      // On reconnect, fetch current session state to resync
      if (isReconnect) {
        authFetch(`/api/sessions/${sessionId}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (!data) return;
            if (data.tasks && data.agents) {
              onEventRef.current({
                type: 'plan_ready',
                tasks: data.tasks,
                agents: data.agents,
                explanation: 'Reconnected — state restored',
                deployment_target: data.deployment_target,
                deploy_steps: data.deploy_steps,
              });
            }
            // Replay test results if test phase already completed
            if (data.testPhaseComplete && data.individualTestResults) {
              for (const test of data.individualTestResults) {
                onEventRef.current({
                  type: 'test_result',
                  test_name: test.test_name,
                  passed: test.passed,
                  details: test.details,
                });
              }
              const results = data.individualTestResults;
              const passed = results.filter((t: { passed: boolean }) => t.passed).length;
              onEventRef.current({
                type: 'test_phase_complete',
                passed,
                failed: results.length - passed,
                total: results.length,
              });
            }
            // If session already done, emit synthetic session_complete
            if (data.state === 'done') {
              onEventRef.current({
                type: 'session_complete',
                summary: 'Reconnected -- build already complete',
              });
            }
          })
          .catch(() => {
            // Silently ignore fetch errors during reconnect sync
          });

        // Fetch meeting state in parallel with session state
        authFetch(`/api/sessions/${sessionId}/meetings`)
          .then(res => res.ok ? res.json() : null)
          .then((meetings: MeetingSnapshot[] | null) => {
            if (!meetings || meetings.length === 0) return;

            // 1. Emit meeting_ended for completed/declined meetings (clears stale active state)
            for (const m of meetings) {
              if (m.status === 'completed' || m.status === 'declined') {
                onEventRef.current({
                  type: 'meeting_ended',
                  meetingId: m.id,
                  outcomes: m.outcomes,
                });
              }
            }

            // 2. Emit meeting_invite for invited meetings (restores invite queue)
            for (const m of meetings) {
              if (m.status === 'invited') {
                onEventRef.current({
                  type: 'meeting_invite',
                  meetingId: m.id,
                  meetingTypeId: m.meetingTypeId,
                  agentName: m.agentName,
                  title: m.title,
                  description: m.description,
                });
              }
            }

            // 3. Emit full sequence for active meetings (restores active meeting)
            for (const m of meetings) {
              if (m.status === 'active') {
                onEventRef.current({
                  type: 'meeting_started',
                  meetingId: m.id,
                  meetingTypeId: m.meetingTypeId,
                  agentName: m.agentName,
                  canvasType: m.canvas.type,
                });
                for (const msg of m.messages) {
                  onEventRef.current({
                    type: 'meeting_message',
                    meetingId: m.id,
                    role: msg.role,
                    content: msg.content,
                  });
                }
                if (m.canvas.data && Object.keys(m.canvas.data).length > 0) {
                  onEventRef.current({
                    type: 'meeting_canvas_update',
                    meetingId: m.id,
                    canvasType: m.canvas.type,
                    data: m.canvas.data,
                  });
                }
                for (const outcome of m.outcomes) {
                  onEventRef.current({
                    type: 'meeting_outcome',
                    meetingId: m.id,
                    outcomeType: outcome.type,
                    data: outcome.data,
                  });
                }
              }
            }
          })
          .catch(() => {
            // Silently ignore meeting fetch errors during reconnect
          });
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        onEventRef.current(data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      // Error details are intentionally hidden by browsers; onclose handles reconnect
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      wsRef.current = null;
      setConnected(false);
      if (retriesRef.current >= MAX_RETRIES) {
        console.warn(`WebSocket: gave up after ${MAX_RETRIES} retries for session ${sessionId}`);
        onEventRef.current({
          type: 'error',
          message: 'WebSocket connection failed after max retries',
          recoverable: false,
        });
        return;
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** retriesRef.current, MAX_DELAY_MS);
      retriesRef.current++;
      reconnectTimer.current = setTimeout(() => connectRef.current?.(), delay);
    };

    wsRef.current = ws;
  }, [sessionId]);

  useEffect(() => { connectRef.current = connect; });

  useEffect(() => {
    retriesRef.current = 0;
    hasConnectedRef.current = false;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
      setConnected(false);
    };
  }, [connect]);

  /** Returns a promise that resolves once the WebSocket is open. */
  const waitForOpen = useCallback((): Promise<void> => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve) => {
      openResolversRef.current.push(resolve);
    });
  }, []);

  return { connected, waitForOpen };
}
