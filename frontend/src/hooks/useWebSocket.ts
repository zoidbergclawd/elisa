import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSEvent } from '../types';
import { authFetch, getAuthToken } from '../lib/apiClient';

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

    ws.onopen = () => {
      const isReconnect = hasConnectedRef.current;
      retriesRef.current = 0;
      hasConnectedRef.current = true;
      setConnected(true);
      // Resolve any pending waitForOpen promises
      for (const resolve of openResolversRef.current) resolve();
      openResolversRef.current = [];
      onEventRef.current({ type: 'session_started', session_id: sessionId });

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
          })
          .catch(() => {
            // Silently ignore fetch errors during reconnect sync
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
