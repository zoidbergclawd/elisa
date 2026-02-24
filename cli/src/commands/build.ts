export interface BuildOptions {
  spec?: string;
  output?: string;
  workspace?: string;
  stream?: boolean;
  json?: boolean;
  timeout?: string;
  model?: string;
}

export async function runBuild(
  description: string | undefined,
  options: BuildOptions,
): Promise<void> {
  console.error('Build command not yet implemented');
  process.exit(1);
}
