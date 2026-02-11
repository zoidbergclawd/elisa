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

    const readmePath = path.join(repoPath, 'README.md');
    fs.writeFileSync(readmePath, `# ${nuggetGoal}\n\nBuilt with Elisa.\n`, 'utf-8');

    await git.add('README.md');
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
}
