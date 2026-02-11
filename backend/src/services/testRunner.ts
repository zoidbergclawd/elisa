/** Runs tests for generated nuggets. */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class TestRunner {
  async runTests(workDir: string): Promise<TestRunResult> {
    const testsDir = path.join(workDir, 'tests');
    if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory()) {
      return { tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null };
    }

    const args = ['-m', 'pytest', testsDir, '-v', '--tb=short'];

    let covJsonPath: string | null = null;
    const srcDir = path.join(workDir, 'src');
    if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
      covJsonPath = path.join(os.tmpdir(), `elisa-cov-${Date.now()}.json`);
      args.push(
        `--cov=${srcDir}`,
        `--cov-report=json:${covJsonPath}`,
        '--cov-report=',
      );
    }

    let stdout = '';
    let stderr = '';
    try {
      const result = await withTimeout(
        execFileAsync('python', args, { cwd: workDir }),
        120_000,
      );
      stdout = result.stdout ?? '';
      stderr = result.stderr ?? '';
    } catch (err: any) {
      if (err.message === 'Timed out') {
        return {
          tests: [{ test_name: 'pytest', passed: false, details: 'Test run timed out' }],
          passed: 0, failed: 1, total: 1, coverage_pct: null, coverage_details: null,
        };
      }
      if (err.code === 'ENOENT') {
        return {
          tests: [{ test_name: 'pytest', passed: false, details: 'pytest not found' }],
          passed: 0, failed: 1, total: 1, coverage_pct: null, coverage_details: null,
        };
      }
      // pytest returns exit code 1 on test failures -- that's normal
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? '';
    }

    // Check for import errors
    if (stderr.includes('ModuleNotFoundError') || stderr.includes('ImportError')) {
      const match = stderr.match(/(ModuleNotFoundError|ImportError): (.+)/);
      const errorMsg = match ? match[0] : 'Import error in test code';
      return {
        tests: [{ test_name: 'import_check', passed: false, details: errorMsg }],
        passed: 0, failed: 1, total: 1, coverage_pct: null, coverage_details: null,
      };
    }

    // Parse verbose output
    const tests: Array<{ test_name: string; passed: boolean; details: string }> = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const line of stdout.split('\n')) {
      const match = line.match(/(.+?)\s+(PASSED|FAILED|ERROR|SKIPPED)/);
      if (match) {
        const testName = match[1].trim();
        const status = match[2];
        const isPassed = status === 'PASSED';
        tests.push({ test_name: testName, passed: isPassed, details: status });
        if (isPassed) passedCount++;
        else failedCount++;
      }
    }

    // Parse coverage
    let coveragePct: number | null = null;
    let coverageDetails: CoverageDetails | null = null;
    if (covJsonPath && fs.existsSync(covJsonPath)) {
      try {
        const covData = JSON.parse(fs.readFileSync(covJsonPath, 'utf-8'));
        const totals = covData.totals ?? {};
        coveragePct = totals.percent_covered ?? null;
        const filesReport: Record<string, any> = {};
        for (const [filepath, fileData] of Object.entries<any>(covData.files ?? {})) {
          const summary = fileData.summary ?? {};
          filesReport[filepath] = {
            statements: summary.num_statements ?? 0,
            covered: summary.covered_lines ?? 0,
            percentage: summary.percent_covered ?? 0,
          };
        }
        coverageDetails = {
          total_statements: totals.num_statements ?? 0,
          covered_statements: totals.covered_lines ?? 0,
          files: filesReport,
        };
      } catch {
        // ignore parse failures
      }
    }

    return {
      tests,
      passed: passedCount,
      failed: failedCount,
      total: passedCount + failedCount,
      coverage_pct: coveragePct,
      coverage_details: coverageDetails,
    };
  }
}

interface CoverageDetails {
  total_statements: number;
  covered_statements: number;
  files: Record<string, { statements: number; covered: number; percentage: number }>;
}

export interface TestRunResult {
  tests: Array<{ test_name: string; passed: boolean; details: string }>;
  passed: number;
  failed: number;
  total: number;
  coverage_pct: number | null;
  coverage_details: CoverageDetails | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
