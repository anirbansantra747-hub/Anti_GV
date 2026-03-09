# 📋 Anti_GV — Team Rules & Change Log

> Write it down. Every time. No exceptions.

---

## 🚨 Ground Rules

### Who Owns What (Don't Touch Someone Else's Code Without Asking)

> **If you need to change a file you don't own → message in the group. Don't just do it.**

---

### Branch Workflow (Follow This Exactly)

```
1. git checkout development
2. git pull origin development
3. git checkout -b feature/<scope>-<name>
4. Write code → test locally (pnpm dev) → commit
5. git push origin feature/<scope>-<name>
6. Open PR: feature branch → development
7. Wait for CI ✅ + 1 teammate review → Merge (squash)
8. When development is stable → PR to main (all 3 approve)
```

**Scopes:** `ai` · `fs` · `runner` · `ui` · `shared` · `infra`

### Commit Messages

```
feat(ai): add intent classifier
fix(runner): handle Judge0 timeout
docs(shared): update socket events
refactor(fs): extract memfs wrapper
chore(infra): update CI pipeline
```

### Before You Push

- [ ] `pnpm dev` runs without errors
- [ ] No hardcoded socket events (use `@antigv/shared`)
- [ ] Commit message follows format: `type(scope): description`
- [ ] Updated this file if you changed anything significant
- [ ] No `.env` secrets in your commit

### Don't Do This

- ❌ Push directly to `main` or `development`
- ❌ Edit files you don't own without asking
- ❌ Blind vibe-code — test before commit, read errors before pushing
- ❌ Install packages from inside app folders — use `pnpm add <pkg> --filter @antigv/web` from ROOT
- ❌ Hardcode event names, API URLs, or magic numbers
- ❌ Commit `node_modules`, `.env`, or build output

---

## 📝 Change Log

New entries at **top**. Format:

```
### YYYY-MM-DD — [SCOPE] Title
**Who:** Name | **Branch:** feature/xxx
**What:** What + why. **Breaking?** Yes/No.
**Teammates:** anything they need to do.
```

---

### 2026-03-01 — [INFRA] Initial Monorepo Setup

**Who:** Anirban | **Branch:** main (initial commit)
**What:** Initialized pnpm monorepo with Turborepo. Created `@antigv/web`, `@antigv/server`, `@antigv/shared`, `@antigv/ai-core`. CI/CD, Husky, shared constants.
**Breaking?** No — first commit.
**Teammates:** `pnpm install` from root. Copy `apps/server/.env.example` → `.env`.

---
### 2026-03-03 — [FS] Module 1: V3 File System Runtime — All 6 Phases

**Who:** Teammate 1 (Soumadeep) | **Branch:** `feature/module-1-filesystem` ← `development`
**What:** Full implementation of the V3 Transactional Workspace Runtime for Module 1.
- **Phase 1** — Core contracts (`WorkspaceContracts.js`), `BlobStore` (SHA-256 deduplication), `MemfsService` (O(1) nested Map FS), `SnapshotService` (Merkle hashing + path-copying)
- **Phase 2** — `EventBus` (Pub/Sub), `WorkspaceMachine` (state machine: IDLE → AI_PENDING → DIFF_REVIEW → COMMITTING), `EditorStore` (Zustand tabs/dirty), `PersistenceService` (3s debounced IDB write), `CrashRecovery` (Web Lock-gated IDB hydration)
- **Phase 3** — `DiffService` (Shadow Trees, O(depth) path-copying, full tx lifecycle), `ContextService` (LLM prompt builder), `DiffViewer.jsx` (Monaco side-by-side diff UI with Accept/Reject)
- **Phase 4** — `TabSyncService` (BroadcastChannel master/slave election), `RemoteSync` (differential Tier 3 blob push), `ConflictResolver` (structural tree diff + merge decisions), `LargeFile` guard (>2MB streaming SHA-256)
- **Phase 5** — `FsErrors` (6 typed error classes with codes + remedies), `FsGuard` (authority enforcement: path safety + module permissions + state check), `IntegrityService` (60s Merkle re-computation), `SnapshotGC` (max-20 cap + orphaned blob eviction), `fsIntegration.test.js` (7 ADR end-to-end tests)
- **Phase 6** — `FileSystemAPI` (sole public facade for all external modules), `FsSubscriptions` (event hooks), `ContextSnapshotAPI` (token-budget-aware LLM context), `ModulePermissions` (per-module registry), `FileWatcher` (hash-diffed watcher), `Bootstrap` (startup sequence wired to `main.jsx`)

**Breaking?** No — all new files under `apps/web/src/`. Updated `main.jsx` to run `bootstrap()` before React mount.
**Teammates:** No `pnpm install` needed (all packages already in `apps/web/package.json`). Other modules **must** import from `fileSystemAPI`, `fsSubscriptions`, `contextSnapshotAPI`, or `fileWatcher` — **never** directly from `memfsService` or `blobStore`.

---

### 2026-03-04 — [AI] LLM Clients & Router

**Who:** Anirban | **Branch:** feature/ai-llm-clients
**What:** Created placeholder files for Groq, Cerebras, and Gemini API clients, plus `llmRouter.js` and `streamHandler.js`. No actual API integration yet.
**Breaking?** No.
**Teammates:** None — placeholders only.

---

### 2026-03-07 — [FS] Full Architecture Review & Fix Pass (P0–P3)

**Who:** Teammate 1 (Soumadeep) | **Branch:** `fix/fs-architecture-review` ← `development`
**What:** Reviewed the entire FS runtime for production readiness. Fixed 9 issues across 13 files.

#### P0 — Critical (data-loss bugs)
- **Monkey-patch fix** (`fileSystemStore.js`) — Store was replacing `memfs._triggerWorkspaceUpdate`, silently killing `FS_MUTATED` events and breaking auto-persistence to IndexedDB. Now subscribes to `FS_MUTATED` via the EventBus instead.
- **Renamed misleading `*Sync` methods** (`memfsService.js` + 8 callers) — `readFileSync` → `readFile`, `writeFileSync` → `writeFile`, `mkdirSync` → `mkdir`, `readdirSync` → `readdir`, `unlinkSync` → `unlink`, `existsSync` → `exists`. All were async (returning Promises) despite the `Sync` suffix.
  - Updated: `fileSystemAPI.js`, `contextService.js`, `contextSnapshotAPI.js`, `fileWatcher.js`, `storage.test.js`, `fsIntegration.test.js`

#### P1 — Important (missing features & memory)
- **Atomic `rename()`** — Added `memfs.rename(oldPath, newPath)` + `fileSystemAPI.renameFile()` facade
- **BlobStore GC** (`blobStore.js`) — Added `incRef()`/`decRef()` reference counting, 100 MB size cap, `gc()` sweep for zero-ref blobs. Wired into `memfsService.writeFile` (old blob decRef on overwrite) and `memfsService.unlink` (recursive `_decRefTree`)
- **`streamingHash` fix** (`largefile.js`) — Was chunking the buffer then merging it back (doubling memory for no reason). Now passes buffer directly to `crypto.subtle.digest()`

#### P2 — Moderate (subscription quality)
- **Path-aware `FS_MUTATED`** — `_triggerWorkspaceUpdate` now includes `changedPath` in the event payload. `fsSubscriptions.onFileChanged` filters by path match, eliminating unnecessary re-renders

#### P3 — Safety (EventBus hardening)
- **Throttle** (`eventBus.js`) — `FS_MUTATED` capped at ~60fps (16ms interval) with trailing emit to guarantee last value delivery
- **Circuit Breaker** (`eventBus.js`) — 1s sliding window, max 50 emits/sec per event. Trips → suppresses that event for 2s + logs `console.error`. Auto-resets after cooldown

#### Documentation
- **`README.md`** — Updated all 6 public API method names + added `memfs.rename()` (item #7)
- **`hld_architecture.html`** — Updated 5 old method references (create file flow, delete flow, editor open, AI context builder, AI accept patch)

**Files touched (13):** `memfsService.js`, `fileSystemStore.js`, `fileSystemAPI.js`, `blobStore.js`, `largefile.js`, `eventBus.js`, `fsSubscriptions.js`, `contextService.js`, `contextSnapshotAPI.js`, `fileWatcher.js`, `storage.test.js`, `fsIntegration.test.js`, `README.md`, `hld_architecture.html`

**Breaking?** Yes — **method names changed.** Any code calling `memfs.readFileSync()` etc. must switch to `memfs.readFile()`. All known callers are already updated.
**Teammates:** Search your code for `readFileSync`, `writeFileSync`, `mkdirSync`, `readdirSync`, `unlinkSync`, `existsSync` — if you call these directly on `memfs`, rename them (drop the `Sync` suffix). If you only use `fileSystemAPI`, you're unaffected.

---