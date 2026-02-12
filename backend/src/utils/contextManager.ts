/** Context management -- file manifest, nugget context, state building. */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.elisa', '.git', '__pycache__', 'node_modules']);

export class ContextManager {
  maxTokens: number;
  private usage: Map<string, number> = new Map();

  constructor(maxTokens = 500_000) {
    this.maxTokens = maxTokens;
  }

  track(agentName: string, tokensUsed: number): void {
    this.usage.set(agentName, (this.usage.get(agentName) ?? 0) + tokensUsed);
  }

  getUsage(): Record<string, number> {
    return Object.fromEntries(this.usage);
  }

  checkBudget(currentTokens: number): { withinBudget: boolean; remaining: number } {
    const remaining = this.maxTokens - currentTokens;
    return {
      withinBudget: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  }

  static capSummary(text: string, maxWords = 500): string {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + ' [truncated]';
  }

  static buildFileManifest(workDir: string, maxEntries = 200): string {
    const entries: string[] = [];

    function walk(dir: string): void {
      let items: string[];
      try {
        items = fs.readdirSync(dir).sort();
      } catch {
        return;
      }
      for (const item of items) {
        const full = path.join(dir, item);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(item)) walk(full);
        } else {
          if (entries.length >= maxEntries) return;
          const rel = path.relative(workDir, full).replace(/\\/g, '/');
          let hint = '';
          try {
            const fd = fs.openSync(full, 'r');
            const buf = Buffer.alloc(256);
            const bytesRead = fs.readSync(fd, buf, 0, 256, 0);
            fs.closeSync(fd);
            const firstLine = buf.toString('utf-8', 0, bytesRead).split('\n')[0].trim();
            if (firstLine) hint = `  # ${firstLine.slice(0, 80)}`;
          } catch {
            // skip
          }
          entries.push(`${rel}${hint}`);
        }
      }
    }

    walk(workDir);
    return entries.join('\n');
  }

  static buildNuggetContext(
    taskSummaries: Record<string, string>,
    completedTaskIds: Set<string>,
  ): string {
    const lines = ['# Nugget Context', ''];
    for (const taskId of [...completedTaskIds].sort()) {
      const summary = taskSummaries[taskId];
      if (summary) {
        lines.push(`## ${taskId}`, summary, '');
      }
    }
    return lines.join('\n');
  }

  static buildCurrentState(
    tasks: Record<string, any>[],
    agents: Record<string, any>[],
  ): Record<string, any> {
    const taskEntries: Record<string, any> = {};
    for (const t of tasks) {
      taskEntries[t.id] = {
        name: t.name ?? '',
        status: t.status ?? 'pending',
        agent_name: t.agent_name ?? '',
      };
    }
    const agentEntries: Record<string, any> = {};
    for (const a of agents) {
      agentEntries[a.name] = {
        role: a.role ?? '',
        status: a.status ?? 'idle',
      };
    }
    return { tasks: taskEntries, agents: agentEntries };
  }

  /**
   * Scan recently-modified source files and extract function/class/export signatures.
   * Returns a digest string for injecting into agent context.
   */
  static buildStructuralDigest(workDir: string, maxFiles = 20): string {
    const SOURCE_EXTS = new Set(['.ts', '.js', '.py', '.mjs', '.jsx', '.tsx']);
    const entries: { rel: string; mtime: number; signatures: string[] }[] = [];

    function walk(dir: string): void {
      let items: string[];
      try {
        items = fs.readdirSync(dir).sort();
      } catch {
        return;
      }
      for (const item of items) {
        const full = path.join(dir, item);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(full);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(item)) walk(full);
        } else {
          const ext = path.extname(item).toLowerCase();
          if (!SOURCE_EXTS.has(ext)) continue;
          const rel = path.relative(workDir, full).replace(/\\/g, '/');
          const sigs = ContextManager.extractSignatures(full);
          entries.push({ rel, mtime: stat.mtimeMs, signatures: sigs });
        }
      }
    }

    walk(workDir);
    // Sort by most recently modified
    entries.sort((a, b) => b.mtime - a.mtime);
    const top = entries.slice(0, maxFiles);

    if (top.length === 0) return '';

    const lines = ['## Structural Digest', ''];
    for (const entry of top) {
      lines.push(`### ${entry.rel}`);
      if (entry.signatures.length > 0) {
        for (const sig of entry.signatures.slice(0, 20)) {
          lines.push(`- ${sig}`);
        }
      } else {
        lines.push('- (no exported signatures detected)');
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  /** Extract function/class/export signatures from a source file. */
  static extractSignatures(filePath: string): string[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const ext = path.extname(filePath).toLowerCase();
    const signatures: string[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (ext === '.py') {
        // Python: def/class
        const defMatch = trimmed.match(/^(def|async\s+def)\s+(\w+)\s*\(/);
        if (defMatch) { signatures.push(`${defMatch[1]} ${defMatch[2]}()`); continue; }
        const classMatch = trimmed.match(/^class\s+(\w+)/);
        if (classMatch) { signatures.push(`class ${classMatch[1]}`); continue; }
      } else {
        // JS/TS: export, function, class
        const exportMatch = trimmed.match(/^export\s+(default\s+)?(function|class|const|let|type|interface)\s+(\w+)/);
        if (exportMatch) { signatures.push(`export ${exportMatch[2]} ${exportMatch[3]}`); continue; }
        const fnMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
        if (fnMatch) { signatures.push(`function ${fnMatch[3]}()`); continue; }
        const classMatch = trimmed.match(/^(export\s+)?class\s+(\w+)/);
        if (classMatch) { signatures.push(`class ${classMatch[2]}`); continue; }
      }
    }
    return signatures;
  }

  static getTransitivePredecessors(
    taskId: string,
    taskMap: Record<string, Record<string, any>>,
  ): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const stack = [...(taskMap[taskId]?.dependencies ?? [])];
    while (stack.length > 0) {
      const dep = stack.pop()!;
      if (visited.has(dep)) continue;
      visited.add(dep);
      result.push(dep);
      stack.push(...(taskMap[dep]?.dependencies ?? []));
    }
    return result;
  }
}
