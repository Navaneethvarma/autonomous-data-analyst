import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import {
  PythonAnalysisRequest,
  PythonAnalysisRequestSchema,
  PythonAnalysisResult,
  PythonAnalysisResultSchema,
  PythonProvenance,
} from './types.js';

/**
 * Disallowed modules and tokens that violate the sandboxed execution boundary.
 */
const FORBIDDEN_TOKENS = [
  // OS & Process Control
  'os.system',
  'os.popen',
  'os.spawn',
  'os.remove',
  'os.unlink',
  'os.rmdir',
  'subprocess',
  'shutil',
  'ctypes',
  'winreg',
  // Networking & Web
  'socket',
  'urllib',
  'requests',
  'http.client',
  'aiohttp',
  'httpx',
  'ftplib',
  'smtplib',
  // Dynamic Execution & Code Injection
  'eval(',
  'exec(',
  '__import__',
  'importlib',
  'sys.modules',
  '__subclasses__',
  '__builtins__',
  // Arbitrary File IO outside dataset
  'open(',
];

/**
 * Static AST / token inspector to reject obvious malicious or dangerous Python code.
 *
 * CRITICAL SECURITY BOUNDARY NOTICE:
 * AST and token validation is a defense-in-depth pre-execution sanity filter, NOT a complete
 * security sandbox. Static parsing cannot prevent all dynamic introspection, bytecode tricks,
 * side channels, or resource exhaustion.
 *
 * On developer workstations, execution runs in a restricted subprocess with stripped credentials
 * and timeouts. For production environments, hardened kernel-isolated container sandboxes
 * (Docker/gVisor) are required.
 */
export function validatePythonCodeSafety(code: string): { safe: boolean; reason?: string } {
  if (!code || typeof code !== 'string') {
    return { safe: false, reason: 'Empty or invalid code string provided.' };
  }

  // Normalize comments and strings for token check
  const lower = code.toLowerCase();

  for (const token of FORBIDDEN_TOKENS) {
    if (lower.includes(token)) {
      return {
        safe: false,
        reason: `Disallowed operation or module detected in Python code: '${token}'. Sandbox prevents arbitrary syscalls, networking, and dynamic code evaluation.`,
      };
    }
  }

  // Check dangerous imports
  const importRegex = /^\s*(?:import|from)\s+([a-zA-Z0-9_\.]+)/gm;
  let match: RegExpExecArray | null;
  const allowedImports = new Set([
    'math',
    'statistics',
    'json',
    'csv',
    'datetime',
    'numpy',
    'scipy',
    'scipy.stats',
    'pandas',
  ]);

  while ((match = importRegex.exec(code)) !== null) {
    const rawMod = match[1];
    if (!rawMod) continue;
    const mod = rawMod.split('.')[0] || '';
    if (!allowedImports.has(mod)) {
      return {
        safe: false,
        reason: `Unauthorized import: '${mod}'. Only verified statistical and data processing libraries are permitted.`,
      };
    }
  }

  return { safe: true };
}

/**
 * Validates that dataset path does not perform path traversal and exists.
 */
export function validateDatasetPath(datasetPath: string, allowedRootDirs: string[] = []): string {
  if (!datasetPath || typeof datasetPath !== 'string') {
    throw new Error('Dataset path must be a non-empty string.');
  }

  // Path normalization
  const resolved = path.resolve(process.cwd(), datasetPath);

  // Reject path traversal with relative parent segments beyond allowed roots
  const defaultRoots = [
    path.resolve(process.cwd(), 'datasets'),
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'reports'),
    path.resolve(process.cwd(), 'tests'),
    path.resolve(os.tmpdir()),
    ...allowedRootDirs.map((d) => path.resolve(process.cwd(), d)),
  ];

  const isPermitted = defaultRoots.some(
    (root) => resolved.startsWith(root) || resolved === root
  );

  if (!isPermitted) {
    throw new Error(
      `Dataset path access denied: '${datasetPath}' resolves outside authorized boundaries.`
    );
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Authorized dataset file does not exist: '${datasetPath}'`);
  }

  return resolved;
}

/**
 * Creates a scrubbed, sanitized process environment with no API keys or application credentials.
 */
export function createScrubbedEnvironment(): NodeJS.ProcessEnv {
  const minimalEnv: NodeJS.ProcessEnv = {};

  // Standard OS variables necessary for Python runtime initialization
  const allowedKeys = [
    'SYSTEMROOT',
    'SYSTEMDRIVE',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
    'PATH',
    'TEMP',
    'TMP',
    'LOCALAPPDATA',
    'APPDATA',
    'USERPROFILE',
    'HOME',
    'LANG',
    'LC_ALL',
    'PYTHONPATH',
  ];

  for (const key of allowedKeys) {
    if (process.env[key]) {
      minimalEnv[key] = process.env[key];
    }
  }

  // Explicitly ensure secrets are NOT present
  delete minimalEnv.OPENAI_API_KEY;
  delete minimalEnv.ANTHROPIC_API_KEY;
  delete minimalEnv.DATABASE_URL;
  delete minimalEnv.AWS_SECRET_ACCESS_KEY;
  delete minimalEnv.GITHUB_TOKEN;

  // Add PYTHONIOENCODING for deterministic utf-8 behavior
  minimalEnv.PYTHONIOENCODING = 'utf-8';
  minimalEnv.PYTHONUNBUFFERED = '1';

  return minimalEnv;
}

/**
 * Sanitizes output strings to redact host paths and stack traces.
 */
export function sanitizeErrorOutput(text: string): string {
  if (!text) return '';
  const cwd = process.cwd();
  // Replace current working directory with generic placeholder
  const sanitized = text
    .split(cwd)
    .join('<workspace>')
    .replace(/[a-zA-Z]:\\[^\s:"]+/g, '<host_path>')
    .replace(/\/home\/[^\s:"]+/g, '<host_path>');
  return sanitized;
}

/**
 * Locates the Python executable.
 */
export function getPythonExecutable(): string {
  // Check C:\Python314\python.exe on Windows first
  if (process.platform === 'win32') {
    const python314 = 'C:\\Python314\\python.exe';
    if (fs.existsSync(python314)) {
      return python314;
    }
  }
  return 'python';
}

export interface HardenedIsolationAssessment {
  isHardened: boolean;
  hasContainerMarker: boolean;
  isNonRoot: boolean;
  isNetworkDisabled: boolean;
  isFilesystemRestricted: boolean;
  rejectionReason?: string;
}

let testHardenedAssessment: (() => HardenedIsolationAssessment) | null = null;

/**
 * Test hook to simulate hardened isolation assessment in hermetic tests.
 */
export function _setHardenedIsolationProbeForTest(probe: (() => HardenedIsolationAssessment) | null): void {
  testHardenedAssessment = probe;
}

/**
 * Backwards compatible alias for test probe.
 */
export function _setContainerVerificationProbeForTest(probe: (() => boolean) | null): void {
  if (probe) {
    testHardenedAssessment = () => {
      const marker = probe();
      return {
        isHardened: marker,
        hasContainerMarker: marker,
        isNonRoot: marker,
        isNetworkDisabled: marker,
        isFilesystemRestricted: marker,
      };
    };
  } else {
    testHardenedAssessment = null;
  }
}

/**
 * Checks for physical, verifiable markers of containerization on the host system.
 * NOTE: Container markers such as /.dockerenv, /run/.containerenv, or cgroup strings
 * must NOT, by themselves, be considered proof of a hardened sandbox.
 */
export function isVerifiedContainerEnvironment(): boolean {
  if (testHardenedAssessment) {
    return testHardenedAssessment().hasContainerMarker;
  }

  // 1. Standard Linux container indicators
  try {
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) {
      return true;
    }
  } catch {
    // Ignore FS errors
  }

  // 2. CGroup inspection for container runtimes (Docker, Podman, Containerd, Kubernetes)
  try {
    const cgroupPath = '/proc/self/cgroup';
    if (fs.existsSync(cgroupPath)) {
      const cgroupContent = fs.readFileSync(cgroupPath, 'utf8');
      if (
        cgroupContent.includes('docker') ||
        cgroupContent.includes('kubepods') ||
        cgroupContent.includes('containerd') ||
        cgroupContent.includes('libpod')
      ) {
        return true;
      }
    }
  } catch {
    // Ignore FS errors
  }

  return false;
}

/**
 * Assesses whether the environment enforces the complete hardened sandbox contract:
 * 1. Physical container runtime environment (cgroups or container runtime marker).
 * 2. Unprivileged / non-root execution (UID !== 0 on POSIX).
 * 3. Network egress disabled (PYTHON_CONTAINER_NETWORK_DISABLED !== 'false' and confirmed).
 * 4. Controlled filesystem access / read-only root.
 * 5. Explicit operator confirmation flag (PYTHON_HARDENED_SANDBOX_VERIFIED === 'true' or CONTAINER_SANDBOX_ACTIVE === 'true').
 */
export function verifyHardenedIsolationEnvironment(): HardenedIsolationAssessment {
  if (testHardenedAssessment) {
    return testHardenedAssessment();
  }

  const hasMarker = isVerifiedContainerEnvironment();
  if (!hasMarker) {
    return {
      isHardened: false,
      hasContainerMarker: false,
      isNonRoot: false,
      isNetworkDisabled: false,
      isFilesystemRestricted: false,
      rejectionReason: 'No verified container runtime marker (cgroups, /.dockerenv) detected on host system.',
    };
  }

  // Check Non-Root execution on POSIX platforms
  let isNonRoot = true;
  if (typeof process.getuid === 'function') {
    const uid = process.getuid();
    if (uid === 0) {
      isNonRoot = false;
      return {
        isHardened: false,
        hasContainerMarker: true,
        isNonRoot: false,
        isNetworkDisabled: false,
        isFilesystemRestricted: false,
        rejectionReason: 'Container marker detected, but process is executing as root (UID 0). Hardened sandbox requires an unprivileged non-root user.',
      };
    }
  }

  // Check Network Egress Policy: Network must be explicitly disabled in sandbox configuration
  const networkDisabled = process.env.PYTHON_CONTAINER_NETWORK_DISABLED === 'true' ||
    process.env.SANDBOX_NETWORK_EGRESS === 'none';
  if (!networkDisabled) {
    return {
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot,
      isNetworkDisabled: false,
      isFilesystemRestricted: false,
      rejectionReason: 'Container marker detected, but network egress is not confirmed disabled (PYTHON_CONTAINER_NETWORK_DISABLED=true required).',
    };
  }

  // Check Read-only Root / Filesystem isolation
  const fsRestricted = process.env.PYTHON_CONTAINER_READONLY_ROOT === 'true' ||
    process.env.SANDBOX_FS_RESTRICTED === 'true';
  if (!fsRestricted) {
    return {
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot,
      isNetworkDisabled: true,
      isFilesystemRestricted: false,
      rejectionReason: 'Container marker detected, but read-only root filesystem policy is not configured (PYTHON_CONTAINER_READONLY_ROOT=true required).',
    };
  }

  // Operator verification confirmation
  const operatorConfirmed = process.env.PYTHON_HARDENED_SANDBOX_VERIFIED === 'true' ||
    process.env.CONTAINER_SANDBOX_ACTIVE === 'true';
  if (!operatorConfirmed) {
    return {
      isHardened: false,
      hasContainerMarker: true,
      isNonRoot,
      isNetworkDisabled: true,
      isFilesystemRestricted: true,
      rejectionReason: 'Hardened sandbox environment present but operator confirmation flag is not set.',
    };
  }

  return {
    isHardened: true,
    hasContainerMarker: true,
    isNonRoot: true,
    isNetworkDisabled: true,
    isFilesystemRestricted: true,
  };
}

/**
 * Checks whether the environment is currently running inside an authorized, hardened container sandbox.
 * Container markers alone do NOT constitute a hardened sandbox.
 */
export function isContainerIsolationActive(): boolean {
  return verifyHardenedIsolationEnvironment().isHardened;
}

/**
 * Checks whether production isolation is strictly required.
 * In production mode, multi-tenant mode, or when PYTHON_SANDBOX_MODE is 'strict_container_only',
 * arbitrary or untrusted code execution MUST require genuine container isolation.
 */
export function isStrictProductionIsolationRequired(): boolean {
  return (
    process.env.PYTHON_SANDBOX_MODE === 'strict_container_only' ||
    process.env.NODE_ENV === 'production' ||
    process.env.MULTI_TENANT_MODE === 'true'
  );
}

/**
 * Resolves provenance metadata reflecting the actual runtime isolation capabilities.
 */
export function getSandboxProvenance(
  datasetId: string,
  datasetPath: string,
  startTime: number,
  pythonVersion = 'unknown',
  librariesUsed: string[] = []
): PythonProvenance {
  const isContainer = isContainerIsolationActive();
  return {
    datasetId,
    datasetPath,
    executionTimeMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    pythonVersion,
    librariesUsed,
    workerSandboxType: isContainer ? 'container_sandbox' : 'restricted_subprocess_dev',
    isolationLevel: isContainer
      ? 'production_hardened_container'
      : 'development_restricted_subprocess',
  };
}

/**
 * Terminate a child process and its entire process tree cleanly.
 */
function killChildProcessTree(child: ReturnType<typeof spawn>): void {
  try {
    if (child.pid) {
      if (os.platform() === 'win32') {
        try {
          execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          child.kill();
        }
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    // Process already exited
  }
}

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
  // Untrusted custom scripts require hardened container isolation in production or strict container mode.
  // Workstation restricted subprocess execution is restricted to controlled development use.
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
