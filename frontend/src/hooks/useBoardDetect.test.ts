import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardDetect } from './useBoardDetect';

describe('useBoardDetect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns board info when board is detected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        detected: true,
        port: 'COM3',
        board_type: 'esp32-s3',
      }),
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // Flush the initial async fetchBoard call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.boardInfo).toEqual({
      port: 'COM3',
      boardType: 'esp32-s3',
    });
  });

  it('returns null when no board is detected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.boardInfo).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useBoardDetect(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.boardInfo).toBeNull();
  });

  it('starts with loading true', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    expect(result.current.loading).toBe(true);
  });

  it('does not fetch when disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useBoardDetect(false));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls at 5s interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useBoardDetect(true));

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 5s, should poll again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After another 5s, should poll again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears interval on unmount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useBoardDetect(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // No additional calls after unmount
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates board info when detection state changes', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: () => Promise.resolve({ detected: false }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({
          detected: true,
          port: 'COM5',
          board_type: 'esp32',
        }),
      });
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.boardInfo).toBeNull();

    // After poll interval, board is now detected
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.boardInfo).toEqual({
      port: 'COM5',
      boardType: 'esp32',
    });
  });

  it('justConnected is false initially', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.justConnected).toBe(false);
  });

  it('justConnected becomes true when board transitions from undetected to detected', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: () => Promise.resolve({ detected: false }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({
          detected: true,
          port: 'COM3',
          board_type: 'esp32',
        }),
      });
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // First poll: no board
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.justConnected).toBe(false);

    // Second poll: board detected (null -> non-null transition)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.justConnected).toBe(true);
  });

  it('justConnected does NOT fire on first poll if board is already connected (sentinel behavior)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        detected: true,
        port: 'COM3',
        board_type: 'esp32',
      }),
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // First poll returns board -- but prev was undefined (sentinel), not null
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.boardInfo).toEqual({ port: 'COM3', boardType: 'esp32' });
    expect(result.current.justConnected).toBe(false);
  });

  it('acknowledgeConnection resets justConnected to false', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: () => Promise.resolve({ detected: false }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({
          detected: true,
          port: 'COM3',
          board_type: 'esp32',
        }),
      });
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // First poll: no board
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Second poll: board detected
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.justConnected).toBe(true);

    // Acknowledge
    act(() => {
      result.current.acknowledgeConnection();
    });
    expect(result.current.justConnected).toBe(false);
  });

  it('justConnected does NOT fire when board disconnects (non-null -> null)', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        // Polls 1-2: no board, then board detected
        if (callCount === 1) {
          return Promise.resolve({
            json: () => Promise.resolve({ detected: false }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({
            detected: true,
            port: 'COM3',
            board_type: 'esp32',
          }),
        });
      }
      // Poll 3: board disconnected
      return Promise.resolve({
        json: () => Promise.resolve({ detected: false }),
      });
    }));

    const { result } = renderHook(() => useBoardDetect(true));

    // Poll 1: no board
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Poll 2: board connected
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.justConnected).toBe(true);

    // Acknowledge
    act(() => {
      result.current.acknowledgeConnection();
    });
    expect(result.current.justConnected).toBe(false);

    // Poll 3: board disconnected
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.justConnected).toBe(false);
  });

  it('calls the correct endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ detected: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useBoardDetect(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/hardware/detect', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });
});
