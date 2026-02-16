import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setAuthToken, getAuthToken, authHeaders, authFetch } from './apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  describe('setAuthToken / getAuthToken', () => {
    it('starts with null token', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('stores and retrieves a token', () => {
      setAuthToken('my-token');
      expect(getAuthToken()).toBe('my-token');
    });

    it('clears token when set to null', () => {
      setAuthToken('my-token');
      setAuthToken(null);
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('authHeaders', () => {
    it('returns Content-Type without Authorization when no token', () => {
      const headers = authHeaders();
      expect(headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('includes Authorization header when token is set', () => {
      setAuthToken('test-token');
      const headers = authHeaders();
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      });
    });
  });

  describe('authFetch', () => {
    it('calls fetch with auth headers', async () => {
      setAuthToken('abc-123');
      const mockResponse = new Response('ok');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const result = await authFetch('/api/test');

      expect(fetchSpy).toHaveBeenCalledWith('/api/test', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer abc-123',
        },
      });
      expect(result).toBe(mockResponse);
    });

    it('merges custom init options', async () => {
      setAuthToken('abc');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));

      await authFetch('/api/test', {
        method: 'POST',
        body: '{"key":"value"}',
      });

      expect(fetchSpy).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        body: '{"key":"value"}',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer abc',
        },
      });
    });

    it('allows custom headers to override auth headers', async () => {
      setAuthToken('abc');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));

      await authFetch('/api/test', {
        headers: { 'Content-Type': 'text/plain' },
      });

      expect(fetchSpy).toHaveBeenCalledWith('/api/test', {
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': 'Bearer abc',
        },
      });
    });

    it('works without auth token', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));

      await authFetch('/api/test');

      expect(fetchSpy).toHaveBeenCalledWith('/api/test', {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });
});
