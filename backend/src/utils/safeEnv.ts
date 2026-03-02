/** Returns a copy of process.env with sensitive keys removed, for use in child processes. */
export function safeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.OPENAI_API_KEY;
  return env;
}
