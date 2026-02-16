import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NarratorFeed from './NarratorFeed';
import type { NarratorMessage, WSEvent } from '../../types';

vi.mock('../shared/MinionAvatar', () => ({
  default: vi.fn(({ name }: { name: string }) => <div data-testid="minion-avatar">{name}</div>),
}));

vi.mock('./CommsFeed', () => ({
  default: vi.fn(() => <div data-testid="comms-feed">CommsFeed</div>),
}));

describe('NarratorFeed', () => {
  const emptyProps = {
    narratorMessages: [] as NarratorMessage[],
    events: [] as WSEvent[],
  };

  it('renders header with title', () => {
    render(<NarratorFeed {...emptyProps} />);
    expect(screen.getByText('Narrator')).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    render(<NarratorFeed {...emptyProps} />);
    expect(screen.getByText(/Elisa will narrate/)).toBeInTheDocument();
  });

  it('renders narrator messages', () => {
    const messages: NarratorMessage[] = [
      { from: 'Elisa', text: 'Let the adventure begin!', mood: 'excited', timestamp: Date.now() },
      { from: 'Elisa', text: 'Great progress!', mood: 'encouraging', timestamp: Date.now() },
    ];
    render(<NarratorFeed narratorMessages={messages} events={[]} />);
    expect(screen.getByText('Let the adventure begin!')).toBeInTheDocument();
    expect(screen.getByText('Great progress!')).toBeInTheDocument();
  });

  it('shows mood-specific styling for messages', () => {
    const messages: NarratorMessage[] = [
      { from: 'Elisa', text: 'Exciting news!', mood: 'excited', timestamp: Date.now() },
    ];
    render(<NarratorFeed narratorMessages={messages} events={[]} />);
    const messageEl = screen.getByText('Exciting news!').closest('[class*="border"]');
    expect(messageEl?.className).toContain('bg-accent-sky/10');
  });

  it('renders Story Mode and Raw Output toggle buttons', () => {
    render(<NarratorFeed {...emptyProps} />);
    expect(screen.getByText('Story Mode')).toBeInTheDocument();
    expect(screen.getByText('Raw Output')).toBeInTheDocument();
  });

  it('switches to raw output mode', () => {
    render(<NarratorFeed {...emptyProps} />);
    fireEvent.click(screen.getByText('Raw Output'));
    expect(screen.getByTestId('comms-feed')).toBeInTheDocument();
  });

  it('shows Technical Details toggle button', () => {
    render(<NarratorFeed {...emptyProps} />);
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
  });

  it('expands technical details on click', () => {
    render(<NarratorFeed {...emptyProps} />);
    fireEvent.click(screen.getByText('Technical Details'));
    // CommsFeed should appear in the technical details section
    expect(screen.getByTestId('comms-feed')).toBeInTheDocument();
  });

  it('renders MinionAvatar for each message', () => {
    const messages: NarratorMessage[] = [
      { from: 'Elisa', text: 'Hello!', mood: 'encouraging', timestamp: Date.now() },
    ];
    render(<NarratorFeed narratorMessages={messages} events={[]} />);
    expect(screen.getByTestId('minion-avatar')).toBeInTheDocument();
  });
});
