/** Manages Git operations for build sessions. */

import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { CommitInfo } from '../models/session.js';

export class GitService {
  async initRepo(repoPath: string, nuggetGoal: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Elisa');
    await git.addConfig('user.email', 'elisa@local');

    // Write .gitignore to prevent staging sensitive/generated files
    const gitignorePath = path.join(repoPath, '.gitignore');
    fs.writeFileSync(gitignorePath, [
      '.elisa/logs/',
      '.elisa/status/',
      '__pycache__/',
      '',
    ].join('\n'), 'utf-8');

    const readmePath = path.join(repoPath, 'README.md');
    fs.writeFileSync(readmePath, `# ${nuggetGoal}\n\nBuilt with Elisa.\n`, 'utf-8');

    await git.add(['README.md', '.gitignore']);
    await git.commit('Nugget started!');
  }

  async commit(
    repoPath: string,
    message: string,
    agentName: string,
    taskId: string,
  ): Promise<CommitInfo> {
    const empty: CommitInfo = {
      sha: '',
      shortSha: '',
      message: '',
      agentName: '',
      taskId: '',
      timestamp: '',
      filesChanged: [],
    };

    const git = simpleGit(repoPath);

    try {
      await git.checkIsRepo();
    } catch {
      return empty;
    }

    await git.add('-A');

    const status = await git.status();
    if (status.staged.length === 0) {
      return empty;
    }

    const result = await git.commit(message);
    const sha = result.commit || '';

    let filesChanged: string[] = [];
    if (sha) {
      try {
        const diff = await git.diffSummary([`${sha}~1`, sha]);
        filesChanged = diff.files.map((f) => f.file);
      } catch {
        // first commit has no parent
      }
    }

    return {
      sha,
      shortSha: sha.slice(0, 7),
      message,
      agentName,
      taskId,
      timestamp: new Date().toISOString(),
      filesChanged,
    };
  }

  /** Returns a summary of uncommitted changes in the workspace (staged + unstaged). */
  async getWorkspaceDiff(repoPath: string): Promise<string> {
    try {
      const git = simpleGit(repoPath);
      await git.checkIsRepo();
      const diff = await git.diff();
      if (!diff) return '';
      // Cap to avoid blowing up the prompt
      const MAX_DIFF_CHARS = 3000;
      if (diff.length > MAX_DIFF_CHARS) {
        return diff.slice(0, MAX_DIFF_CHARS) + '\n[diff truncated]';
      }
      return diff;
    } catch {
      return '';
    }
  }
}
