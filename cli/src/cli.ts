#!/usr/bin/env node

import { Command } from 'commander';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('elisa')
    .description('Elisa IDE — AI-powered project builder')
    .version('0.1.0');

  program
    .command('build [description]')
    .description('Build a project from a description or NuggetSpec')
    .option('--spec <path>', 'Path to NuggetSpec JSON file')
    .option('--output <dir>', 'Workspace output directory')
    .option('--workspace <dir>', 'Reuse existing workspace (iterative builds)')
    .option('--stream', 'Stream events to stdout as NDJSON')
    .option('--json', 'Output final result as JSON')
    .option('--timeout <seconds>', 'Max build time in seconds', '600')
    .option('--model <model>', 'Override agent model')
    .action(async (description, options) => {
      const { runBuild } = await import('./commands/build.js');
      await runBuild(description, options);
    });

  program
    .command('status <sessionId>')
    .description('Check build progress')
    .action(async (sessionId: string) => {
      console.error('Not yet implemented');
      process.exit(1);
    });

  program
    .command('stop <sessionId>')
    .description('Cancel a running build')
    .action(async (sessionId: string) => {
      console.error('Not yet implemented');
      process.exit(1);
    });

  return program;
}

const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  createProgram().parse();
}
