import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * Disallowed modules and tokens that violate the sandboxed execution boundary.
 */
export const FORBIDDEN_TOKENS = [
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
