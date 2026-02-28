import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MeetingInviteCard from './MeetingInviteCard';
import type { MeetingInvite } from './MeetingInviteToast';

const mockInvite: MeetingInvite = {
  meetingId: 'meeting-1',
  meetingTypeId: 'doc-agent',
  agentName: 'Doc',
  title: 'Documentation Review',
  description: 'Let me help you write great docs!',
};

describe('MeetingInviteCard', () => {
  it('renders agent name, title, and description', () => {
    render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByText('Doc')).toBeInTheDocument();
    expect(screen.getByText('Documentation Review')).toBeInTheDocument();
    expect(screen.getByText('Let me help you write great docs!')).toBeInTheDocument();
  });

  it('shows agent initial in avatar circle', () => {
    render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('calls onAccept with meetingId when Join Meeting is clicked', () => {
    const onAccept = vi.fn();
    render(
      <MeetingInviteCard invite={mockInvite} onAccept={onAccept} onDecline={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Join Meeting'));
    expect(onAccept).toHaveBeenCalledWith('meeting-1');
  });

  it('calls onDecline with meetingId when Maybe Later is clicked', () => {
    const onDecline = vi.fn();
    render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={onDecline} />,
    );
    fireEvent.click(screen.getByText('Maybe Later'));
    expect(onDecline).toHaveBeenCalledWith('meeting-1');
  });

  it('has correct ARIA role with agent name', () => {
    render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    expect(screen.getByRole('region', { name: 'Meeting invite from Doc' })).toBeInTheDocument();
  });

  it('is not fixed/absolute positioned (flow layout)', () => {
    const { container } = render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toContain('fixed');
    expect(card.className).not.toContain('absolute');
  });

  it('renders with glass-panel styling', () => {
    const { container } = render(
      <MeetingInviteCard invite={mockInvite} onAccept={vi.fn()} onDecline={vi.fn()} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('glass-panel');
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('border-l-accent-sky');
  });
});
