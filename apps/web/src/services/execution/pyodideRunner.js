/**
 * @file pyodideRunner.js
 * @description Runs Python code in-browser using Pyodide (Python WASM).
 * Lazy-loads Pyodide from CDN on first use.
 *
 * Supports optional `stdin` string — the entire string is provided as input
 * to the Python `input()` builtin via a custom readline implementation.
 */

let pyodideInstance = null;
let pyodideLoading = null;

/**
 * Load + initialize Pyodide once.
 * @returns {Promise<object>} Pyodide instance
 */
async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = new Promise(async (resolve, reject) => {
    try {
      // Lazy inject Pyodide CDN script if not already present
      if (!window.loadPyodide) {
        await new Promise((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
          script.onload = res;
          script.onerror = rej;
          document.head.appendChild(script);
        });
      }

      const pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
      });
      pyodideInstance = pyodide;
      resolve(pyodide);
    } catch (err) {
      pyodideLoading = null;
      reject(err);
    }
  });

  return pyodideLoading;
}

/**
 * Execute Python code using Pyodide WASM.
 * @param {string} code - Python code to run.
 * @param {function(string): void} onOutput - Callback for captured stdout/stderr lines.
 * @param {function(number): void} [onExit] - Callback for exit code (0 or 1).
 * @param {string} [stdin] - Optional multi-line stdin string. Each newline-delimited
 *                           segment becomes one call to `input()`.
 */
export async function runInPyodide(code, onOutput, onExit, stdin = '') {
  try {
    onOutput('\x1b[36m▶ Loading Pyodide (Python WASM)...\x1b[0m\r\n');
    const pyodide = await getPyodide();
    onOutput('\x1b[36m▶ Running Python...\x1b[0m\r\n');

    // ── Redirect stdout/stderr to our callback ────────────────
    pyodide.runPython(`
import sys
from io import StringIO
_captured_output = StringIO()
sys.stdout = _captured_output
sys.stderr = _captured_output
`);

    // ── Inject stdin support ──────────────────────────────────
    // We split the stdin string into lines and override builtins.input()
    // so each successive call to input() returns the next line.
    if (stdin && stdin.trim()) {
      const stdinLines = JSON.stringify(stdin.split('\n'));
      pyodide.runPython(`
import builtins as _builtins
_stdin_lines = ${stdinLines}
_stdin_idx = 0

def _fake_input(prompt=''):
    global _stdin_idx
    if _stdin_idx < len(_stdin_lines):
        val = _stdin_lines[_stdin_idx]
        _stdin_idx += 1
        # Echo the prompt + value to captured output
        if prompt:
            sys.stdout.write(prompt)
        sys.stdout.write(val + '\\n')
        return val
    return ''

_builtins.input = _fake_input
`);
    }

    let exitCode = 0;
    try {
      await pyodide.runPythonAsync(code);
    } catch (err) {
      pyodide.runPython(`sys.stderr.write(${JSON.stringify(String(err))})`);
      exitCode = 1;
    }

    const captured = pyodide.runPython('_captured_output.getvalue()');

    // ── Restore stdout/stderr and builtins ───────────────────
    pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
try:
    import builtins as _builtins
    _builtins.input = input  # restore original input
except Exception:
    pass
`);

    if (captured) {
      // Convert newlines to CRLF for xterm.js
      onOutput(captured.replace(/\n/g, '\r\n'));
    }

    if (exitCode === 0) {
      onOutput('\r\n\x1b[32m✓ Python exited with code 0\x1b[0m\r\n');
    } else {
      onOutput(`\r\n\x1b[31m✗ Python exited with code 1\x1b[0m\r\n`);
    }

    if (onExit) onExit(exitCode);
  } catch (err) {
    onOutput(`\r\n\x1b[31m[Pyodide Error] ${err.message}\x1b[0m\r\n`);
    if (onExit) onExit(1);
  }
}
