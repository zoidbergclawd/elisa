import { vi, describe, it, expect, beforeEach } from 'vitest';

const { writeFileSyncMock } = vi.hoisted(() => ({
  writeFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    default: {
      ...original,
      writeFileSync: writeFileSyncMock,
    },
    writeFileSync: writeFileSyncMock,
  };
});

vi.mock('simple-git', () => {
  const mockGit = {
    init: vi.fn().mockResolvedValue(undefined),
    addConfig: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ commit: 'abc1234567890' }),
    status: vi.fn().mockResolvedValue({ staged: ['file.ts'] }),
    diffSummary: vi.fn().mockResolvedValue({ files: [{ file: 'src/main.ts' }] }),
    checkIsRepo: vi.fn().mockResolvedValue(true),
  };
  return {
    simpleGit: vi.fn(() => mockGit),
    __mockGit: mockGit,
  };
});

import { GitService } from './gitService.js';
import { simpleGit } from 'simple-git';

function getMockGit() {
  return (simpleGit as any).__mockGit ?? (simpleGit as any)();
}

describe('GitService', () => {
  let git: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    git = new GitService();
  });

  describe('initRepo', () => {
    it('initializes git repo and creates .gitignore + README', async () => {
      await git.initRepo('/fake/path', 'My Cool Project');

      const mockGit = getMockGit();
      expect(mockGit.init).toHaveBeenCalled();
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.name', 'Elisa');
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.email', 'elisa@local');

      // Should write .gitignore and README
      const writeArgs = writeFileSyncMock.mock.calls.map((c: any[]) => String(c[0]));
      expect(writeArgs.some((p: string) => p.includes('.gitignore'))).toBe(true);
      expect(writeArgs.some((p: string) => p.includes('README.md'))).toBe(true);

      // README should contain the goal
      const readmeCall = writeFileSyncMock.mock.calls.find(
        (c: any[]) => String(c[0]).includes('README.md'),
      );
      expect(readmeCall?.[1]).toContain('My Cool Project');

      expect(mockGit.add).toHaveBeenCalledWith(['README.md', '.gitignore']);
      expect(mockGit.commit).toHaveBeenCalledWith('Nugget started!');
    });
  });

  describe('commit', () => {
    it('returns CommitInfo on successful commit', async () => {
      const result = await git.commit('/fake/repo', 'test message', 'Builder Bot', 'task-1');
      expect(result.sha).toBe('abc1234567890');
      expect(result.shortSha).toBe('abc1234');
      expect(result.message).toBe('test message');
      expect(result.agentName).toBe('Builder Bot');
      expect(result.taskId).toBe('task-1');
      expect(result.timestamp).toBeTruthy();
      expect(result.filesChanged).toEqual(['src/main.ts']);
    });

    it('returns empty CommitInfo when not a repo (checkIsRepo throws)', async () => {
      const mockGit = getMockGit();
      mockGit.checkIsRepo.mockRejectedValueOnce(new Error('not a repo'));

      const result = await git.commit('/not/a/repo', 'msg', 'Agent', 'task-x');
      expect(result.sha).toBe('');
      expect(result.message).toBe('');
      expect(result.filesChanged).toEqual([]);
    });

    it('returns empty CommitInfo when no files are staged', async () => {
      const mockGit = getMockGit();
      mockGit.status.mockResolvedValueOnce({ staged: [] });

      const result = await git.commit('/fake/repo', 'nothing to commit', 'Agent', 'task-y');
      expect(result.sha).toBe('');
      expect(result.message).toBe('');
    });
  });
});
