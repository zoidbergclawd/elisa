import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import PlanningIndicator from './PlanningIndicator';

// Mock MinionAvatar to avoid importing SVG assets
vi.mock('../shared/MinionAvatar', () => ({
  default: vi.fn(({ name }: { name: string }) => <div data-testid="minion-avatar">{name}</div>),
}));

describe('PlanningIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the initial planning message', () => {
    render(<PlanningIndicator />);
    expect(screen.getByText('Reading your blocks...')).toBeInTheDocument();
  });

  it('renders the Elisa avatar', () => {
    render(<PlanningIndicator />);
    expect(screen.getByTestId('minion-avatar')).toBeInTheDocument();
    expect(screen.getByText('Elisa')).toBeInTheDocument();
  });

  it('renders three progress dots', () => {
    const { container } = render(<PlanningIndicator />);
    const dots = container.querySelectorAll('.rounded-full.bg-accent-lavender\\/40');
    expect(dots).toHaveLength(3);
  });

  it('cycles to next message after 2500ms', () => {
    render(<PlanningIndicator />);
    expect(screen.getByText('Reading your blocks...')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByText('Thinking up a plan...')).toBeInTheDocument();
  });

  it('cycles through multiple messages', () => {
    render(<PlanningIndicator />);

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Thinking up a plan...')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Choosing the right minions...')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Mapping out the tasks...')).toBeInTheDocument();
  });

  it('wraps around to first message after all messages shown', () => {
    render(<PlanningIndicator />);

    // Advance through all 6 messages (6 * 2500 = 15000ms)
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.getByText('Reading your blocks...')).toBeInTheDocument();
  });

  it('includes animation styles in the document', () => {
    const { container } = render(<PlanningIndicator />);
    const style = container.querySelector('style');
    expect(style).toBeTruthy();
    expect(style!.textContent).toContain('planning-orbit');
    expect(style!.textContent).toContain('planning-pulse');
    expect(style!.textContent).toContain('planning-fade');
  });

  it('includes reduced-motion media query', () => {
    const { container } = render(<PlanningIndicator />);
    const style = container.querySelector('style');
    expect(style!.textContent).toContain('prefers-reduced-motion');
  });

  it('renders orbiting dots', () => {
    const { container } = render(<PlanningIndicator />);
    expect(container.querySelector('.planning-orbit-1')).toBeTruthy();
    expect(container.querySelector('.planning-orbit-2')).toBeTruthy();
    expect(container.querySelector('.planning-orbit-3')).toBeTruthy();
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<PlanningIndicator />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
