import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../lib/apiClient';

export interface BoardInfo {
  port: string;
  boardType: string;
}

const POLL_INTERVAL = 5_000;

export function useBoardDetect(enabled: boolean) {
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [justConnected, setJustConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // undefined = never polled yet (sentinel), null = polled but no board
  const prevBoardInfoRef = useRef<BoardInfo | null | undefined>(undefined);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await authFetch('/api/hardware/detect');
      const data = await res.json();
      if (data.detected) {
        setBoardInfo({ port: data.port, boardType: data.board_type });
      } else {
        setBoardInfo(null);
      }
    } catch {
      setBoardInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Detect null -> non-null transition (board plugged in)
  useEffect(() => {
    // Don't track transitions until first poll completes
    if (loading) return;

    const prev = prevBoardInfoRef.current;
    // Only fire when previous was null (not undefined/sentinel) and current is non-null
    if (prev === null && boardInfo !== null) {
      setJustConnected(true);
    }
    prevBoardInfoRef.current = boardInfo;
  }, [boardInfo, loading]);

  const acknowledgeConnection = useCallback(() => setJustConnected(false), []);

  useEffect(() => {
    if (!enabled) return;

    fetchBoard();
    timerRef.current = setInterval(fetchBoard, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, fetchBoard]);

  return { boardInfo, loading, justConnected, acknowledgeConnection };
}
