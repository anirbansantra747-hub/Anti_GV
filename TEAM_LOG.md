# 📋 Anti_GV — Team Log & Rules

> Write it down. Every time. No exceptions.

---

## 🚨 Rules (Read Before You Write Code)

### Branch Workflow

```
1. git checkout development && git pull
2. git checkout -b feature/<scope>-<name>    (or fix/<scope>-<name>)
3. Write code, test locally, commit often
4. git push → Open PR to development
5. 1 teammate reviews → Merge
6. When development is stable → PR to main (all 3 approve)
```

### Scopes

`ai` · `fs` · `runner` · `ui` · `shared` · `infra`

### Commit Messages

```
feat(ai): add intent classifier
fix(runner): handle Judge0 timeout
docs(shared): update socket events
refactor(fs): extract memfs wrapper
chore(infra): update CI pipeline
```

**Format:** `type(scope): short description`
**Types:** `feat` `fix` `docs` `refactor` `test` `chore` `ci`

### Before You Push — Checklist

- [ ] Code runs locally without errors (`pnpm dev`)
- [ ] No hardcoded strings for socket events (use `@antigv/shared`)
- [ ] Commit message follows the format above
- [ ] Added an entry to this file if you changed anything significant
- [ ] No `.env` secrets committed (check `.gitignore`)
- [ ] No `console.log` spam left in code

### Don't Do This

- ❌ Don't push directly to `main` or `development`
- ❌ Don't vibe-code — test your stuff before pushing
- ❌ Don't install packages in individual app folders — run `pnpm add <pkg> --filter @antigv/web` from ROOT
- ❌ Don't hardcode event names, API URLs, or magic numbers
- ❌ Don't commit `node_modules`, `.env`, or build output

---

## 📝 Change Log

Add new entries at the **top**. Use this format:

```
### YYYY-MM-DD — [SCOPE] Title
**Who:** Name | **Branch:** feature/xxx
**What:** What you changed and why.
**Breaking?** Yes/No. If yes, what breaks.
**Teammates need to:** (new env var? new package? schema change?)
```

---

### 2026-03-01 — [INFRA] Initial Monorepo Setup

**Who:** Anirban | **Branch:** main (initial commit)
**What:** Initialized pnpm monorepo with Turborepo. Created `@antigv/web`, `@antigv/server`, `@antigv/shared`, `@antigv/ai-core`. Set up CI/CD, Husky pre-commit, shared constants.
**Breaking?** No — first commit.
**Teammates need to:**

- `pnpm install` from root
- Copy `apps/server/.env.example` → `apps/server/.env`
- Import socket events from `@antigv/shared`, never hardcode

---
