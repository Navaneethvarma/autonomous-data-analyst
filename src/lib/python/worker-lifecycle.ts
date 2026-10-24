import { spawn, execSync } from 'child_process';
import * as os from 'os';

/**
 * Terminate a child process and its entire process tree cleanly.
 */
export function killChildProcessTree(child: ReturnType<typeof spawn>): void {
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
