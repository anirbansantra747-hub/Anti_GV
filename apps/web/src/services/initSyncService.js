import { memfs } from './memfsService.js';
import { snapshotStore } from './snapshotService.js';
import { bus, Events } from './eventBus.js';
import { blobStore } from './blobStore.js';
import { loadFromIDB } from './persistenceService.js';
import { resetWorkspace } from './workspaceReset.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Perform an HTTP sync to fetch the true real disk state before we turn on integrity checking.
 * This ensures the memory tree matches exactly what is on disk, avoiding phantom crashes.
 */
export async function syncRealDiskToMemfs(opts = {}) {
  const { preferIDB = true, reset = true } = opts;
  try {
    if (reset) resetWorkspace();

    if (preferIDB) {
      const isHydrated = await loadFromIDB();
      if (isHydrated) {
        const rootHash = await snapshotStore.computeTreeHash(memfs.workspace.root);
        memfs.workspace.version = rootHash;
        console.log(`[InitSync] Hydrated memfs from IDB. Root hash = ${rootHash.slice(0, 8)}`);
        return true;
      }
    }

    const res = await fetch(`${API_URL}/api/fs/list?path=.&recursive=true`);
    if (!res.ok) throw new Error('Failed to fetch fs list');

    const data = await res.json();
    if (!data.success || !data.items) return false;

    // 1. We clear out memfs to avoid duplicates
    memfs.workspace.root = {
      type: 'dir',
      id: 'root',
      name: '/',
      children: new Map(),
    };

    // 2. Hydrate from flat list
    for (const item of data.items) {
      if (item.type === 'dir' || item.isDirectory) {
        memfs.mkdir(item.path, { recursive: true }, 'SYNC');
      } else {
        // We write "stubs" for files — we don't fetch their content yet.
        // The editor will lazy-load via sockets.
        // We need a dummy blob for the architecture.
        const hashStr = `stub-${Date.now()}`;
        blobStore.blobs.set(hashStr, new ArrayBuffer(0)); // empty content stub

        const loc = memfs._traverse(item.path, true);
        if (loc) {
          loc.parentNode.children.set(loc.nodeName, {
            type: 'file',
            id: crypto.randomUUID(),
            name: loc.nodeName,
            hash: `FILE|${hashStr}`,
            blobId: hashStr,
            binary: false,
          });
        }
      }
    }

    // 3. Compute final initial hash so IntegrityService doesn't crash us
    const rootHash = await snapshotStore.computeTreeHash(memfs.workspace.root);
    memfs.workspace.version = rootHash;

    console.log(`[InitSync] Hydrated memfs from real disk. Root hash = ${rootHash.slice(0, 8)}`);

    // 4. Force UI update
    bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, path: null });

    return true;
  } catch (err) {
    console.error('[InitSync] Failed to sync disk to memfs:', err);
    return false;
  }
}
