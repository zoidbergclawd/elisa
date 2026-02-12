import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TestRunner, parseJsTestOutput } from './testRunner.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Helper to make execFile mock resolve/reject
function mockExecFile(impl: (...args: any[]) => void) {
  (execFile as any).mockImplementation(impl);
}

describe('parseJsTestOutput', () => {
  it('parses PASS/FAIL lines', () => {
    const stdout = 'PASS: addition works\nFAIL: subtraction broken\nPASS: multiply ok\n';
    const results = parseJsTestOutput(stdout);
    expect(results).toEqual([
      { test_name: 'addition works', passed: true, details: 'PASSED' },
      { test_name: 'subtraction broken', passed: false, details: 'FAILED' },
      { test_name: 'multiply ok', passed: true, details: 'PASSED' },
    ]);
  });

  it('parses TAP format', () => {
    const stdout = 'ok 1 - first test\nnot ok 2 - second test\nok 3 - third test\n';
    const results = parseJsTestOutput(stdout);
    expect(results).toEqual([
      { test_name: 'first test', passed: true, details: 'PASSED' },
      { test_name: 'second test', passed: false, details: 'FAILED' },
      { test_name: 'third test', passed: true, details: 'PASSED' },
    ]);
  });

  it('handles mixed formats', () => {
    const stdout = 'PASS: first\nok 1 - second\nsome random line\nFAIL: third\n';
    const results = parseJsTestOutput(stdout);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ test_name: 'first', passed: true });
    expect(results[1]).toMatchObject({ test_name: 'second', passed: true });
    expect(results[2]).toMatchObject({ test_name: 'third', passed: false });
  });

  it('returns empty array for unparseable output', () => {
    expect(parseJsTestOutput('hello world\nno tests here\n')).toEqual([]);
  });

  it('is case-insensitive for PASS/FAIL prefix', () => {
    const results = parseJsTestOutput('pass: lower\nFail: upper\n');
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });
});

describe('TestRunner', () => {
  let tmpDir: string;
  let testsDir: string;
  let runner: TestRunner;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-'));
    testsDir = path.join(tmpDir, 'tests');
    runner = new TestRunner();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zeros when tests/ directory does not exist', async () => {
    const result = await runner.runTests(tmpDir);
    expect(result).toEqual({ tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null });
  });

  it('returns zeros when tests/ has no recognized files', async () => {
    fs.mkdirSync(testsDir);
    fs.writeFileSync(path.join(testsDir, 'notes.txt'), 'not a test');
    const result = await runner.runTests(tmpDir);
    expect(result).toEqual({ tests: [], passed: 0, failed: 0, total: 0, coverage_pct: null, coverage_details: null });
  });

  describe('JS test detection and execution', () => {
    it('detects .js files and runs them with node', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_math.js'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'PASS: addition\nPASS: subtraction\n', '');
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(result.tests).toHaveLength(2);

      // Verify node was called (not python)
      expect(execFile).toHaveBeenCalledWith(
        'node',
        [path.join(testsDir, 'test_math.js')],
        expect.objectContaining({ cwd: tmpDir }),
        expect.any(Function),
      );
    });

    it('detects .mjs files', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_utils.mjs'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'ok 1 - works\n', '');
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(1);
      expect(result.total).toBe(1);
    });

    it('falls back to file-level pass/fail when output is unparseable', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_app.js'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'All good!\n', '');
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(1);
      expect(result.tests[0]).toEqual({ test_name: 'test_app.js', passed: true, details: 'PASSED' });
    });

    it('counts file as failed on non-zero exit code with unparseable output', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_broken.js'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const err: any = new Error('exit 1');
        err.stdout = 'Error: assertion failed\n';
        err.stderr = '';
        err.status = 1;
        cb(err);
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(1);
      expect(result.tests[0]).toMatchObject({ test_name: 'test_broken.js', passed: false });
    });

    it('handles mixed passing and failing test files', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_a.js'), '');
      fs.writeFileSync(path.join(testsDir, 'test_b.js'), '');

      let callIndex = 0;
      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        if (callIndex === 0) {
          callIndex++;
          cb(null, 'PASS: test1\nPASS: test2\n', '');
        } else {
          const err: any = new Error('exit 1');
          err.stdout = 'PASS: test3\nFAIL: test4\n';
          err.stderr = '';
          err.status = 1;
          cb(err);
        }
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(3);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(4);
    });

    it('reports timeout per file', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_slow.js'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        // Simulate the promisified withTimeout rejecting
        const err: any = new Error('Timed out');
        cb(err);
      });

      const result = await runner.runTests(tmpDir);
      expect(result.failed).toBe(1);
      expect(result.tests[0]).toMatchObject({ test_name: 'test_slow.js', details: 'Test run timed out' });
    });

    it('reports ENOENT when node is not found', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_app.js'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        const err: any = new Error('spawn node ENOENT');
        err.code = 'ENOENT';
        cb(err);
      });

      const result = await runner.runTests(tmpDir);
      expect(result.failed).toBe(1);
      expect(result.tests[0]).toMatchObject({ test_name: 'test_app.js', details: 'node not found' });
    });
  });

  describe('Python test detection', () => {
    it('detects .py files and runs pytest', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_math.py'), '');

      mockExecFile((_cmd: string, _args: string[], _opts: any, cb: Function) => {
        cb(null, 'test_math.py::test_add PASSED\ntest_math.py::test_sub FAILED\n', '');
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(2);

      // Verify python/pytest was called
      expect(execFile).toHaveBeenCalledWith(
        'python',
        expect.arrayContaining(['-m', 'pytest']),
        expect.objectContaining({ cwd: tmpDir }),
        expect.any(Function),
      );
    });
  });

  describe('mixed Python + JS tests', () => {
    it('merges results from both runners', async () => {
      fs.mkdirSync(testsDir);
      fs.writeFileSync(path.join(testsDir, 'test_math.py'), '');
      fs.writeFileSync(path.join(testsDir, 'test_app.js'), '');

      let callIndex = 0;
      mockExecFile((cmd: string, _args: string[], _opts: any, cb: Function) => {
        if (cmd === 'python') {
          cb(null, 'test_math.py::test_add PASSED\n', '');
        } else {
          cb(null, 'PASS: js test\n', '');
        }
      });

      const result = await runner.runTests(tmpDir);
      expect(result.passed).toBe(2);
      expect(result.total).toBe(2);
      expect(result.tests).toHaveLength(2);
    });
  });
});
