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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!enabled) return;

    fetchBoard();
    timerRef.current = setInterval(fetchBoard, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, fetchBoard]);

  return { boardInfo, loading };
}
