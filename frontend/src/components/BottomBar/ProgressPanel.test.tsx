import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressPanel from './ProgressPanel';
import type { Task } from '../../types';

describe('ProgressPanel', () => {
  it('shows idle message in design mode', () => {
    render(<ProgressPanel uiState="design" tasks={[]} deployProgress={null} deployChecklist={null} />);
    expect(screen.getByText('Progress will appear during a build')).toBeInTheDocument();
  });

  it('shows planning text during build with no tasks', () => {
    render(<ProgressPanel uiState="building" tasks={[]} deployProgress={null} deployChecklist={null} />);
    expect(screen.getByText('Planning...')).toBeInTheDocument();
  });

  it('shows building progress with task counts', () => {
    const tasks: Task[] = [
      { id: '1', name: 'Build UI', description: '', status: 'done', agent_name: 'Builder', dependencies: [] },
      { id: '2', name: 'Write tests', description: '', status: 'in_progress', agent_name: 'Tester', dependencies: [] },
    ];
    render(<ProgressPanel uiState="building" tasks={tasks} deployProgress={null} deployChecklist={null} />);
    expect(screen.getByText(/Building \(1\/2\)/)).toBeInTheDocument();
  });

  it('shows deploy progress step text', () => {
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Flashing to board...', progress: 60 }}
        deployChecklist={null}
      />,
    );
    expect(screen.getByText('Flashing to board...')).toBeInTheDocument();
  });

  it('shows done state', () => {
    render(<ProgressPanel uiState="done" tasks={[]} deployProgress={null} deployChecklist={null} />);
    expect(screen.getByText('Done!')).toBeInTheDocument();
  });

  // --- Deploy checklist ---
  it('renders deploy checklist when provided', () => {
    const checklist = [
      { name: 'Must compile', prompt: 'Code must compile cleanly' },
      { name: 'Tests pass', prompt: 'All tests must pass' },
    ];
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Flashing...', progress: 50 }}
        deployChecklist={checklist}
      />,
    );
    expect(screen.getByText('Deploy checklist:')).toBeInTheDocument();
    expect(screen.getByText('Must compile')).toBeInTheDocument();
    expect(screen.getByText('Tests pass')).toBeInTheDocument();
  });

  it('does not render deploy checklist when null', () => {
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Flashing...', progress: 50 }}
        deployChecklist={null}
      />,
    );
    expect(screen.queryByText('Deploy checklist:')).not.toBeInTheDocument();
  });

  it('does not render deploy checklist when empty array', () => {
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Flashing...', progress: 50 }}
        deployChecklist={[]}
      />,
    );
    expect(screen.queryByText('Deploy checklist:')).not.toBeInTheDocument();
  });

  it('renders rule prompt text alongside rule name', () => {
    const checklist = [
      { name: 'Compile check', prompt: 'No errors or warnings allowed' },
    ];
    render(
      <ProgressPanel
        uiState="building"
        tasks={[]}
        deployProgress={{ step: 'Deploying...', progress: 30 }}
        deployChecklist={checklist}
      />,
    );
    expect(screen.getByText('Compile check')).toBeInTheDocument();
    expect(screen.getByText(/No errors or warnings allowed/)).toBeInTheDocument();
  });
});
