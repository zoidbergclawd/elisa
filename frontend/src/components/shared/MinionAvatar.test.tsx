import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MinionAvatar from './MinionAvatar';

describe('MinionAvatar', () => {
  // -- SVG rendering for known roles --

  it('renders an img for narrator role', () => {
    const { container } = render(<MinionAvatar name="Elisa" role="narrator" status="idle" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.alt).toBe('Elisa');
  });

  it('renders an img for builder role', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.alt).toBe('Sparky');
  });

  it('renders an img for tester role', () => {
    const { container } = render(<MinionAvatar name="Testy" role="tester" status="idle" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
  });

  it('renders an img for reviewer role', () => {
    const { container } = render(<MinionAvatar name="Rev" role="reviewer" status="idle" />);
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
  });

  // -- Fallback initial for custom/unknown roles --

  it('renders initial letter for custom role (no SVG)', () => {
    render(<MinionAvatar name="Helper" role="custom" status="idle" />);
    expect(screen.getByText('H')).toBeInTheDocument();
  });

  it('uppercases the initial letter', () => {
    render(<MinionAvatar name="lower" role="custom" status="idle" />);
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('does not render img for custom role', () => {
    const { container } = render(<MinionAvatar name="Custom" role="custom" status="idle" />);
    expect(container.querySelector('img')).toBeNull();
  });

  // -- Role colors --

  it('applies coral color for custom role', () => {
    const { container } = render(<MinionAvatar name="Custom" role="custom" status="idle" />);
    const div = container.querySelector('div > div');
    expect(div!.className).toContain('bg-accent-coral');
  });

  it('applies coral color override for error status regardless of role', () => {
    const { container } = render(<MinionAvatar name="Custom" role="custom" status="error" />);
    const div = container.querySelector('div > div');
    expect(div!.className).toContain('bg-accent-coral');
  });

  // -- Status classes --

  it('applies minion-idle class for idle status', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('minion-idle');
  });

  it('applies minion-working class for working status', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="working" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('minion-working');
  });

  it('applies minion-error class for error status', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="error" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('minion-error');
  });

  it('applies minion-waiting class for waiting status', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="waiting" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('minion-waiting');
  });

  it('applies ring for done status', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="done" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('ring-2');
  });

  // -- Done checkmark --

  it('shows checkmark badge for done status', () => {
    render(<MinionAvatar name="Sparky" role="builder" status="done" />);
    // The checkmark is ✓ rendered as HTML entity &#10003;
    expect(screen.getByText('\u2713')).toBeInTheDocument();
  });

  it('does not show checkmark for non-done status', () => {
    render(<MinionAvatar name="Sparky" role="builder" status="working" />);
    expect(screen.queryByText('\u2713')).not.toBeInTheDocument();
  });

  // -- Glow classes --

  it('applies glow class when working', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="working" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('glow-sky');
  });

  it('does not apply glow class when idle', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).not.toContain('glow-sky');
  });

  // -- Size variants --

  it('defaults to md size', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('w-8');
    expect(avatarDiv!.className).toContain('h-8');
  });

  it('applies sm size classes', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" size="sm" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('w-6');
    expect(avatarDiv!.className).toContain('h-6');
  });

  it('applies lg size classes', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" size="lg" />);
    const avatarDiv = container.querySelector('div > div');
    expect(avatarDiv!.className).toContain('w-12');
    expect(avatarDiv!.className).toContain('h-12');
  });

  // -- Style tag is present --

  it('renders a style tag with animation keyframes', () => {
    const { container } = render(<MinionAvatar name="Sparky" role="builder" status="idle" />);
    const style = container.querySelector('style');
    expect(style).toBeTruthy();
    expect(style!.textContent).toContain('minion-bounce');
    expect(style!.textContent).toContain('prefers-reduced-motion');
  });
});
