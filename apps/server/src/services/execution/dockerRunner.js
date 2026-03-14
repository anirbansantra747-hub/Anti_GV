/**
 * @file dockerRunner.js
 * @description Generic Docker-based code execution and linting for all supported languages.
 *
 * Exports:
 *   RUNNER_CONFIG  — per-language run configuration (keyed by file extension)
 *   LINTER_CONFIG  — per-language lint configuration (keyed by file extension)
 *   runInDocker(ext, code, stdin?, timeoutMs?) → { stdout, stderr, exitCode, runTime }
 *   lintInDocker(ext, code) → ErrorMarker[]
 *
 * Security controls applied to every container:
 *   --network none   — no outbound access
 *   --read-only      — immutable root FS
 *   --tmpfs /tmp     — writable JVM/compiler scratch (64 MB, exec-allowed)
 *   --memory / --cpus — resource cap from env
 *   USER runner      — non-root, baked into each image
 *   --rm             — auto-deleted on exit
 */

import { spawn } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseLintOutput } from './errorParser.js';
import dotenv from 'dotenv';
dotenv.config();

const TIMEOUT_MS = parseInt(process.env.DOCKER_RUN_TIMEOUT_MS || '10000', 10);
const MEMORY = process.env.DOCKER_MEMORY_LIMIT || '256m';
const CPUS = process.env.DOCKER_CPU_LIMIT || '0.5';

const img = (envKey, fallback) => () => process.env[envKey] || fallback;

// ── Runner configuration (keyed by file extension) ────────────────────────

export const RUNNER_CONFIG = {
  // ── JVM ──────────────────────────────────────────────────────────────────
  java: {
    image: img('DOCKER_JAVA_IMAGE', 'antigv-java-runner:latest'),
    filename: 'Main.java',
    cmd: 'javac /sandbox/Main.java -d /tmp 2>&1 >&2 && java -cp /tmp Main',
  },
  kt: {
    image: img('DOCKER_KOTLIN_IMAGE', 'antigv-kotlin-runner:latest'),
    filename: 'Main.kt',
    cmd: 'kotlinc /sandbox/Main.kt -include-runtime -d /tmp/main.jar 2>&1 >&2 && java -jar /tmp/main.jar',
  },

  // ── Node / Web ────────────────────────────────────────────────────────────
  js: {
    image: img('DOCKER_NODE_IMAGE', 'antigv-node-runner:latest'),
    filename: 'code.js',
    cmd: 'node /sandbox/code.js',
  },
  ts: {
    image: img('DOCKER_NODE_IMAGE', 'antigv-node-runner:latest'),
    filename: 'code.ts',
    cmd: 'tsc --outDir /tmp --target es2022 --module commonjs /sandbox/code.ts && node /tmp/code.js',
  },

  // ── Python ────────────────────────────────────────────────────────────────
  py: {
    image: img('DOCKER_PYTHON_IMAGE', 'antigv-python-runner:latest'),
    filename: 'code.py',
    cmd: 'python3 /sandbox/code.py',
  },

  // ── C / C++ ───────────────────────────────────────────────────────────────
  c: {
    image: img('DOCKER_GCC_IMAGE', 'antigv-gcc-runner:latest'),
    filename: 'code.c',
    cmd: 'gcc /sandbox/code.c -o /tmp/code && /tmp/code',
  },
  cpp: {
    image: img('DOCKER_GCC_IMAGE', 'antigv-gcc-runner:latest'),
    filename: 'code.cpp',
    cmd: 'g++ /sandbox/code.cpp -o /tmp/code && /tmp/code',
  },
  cc: {
    image: img('DOCKER_GCC_IMAGE', 'antigv-gcc-runner:latest'),
    filename: 'code.cpp',
    cmd: 'g++ /sandbox/code.cpp -o /tmp/code && /tmp/code',
  },

  // ── Go ───────────────────────────────────────────────────────────────────
  go: {
    image: img('DOCKER_GO_IMAGE', 'antigv-go-runner:latest'),
    filename: 'main.go',
    cmd: 'cp /sandbox/main.go /tmp/ && cd /tmp && go run main.go',
  },

  // ── Rust ─────────────────────────────────────────────────────────────────
  rs: {
    image: img('DOCKER_RUST_IMAGE', 'antigv-rust-runner:latest'),
    filename: 'main.rs',
    cmd: 'rustc /sandbox/main.rs -o /tmp/main && /tmp/main',
  },

  // ── Ruby ─────────────────────────────────────────────────────────────────
  rb: {
    image: img('DOCKER_RUBY_IMAGE', 'antigv-ruby-runner:latest'),
    filename: 'code.rb',
    cmd: 'ruby /sandbox/code.rb',
  },

  // ── PHP ──────────────────────────────────────────────────────────────────
  php: {
    image: img('DOCKER_PHP_IMAGE', 'antigv-php-runner:latest'),
    filename: 'code.php',
    cmd: 'php /sandbox/code.php',
  },

  // ── C# (.NET) ─────────────────────────────────────────────────────────────
  cs: {
    image: img('DOCKER_DOTNET_IMAGE', 'antigv-dotnet-runner:latest'),
    filename: 'Program.cs',
    // Copies the pre-restored template, injects user code, and runs without re-restoring
    cmd: 'cp -r /template/runner /tmp/runner && cp /sandbox/Program.cs /tmp/runner/Program.cs && cd /tmp/runner && dotnet run --no-restore',
  },

  // ── Bash / Shell ──────────────────────────────────────────────────────────
  sh: {
    image: img('DOCKER_BASH_IMAGE', 'antigv-bash-runner:latest'),
    filename: 'script.sh',
    cmd: 'bash /sandbox/script.sh',
  },
};

// ── Linter configuration (keyed by file extension) ────────────────────────
// Each entry optionally provides `extraFiles` written alongside the source.

const _eslintRc = (extra = {}) =>
  JSON.stringify({
    env: { es2022: true, node: true, browser: true },
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { 'no-unused-vars': 'warn', 'no-undef': 'warn', eqeqeq: 'warn', semi: 'warn' },
    ...extra,
  });

const _tsEslintRc = JSON.stringify({
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'warn',
    'no-undef': 'off', // TS handles this
    semi: 'warn',
  },
});

export const LINTER_CONFIG = {
  js: {
    image: img('DOCKER_NODE_IMAGE', 'antigv-node-runner:latest'),
    filename: 'code.js',
    extraFiles: [{ name: '.eslintrc.json', content: _eslintRc() }],
    cmd: 'eslint -c /sandbox/.eslintrc.json --format json /sandbox/code.js',
    parser: 'eslint',
  },
  ts: {
    image: img('DOCKER_NODE_IMAGE', 'antigv-node-runner:latest'),
    filename: 'code.ts',
    extraFiles: [{ name: '.eslintrc.json', content: _tsEslintRc }],
    cmd: 'eslint -c /sandbox/.eslintrc.json --format json /sandbox/code.ts',
    parser: 'eslint',
  },
  py: {
    image: img('DOCKER_PYTHON_IMAGE', 'antigv-python-runner:latest'),
    filename: 'code.py',
    extraFiles: [],
    cmd: 'pylint --output-format=json /sandbox/code.py',
    parser: 'pylint',
  },
  go: {
    image: img('DOCKER_GO_IMAGE', 'antigv-go-runner:latest'),
    filename: 'main.go',
    extraFiles: [],
    cmd: 'cp /sandbox/main.go /tmp/ && cd /tmp && go vet ./... 2>&1',
    parser: 'go',
  },
};

// ── Shared sandbox helper ─────────────────────────────────────────────────

/**
 * Create a temp dir, write files, run callback, always clean up.
 */
async function _withSandbox(files, cb) {
  const tempDir = await mkdtemp(join(tmpdir(), 'antigv-'));
  try {
    await Promise.all(
      files.map(({ name, content }) => writeFile(join(tempDir, name), content, 'utf8'))
    );
    return await cb(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Docker execution helper ───────────────────────────────────────────────

function _dockerArgs(image, mountPath) {
  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,exec,size=64m',
    '--memory',
    MEMORY,
    '--cpus',
    CPUS,
    '--workdir',
    '/sandbox',
    '-v',
    `${mountPath}:/sandbox:ro`,
    '-i',
    image,
    'sh',
    '-c',
  ];
}

/** Convert a Windows absolute path to a Docker-Desktop-compatible mount path. */
function _toMountPath(p) {
  return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
}

function _spawnWithTimeout(cmd, args, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    if (stdin) proc.stdin.write(stdin);
    proc.stdin.end();

    proc.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    proc.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          stdout,
          stderr: stderr + `\n[Timed out after ${timeoutMs}ms — process killed]`,
          exitCode: 124,
        });
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('Docker is not installed or not running. Please start Docker Desktop.'));
      } else {
        reject(err);
      }
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Run source code in a sandboxed Docker container.
 * @param {string} ext        - File extension key (e.g. 'java', 'py', 'js')
 * @param {string} code       - Source code
 * @param {string} [stdin]    - Optional stdin
 * @param {number} [timeoutMs]
 * @returns {Promise<{stdout, stderr, exitCode, runTime}>}
 */
export async function runInDocker(ext, code, stdin = '', timeoutMs = TIMEOUT_MS) {
  const cfg = RUNNER_CONFIG[ext];
  if (!cfg) throw new Error(`No Docker runner configured for extension: "${ext}"`);

  const image = cfg.image();
  const start = Date.now();

  const result = await _withSandbox([{ name: cfg.filename, content: code }], async (tempDir) => {
    const mountPath = _toMountPath(tempDir);
    const args = [..._dockerArgs(image, mountPath), cfg.cmd];
    return _spawnWithTimeout('docker', args, stdin, timeoutMs);
  });

  return { ...result, runTime: Date.now() - start };
}

/**
 * Lint source code and return structured error markers.
 * @param {string} ext   - File extension key (e.g. 'js', 'py')
 * @param {string} code  - Source code
 * @returns {Promise<import('./errorParser.js').ErrorMarker[]>}
 */
export async function lintInDocker(ext, code) {
  const cfg = LINTER_CONFIG[ext];
  if (!cfg) return []; // no linter defined → silently return empty

  const image = cfg.image();
  const files = [{ name: cfg.filename, content: code }, ...(cfg.extraFiles || [])];

  const { stdout, stderr, exitCode } = await _withSandbox(files, async (tempDir) => {
    const mountPath = _toMountPath(tempDir);
    const args = [..._dockerArgs(image, mountPath), cfg.cmd];
    return _spawnWithTimeout('docker', args, '', TIMEOUT_MS);
  });

  // ESLint exits 1 on lint warnings/errors — that's expected, not a crash
  const raw = cfg.parser === 'eslint' ? stdout : stdout + stderr;
  return parseLintOutput(raw, cfg.parser, exitCode);
}
