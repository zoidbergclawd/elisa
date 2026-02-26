/** Scaffolds and deploys IoT cloud dashboards to Google Cloud Run. */

import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Directory containing the cloud_dashboard template files. */
const TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'hardware', 'templates', 'cloud_dashboard',
);

export class CloudDeployService {
  /**
   * Generate a crypto-random 32-character hex string suitable for use
   * as an API key shared between the ESP32 gateway and cloud dashboard.
   */
  generateApiKey(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Copy cloud dashboard template files into `nuggetDir/iot-dashboard/`
   * and inject the given API key into the Dockerfile as an environment variable.
   *
   * @param nuggetDir  The nugget workspace directory
   * @param apiKey     The API key to inject
   */
  async scaffoldDashboard(nuggetDir: string, apiKey: string): Promise<string> {
    const dashboardDir = path.join(nuggetDir, 'iot-dashboard');

    // Create dashboard directory structure
    fs.mkdirSync(path.join(dashboardDir, 'public'), { recursive: true });

    // Copy template files
    const templateFiles = ['server.js', 'package.json', 'Dockerfile'];
    for (const file of templateFiles) {
      const src = path.join(TEMPLATE_DIR, file);
      const dest = path.join(dashboardDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Copy public/ directory contents
    const publicSrc = path.join(TEMPLATE_DIR, 'public');
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
    ].join(' ');
  }

  /**
   * Execute the full deploy pipeline: generate API key, scaffold dashboard,
   * and deploy to Cloud Run via gcloud CLI.
   *
   * @param nuggetDir  The nugget workspace directory
   * @param project    GCP project ID
   * @param region     GCP region (e.g. 'us-central1')
   * @returns Object with the service URL and generated API key
   */
  async deploy(
    nuggetDir: string,
    project: string,
    region: string,
  ): Promise<{ url: string; apiKey: string }> {
    const apiKey = this.generateApiKey();
    const dashboardDir = await this.scaffoldDashboard(nuggetDir, apiKey);

    // Use exec (shell) instead of execFile -- gcloud is a .cmd wrapper on Windows
    // and execFile cannot spawn .cmd files reliably across all Windows versions.
    const cmd = [
      'gcloud', 'run', 'deploy', 'elisa-iot-dashboard',
      '--source', `"${dashboardDir}"`,
      '--project', project,
      '--region', region,
      '--allow-unauthenticated',
      '--format', 'value(status.url)',
    ].join(' ');

    const { stdout } = await execAsync(cmd, {
      timeout: 300_000, // 5 minute timeout for cloud deploy
    });

    const url = stdout.trim();
    return { url, apiKey };
  }
}
