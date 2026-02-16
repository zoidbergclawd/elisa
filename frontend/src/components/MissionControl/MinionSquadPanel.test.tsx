import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MinionSquadPanel from './MinionSquadPanel';
import type { Agent } from '../../types';

vi.mock('../shared/MinionAvatar', () => ({
  default: vi.fn(({ name, role, status }: { name: string; role: string; status: string }) => (
    <div data-testid={`avatar-${name}`} data-role={role} data-status={status}>{name}</div>
  )),
}));

describe('MinionSquadPanel', () => {
  it('renders with heading', () => {
    render(<MinionSquadPanel agents={[]} uiState="design" />);
    expect(screen.getByText('Minion Squad')).toBeInTheDocument();
  });

  it('always renders Elisa as narrator', () => {
    render(<MinionSquadPanel agents={[]} uiState="design" />);
    const elisaAvatar = screen.getByTestId('avatar-Elisa');
    expect(elisaAvatar).toBeInTheDocument();
    expect(elisaAvatar.getAttribute('data-role')).toBe('narrator');
  });

  it('shows empty state message when no agents', () => {
    render(<MinionSquadPanel agents={[]} uiState="design" />);
    expect(screen.getByText(/Minions will appear/)).toBeInTheDocument();
  });

  it('renders agent cards', () => {
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: '', status: 'working' },
      { name: 'Tester Bot', role: 'tester', persona: '', status: 'idle' },
    ];
    render(<MinionSquadPanel agents={agents} uiState="building" />);
    expect(screen.getByTestId('avatar-Builder Bot')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-Tester Bot')).toBeInTheDocument();
  });

  it('displays role labels for agents', () => {
    const agents: Agent[] = [
      { name: 'Builder Bot', role: 'builder', persona: '', status: 'working' },
    ];
    render(<MinionSquadPanel agents={agents} uiState="building" />);
    expect(screen.getByText('Builder')).toBeInTheDocument();
  });

  it('sets Elisa status to working during build', () => {
    render(<MinionSquadPanel agents={[]} uiState="building" />);
    const elisa = screen.getByTestId('avatar-Elisa');
    expect(elisa.getAttribute('data-status')).toBe('working');
  });

  it('sets Elisa status to done when build is done', () => {
    render(<MinionSquadPanel agents={[]} uiState="done" />);
    const elisa = screen.getByTestId('avatar-Elisa');
    expect(elisa.getAttribute('data-status')).toBe('done');
  });

  it('sets Elisa status to idle in design mode', () => {
    render(<MinionSquadPanel agents={[]} uiState="design" />);
    const elisa = screen.getByTestId('avatar-Elisa');
    expect(elisa.getAttribute('data-status')).toBe('idle');
  });

  it('sets Elisa status to working during review', () => {
    render(<MinionSquadPanel agents={[]} uiState="review" />);
    const elisa = screen.getByTestId('avatar-Elisa');
    expect(elisa.getAttribute('data-status')).toBe('working');
  });

  it('does not show empty state message when agents exist', () => {
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'idle' },
    ];
    render(<MinionSquadPanel agents={agents} uiState="design" />);
    expect(screen.queryByText(/Minions will appear/)).not.toBeInTheDocument();
  });
});
