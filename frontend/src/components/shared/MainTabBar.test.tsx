import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MainTabBar from './MainTabBar';
import type { Task, Agent } from '../../types';

const defaultProps = {
  activeTab: 'workspace' as const,
  onTabChange: vi.fn(),
  tasks: [] as Task[],
  agents: [] as Agent[],
};

describe('MainTabBar', () => {
  it('renders all main tabs', () => {
    render(<MainTabBar {...defaultProps} />);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Mission Control')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Tests')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(<MainTabBar {...defaultProps} activeTab="mission" />);
    const missionTab = screen.getByText('Mission Control');
    expect(missionTab.className).toContain('bg-accent-lavender');
  });

  it('calls onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<MainTabBar {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Mission Control'));
    expect(onTabChange).toHaveBeenCalledWith('mission');
  });

  it('calls onTabChange with system when System tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<MainTabBar {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('System'));
    expect(onTabChange).toHaveBeenCalledWith('system');
  });

  it('highlights System tab when active', () => {
    render(<MainTabBar {...defaultProps} activeTab="system" />);
    const systemTab = screen.getByText('System');
    expect(systemTab.className).toContain('bg-accent-lavender');
  });

  it('shows combined badge count for working agents and in-progress tasks', () => {
    const agents: Agent[] = [
      { name: 'Builder', role: 'builder', persona: '', status: 'working' },
      { name: 'Tester', role: 'tester', persona: '', status: 'idle' },
    ];
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'in_progress', agent_name: 'Builder', dependencies: [] },
      { id: '2', name: 'Write tests', description: '', status: 'pending', agent_name: 'Tester', dependencies: [] },
    ];
    render(<MainTabBar {...defaultProps} agents={agents} tasks={tasks} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show badges when no active work', () => {
    render(<MainTabBar {...defaultProps} />);
    const badges = document.querySelectorAll('.rounded-full.bg-accent-sky');
    expect(badges).toHaveLength(0);
  });

  it('muted styling for inactive tabs in design mode', () => {
    render(<MainTabBar {...defaultProps} activeTab="workspace" />);
    const missionTab = screen.getByText('Mission Control');
    expect(missionTab.className).toContain('text-atelier-text-muted');
  });

  it('shows failing test count badge on Tests tab', () => {
    render(<MainTabBar {...defaultProps} failingTestCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows pending invite count badge on Team tab', () => {
    render(<MainTabBar {...defaultProps} pendingInviteCount={2} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show badges when counts are zero', () => {
    render(<MainTabBar {...defaultProps} failingTestCount={0} pendingInviteCount={0} />);
    // No badge elements should appear for zero counts
    const badges = document.querySelectorAll('.rounded-full');
    expect(badges).toHaveLength(0);
  });
});
