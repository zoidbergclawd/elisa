import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReadinessBadge from './ReadinessBadge';
import type { HealthStatus } from '../../hooks/useHealthCheck';

const readyHealth: HealthStatus = {
  status: 'ready',
  apiKey: 'valid',
  agentSdk: 'available',
};

const offlineHealth: HealthStatus = {
  status: 'offline',
  apiKey: 'unchecked',
  agentSdk: 'not_found',
};

const degradedMissingKey: HealthStatus = {
  status: 'degraded',
  apiKey: 'missing',
  agentSdk: 'available',
};

const degradedInvalidKey: HealthStatus = {
  status: 'degraded',
  apiKey: 'invalid',
  agentSdk: 'available',
};

const degradedSdkMissing: HealthStatus = {
  status: 'degraded',
  apiKey: 'valid',
  agentSdk: 'not_found',
};

describe('ReadinessBadge', () => {
  describe('loading state', () => {
    it('shows "Checking..." when loading', () => {
      render(<ReadinessBadge health={readyHealth} loading={true} />);
      expect(screen.getByText('Checking...')).toBeInTheDocument();
    });

    it('does not show Ready/Offline when loading', () => {
      render(<ReadinessBadge health={readyHealth} loading={true} />);
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    });
  });

  describe('ready state', () => {
    it('shows "Ready" text', () => {
      render(<ReadinessBadge health={readyHealth} loading={false} />);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('has mint/green styling', () => {
      const { container } = render(<ReadinessBadge health={readyHealth} loading={false} />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-accent-mint');
    });

    it('has friendly title text', () => {
      render(<ReadinessBadge health={readyHealth} loading={false} />);
      expect(screen.getByTitle('Ready to build!')).toBeInTheDocument();
    });
  });

  describe('offline state', () => {
    it('shows "Offline" text', () => {
      render(<ReadinessBadge health={offlineHealth} loading={false} />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('has coral/red styling', () => {
      const { container } = render(<ReadinessBadge health={offlineHealth} loading={false} />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-accent-coral');
    });

    it('has friendly title about backend', () => {
      render(<ReadinessBadge health={offlineHealth} loading={false} />);
      expect(screen.getByTitle(/can't find the backend/i)).toBeInTheDocument();
    });
  });

  describe('degraded state - missing API key', () => {
    it('shows "Needs API Key"', () => {
      render(<ReadinessBadge health={degradedMissingKey} loading={false} />);
      expect(screen.getByText('Needs API Key')).toBeInTheDocument();
    });

    it('has gold/yellow styling', () => {
      const { container } = render(<ReadinessBadge health={degradedMissingKey} loading={false} />);
      const badge = container.firstChild as HTMLElement;
      expect(badge.className).toContain('bg-accent-gold');
    });

    it('has friendly title about missing key', () => {
      render(<ReadinessBadge health={degradedMissingKey} loading={false} />);
      expect(screen.getByTitle(/No API key found/)).toBeInTheDocument();
    });
  });

  describe('degraded state - invalid API key', () => {
    it('shows "Needs API Key"', () => {
      render(<ReadinessBadge health={degradedInvalidKey} loading={false} />);
      expect(screen.getByText('Needs API Key')).toBeInTheDocument();
    });

    it('has friendly title about invalid key', () => {
      render(<ReadinessBadge health={degradedInvalidKey} loading={false} />);
      expect(screen.getByTitle(/didn't work/)).toBeInTheDocument();
    });
  });

  describe('degraded state - SDK not found', () => {
    it('shows "Not Ready"', () => {
      render(<ReadinessBadge health={degradedSdkMissing} loading={false} />);
      expect(screen.getByText('Not Ready')).toBeInTheDocument();
    });

    it('has friendly title about SDK', () => {
      render(<ReadinessBadge health={degradedSdkMissing} loading={false} />);
      expect(screen.getByTitle(/Agent SDK not installed/)).toBeInTheDocument();
    });
  });
});
