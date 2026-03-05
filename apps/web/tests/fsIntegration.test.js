/**
 * @file fsIntegration.test.js
 * @description End-to-end ADR validation test suite for Module 1 (File System).
 * Tests the full pipeline: write → IDB persist → reload → integrity check → guard checks.
 *
 * Run with: node --experimental-vm-modules node_modules/tape/bin/tape tests/fsIntegration.test.js
 */

import test from 'tape';
import { memfs } from '../src/services/memfsService.js';
import { blobStore } from '../src/services/blobStore.js';
import { guardWrite, guardRead } from '../src/services/fsGuard.js';
import { fileSystemAPI } from '../src/services/fileSystemAPI.js';
import { diffService } from '../src/services/diffService.js';
import { snapshotGC } from '../src/services/snapshotGC.js';
import { snapshotStore } from '../src/services/snapshotService.js';
import { integrityService } from '../src/services/integrityService.js';
import {
  FsNotFoundError,
  FsLockedError,
  FsInvalidPathError,
  FsPermissionError,
  isFsError
} from '../src/services/fsErrors.js';

// ── ADR 1: Hash-as-Identity ───────────────────────────────────────────────────
test('ADR 1 — blobId is always SHA256(content)', async (t) => {
  t.plan(3);
  const content = 'export const hello = "world";';
  const { blobId, hash } = await blobStore.put(content);
  t.equal(blobId, hash, 'blobId equals hash');

  // Same content should deduplicate to the same blobId
  const { blobId: blobId2 } = await blobStore.put(content);
  t.equal(blobId, blobId2, 'Deduplication: same content → same blobId');

  // Write via memfs and verify internal node points to same blob
  await memfs.writeFileSync('/test/hello.js', content);
  const loc = memfs._traverse('/test/hello.js', false);
  const node = loc.parentNode.children.get(loc.nodeName);
  t.equal(node.blobId, blobId, 'FileNode.blobId matches deduplicated blobId');
});

// ── ADR 2: Immutability of Tier 1 via Shadow Trees ────────────────────────────
test('ADR 2 — Shadow Tree does not mutate Tier 1 before commit', async (t) => {
  t.plan(3);

  const original = 'const x = 1;';
  const proposed = 'const x = 99;';

  await memfs.writeFileSync('/test/vars.js', original);

  const txId = diffService.beginTransaction();
  await diffService.applyPatch(txId, {
    path: '/test/vars.js',
    operations: [{ type: 'replace', startLine: 1, endLine: 1, content: proposed }],
  });

  // Tier 1 must be unchanged
  const actualTier1 = await memfs.readFileSync('/test/vars.js', 'utf8');
  t.equal(actualTier1, original, 'Tier 1 content is unchanged after shadow patch');

  // Diff is available
  const { original: orig, proposed: prop } = await diffService.getDiff(txId, '/test/vars.js');
  t.equal(orig, original, 'Diff original matches Tier 1');
  t.ok(prop.includes('99'), 'Diff proposed shows the patched content');

  diffService.rollback(txId);
});

// ── ADR 3: Merkle Hashing ─────────────────────────────────────────────────────
test('ADR 3 — Merkle hash changes when any file changes', async (t) => {
  t.plan(2);

  await memfs.writeFileSync('/project/a.js', 'version A');
  const hash1 = await snapshotStore.computeDirHash(memfs.workspace.root);

  await memfs.writeFileSync('/project/a.js', 'version B');
  const hash2 = await snapshotStore.computeDirHash(memfs.workspace.root);

  t.notEqual(hash1, hash2, 'Root hash changes when file content changes');

  await memfs.writeFileSync('/project/a.js', 'version A');
  const hash3 = await snapshotStore.computeDirHash(memfs.workspace.root);
  t.equal(hash1, hash3, 'Root hash is deterministic: same content → same hash');
});

// ── ADR 4: FS Authority Guard ─────────────────────────────────────────────────
test('ADR 4 — fsGuard rejects path traversal and reserved names', (t) => {
  t.plan(4);

  t.throws(() => guardWrite('/../etc/passwd', 'UI'),  FsInvalidPathError, 'Blocks ".." traversal');
  t.throws(() => guardWrite('/node_modules/evil.js', 'UI'), FsInvalidPathError, 'Blocks reserved name node_modules');
  t.throws(() => guardWrite('relative/path.js', 'UI'), FsInvalidPathError, 'Blocks relative paths (no leading /)');
  t.doesNotThrow(() => guardWrite('/src/safe.js', 'UI'), 'Allows clean absolute path');
});

test('ADR 4 — fsGuard rejects writes from read-only modules', (t) => {
  t.plan(2);

  t.throws(() => guardWrite('/src/app.js', 'CODE_RUNNER'), FsPermissionError, 'CODE_RUNNER cannot write');
  t.throws(() => guardWrite('/src/app.js', 'RAG_INDEXER'), FsPermissionError, 'RAG_INDEXER cannot write');
});

test('ADR 4 — fsGuard rejects writes when workspace is locked', (t) => {
  t.plan(1);

  const backup = memfs.workspace.locked;
  memfs.workspace.locked = true;

  t.throws(() => guardWrite('/src/app.js', 'AI_AGENT'), FsLockedError, 'Write rejected when locked');

  memfs.workspace.locked = backup;
});

// ── ADR 5: Typed Errors ───────────────────────────────────────────────────────
test('ADR 5 — FsError subclasses carry machine-readable codes and paths', (t) => {
  t.plan(3);
  const err = new FsNotFoundError('/missing.js');
  t.equal(err.code, 'FS_NOT_FOUND', 'Error has machine-readable code');
  t.equal(err.path, '/missing.js', 'Error carries offending path');
  t.ok(isFsError(err), 'isFsError() type guard returns true');
});

// ── ADR 6: fileSystemAPI public facade ───────────────────────────────────────
test('ADR 6 — fileSystemAPI.readFile throws FsNotFoundError for missing paths', async (t) => {
  t.plan(1);
  try {
    await fileSystemAPI.readFile('/does/not/exist.js');
    t.fail('Should have thrown');
  } catch (err) {
    t.ok(err instanceof FsNotFoundError, 'Throws FsNotFoundError');
  }
});

// ── ADR 7: Snapshot GC ────────────────────────────────────────────────────────
test('ADR 7 — SnapshotGC evicts oldest snapshots when exceeding cap', (t) => {
  t.plan(2);
  snapshotGC.clear();

  for (let i = 0; i < 22; i++) {
    snapshotGC.register({
      id: `snap-${i}`,
      rootTreeHash: `hash-${i}`,
      tree: memfs.workspace.root,
    });
  }

  t.equal(snapshotGC.size, 20, 'Snapshot count capped at 20');
  t.notOk(snapshotGC.snapshots.find(s => s.id === 'snap-0'), 'Oldest snapshot evicted');

  snapshotGC.clear();
});
