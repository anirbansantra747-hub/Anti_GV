/**
 * @file errorParser.js
 * @description Parses stderr from Piston API responses into structured error marker arrays.
 *
 * Supported error styles:
 *   - 'gcc'     — GCC/G++/Clang/C# (mono): "file.c:10:5: error: message"
 *   - 'javac'   — Java/Kotlin: "Main.java:10: error: message" or javac-style
 *   - 'python'  — Python: "  File "x.py", line 10\n    code\nError: msg"
 *   - 'go'      — Go: "./main.go:10:5: message"
 *   - 'rust'    — Rust: "error[Exxxx]: message\n  --> src/main.rs:10:5"
 *   - 'generic' — Best-effort line-number extraction
 *
 * Returns an array of ErrorMarker objects:
 * { line: number, col: number, message: string, severity: 'error'|'warning' }
 */

/**
 * @typedef {Object} ErrorMarker
 * @property {number} line       — 1-indexed line number
 * @property {number} col        — 1-indexed column number (0 if unknown)
 * @property {string} message    — Human-readable error description
 * @property {'error'|'warning'} severity
 */

/**
 * Parse stderr into an array of error markers.
 *
 * @param {string} stderr     — Raw stderr string from Piston
 * @param {string} errorStyle — One of: 'gcc'|'javac'|'python'|'go'|'rust'|'generic'
 * @returns {ErrorMarker[]}
 */
export function parseErrors(stderr, errorStyle = 'generic') {
  if (!stderr || !stderr.trim()) return [];

  switch (errorStyle) {
    case 'gcc':
      return _parseGcc(stderr);
    case 'javac':
      return _parseJavac(stderr);
    case 'python':
      return _parsePython(stderr);
    case 'go':
      return _parseGo(stderr);
    case 'rust':
      return _parseRust(stderr);
    default:
      return _parseGeneric(stderr);
  }
}

// ── GCC / G++ / Clang / Mono ─────────────────────────────────
// Format: "filename:line:col: (error|warning|note): message"
function _parseGcc(stderr) {
  const markers = [];
  // Match: something.c:10:5: error: undefined reference to 'foo'
  const re = /^[^:]+:(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/gim;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    const [, line, col, type, msg] = m;
    if (type === 'note') continue; // skip notes
    markers.push({
      line: parseInt(line, 10),
      col: parseInt(col, 10),
      message: msg.trim(),
      severity: type === 'warning' ? 'warning' : 'error',
    });
  }
  return markers.length ? markers : _parseGeneric(stderr);
}

// ── Java / Kotlin ─────────────────────────────────────────────
// Format: "Main.java:10: error: ';' expected"
function _parseJavac(stderr) {
  const markers = [];
  const re = /^[^:]+:(\d+):\s*(error|warning):\s*(.+)$/gim;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    const [, line, type, msg] = m;
    markers.push({
      line: parseInt(line, 10),
      col: 0,
      message: msg.trim(),
      severity: type === 'warning' ? 'warning' : 'error',
    });
  }
  return markers.length ? markers : _parseGeneric(stderr);
}

// ── Python ────────────────────────────────────────────────────
// Format: "  File "code.py", line 10\n    code_line\nSyntaxError: message"
function _parsePython(stderr) {
  const markers = [];

  // SyntaxError + Traceback lines
  const lineRe = /File "[^"]+",\s*line\s+(\d+)/gim;
  const lines = [];
  let m;
  while ((m = lineRe.exec(stderr)) !== null) {
    lines.push(parseInt(m[1], 10));
  }

  // Extract the final error message (last non-empty line after traceback)
  const errorMsgMatch = stderr.match(/^([A-Za-z][A-Za-z0-9_]*(?:Error|Exception|Warning)[^\n]*)/m);
  const msg = errorMsgMatch ? errorMsgMatch[1].trim() : stderr.trim().split('\n').pop().trim();

  if (lines.length > 0) {
    for (const line of lines) {
      markers.push({ line, col: 0, message: msg, severity: 'error' });
    }
  } else if (msg) {
    markers.push({ line: 1, col: 0, message: msg, severity: 'error' });
  }

  return markers;
}

// ── Go ─────────────────────────────────────────────────────────
// Format: "./main.go:10:5: undefined: foo"
function _parseGo(stderr) {
  const markers = [];
  const re = /^[^:]+:(\d+):(\d+):\s*(.+)$/gim;
  let m;
  while ((m = re.exec(stderr)) !== null) {
    const [, line, col, msg] = m;
    markers.push({
      line: parseInt(line, 10),
      col: parseInt(col, 10),
      message: msg.trim(),
      severity: 'error',
    });
  }
  return markers.length ? markers : _parseGeneric(stderr);
}

// ── Rust ──────────────────────────────────────────────────────
// Format: "error[E0308]: ...\n  --> src/main.rs:10:5"
function _parseRust(stderr) {
  const markers = [];
  // Capture "error: msg" lines then look for "-->" location hints
  const blockRe =
    /(error(?:\[E\d+\])?|warning(?:\[.*?\])?):\s*([^\n]+)\n(?:\s*-->\s*[^:]+:(\d+):(\d+))?/gim;
  let m;
  while ((m = blockRe.exec(stderr)) !== null) {
    const [, type, msg, line, col] = m;
    markers.push({
      line: line ? parseInt(line, 10) : 1,
      col: col ? parseInt(col, 10) : 0,
      message: msg.trim(),
      severity: type.startsWith('warning') ? 'warning' : 'error',
    });
  }
  return markers.length ? markers : _parseGeneric(stderr);
}

// ── Generic fallback ──────────────────────────────────────────
// Tries to find any "line N" or ":N:" pattern in the output
function _parseGeneric(stderr) {
  const markers = [];
  const lineRef = /(?:line|Line)\s+(\d+)/g;
  const colonRef = /:(\d+)(?::(\d+))?:/g;

  const msg =
    stderr
      .trim()
      .split('\n')
      .find((l) => l.trim()) || stderr.trim();

  let m;
  // prefer "line N" style
  while ((m = lineRef.exec(stderr)) !== null) {
    markers.push({ line: parseInt(m[1], 10), col: 0, message: msg, severity: 'error' });
  }
  if (markers.length) return _dedup(markers);

  // fallback to ":N:M:" style
  while ((m = colonRef.exec(stderr)) !== null) {
    markers.push({
      line: parseInt(m[1], 10),
      col: m[2] ? parseInt(m[2], 10) : 0,
      message: msg,
      severity: 'error',
    });
  }
  if (markers.length) return _dedup(markers);

  // last resort: return a single message at line 1
  if (msg) {
    return [{ line: 1, col: 0, message: msg, severity: 'error' }];
  }
  return [];
}

function _dedup(markers) {
  const seen = new Set();
  return markers.filter((m) => {
    const key = `${m.line}:${m.col}:${m.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
