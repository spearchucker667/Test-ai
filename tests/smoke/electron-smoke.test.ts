import { test } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

test('packaged electron app launches successfully', async () => {
  const root = path.join(__dirname, '..', '..');
  const releaseDir = path.join(root, 'release');
  
  let exePath: string | undefined;
  
  if (os.platform() === 'win32') {
    if (!fs.existsSync(releaseDir)) throw new Error('release/ directory not found');
    const files = fs.readdirSync(releaseDir);
    const portable = files.find(f => f.endsWith('-Portable.exe'));
    if (portable) exePath = path.join(releaseDir, portable);
  } else if (os.platform() === 'darwin') {
    const archs = os.arch() === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-arm64'];
    for (const archDirName of archs) {
      const archDir = path.join(releaseDir, archDirName);
      if (fs.existsSync(archDir)) {
        const files = fs.readdirSync(archDir);
        const app = files.find(f => f.endsWith('.app'));
        if (app) {
          exePath = path.join(archDir, app, 'Contents', 'MacOS', 'Venice Forge');
          break;
        }
      }
    }
  }

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error('Packaged app not found. Did you run `npm run dist`?');
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(exePath!, [], {
      stdio: 'pipe',
      env: { ...process.env, VENICE_FORGE_SMOKE_TEST: 'true' }
    });

    let stdout = '';
    let stderr = '';
    let hasExited = false;
    let exitCode: number | null = null;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('exit', (code) => {
      hasExited = true;
      exitCode = code ?? null;
    });

    // If it survives for 5 seconds without crashing, send SIGTERM and verify clean shutdown.
    setTimeout(() => {
      if (hasExited) {
        // Exited early — code was already checked in the listener, so this path only
        // triggers if exitCode is 0/null (resolve) or non-zero (reject).
        if (exitCode !== 0 && exitCode !== null) {
          reject(new Error(`App exited early with code ${exitCode}. stdout: ${stdout}\nstderr: ${stderr}`));
        } else {
          resolve();
        }
        return;
      }

      // Still running after 5 s — check for obvious fatal errors in output before killing.
      const combined = stdout + stderr;
      const fatalPatterns = [/Cannot find module/i, /SyntaxError/i, /ReferenceError/i, /FATAL/i, /crash reporter/i];
      for (const pattern of fatalPatterns) {
        if (pattern.test(combined)) {
          child.kill('SIGKILL');
          reject(new Error(`Detected fatal pattern ${pattern} in output. stdout: ${stdout}\nstderr: ${stderr}`));
          return;
        }
      }

      child.kill('SIGTERM');

      // Give the process up to 3 s to exit gracefully after SIGTERM.
      const termTimeout = setTimeout(() => {
        if (!hasExited) {
          child.kill('SIGKILL');
          reject(new Error('App did not exit within 3 s of SIGTERM; forcibly killed.'));
        }
      }, 3000);

      child.on('exit', () => {
        clearTimeout(termTimeout);
        if (exitCode !== 0 && exitCode !== null) {
          reject(new Error(`App exited with code ${exitCode} after SIGTERM. stdout: ${stdout}\nstderr: ${stderr}`));
        } else {
          resolve();
        }
      });
    }, 5000);
  });
}, 10000);
