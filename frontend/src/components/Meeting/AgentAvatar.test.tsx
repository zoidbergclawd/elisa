import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentAvatar from './AgentAvatar';

describe('AgentAvatar', () => {
  it('renders SVG avatar for known agent (Pixel)', () => {
    render(<AgentAvatar agentName="Pixel" />);
    const svg = screen.getByRole('img', { name: 'Pixel avatar' });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName).toBe('svg');
  });

  it('renders SVG avatar for known agent (Blueprint)', () => {
    render(<AgentAvatar agentName="Blueprint" />);
    expect(screen.getByRole('img', { name: 'Blueprint avatar' })).toBeInTheDocument();
  });

  it('renders SVG avatar for known agent (Bug Detective)', () => {
    render(<AgentAvatar agentName="Bug Detective" />);
    expect(screen.getByRole('img', { name: 'Bug Detective avatar' })).toBeInTheDocument();
  });

  it('renders fallback letter circle for unknown agent', () => {
    render(<AgentAvatar agentName="Unknown" />);
    expect(screen.getByText('U')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('is case-insensitive for agent name matching', () => {
    render(<AgentAvatar agentName="pixel" />);
    expect(screen.getByRole('img', { name: 'pixel avatar' })).toBeInTheDocument();
  });

  it('applies custom size', () => {
    render(<AgentAvatar agentName="Scribe" size={24} />);
    const svg = screen.getByRole('img', { name: 'Scribe avatar' });
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
  });

  it('applies default size of 40', () => {
    render(<AgentAvatar agentName="Canvas" />);
    const svg = screen.getByRole('img', { name: 'Canvas avatar' });
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.getAttribute('height')).toBe('40');
  });

  it('renders all known agents without errors', () => {
    const agents = ['Pixel', 'Canvas', 'Scribe', 'Styler', 'Blueprint', 'Interface Designer', 'Bug Detective'];
    for (const agent of agents) {
      const { unmount } = render(<AgentAvatar agentName={agent} />);
      expect(screen.getByRole('img', { name: `${agent} avatar` })).toBeInTheDocument();
      unmount();
    }
  });

  it('renders correct color for agent circle', () => {
    render(<AgentAvatar agentName="Pixel" />);
    const svg = screen.getByRole('img', { name: 'Pixel avatar' });
    const circle = svg.querySelector('circle');
    expect(circle?.getAttribute('fill')).toBe('#8B5CF6');
  });
});
