import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type {
  PythonAnalysisRequest,
  PythonAnalysisResult,
} from './types.js';
import {
  PythonAnalysisRequestSchema,
  PythonAnalysisResultSchema,
} from './types.js';
import {
  FORBIDDEN_TOKENS,
  validatePythonCodeSafety,
  validateDatasetPath,
  createScrubbedEnvironment,
  sanitizeErrorOutput,
} from './security-validator.js';
import type { HardenedIsolationAssessment } from './isolation.js';
import {
  _setHardenedIsolationProbeForTest,
  _setContainerVerificationProbeForTest,
  isVerifiedContainerEnvironment,
  verifyHardenedIsolationEnvironment,
  isContainerIsolationActive,
  isStrictProductionIsolationRequired,
  getSandboxProvenance,
  getPythonExecutable,
} from './isolation.js';
import { killChildProcessTree } from './worker-lifecycle.js';

// Re-export public functions and types for backwards compatibility
export type { HardenedIsolationAssessment };
export {
  FORBIDDEN_TOKENS,
  validatePythonCodeSafety,
  validateDatasetPath,
  createScrubbedEnvironment,
  sanitizeErrorOutput,
  _setHardenedIsolationProbeForTest,
  _setContainerVerificationProbeForTest,
  isVerifiedContainerEnvironment,
  verifyHardenedIsolationEnvironment,
  isContainerIsolationActive,
  isStrictProductionIsolationRequired,
  getSandboxProvenance,
  getPythonExecutable,
  killChildProcessTree,
};

/**
 * Primary interface to execute Python analytics in an isolated worker subprocess.
 */
export async function executeSandboxedPython(
  rawRequest: PythonAnalysisRequest,
  options?: { signal?: AbortSignal }
): Promise<PythonAnalysisResult> {
  const startTime = Date.now();

  // 1. Schema Validation
  const parseResult = PythonAnalysisRequestSchema.safeParse(rawRequest);
  if (!parseResult.success) {
    return {
      contractVersion: '1.0.0',
      status: 'validation_failed',
      taskType: rawRequest.taskType || 'descriptive_stats',
      interpretation: 'Request schema validation failed.',
      sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
      numericResults: {},
      assumptions: [],
      warnings: [],
      provenance: getSandboxProvenance(rawRequest.datasetId || 'unknown', '', startTime),
      error: `Invalid request payload: ${JSON.stringify(parseResult.error.format())}`,
    };
  }

  const req = parseResult.data;

  // 2. Validate Dataset Path Boundary
  let safeDatasetPath: string;
  try {
    safeDatasetPath = validateDatasetPath(req.datasetPath);
  } catch (err: any) {
    return {
      contractVersion: '1.0.0',
      status: 'error',
      taskType: req.taskType,
      interpretation: 'Dataset access denied.',
      sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
      numericResults: {},
      assumptions: [],
      warnings: [],
      provenance: getSandboxProvenance(req.datasetId, '', startTime),
      error: sanitizeErrorOutput(err.message),
    };
  }

  // 3. Explicit Capability Check for Production Isolation
  if (req.taskType === 'custom_script') {
    if (isStrictProductionIsolationRequired()) {
      const assessment = verifyHardenedIsolationEnvironment();
      if (!assessment.isHardened) {
        return {
          contractVersion: '1.0.0',
          status: 'error',
          taskType: req.taskType,
          interpretation: 'Untrusted Python execution rejected: production container isolation is required but unavailable.',
          sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
          numericResults: {},
          assumptions: [],
          warnings: [
            'Workstation restricted subprocess is not authorized for untrusted code execution in production or strict container isolation mode.',
            assessment.rejectionReason || 'Hardened isolation boundary not established.',
          ],
          provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
          error: `Execution policy rejection: Arbitrary Python code requires a verified hardened container sandbox (verified container runtime environment with cgroup isolation and no host access). Subprocess fallback is prohibited. Reason: ${assessment.rejectionReason || 'Hardened sandbox configuration incomplete.'}`,
        };
      }
    }
  }

  // 4. AST / Token Safety Check for custom scripts (defense-in-depth pre-filter)
  if (req.taskType === 'custom_script' && req.code) {
    const safety = validatePythonCodeSafety(req.code);
    if (!safety.safe) {
      return {
        contractVersion: '1.0.0',
        status: 'error',
        taskType: req.taskType,
        interpretation: 'Custom script rejected by AST security validator.',
        sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
        numericResults: {},
        assumptions: [],
        warnings: [],
        provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
        error: safety.reason,
      };
    }
  }

  // 5. Create Ephemeral Scratch Workspace
  const scratchId = randomUUID();
  const tempDir = path.join(process.cwd(), 'reports', 'tmp', `py_sandbox_${scratchId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const workerScriptPath = path.resolve(
    process.cwd(),
    'src',
    'lib',
    'python',
    'worker_runner.py'
  );

  const pythonExec = getPythonExecutable();
  const scrubbedEnv = createScrubbedEnvironment();

  // Prepare runner payload
  const workerPayload = {
    ...req,
    datasetPath: safeDatasetPath,
  };

  return new Promise<PythonAnalysisResult>((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timedOut = false;
    let cancelled = false;
    let abortListener: (() => void) | null = null;

    const timeoutLimit = req.limits?.timeoutMs || 10000;
    const maxOutputBytes = req.limits?.maxOutputBytes || 524288;

    const child = spawn(pythonExec, [workerScriptPath], {
      cwd: tempDir,
      env: scrubbedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Support cancellation via AbortSignal
    if (options?.signal) {
      if (options.signal.aborted) {
        cancelled = true;
        killChildProcessTree(child);
      } else {
        abortListener = () => {
          cancelled = true;
          killChildProcessTree(child);
        };
        options.signal.addEventListener('abort', abortListener, { once: true });
      }
    }

    // Enforce execution timeout
    const timer = setTimeout(() => {
      timedOut = true;
      killChildProcessTree(child);
    }, timeoutLimit);

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBuffer.length + chunk.length <= maxOutputBytes) {
        stdoutBuffer += chunk.toString('utf-8');
      } else {
        killChildProcessTree(child);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuffer.length + chunk.length <= maxOutputBytes) {
        stderrBuffer += chunk.toString('utf-8');
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      if (abortListener && options?.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
      resolve({
        contractVersion: '1.0.0',
        status: 'error',
        taskType: req.taskType,
        interpretation: 'Failed to spawn sandboxed Python worker process.',
        sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
        numericResults: {},
        assumptions: [],
        warnings: [],
        provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
        error: sanitizeErrorOutput(err.message),
      });
    });

    child.on('close', (_code: number | null) => {
      clearTimeout(timer);
      if (abortListener && options?.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }

      // Cleanup ephemeral workspace
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }

      if (cancelled) {
        resolve({
          contractVersion: '1.0.0',
          status: 'timeout',
          taskType: req.taskType,
          interpretation: 'Python analysis cancelled by client.',
          sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
          numericResults: {},
          assumptions: [],
          warnings: ['Analysis execution was cancelled before completion.'],
          provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
          error: 'Execution cancelled.',
        });
        return;
      }

      if (timedOut) {
        resolve({
          contractVersion: '1.0.0',
          status: 'timeout',
          taskType: req.taskType,
          interpretation: `Python execution timed out after ${timeoutLimit}ms limit.`,
          sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
          numericResults: {},
          assumptions: [],
          warnings: [`Execution terminated after reaching the ${timeoutLimit}ms wall-clock threshold.`],
          provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
          error: `Execution timed out (${timeoutLimit}ms limit exceeded).`,
        });
        return;
      }

      if (stdoutBuffer.length > maxOutputBytes) {
        resolve({
          contractVersion: '1.0.0',
          status: 'error',
          taskType: req.taskType,
          interpretation: 'Python execution exceeded maximum allowed output buffer size.',
          sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
          numericResults: {},
          assumptions: [],
          warnings: [],
          provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
          error: `Output exceeded buffer limit of ${maxOutputBytes} bytes.`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdoutBuffer);
        const validated = PythonAnalysisResultSchema.safeParse(parsed);
        if (validated.success) {
          const verifiedProvenance = getSandboxProvenance(req.datasetId, safeDatasetPath, startTime);
          resolve({
            ...validated.data,
            provenance: {
              ...validated.data.provenance,
              workerSandboxType: verifiedProvenance.workerSandboxType,
              isolationLevel: verifiedProvenance.isolationLevel,
            },
          });
        } else {
          resolve({
            contractVersion: '1.0.0',
            status: 'error',
            taskType: req.taskType,
            interpretation: 'Python worker returned malformed result schema.',
            sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
            numericResults: {},
            assumptions: [],
            warnings: [],
            provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
            error: `Result schema mismatch: ${JSON.stringify(validated.error.format())}`,
          });
        }
      } catch (err: any) {
        const sanitizedErr = sanitizeErrorOutput(stderrBuffer || stdoutBuffer || err.message);
        resolve({
          contractVersion: '1.0.0',
          status: 'error',
          taskType: req.taskType,
          interpretation: 'Failed to parse structured JSON from Python worker.',
          sampleSize: { totalRows: 0, validObservations: 0, droppedOrMissing: 0 },
          numericResults: {},
          assumptions: [],
          warnings: [],
          provenance: getSandboxProvenance(req.datasetId, safeDatasetPath, startTime),
          error: sanitizedErr || 'Unknown worker termination error.',
        });
      }
    });

    child.stdin.on('error', () => {
      // Ignore write errors if child terminated early or was cancelled
    });

    // Write input payload to stdin and close stream
    try {
      if (!cancelled && !child.stdin.destroyed) {
        child.stdin.write(JSON.stringify(workerPayload));
        child.stdin.end();
      }
    } catch {
      // ignore
    }
  });
}
