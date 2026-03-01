# 📋 Anti_GV — Team Rules & Change Log

> Write it down. Every time. No exceptions.

---

## 🚨 Ground Rules

### Who Owns What (Don't Touch Someone Else's Code Without Asking)

| Area                  | Owner            | Files (CAN touch)                             | Files (DON'T touch)                   |
| --------------------- | ---------------- | --------------------------------------------- | ------------------------------------- |
| **File System & UI**  | Teammate 1       | `apps/web/src/components/FileTree/`           | `apps/server/src/services/agent/`     |
|                       |                  | `apps/web/src/components/Editor/`             | `apps/server/src/services/rag/`       |
|                       |                  | `apps/web/src/components/Topbar/`             | `apps/server/src/services/llm/`       |
|                       |                  | `apps/web/src/stores/editorStore.js`          | `apps/web/src/components/AIPanel/`    |
|                       |                  | `apps/web/src/stores/fileSystemStore.js`      | `apps/web/src/components/Terminal/`   |
|                       |                  | `apps/web/src/services/memfsService.js`       |                                       |
|                       |                  | `apps/web/src/services/persistenceService.js` |                                       |
| **Code Runner**       | Teammate 2       | `apps/web/src/components/Terminal/`           | `apps/server/src/services/agent/`     |
|                       |                  | `apps/web/src/stores/terminalStore.js`        | `apps/server/src/services/rag/`       |
|                       |                  | `apps/web/src/services/executionService.js`   | `apps/web/src/components/FileTree/`   |
|                       |                  | `apps/server/src/services/execution/`         | `apps/web/src/components/Editor/`     |
|                       |                  | `apps/server/src/routes/executionRoutes.js`   | `apps/web/src/components/AIPanel/`    |
|                       |                  | `apps/server/src/sockets/executionSocket.js`  |                                       |
| **AI Agent**          | Teammate 3 (You) | `apps/web/src/components/AIPanel/`            | `apps/web/src/components/FileTree/`   |
|                       |                  | `apps/web/src/stores/agentStore.js`           | `apps/web/src/components/Editor/`     |
|                       |                  | `apps/web/src/services/agentService.js`       | `apps/web/src/components/Terminal/`   |
|                       |                  | `apps/server/src/services/agent/`             | `apps/server/src/services/execution/` |
|                       |                  | `apps/server/src/services/rag/`               |                                       |
|                       |                  | `apps/server/src/services/llm/`               |                                       |
|                       |                  | `apps/server/src/routes/agentRoutes.js`       |                                       |
|                       |                  | `apps/server/src/sockets/agentSocket.js`      |                                       |
| **Shared (everyone)** | All              | `packages/shared/`                            | —                                     |
|                       |                  | `packages/ai-core/`                           | —                                     |
|                       |                  | `TEAM_LOG.md`                                 | Root configs (ask first)              |

> **If you need to change a file you don't own → message the owner in the group. Don't just do it.**

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
