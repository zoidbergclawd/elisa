import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSEvent } from '../types';

interface UseWebSocketOptions {
  sessionId: string | null;
  onEvent: (event: WSEvent) => void;
}

const MAX_RETRIES = 10;
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

  useEffect(() => { onEventRef.current = onEvent; });

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/session/${sessionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      retriesRef.current = 0;
      setConnected(true);
      // Resolve any pending waitForOpen promises
      for (const resolve of openResolversRef.current) resolve();
      openResolversRef.current = [];
      onEventRef.current({ type: 'session_started', session_id: sessionId });
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
