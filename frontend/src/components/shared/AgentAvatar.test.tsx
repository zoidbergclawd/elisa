import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AgentAvatar from './AgentAvatar';

describe('AgentAvatar', () => {
  it('renders initial letter', () => {
    render(<AgentAvatar name="Sparky" role="builder" status="idle" />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('uses blue for builder role', () => {
    const { container } = render(<AgentAvatar name="Sparky" role="builder" status="idle" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('bg-blue-500');
  });

  it('uses green for tester role', () => {
    const { container } = render(<AgentAvatar name="Testy" role="tester" status="idle" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('bg-green-500');
  });

  it('uses purple for reviewer role', () => {
    const { container } = render(<AgentAvatar name="Review" role="reviewer" status="idle" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('bg-purple-500');
  });

  it('uses orange for custom role', () => {
    const { container } = render(<AgentAvatar name="Custom" role="custom" status="idle" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('bg-orange-500');
  });

  it('applies opacity for idle status', () => {
    const { container } = render(<AgentAvatar name="S" role="builder" status="idle" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('opacity-60');
  });

  it('applies bounce animation for working status', () => {
    const { container } = render(<AgentAvatar name="S" role="builder" status="working" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('animate-bounce');
  });

  it('shows checkmark for done status', () => {
    const { container } = render(<AgentAvatar name="S" role="builder" status="done" />);
    // The checkmark is rendered as &#10003;
    const checkmark = container.querySelector('.bg-green-400');
    expect(checkmark).toBeTruthy();
  });

  it('applies red bg for error status', () => {
    const { container } = render(<AgentAvatar name="S" role="builder" status="error" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('bg-red-500');
  });

  it('supports small size', () => {
    const { container } = render(<AgentAvatar name="S" role="builder" status="idle" size="sm" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('w-6');
  });
});
