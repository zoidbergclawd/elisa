import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TeachingToast from './TeachingToast';
import type { TeachingMoment } from '../../types';

describe('TeachingToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when moment is null', () => {
    const { container } = render(<TeachingToast moment={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders headline and explanation when moment provided', () => {
    const moment: TeachingMoment = {
      concept: 'source_control',
      headline: 'Saving work!',
      explanation: 'Your helpers are saving.',
    };
    render(<TeachingToast moment={moment} onDismiss={() => {}} />);
    expect(screen.getByText('Saving work!')).toBeInTheDocument();
    expect(screen.getByText('Your helpers are saving.')).toBeInTheDocument();
  });

  it('dismiss button calls onDismiss', () => {
    const onDismiss = vi.fn();
    const moment: TeachingMoment = {
      concept: 'testing',
      headline: 'Tests!',
      explanation: 'Testing.',
    };
    render(<TeachingToast moment={moment} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 10 seconds', () => {
    const onDismiss = vi.fn();
    const moment: TeachingMoment = {
      concept: 'testing',
      headline: 'Tests!',
      explanation: 'Testing.',
    };
    render(<TeachingToast moment={moment} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not auto-dismiss before 10 seconds', () => {
    const onDismiss = vi.fn();
    const moment: TeachingMoment = {
      concept: 'testing',
      headline: 'Tests!',
      explanation: 'Testing.',
    };
    render(<TeachingToast moment={moment} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('tell me more button works', () => {
    const moment: TeachingMoment = {
      concept: 'testing',
      headline: 'Tests!',
      explanation: 'Testing.',
      tell_me_more: 'More detail here.',
    };
    render(<TeachingToast moment={moment} onDismiss={() => {}} />);
    expect(screen.queryByText('More detail here.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Tell me more'));
    expect(screen.getByText('More detail here.')).toBeInTheDocument();
  });
});
