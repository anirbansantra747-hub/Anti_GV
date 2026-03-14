/**
 * @file dependencyGraph.js
 * @description Build dependency graph from file index metadata.
 */

import path from 'path';
import FileIndex from '../db/fileIndexModel.js';
import { isConnected } from '../db/dbService.js';

const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

export async function getImpactedFiles(workspaceId, targetFile, options = {}) {
  if (!isConnected()) return [];
  if (!workspaceId || !targetFile) return [];

  const maxDepth = options.maxDepth ?? 2;
  const limit = options.limit ?? 20;

  const indexes = await FileIndex.find({ workspaceId }).lean();
  if (!indexes || indexes.length === 0) return [];

  const fileSet = new Set(indexes.map((i) => normalizePath(i.filePath)));
  const reverse = new Map();

  for (const entry of indexes) {
    const fromFile = normalizePath(entry.filePath);
    const imports = entry.imports || [];
    for (const spec of imports) {
      const resolved = resolveImport(fromFile, spec, fileSet, entry.language || '');
      if (!resolved) continue;
      const toFile = normalizePath(resolved);
      if (!reverse.has(toFile)) reverse.set(toFile, new Set());
      reverse.get(toFile).add(fromFile);
    }
  }

  const impacted = new Set();
  const queue = [{ file: normalizePath(targetFile), depth: 0 }];

  while (queue.length > 0 && impacted.size < limit) {
    const { file, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    const dependents = reverse.get(file);
    if (!dependents) continue;

    for (const dep of dependents) {
      if (dep === normalizePath(targetFile)) continue;
      if (impacted.has(dep)) continue;
      impacted.add(dep);
      queue.push({ file: dep, depth: depth + 1 });
      if (impacted.size >= limit) break;
    }
  }

  return Array.from(impacted);
}

export async function getDependencies(workspaceId, targetFile, options = {}) {
  if (!isConnected()) return [];
  if (!workspaceId || !targetFile) return [];

  const limit = options.limit ?? 20;
  const indexes = await FileIndex.find({ workspaceId }).lean();
  if (!indexes || indexes.length === 0) return [];

  const fileSet = new Set(indexes.map((i) => normalizePath(i.filePath)));
  const target = normalizePath(targetFile);
  const entry = indexes.find((i) => normalizePath(i.filePath) === target);
  if (!entry) return [];

  const deps = new Set();
  for (const spec of entry.imports || []) {
    const resolved = resolveImport(target, spec, fileSet, entry.language || '');
    if (resolved) deps.add(normalizePath(resolved));
    if (deps.size >= limit) break;
  }

  return Array.from(deps);
}

function resolveImport(fromFile, spec, fileSet, language) {
  if (!spec || typeof spec !== 'string') return null;

  if (language === 'python') {
    return resolvePythonImport(fromFile, spec, fileSet);
  }

  if (language === 'java') {
    // TODO: add Java package resolver. For now, skip non-relative.
    if (spec.startsWith('.') || spec.startsWith('/')) {
      return resolveRelativeImport(fromFile, spec, fileSet);
    }
    return null;
  }

  // Default: JS/TS resolution
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return resolveRelativeImport(fromFile, spec, fileSet);
  }

  return null;
}

function resolveRelativeImport(fromFile, spec, fileSet) {
  const baseDir = path.posix.dirname(fromFile);
  const raw = spec.startsWith('/') ? spec : path.posix.resolve(baseDir, spec);
  const normalized = normalizePath(raw);

  if (hasExtension(normalized)) {
    if (fileSet.has(normalized)) return normalized;
    return null;
  }

  const candidates = [];
  for (const ext of JS_EXTENSIONS) {
    candidates.push(normalized + ext);
  }
  for (const ext of JS_EXTENSIONS) {
    candidates.push(path.posix.join(normalized, 'index' + ext));
  }

  for (const c of candidates) {
    if (fileSet.has(c)) return c;
  }

  return null;
}

function resolvePythonImport(fromFile, spec, fileSet) {
  const baseDir = path.posix.dirname(fromFile);

  // relative imports: .foo or ..foo
  const relMatch = spec.match(/^(\.+)(.*)$/);
  if (relMatch) {
    const dots = relMatch[1].length;
    const rest = (relMatch[2] || '').replace(/^\./, '');
    const levelsUp = Math.max(dots - 1, 0);
    let dir = baseDir;
    for (let i = 0; i < levelsUp; i++) dir = path.posix.dirname(dir);
    const modulePath = rest ? path.posix.join(dir, rest.replace(/\./g, '/')) : dir;
    return resolvePythonModule(modulePath, fileSet);
  }

  // absolute module path
  const modulePath = '/' + spec.replace(/\./g, '/');
  return resolvePythonModule(modulePath, fileSet);
}

function resolvePythonModule(modulePath, fileSet) {
  const direct = normalizePath(modulePath + '.py');
  if (fileSet.has(direct)) return direct;

  const initFile = normalizePath(path.posix.join(modulePath, '__init__.py'));
  if (fileSet.has(initFile)) return initFile;

  return null;
}

function hasExtension(filePath) {
  return path.posix.extname(filePath).length > 0;
}

function normalizePath(p) {
  if (!p) return p;
  const withSlashes = p.replace(/\\/g, '/');
  return withSlashes.startsWith('/') ? withSlashes : '/' + withSlashes;
}
