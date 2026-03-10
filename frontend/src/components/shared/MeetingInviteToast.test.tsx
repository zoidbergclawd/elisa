import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import MeetingInviteToast from './MeetingInviteToast';
import type { MeetingInvite } from './MeetingInviteToast';

const mockInvite: MeetingInvite = {
  meetingId: 'meeting-1',
  meetingTypeId: 'test-type',
  agentName: 'Pixel',
  title: 'Debug Session',
  description: 'Let me help you find the bug!',
};

describe('MeetingInviteToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when invite is null', () => {
    const { container } = render(
      <MeetingInviteToast invite={null} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders invite with agent name and title', () => {
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByText('Pixel')).toBeInTheDocument();
    expect(screen.getByText('Debug Session')).toBeInTheDocument();
    expect(screen.getByText('Let me help you find the bug!')).toBeInTheDocument();
  });

  it('shows agent avatar', () => {
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole('img', { name: 'Pixel avatar' })).toBeInTheDocument();
  });

  it('calls onAccept with meetingId when Join Meeting is clicked', () => {
    const onAccept = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={onAccept} onDecline={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Join Meeting'));
    expect(onAccept).toHaveBeenCalledWith('meeting-1');
  });

  it('calls onDecline with meetingId when Maybe Later is clicked', () => {
    const onDecline = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} />,
    );

    fireEvent.click(screen.getByText('Maybe Later'));
    expect(onDecline).toHaveBeenCalledWith('meeting-1');
  });

  it('auto-dismisses after 30 seconds by calling onDecline when no onDismissToast', () => {
    const onDecline = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} />,
    );

    expect(onDecline).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onDecline).toHaveBeenCalledWith('meeting-1');
  });

  it('auto-dismisses after 30 seconds by calling onDismissToast when provided', () => {
    const onDecline = vi.fn();
    const onDismissToast = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} onDismissToast={onDismissToast} />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onDismissToast).toHaveBeenCalledWith('meeting-1');
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('does not auto-dismiss before 30 seconds', () => {
    const onDecline = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} />,
    );

    act(() => {
      vi.advanceTimersByTime(29_000);
    });

    expect(onDecline).not.toHaveBeenCalled();
  });

  it('has correct ARIA role', () => {
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('does not auto-dismiss when pauseAutoDismiss is true', () => {
    const onDecline = vi.fn();
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} pauseAutoDismiss />,
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(onDecline).not.toHaveBeenCalled();
  });

  it('renders with z-40 (below modals at z-50) not z-60', () => {
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    const toast = screen.getByRole('alert');
    expect(toast.className).toContain('z-40');
    expect(toast.className).not.toContain('z-[60]');
  });

  it('calls onDismissToast for correct meetingId when invite changes (queue simulation)', () => {
    const onDecline = vi.fn();
    const onDismissToast = vi.fn();
    const secondInvite: MeetingInvite = {
      meetingId: 'meeting-2',
      meetingTypeId: 'another-type',
      agentName: 'Scribe',
      title: 'Doc Review',
      description: 'Let me document this!',
    };

    const { rerender } = render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} onDismissToast={onDismissToast} />,
    );

    // Auto-dismiss first invite
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onDismissToast).toHaveBeenCalledWith('meeting-1');
    expect(onDismissToast).toHaveBeenCalledTimes(1);

    // Parent shows next invite from queue
    rerender(
      <MeetingInviteToast invite={secondInvite} onAccept={vi.fn()} onDecline={onDecline} onDismissToast={onDismissToast} />,
    );

    // Auto-dismiss second invite
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onDismissToast).toHaveBeenCalledWith('meeting-2');
    expect(onDismissToast).toHaveBeenCalledTimes(2);
    // onDecline should never have been called since onDismissToast is provided
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('resumes auto-dismiss when pauseAutoDismiss changes to false', () => {
    const onDecline = vi.fn();
    const { rerender } = render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} pauseAutoDismiss />,
    );

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDecline).not.toHaveBeenCalled();

    rerender(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} pauseAutoDismiss={false} />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onDecline).toHaveBeenCalledWith('meeting-1');
  });
});
