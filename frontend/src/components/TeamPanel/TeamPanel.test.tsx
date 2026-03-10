import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TeamMemberList from './TeamMemberList';

describe('TeamMemberList', () => {
  it('renders team member names', () => {
    render(
      <TeamMemberList
        inviteQueue={[]}
        onAcceptInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Scribe')).toBeInTheDocument();
    expect(screen.getByText('Blueprint')).toBeInTheDocument();
    expect(screen.getByText('Bug Detective')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
  });

  it('shows Chat button for pending invites', () => {
    const invite = {
      meetingId: 'inv-1',
      meetingTypeId: 'buddy-agent',
      agentName: 'Buddy',
      title: 'Check-in',
      description: 'Buddy wants to chat',
    };

    render(
      <TeamMemberList
        inviteQueue={[invite]}
        onAcceptInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('does not show Chat button when no pending invites', () => {
    render(
      <TeamMemberList
        inviteQueue={[]}
        onAcceptInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
      />,
    );
    expect(screen.queryByText('Chat')).not.toBeInTheDocument();
  });

  it('calls onAcceptInvite with meetingId when Chat is clicked', () => {
    const onAcceptInvite = vi.fn();
    const invite = {
      meetingId: 'inv-1',
      meetingTypeId: 'buddy-agent',
      agentName: 'Buddy',
      title: 'Check-in',
      description: 'Buddy wants to chat',
    };

    render(
      <TeamMemberList
        inviteQueue={[invite]}
        onAcceptInvite={onAcceptInvite}
        onDeclineInvite={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Chat'));
    expect(onAcceptInvite).toHaveBeenCalledWith('inv-1');
  });

  it('renders custom agents from invite queue that are not in builtin list', () => {
    const customInvite = {
      meetingId: 'inv-custom',
      meetingTypeId: 'custom-session-0',
      agentName: 'Carl Sagan',
      title: 'Astrophysics Expert',
      description: 'Carl Sagan wants to chat',
    };

    render(
      <TeamMemberList
        inviteQueue={[customInvite]}
        onAcceptInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
      />,
    );
    expect(screen.getByText('Carl Sagan')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });
});
