/** Returns a copy of process.env with sensitive keys removed, for use in child processes.
 *
 * When the Electron node.exe shim is active (ELISA_USE_NODE_SHIM=1),
 * injects ELECTRON_RUN_AS_NODE=1 so the shim behaves as Node.js.
 * This env var must NOT be set on the main Electron process (breaks
 * renderer windows), so it's only injected into child process envs here.
 */
export function safeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  if (env.ELISA_USE_NODE_SHIM === '1') {
    env.ELECTRON_RUN_AS_NODE = '1';
  }
  return env;
}
