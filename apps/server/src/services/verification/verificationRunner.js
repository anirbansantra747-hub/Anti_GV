/**
 * @file verificationRunner.js
 * @description Targeted verification after code edits.
 */

import fs from 'fs/promises';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { getWorkspaceRoot } from '../fs/fileService.js';

const execAsync = util.promisify(exec);

export async function runVerification({ workspaceId, socket, changedFiles }) {
  if (!workspaceId || !socket) return;
  const root = getWorkspaceRoot();

  const checks = [];
  const hasJs = changedFiles.some((f) => /\.(js|jsx|ts|tsx)$/.test(f));
  const hasPy = changedFiles.some((f) => f.endsWith('.py'));
  const hasJava = changedFiles.some((f) => f.endsWith('.java'));

  if (hasJs && (await hasNpmScript(root, 'lint'))) {
    checks.push({ name: 'lint', cmd: 'npm run lint' });
  }

  if (hasPy && (await hasPytest(root))) {
    checks.push({ name: 'pytest', cmd: 'pytest' });
  }

  if (hasJava && (await exists(path.join(root, 'pom.xml')))) {
    checks.push({ name: 'mvn test', cmd: 'mvn test' });
  }

  if (checks.length === 0) {
    socket.emit('agent:verify', { stream: 'info', text: 'No verification steps configured.\n' });
    return;
  }

  for (const check of checks) {
    socket.emit('agent:verify', { stream: 'info', text: `Running ${check.name}...\n` });
    try {
      const { stdout, stderr } = await execAsync(check.cmd, { cwd: root, timeout: 60000 });
      if (stdout) socket.emit('agent:verify', { stream: 'stdout', text: stdout });
      if (stderr) socket.emit('agent:verify', { stream: 'stderr', text: stderr });
      socket.emit('agent:verify', { stream: 'info', text: `${check.name} completed.\n` });
    } catch (err) {
      socket.emit('agent:verify', {
        stream: 'stderr',
        text: `${check.name} failed: ${err.message}\n`,
      });
    }
  }
}

async function hasNpmScript(root, scriptName) {
  try {
    const pkgPath = path.join(root, 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    return Boolean(pkg.scripts && pkg.scripts[scriptName]);
  } catch {
    return false;
  }
}

async function hasPytest(root) {
  if (await exists(path.join(root, 'pytest.ini'))) return true;
  if (await exists(path.join(root, 'pyproject.toml'))) return true;
  try {
    const req = await fs.readFile(path.join(root, 'requirements.txt'), 'utf-8');
    return req.includes('pytest');
  } catch {
    return false;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
