import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LevelBadge from './LevelBadge';

describe('LevelBadge', () => {
  it('renders Explorer level', () => {
    render(<LevelBadge level="explorer" />);
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'System level: Explorer',
    );
  });

  it('renders Builder level', () => {
    render(<LevelBadge level="builder" />);
    expect(screen.getByText('Builder')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'System level: Builder',
    );
  });

  it('renders Architect level', () => {
    render(<LevelBadge level="architect" />);
    expect(screen.getByText('Architect')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'System level: Architect',
    );
  });

  it('shows description in title tooltip for Explorer', () => {
    render(<LevelBadge level="explorer" />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('title')).toContain('automatic');
    expect(badge.getAttribute('title')).toContain('explained');
  });

  it('shows description in title tooltip for Builder', () => {
    render(<LevelBadge level="builder" />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('title')).toContain('control');
  });

  it('shows description in title tooltip for Architect', () => {
    render(<LevelBadge level="architect" />);
    const badge = screen.getByRole('status');
    expect(badge.getAttribute('title')).toContain('Design');
  });

  it('uses different styling classes for each level', () => {
    const { rerender } = render(<LevelBadge level="explorer" />);
    const explorerBadge = screen.getByRole('status');
    expect(explorerBadge.className).toContain('blue');

    rerender(<LevelBadge level="builder" />);
    const builderBadge = screen.getByRole('status');
    expect(builderBadge.className).toContain('amber');

    rerender(<LevelBadge level="architect" />);
    const architectBadge = screen.getByRole('status');
    expect(architectBadge.className).toContain('purple');
  });
});
