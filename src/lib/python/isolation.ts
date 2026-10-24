import * as fs from 'fs';
import type { PythonProvenance } from './types.js';

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
