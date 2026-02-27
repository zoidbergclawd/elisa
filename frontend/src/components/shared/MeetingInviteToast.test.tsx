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

  it('shows agent initial in avatar', () => {
    render(
      <MeetingInviteToast invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByText('P')).toBeInTheDocument();
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

  it('auto-dismisses after 30 seconds by calling onDecline', () => {
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
});
