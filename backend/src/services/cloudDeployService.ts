/** Scaffolds and deploys IoT cloud dashboards to Google Cloud Run. */

import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** GCP APIs required for Cloud Run source deploys. */
const REQUIRED_APIS = [
  'run.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
];

export class CloudDeployService {
  /**
   * Generate a crypto-random 32-character hex string suitable for use
   * as an API key shared between the ESP32 gateway and cloud dashboard.
   */
  generateApiKey(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Enable the GCP APIs required for Cloud Run source deploys.
   * Idempotent -- already-enabled APIs are silently skipped.
   */
  async enableRequiredApis(project: string): Promise<void> {
    const cmd = [
      'gcloud', 'services', 'enable',
      ...REQUIRED_APIS,
      '--project', project,
      '--quiet',
    ].join(' ');

    await execAsync(cmd, { timeout: 120_000 });
  }

  /**
   * Copy scaffold template files into `workDir/iot-dashboard/` and inject
   * the given API key into the Dockerfile as an environment variable.
   *
   * @param scaffoldDir  Source directory containing scaffold templates (server.js, Dockerfile, etc.)
   * @param workDir      Workspace directory where `iot-dashboard/` will be created
   * @param apiKey       The API key to inject
   */
  async scaffoldDashboard(scaffoldDir: string, workDir: string, apiKey: string): Promise<string> {
    const dashboardDir = path.join(workDir, 'iot-dashboard');

    // Create dashboard directory structure
    fs.mkdirSync(path.join(dashboardDir, 'public'), { recursive: true });

    // Copy template files
    const templateFiles = ['server.js', 'package.json', 'Dockerfile'];
    for (const file of templateFiles) {
      const src = path.join(scaffoldDir, file);
      const dest = path.join(dashboardDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Copy public/ directory contents
    const publicSrc = path.join(scaffoldDir, 'public');
    if (fs.existsSync(publicSrc)) {
      fs.cpSync(publicSrc, path.join(dashboardDir, 'public'), { recursive: true });
    }

    // Inject API key into Dockerfile as an ENV directive
    const dockerfilePath = path.join(dashboardDir, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      let dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
      // Insert ENV API_KEY before the CMD line
      dockerfile = dockerfile.replace(
        /^(CMD .*)$/m,
        `ENV API_KEY=${apiKey}\n$1`,
      );
      fs.writeFileSync(dockerfilePath, dockerfile, 'utf-8');
    }

    return dashboardDir;
  }

  /**
   * Build the gcloud CLI command string for deploying the dashboard
   * to Google Cloud Run.
   *
   * @param dashboardDir  Path to the scaffolded dashboard directory
   * @param project       GCP project ID
   * @param region        GCP region (e.g. 'us-central1')
   */
  buildDeployCommand(dashboardDir: string, project: string, region: string): string {
    return [
      'gcloud', 'run', 'deploy', 'elisa-iot-dashboard',
      '--source', dashboardDir,
      '--project', project,
      '--region', region,
      '--allow-unauthenticated',
      '--quiet',
    ].join(' ');
  }

  /**
   * Execute the full deploy pipeline: generate API key, scaffold dashboard,
   * and deploy to Cloud Run via gcloud CLI.
   *
   * @param scaffoldDir  Source directory containing scaffold templates
   * @param workDir      Workspace directory to stage files in
   * @param project      GCP project ID
   * @param region       GCP region (e.g. 'us-central1')
   * @returns Object with the service URL and generated API key
   */
  async deploy(
    scaffoldDir: string,
    workDir: string,
    project: string,
    region: string,
  ): Promise<{ url: string; apiKey: string }> {
    const apiKey = this.generateApiKey();
    const dashboardDir = await this.scaffoldDashboard(scaffoldDir, workDir, apiKey);

    // Enable required GCP APIs (idempotent -- skips already-enabled ones)
    await this.enableRequiredApis(project);

    // Use exec (shell) instead of execFile -- gcloud is a .cmd wrapper on Windows
    // and execFile cannot spawn .cmd files reliably across all Windows versions.
    // --quiet suppresses interactive prompts (API enablement, service creation confirmation).
    // Parentheses in format arg must be quoted to avoid shell interpretation.
    const cmd = [
      'gcloud', 'run', 'deploy', 'elisa-iot-dashboard',
      '--source', `"${dashboardDir}"`,
      '--project', project,
      '--region', region,
      '--allow-unauthenticated',
      '--quiet',
      '--format', '"value(status.url)"',
    ].join(' ');

    const { stdout } = await execAsync(cmd, {
      timeout: 300_000, // 5 minute timeout for cloud deploy
    });

    const url = stdout.trim();
    return { url, apiKey };
  }
}
