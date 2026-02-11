import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
        claudeCli: 'available',
        claudeCliVersion: '1.0.0',
      }),
    }));

    const { result } = renderHook(() => useHealthCheck(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.health.status).toBe('ready');
    expect(result.current.health.apiKey).toBe('valid');
    expect(result.current.health.claudeCli).toBe('available');
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
        claudeCli: 'available',
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
        claudeCli: 'available',
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
});
