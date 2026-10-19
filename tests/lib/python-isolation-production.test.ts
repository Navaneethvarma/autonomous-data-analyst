import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  executeSandboxedPython,
  isContainerIsolationActive,
  isStrictProductionIsolationRequired,
  _setContainerVerificationProbeForTest,
  _setHardenedIsolationProbeForTest,
} from '../../src/lib/python/sandbox-runner.js';
import { PythonAnalysisRequest } from '../../src/lib/python/types.js';

describe('Python Production Fail-Closed Boundary (Milestone 11)', () => {
  const originalEnv = { ...process.env };
  const fixturePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'python_stats_test.csv');

  beforeEach(() => {
    process.env = { ...originalEnv };
    _setContainerVerificationProbeForTest(null);
    _setHardenedIsolationProbeForTest(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _setContainerVerificationProbeForTest(null);
    _setHardenedIsolationProbeForTest(null);
  });

  it('fails closed for arbitrary custom_script when CONTAINER_SANDBOX_ACTIVE=true is set without verifiable isolation', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    // Without genuine container indicators (e.g. on host Windows without /.dockerenv or cgroups)
    _setContainerVerificationProbeForTest(() => false);

    expect(isStrictProductionIsolationRequired()).toBe(true);
    expect(isContainerIsolationActive()).toBe(false);

    const req: PythonAnalysisRequest = {
      taskId: 'sec-custom-prod-1',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\nprint("arbitrary code")\noutput={"mean": 10.0}',
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('error');
    expect(res.error).toContain('Execution policy rejection');
    expect(res.error).toContain('Arbitrary Python code requires a verified hardened container sandbox');
    expect(res.warnings).toContain(
      'Workstation restricted subprocess is not authorized for untrusted code execution in production or strict container isolation mode.'
    );
  });

  it('fails closed in multi-tenant mode even if NODE_ENV is development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.MULTI_TENANT_MODE = 'true';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    _setContainerVerificationProbeForTest(() => false);

    expect(isStrictProductionIsolationRequired()).toBe(true);
    expect(isContainerIsolationActive()).toBe(false);

    const req: PythonAnalysisRequest = {
      taskId: 'sec-custom-multi-1',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\noutput={"mean": 42.0}',
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('error');
    expect(res.error).toContain('Execution policy rejection');
  });

  it('fails closed when container marker exists but process is running as root (UID 0)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    _setHardenedIsolationProbeForTest(() => ({
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot: false,
      isNetworkDisabled: true,
      isFilesystemRestricted: true,
      rejectionReason: 'Container marker detected, but process is executing as root (UID 0). Hardened sandbox requires an unprivileged non-root user.',
    }));

    const req: PythonAnalysisRequest = {
      taskId: 'sec-root-container',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\noutput={"mean": 1.0}',
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('error');
    expect(res.error).toContain('Execution policy rejection');
    expect(res.error).toContain('executing as root (UID 0)');
  });

  it('fails closed when container marker exists but network egress is not disabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    _setHardenedIsolationProbeForTest(() => ({
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot: true,
      isNetworkDisabled: false,
      isFilesystemRestricted: true,
      rejectionReason: 'Container marker detected, but network egress is not confirmed disabled.',
    }));

    const req: PythonAnalysisRequest = {
      taskId: 'sec-net-container',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\noutput={"mean": 1.0}',
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('error');
    expect(res.error).toContain('Execution policy rejection');
    expect(res.error).toContain('network egress is not confirmed disabled');
  });

  it('fails closed when container marker exists but filesystem is not restricted', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    _setHardenedIsolationProbeForTest(() => ({
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot: true,
      isNetworkDisabled: true,
      isFilesystemRestricted: false,
      rejectionReason: 'Container marker detected, but read-only root filesystem policy is not configured.',
    }));

    const req: PythonAnalysisRequest = {
      taskId: 'sec-fs-container',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\noutput={"mean": 1.0}',
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('error');
    expect(res.error).toContain('Execution policy rejection');
    expect(res.error).toContain('read-only root filesystem policy is not configured');
  });

  it('allows verified container execution when genuine isolation probe confirms container environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'true';
    _setContainerVerificationProbeForTest(() => true);

    expect(isContainerIsolationActive()).toBe(true);

    const req: PythonAnalysisRequest = {
      taskId: 'sec-custom-verified-1',
      taskType: 'custom_script',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      code: 'import math\noutput={"mean": 10.5}\nprint("EXEC_SUCCESS")',
    };

    const res = await executeSandboxedPython(req);
    // Should NOT be rejected by policy; provenance should reflect production hardened container
    expect(res.error).not.toContain('Execution policy rejection');
    expect(res.provenance.workerSandboxType).toBe('container_sandbox');
    expect(res.provenance.isolationLevel).toBe('production_hardened_container');
  });

  it('preserves pre-approved parameter-driven statistical operations without custom_script risks', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTAINER_SANDBOX_ACTIVE = 'false';
    _setContainerVerificationProbeForTest(() => false);

    const req: PythonAnalysisRequest = {
      taskId: 'stat-desc-prod-1',
      taskType: 'descriptive_stats',
      datasetId: 'test_dataset',
      datasetPath: fixturePath,
      columns: ['x'],
      parameters: { column: 'x' },
    };

    const res = await executeSandboxedPython(req);
    expect(res.status).toBe('success');
    expect(res.numericResults.mean).toBeCloseTo(10.5, 2);
  });
});
