import test from 'tape';
import { memfs } from '../src/services/memfsService.js';
import { blobStore } from '../src/services/blobStore.js';

test('Core V3 Storage Mechanics', async (t) => {
  t.plan(4);

  const testContent = 'const x = 42;';

  // 1. Initial State
  t.equal(memfs.exists('/src/main.js'), false, 'File should not exist initially');

  // 2. Write File
  await memfs.writeFile('/src/main.js', testContent);
  t.equal(memfs.exists('/src/main.js'), true, 'File should exist after writing');

  // 3. Verify Content Retrieval via MemFS
  const readContent = await memfs.readFile('/src/main.js');
  t.equal(readContent, testContent, 'Read content matches written content');

  // 4. Verify Identity-as-Hash deduplication in the BlobStore
  const nodeLoc = memfs._traverse('/src/main.js', false);
  const fileNode = nodeLoc.parentNode.children.get(nodeLoc.nodeName);

  const blobInfo = await blobStore.put(testContent);

  t.equal(
    fileNode.blobId,
    blobInfo.blobId,
    'FileNode blobId correctly maps to the dedicated BlobStore hash'
  );
});
