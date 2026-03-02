import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentAvatar from './AgentAvatar';

describe('AgentAvatar', () => {
  it('renders img avatar for known agent with SVG (Pixel)', () => {
    render(<AgentAvatar agentName="Pixel" />);
    const img = screen.getByRole('img', { name: 'Pixel avatar' });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('renders img avatar for Blueprint', () => {
    render(<AgentAvatar agentName="Blueprint" />);
    const img = screen.getByRole('img', { name: 'Blueprint avatar' });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('renders img avatar for Bug Detective', () => {
    render(<AgentAvatar agentName="Bug Detective" />);
    const img = screen.getByRole('img', { name: 'Bug Detective avatar' });
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
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

  it('applies custom size to img', () => {
    render(<AgentAvatar agentName="Scribe" size={24} />);
    const img = screen.getByRole('img', { name: 'Scribe avatar' });
    expect(img.getAttribute('width')).toBe('24');
    expect(img.getAttribute('height')).toBe('24');
  });

  it('applies default size of 40', () => {
    render(<AgentAvatar agentName="Canvas" />);
    const img = screen.getByRole('img', { name: 'Canvas avatar' });
    expect(img.getAttribute('width')).toBe('40');
    expect(img.getAttribute('height')).toBe('40');
  });

  it('renders all agents with SVG files as img elements', () => {
    const svgAgents = ['Pixel', 'Canvas', 'Scribe', 'Styler', 'Blueprint', 'Interface Designer', 'Bug Detective'];
    for (const agent of svgAgents) {
      const { unmount } = render(<AgentAvatar agentName={agent} />);
      const img = screen.getByRole('img', { name: `${agent} avatar` });
      expect(img.tagName).toBe('IMG');
      unmount();
    }
  });

  it('unknown agent falls back to colored letter circle', () => {
    const { container } = render(<AgentAvatar agentName="Mystery" />);
    const div = container.firstElementChild as HTMLElement;
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(div.tagName).toBe('DIV');
  });
});
