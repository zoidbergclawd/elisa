import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useHealthCheck } from './useHealthCheck';

describe('useHealthCheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns ready when endpoint reports ready', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        status: 'ready',
        apiKey: 'valid',
        agentSdk: 'available',
      }),
    }));

    const { result } = renderHook(() => useHealthCheck(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.health.status).toBe('ready');
    expect(result.current.health.apiKey).toBe('valid');
    expect(result.current.health.agentSdk).toBe('available');
  });

  it('returns offline when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { result } = renderHook(() => useHealthCheck(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.health.status).toBe('offline');
  });

  it('returns degraded when apiKey is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        status: 'degraded',
        apiKey: 'missing',
        agentSdk: 'available',
      }),
    }));

    const { result } = renderHook(() => useHealthCheck(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.health.status).toBe('degraded');
    expect(result.current.health.apiKey).toBe('missing');
  });

  it('starts with loading true and transitions to false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        status: 'ready',
        apiKey: 'valid',
        agentSdk: 'available',
      }),
    }));

    const { result } = renderHook(() => useHealthCheck(true));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('does not fetch when disabled', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useHealthCheck(false));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls at 30s interval', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        status: 'ready',
        apiKey: 'valid',
        agentSdk: 'available',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useHealthCheck(true));

    // Initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After 30s, second poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After another 30s, third poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('clears interval on unmount', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        status: 'ready',
        apiKey: 'valid',
        agentSdk: 'available',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useHealthCheck(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // No additional calls after unmount
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
