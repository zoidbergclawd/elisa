import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectPicker from './ProjectPicker';

const mockAuthFetch = vi.fn();

vi.mock('../../lib/apiClient', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

const mockProjects = [
  {
    projectDir: '/home/user/Elisa/projects/my-game',
    slug: 'my-game',
    sessionId: 'sess-1',
    goal: 'My Cool Game',
    state: 'done',
    savedAt: '2026-03-25T10:00:00Z',
    framework: 'Phaser',
  },
  {
    projectDir: '/home/user/Elisa/projects/todo-app',
    slug: 'todo-app',
    sessionId: 'sess-2',
    goal: 'Todo App',
    state: 'done',
    savedAt: '2026-03-24T09:00:00Z',
  },
];

describe('ProjectPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockProjects) });
  });

  it('renders loading state initially', () => {
    mockAuthFetch.mockReturnValue(new Promise(() => {}));
    render(<ProjectPicker onSelectProject={vi.fn()} />);
    expect(screen.getByTestId('project-picker-loading')).toBeTruthy();
  });

  it('renders empty state when no projects', async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    render(<ProjectPicker onSelectProject={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('project-picker-empty')).toBeTruthy();
    });
    expect(screen.getByText(/No projects yet/)).toBeTruthy();
  });

  it('renders project cards with correct data', async () => {
    render(<ProjectPicker onSelectProject={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('project-picker')).toBeTruthy();
    });
    expect(screen.getByText('My Cool Game')).toBeTruthy();
    expect(screen.getByText('Todo App')).toBeTruthy();
    expect(screen.getByText('Phaser')).toBeTruthy();
  });

  it('fires click handler with correct project path', async () => {
    const onSelect = vi.fn();
    render(<ProjectPicker onSelectProject={onSelect} />);
    await waitFor(() => {
      expect(screen.getByTestId('project-picker')).toBeTruthy();
    });
    const cards = screen.getAllByTestId('project-card');
    fireEvent.click(cards[0]);
    expect(onSelect).toHaveBeenCalledWith('/home/user/Elisa/projects/my-game');
  });

  it('renders error state on fetch failure', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    render(<ProjectPicker onSelectProject={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Could not load projects')).toBeTruthy();
    });
  });
});
