/** Runs tests for generated nuggets. Supports pytest (Python) and Node.js test files. */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeEnv } from '../utils/safeEnv.js';
import { withTimeout, TimeoutError } from '../utils/withTimeout.js';
import { TEST_TIMEOUT_MS } from '../utils/constants.js';

/** Error subtype augmented with child process stdout/stderr for diagnostics. */
interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  code?: string;
  killed?: boolean;
  status?: number;
}

/** Detect which test file types exist in a directory. */
function detectTestTypes(testsDir: string): { hasPython: boolean; hasJs: boolean } {
  const entries = fs.readdirSync(testsDir);
  let hasPython = false;
  let hasJs = false;
  for (const entry of entries) {
    if (entry.endsWith('.py')) hasPython = true;
    if (entry.endsWith('.js') || entry.endsWith('.mjs')) hasJs = true;
  }
  return { hasPython, hasJs };
}

/** Parse JS test stdout for granular PASS/FAIL lines. */
export function parseJsTestOutput(stdout: string): Array<{ test_name: string; passed: boolean; details: string }> {
  const results: Array<{ test_name: string; passed: boolean; details: string }> = [];
  for (const line of stdout.split('\n')) {
    // "PASS: test name" / "FAIL: test name"
    const passFail = line.match(/^(PASS|FAIL):\s*(.+)/i);
    if (passFail) {
      const passed = passFail[1].toUpperCase() === 'PASS';
      results.push({ test_name: passFail[2].trim(), passed, details: passed ? 'PASSED' : 'FAILED' });
      continue;
    }
    // TAP format: "ok N - description" / "not ok N - description"
    const tap = line.match(/^(not ok|ok)\s+\d+\s*[-:]?\s*(.*)/);
    if (tap) {
      const passed = tap[1] === 'ok';
      const name = tap[2].trim() || 'unnamed';
      results.push({ test_name: name, passed, details: passed ? 'PASSED' : 'FAILED' });
    }
  }
  return results;
}

export class TestRunner {
  async runTests(workDir: string): Promise<TestRunResult> {
    const testsDir = path.join(workDir, 'tests');
    if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory()) {
      return { tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null };
    }

    const { hasPython, hasJs } = detectTestTypes(testsDir);

    if (!hasPython && !hasJs) {
      return { tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null };
    }

    let pyResult: TestRunResult | null = null;
    let jsResult: TestRunResult | null = null;

    if (hasPython) {
      pyResult = await this.runPytest(workDir, testsDir);
    }
    if (hasJs) {
      jsResult = await this.runJsTests(workDir, testsDir);
    }

    // Merge results if both exist
    if (pyResult && jsResult) {
      return {
        tests: [...pyResult.tests, ...jsResult.tests],
        passed: pyResult.passed + jsResult.passed,
        failed: pyResult.failed + jsResult.failed,
        total: pyResult.total + jsResult.total,
        coverage_pct: pyResult.coverage_pct,
        coverage_details: pyResult.coverage_details,
      };
    }

    return pyResult ?? jsResult!;
  }

  private async runJsTests(workDir: string, testsDir: string): Promise<TestRunResult> {
    const entries = fs.readdirSync(testsDir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
    const tests: Array<{ test_name: string; passed: boolean; details: string }> = [];
    let passedCount = 0;
    let failedCount = 0;

    for (const file of entries) {
      const filePath = path.join(testsDir, file);
      let stdout = '';
      let exitCode = 0;

      try {
        let childProc: import('node:child_process').ChildProcess | undefined;
        const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
          childProc = execFile('node', [filePath], { cwd: workDir, env: safeEnv() }, (err, stdout, stderr) => {
            if (err) {
              const execErr = err as ExecError;
              if (stdout != null) execErr.stdout = stdout;
              if (stderr != null) execErr.stderr = stderr;
              reject(execErr);
            } else {
              resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
            }
          });
        });
        const result = await withTimeout(
          execPromise,
          TEST_TIMEOUT_MS,
          { childProcess: childProc },
        );
        stdout = result.stdout ?? '';
      } catch (err: unknown) {
        const execErr = err as ExecError;
        if (err instanceof TimeoutError) {
          tests.push({ test_name: file, passed: false, details: 'Test run timed out' });
          failedCount++;
          continue;
        }
        if (execErr.code === 'ENOENT') {
          tests.push({ test_name: file, passed: false, details: 'node not found' });
          failedCount++;
          continue;
        }
        // Non-zero exit code -- test failure
        stdout = execErr.stdout ?? '';
        exitCode = execErr.status ?? 1;
      }

      // Try to parse granular test output
      const parsed = parseJsTestOutput(stdout);
      if (parsed.length > 0) {
        for (const t of parsed) {
          tests.push(t);
          if (t.passed) passedCount++;
          else failedCount++;
        }
      } else {
        // Fall back: count the whole file as one test
        const passed = exitCode === 0;
        tests.push({ test_name: file, passed, details: passed ? 'PASSED' : 'FAILED' });
        if (passed) passedCount++;
        else failedCount++;
      }
    }

    return { tests, passed: passedCount, failed: failedCount, total: passedCount + failedCount, coverage_pct: null, coverage_details: null };
  }

  private async runPytest(workDir: string, testsDir: string): Promise<TestRunResult> {
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
      let childProc: import('node:child_process').ChildProcess | undefined;
      const execPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        childProc = execFile('python', args, { cwd: workDir, env: safeEnv() }, (err, stdoutBuf, stderrBuf) => {
          if (err) {
            const execErr = err as ExecError;
            if (stdoutBuf != null) execErr.stdout = stdoutBuf;
            if (stderrBuf != null) execErr.stderr = stderrBuf;
            reject(execErr);
          } else {
            resolve({ stdout: stdoutBuf ?? '', stderr: stderrBuf ?? '' });
          }
        });
      });
      const result = await withTimeout(
        execPromise,
        120_000,
        { childProcess: childProc },
      );
      stdout = result.stdout ?? '';
      stderr = result.stderr ?? '';
    } catch (err: unknown) {
      const execErr = err as ExecError;
      if (err instanceof TimeoutError) {
        this.cleanupCovFile(covJsonPath);
        return {
          tests: [{ test_name: 'pytest', passed: false, details: 'Test run timed out' }],
          passed: 0, failed: 1, total: 1, coverage_pct: null, coverage_details: null,
        };
      }
      if (execErr.code === 'ENOENT') {
        return {
          tests: [{ test_name: 'pytest', passed: false, details: 'pytest not found' }],
          passed: 0, failed: 1, total: 1, coverage_pct: null, coverage_details: null,
        };
      }
      // pytest returns exit code 1 on test failures -- that's normal
      stdout = execErr.stdout ?? '';
      stderr = execErr.stderr ?? '';
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
        const filesReport: CoverageDetails['files'] = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- covData.files is untyped JSON from pytest coverage output
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

    // Clean up temp coverage file
    this.cleanupCovFile(covJsonPath);

    return {
      tests,
      passed: passedCount,
      failed: failedCount,
      total: passedCount + failedCount,
      coverage_pct: coveragePct,
      coverage_details: coverageDetails,
    };
  }

  private cleanupCovFile(covJsonPath: string | null): void {
    if (covJsonPath) {
      try { fs.unlinkSync(covJsonPath); } catch { /* best-effort */ }
    }
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

