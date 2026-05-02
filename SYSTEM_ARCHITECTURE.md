# Anti_GV — Complete System Architecture & Design Document

> A zero-cost, open-source, browser-based AI IDE with an AI agent that can plan, write, verify, and self-heal code — like Cursor, but free.

**Total Infrastructure Cost: $0/month** | Monorepo (pnpm workspaces + Turborepo)

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Repository Structure](#2-repository-structure)
3. [Module 1: File System (memfs + Persistence)](#3-module-1-file-system)
4. [Module 2: Monaco Editor](#4-module-2-monaco-editor)
5. [Module 3: Code Runner & Execution Engine](#5-module-3-code-runner)
6. [Module 4: AI Agent Pipeline](#6-module-4-ai-agent-pipeline)
7. [Module 5: RAG (Retrieval-Augmented Generation)](#7-module-5-rag-system)
8. [Module 6: Multi-Provider LLM Orchestration](#8-module-6-llm-orchestration)
9. [Module 7: Real-Time Communication (Socket.io)](#9-module-7-socket-layer)
10. [Module 8: Database Layer](#10-module-8-database-layer)
11. [Module 9: Learning Mode (Future)](#11-module-9-learning-mode)
12. [End-to-End Workflow Examples](#12-end-to-end-workflows)
13. [Tech Stack Summary](#13-tech-stack)
14. [Environment Variables](#14-environment-variables)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          BROWSER (React 18 SPA)                         │
│                                                                         │
│  ┌────────────┐  ┌───────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ ① FILE     │  │ ② MONACO      │  │ ④ AI AGENT │  │ ⑤ LEARNING   │  │
│  │   SYSTEM   │──│   EDITOR      │──│   PANEL    │  │   MODE       │  │
│  │  (memfs)   │  │  (code edit)  │  │  (chat UI) │  │  (roadmap)   │  │
│  └────────────┘  └───────────────┘  └────────────┘  └──────────────┘  │
│        │          ┌───────────────┐        │                            │
│        │          │ ③ CODE RUNNER │        │                            │
│        └──────────│  (terminal)   │────────┘                            │
│                   └───────────────┘                                     │
│                                                                         │
│  State: Zustand (7 stores) │ Persistence: localForage (IndexedDB)      │
│  FS: memfs (in-memory)     │ Exec: Pyodide + WebContainers (WASM)      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    Socket.io + REST API (JSON)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NODE.JS BACKEND (Express)                          │
│                                                                         │
│  Routes:          Sockets:           Services:                          │
│  /api/agent       agentSocket        agent/ (12 files)                  │
│  /api/rag         fsSocket           llm/ (8 providers)                 │
│  /api/fs          terminalSocket     rag/ (indexer, chunker, search)    │
│  /api/workspace   executionSocket    execution/ (docker, error parse)   │
│  /api/chats                          db/ (11 models & services)         │
│                                      fs/ (fileService, workspaceState)  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
          ┌─────────┬───────────┼───────────┬─────────────┐
          ▼         ▼           ▼           ▼             ▼
     MongoDB    ChromaDB     Groq API   NVIDIA NIM    Judge0 CE
     Atlas      (vectors)   (LLM #1)   (LLM #2)     (Docker exec)
     (free M0)              + Gemini   + GitHub      + Pyodide
                            + Cerebras + Together    + WebContainers
```

### Three-Tier Data Flow

```
BROWSER (Client)                     BACKEND (Server)                  EXTERNAL
─────────────────                    ────────────────                  ────────
memfs (RAM)                          Express REST API                  MongoDB Atlas
  ↕ auto-sync 3s                       ↕                               ChromaDB
localForage (IndexedDB)              Socket.io handlers                Groq / NVIDIA / etc.
  ↕ on Ctrl+S / blur                   ↕                               Judge0 CE
Socket.io client ──────────────────→ Socket.io server ──────────────→ External APIs
REST fetch() ──────────────────────→ Express routes ────────────────→ Database writes
```

---

## 2. Repository Structure

```
Anti_GV/                          ← Monorepo root (pnpm workspaces + Turborepo)
├── apps/
│   ├── web/                      ← Frontend (React 18 + Vite)
│   │   └── src/
│   │       ├── App.jsx           ← Main app shell, layout, panels
│   │       ├── components/
│   │       │   ├── AIPanel/      ← AI chat UI, plan viewer, diff review
│   │       │   ├── Editor/       ← Monaco wrapper, tabs, diff viewer, inline diff
│   │       │   ├── Explorer/     ← File tree (react-arborist based)
│   │       │   ├── FileTree/     ← File node, actions, explorer menu
│   │       │   ├── Terminal/     ← xterm.js terminal pane
│   │       │   ├── Topbar/       ← Search, run button, user controls
│   │       │   ├── Shell/        ← Site shell layout wrapper
│   │       │   ├── StatusBar/    ← Bottom status bar
│   │       │   ├── History/      ← History drawer
│   │       │   ├── QuickOpen/    ← Quick file open (Ctrl+P)
│   │       │   ├── ConflictBanner/ ← File conflict resolution UI
│   │       │   └── Toast/        ← Toast notification viewport
│   │       ├── stores/           ← Zustand state management
│   │       │   ├── agentStore.js       ← AI agent state (22KB, largest store)
│   │       │   ├── editorStore.js      ← Active file, open tabs, dirty state
│   │       │   ├── fileSystemStore.js  ← File tree data, selected node
│   │       │   ├── sessionStore.js     ← User session, workspace ID
│   │       │   ├── settingsStore.js    ← User preferences
│   │       │   ├── toastStore.js       ← Toast notifications
│   │       │   └── workspaceAccessStore.js ← Workspace permissions
│   │       ├── services/
│   │       │   ├── memfsService.js     ← memfs wrapper with event hooks
│   │       │   ├── persistenceService.js ← localForage + MongoDB sync
│   │       │   ├── fileWatcher.js      ← Debounced sync, dirty tracking
│   │       │   ├── bootstrap.js        ← App initialization sequence
│   │       │   ├── initSyncService.js  ← Initial sync on load
│   │       │   ├── crashRecovery.js    ← Recover from browser crashes
│   │       │   ├── conflictResolver.js ← Resolve file conflicts
│   │       │   ├── integrityService.js ← File integrity checks
│   │       │   ├── contextService.js   ← Context gathering for AI
│   │       │   ├── contextSnapshotAPI.js ← Context snapshot API
│   │       │   ├── diffService.js      ← Diff computation
│   │       │   ├── eventBus.js         ← Cross-component events
│   │       │   ├── socketService.js    ← Socket.io client wrapper
│   │       │   ├── fileSystemAPI.js    ← REST API for file operations
│   │       │   ├── execution/          ← Code execution services
│   │       │   │   ├── executionService.js
│   │       │   │   ├── languageDetector.js
│   │       │   │   ├── pyodideRunner.js
│   │       │   │   └── webContainerRunner.js
│   │       │   └── ...
│   │       └── models/
│   │           └── WorkspaceContracts.js ← Workspace data contracts
│   │
│   └── server/                   ← Backend (Node.js + Express)
│       ├── src/
│       │   ├── app.js            ← Express app, Socket.io setup, route mounting
│       │   ├── routes/
│       │   │   ├── agent.js      ← /api/agent/* endpoints
│       │   │   ├── rag.js        ← /api/rag/* endpoints (indexing, search)
│       │   │   ├── fs.js         ← /api/fs/* endpoints (file operations)
│       │   │   ├── workspace.js  ← /api/workspace/* endpoints (CRUD)
│       │   │   └── chats.js      ← /api/chats/* endpoints (chat history)
│       │   ├── sockets/
│       │   │   ├── agentSocket.js     ← AI agent real-time events
│       │   │   ├── fsSocket.js        ← File system sync events
│       │   │   ├── terminalSocket.js  ← Terminal I/O streaming
│       │   │   └── executionSocket.js ← Code execution events
│       │   └── services/
│       │       ├── agent/        ← AI Agent Pipeline (12+ files)
│       │       │   ├── index.js              ← Main orchestrator
│       │       │   ├── intentClassifier.js   ← Phase 0: classify intent
│       │       │   ├── taskBriefAgent.js     ← Phase 1: canonical brief
│       │       │   ├── contextAssembler.js   ← Phase 2: static context
│       │       │   ├── contextBundleBuilder.js ← Phase 2: bundle builder
│       │       │   ├── plannerAgent.js       ← Phase 3: plan generation
│       │       │   ├── planValidator.js      ← Phase 4: plan validation
│       │       │   ├── preflightValidator.js ← Phase 5: pre-flight checks
│       │       │   ├── coderAgent.js         ← Phase 6: code generation
│       │       │   ├── criticAgent.js        ← Phase 7: code review
│       │       │   ├── fixerAgent.js         ← Phase 7: self-healing
│       │       │   ├── verificationAgent.js  ← Phase 8: verify output
│       │       │   ├── shadowWorkspace.js    ← Shadow transaction staging
│       │       │   ├── shadowEvalService.js  ← Shadow model evaluation
│       │       │   ├── cacheService.js       ← Brief/plan caching
│       │       │   ├── tokenBudgetService.js ← Token budget management
│       │       │   ├── failurePatternDetector.js ← Error pattern learning
│       │       │   └── schemas/
│       │       │       ├── planSchema.js     ← Zod plan validation
│       │       │       └── editSchema.js     ← Zod edit validation
│       │       ├── llm/          ← LLM Provider Clients (8 providers)
│       │       │   ├── groqClient.js
│       │       │   ├── geminiClient.js
│       │       │   ├── githubModelsClient.js
│       │       │   ├── nvidiaClient.js
│       │       │   ├── togetherClient.js
│       │       │   ├── openRouterClient.js
│       │       │   ├── cerebrasClient.js
│       │       │   ├── huggingfaceClient.js
│       │       │   ├── modelRegistry.js      ← Model registry + health
│       │       │   ├── routingEngine.js      ← Task-aware routing
│       │       │   ├── rateLimiter.js        ← Rate limit management
│       │       │   ├── circuitBreaker.js     ← Circuit breaker system
│       │       │   └── streamHandler.js      ← SSE stream handling
│       │       ├── rag/          ← RAG Pipeline
│       │       │   ├── indexer.js     ← Index files into ChromaDB
│       │       │   ├── chunker.js     ← Semantic chunking
│       │       │   ├── embedder.js    ← Embedding via API
│       │       │   ├── searcher.js    ← Vector search + rerank
│       │       │   └── reranker.js    ← LLM-based reranking
│       │       ├── execution/    ← Code Execution
│       │       │   ├── dockerRunner.js  ← Judge0 CE adapter
│       │       │   ├── errorParser.js   ← Parse stderr → markers
│       │       │   └── languageMap.js   ← Language → Judge0 ID map
│       │       ├── db/           ← Database Models & Services
│       │       │   ├── dbService.js           ← MongoDB connection
│       │       │   ├── workspaceModel.js      ← Workspace schema
│       │       │   ├── workspaceService.js    ← Workspace CRUD
│       │       │   ├── chatModel.js           ← Chat history schema
│       │       │   ├── chatService.js         ← Chat CRUD
│       │       │   ├── fileIndexModel.js      ← File index schema
│       │       │   ├── fileIndexService.js    ← File index CRUD
│       │       │   ├── fileInventoryModel.js  ← File inventory schema
│       │       │   ├── fileInventoryService.js
│       │       │   ├── chunkMetaModel.js      ← Chunk metadata schema
│       │       │   └── chunkMetaService.js    ← Chunk metadata CRUD
│       │       └── fs/           ← File System Backend
│       │           ├── fileService.js     ← Server-side file ops
│       │           └── workspaceState.js  ← Workspace state management
│       └── embedding_service/    ← Python embedding microservice
│           ├── embedding_server.py  ← FastAPI server for embeddings
│           └── requirements.txt
│
├── packages/
│   ├── ai-core/                  ← Shared AI utilities
│   │   └── src/
│   │       ├── index.js
│   │       ├── contextBudget.js  ← Token budget calculations
│   │       └── tokenCounter.js   ← Token estimation
│   └── shared/                   ← Shared types & constants
│       └── src/
│           ├── index.js
│           ├── constants/
│           │   ├── languages.js  ← Supported language list
│           │   └── limits.js     ← System limits
│           ├── types/
│           │   ├── agent.types.js        ← Agent type definitions
│           │   ├── agentContracts.js      ← Agent API contracts
│           │   ├── agentControl.types.js  ← Agent control types
│           │   └── socket.events.js       ← Socket event definitions
│           └── utils/
│               └── fileHelpers.js ← File utility functions
│
├── docker/                       ← Docker configs for execution engines
│   ├── node/Dockerfile
│   ├── python/Dockerfile
│   ├── java/Dockerfile
│   ├── gcc/Dockerfile
│   ├── go/Dockerfile
│   ├── rust/Dockerfile
│   ├── ruby/Dockerfile
│   ├── php/Dockerfile
│   ├── kotlin/Dockerfile
│   ├── dotnet/Dockerfile
│   └── bash/Dockerfile
│
├── piston_engine/                ← Code execution engine (planned)
├── hld_architecture.html         ← Visual HLD reference document
├── ai-plan.md                    ← Detailed AI pipeline design doc
├── turbo.json                    ← Turborepo pipeline config
├── pnpm-workspace.yaml           ← Monorepo workspace definition
└── package.json                  ← Root package with shared scripts
```

---

## 3. Module 1: File System

### 3.1 Three-Layer Storage Architecture

```
LAYER 1: memfs (in-memory)        ← All reads/writes go here. ~0ms latency.
    │                                POSIX-compatible. Lost on page refresh.
    │ auto-sync every 3 seconds
    ▼
LAYER 2: IndexedDB (browser)      ← localForage wraps IndexedDB. Survives
    │                                page refresh. Works offline. 50MB+.
    │ on Ctrl+S or window blur
    ▼
LAYER 3: MongoDB Atlas (cloud)    ← Source of truth. Cross-device sync.
                                     Files stored embedded in workspace doc.
```

**Rule:** Every user action (type, create, delete) hits memfs instantly. IndexedDB captures it automatically for offline-safety. MongoDB only gets called on explicit save (Ctrl+S) or window blur — never on every keystroke.

### 3.2 File Create Flow

```
User clicks "+ New File" in left panel
    │
    ▼
react-arborist renders inline input → user types filename (e.g., Main.java)
    │
    ▼
memfs.writeFile('/project/src/Main.java', '')   ← ~0ms, no server call
    │
    ▼
File tree re-renders immediately (Zustand fileSystemStore update)
    │
    ▼
Monaco auto-opens file, detects extension → loads Java language mode
    │
    ▼
localForage.setItem syncs workspace state within 3 seconds
```

### 3.3 File Save Flow (Ctrl+S)

```
User presses Ctrl+S
    → Monaco save event fires
    → memfs updated with latest editor content
    → localForage.setItem (IndexedDB write)
    → PATCH /api/workspace/:id (REST call to backend)
    → MongoDB Atlas updated (source of truth)
```

### 3.4 File Open / Page Reload Flow

```
Page loads / User opens workspace
    │
    ├─ Check IndexedDB first (localForage.getItem)
    │   ├─ Found + timestamp newer than MongoDB → load from IndexedDB (offline-first)
    │   └─ Not found → fetch from MongoDB via GET /api/workspace/:id
    │
    ▼
Files loaded into memfs → react-arborist tree rendered → ready
```

### 3.5 Key Frontend Services

| Service            | File                             | Purpose                                     |
| ------------------ | -------------------------------- | ------------------------------------------- |
| memfsService       | `services/memfsService.js`       | POSIX wrapper around memfs with event hooks |
| persistenceService | `services/persistenceService.js` | localForage + MongoDB sync orchestration    |
| fileWatcher        | `services/fileWatcher.js`        | Debounced auto-sync, dirty file tracking    |
| crashRecovery      | `services/crashRecovery.js`      | Recover workspace from browser crashes      |
| conflictResolver   | `services/conflictResolver.js`   | Resolve conflicts when server/local diverge |
| integrityService   | `services/integrityService.js`   | File integrity validation                   |
| initSyncService    | `services/initSyncService.js`    | Initial load synchronization                |
| bootstrap          | `services/bootstrap.js`          | App initialization sequence                 |

### 3.6 memfs API (Used by ALL other modules)

```javascript
memfs.readFile(path, 'utf8')          → Promise<string>
memfs.writeFile(path, content)        → void
memfs.mkdir(dirPath, { recursive })   → void
memfs.readdir('/', { recursive })     → string[]
memfs.exists(path)                    → boolean
memfs.unlink(path)                    → void
memfs.rename(oldPath, newPath)        → void
```

### 3.7 Zustand Stores (State Management)

```javascript
// editorStore.js — AI agent reads from this
{
  activeFile: string,          // currently focused file path
  openTabs: string[],         // all open tab paths
  dirtyFiles: Set<string>,    // files with unsaved changes
  recentlyEdited: string[],   // files edited in last 5 min
}

// fileSystemStore.js
{
  tree: TreeNode[],            // full file tree structure
  selectedNode: string | null, // currently selected file/folder
}

// agentStore.js (22KB — largest store)
{
  messages: Message[],         // chat history
  currentPlan: Plan | null,    // active execution plan
  runState: RunState,          // current pipeline phase
  isStreaming: boolean,
  pendingDiffs: Diff[],        // diffs awaiting approval
}

// sessionStore.js
{
  workspaceId: string,
  userId: string,
  connectionStatus: string,
}
```

---

## 4. Module 2: Monaco Editor

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MONACO EDITOR                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ EDITOR MODEL │  │ LANGUAGE SERVICES │  │ AI INLINE        │  │
│  │              │  │                  │  │ FEATURES          │  │
│  │ • 1 model    │  │ • Built-in:      │  │                  │  │
│  │   per file   │  │   JS/TS/HTML/CSS │  │ • Ghost text     │  │
│  │ • Backed by  │  │ • ESLint worker  │  │   (suggestions)  │  │
│  │   memfs      │  │ • Pyright WASM   │  │ • DiffEditor     │  │
│  │ • Full undo/ │  │ • Auto-detect    │  │   (accept/reject)│  │
│  │   redo       │  │   from extension │  │ • Decorations    │  │
│  │ • Dirty      │  │ • Error squiggles│  │ • Right-click    │  │
│  │   tracking   │  │   (markers API)  │  │   AI commands    │  │
│  └──────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 File Open in Monaco

```
User clicks file in FileTree
    → react-arborist fires onSelect
    → Zustand editorStore.setActiveFile(path)
    → memfs.readFile(path, 'utf8') → content string
    → monaco.editor.createModel(content, language, uri) or reuse existing
    → Language auto-detected from file extension (.js→javascript, .py→python)
    → Tab added to TabBar, cursor positioned
```

### 4.3 Typing & Auto-Save

```
User types in editor
    → Monaco model updates (internal buffer)
    → onChange fires → memfs.writeFile(path, model.getValue())
    → Zustand marks file as dirty (dot indicator on tab)
    → fileWatcher debounced 3s → localForage.setItem (IndexedDB)
    → On Ctrl+S: immediate localForage + MongoDB PATCH
```

### 4.4 Error Integration (Editor ↔ Code Runner)

```
Code execution produces error: "TypeError at line 14"
    → Backend errorParser extracts { line: 14, column: 5, message: "..." }
    → Socket.io sends error markers to client
    → monaco.editor.setModelMarkers(model, 'runtime', markers)
    → Red squiggly underline appears on line 14
    → Hovering shows error message tooltip
```

### 4.5 AI Patch Display (Editor ↔ AI Agent)

```
AI generates code patch (SEARCH/REPLACE format)
    → agentStore receives patch via Socket.io
    → DiffViewer.jsx renders Monaco DiffEditor
    → Left: original code | Right: AI-modified code
    → User clicks "Accept" → memfs.writeFile with new content
    → User clicks "Reject" → discard, no changes
    → InlineDiffReview.jsx for inline accept/reject per hunk
```

---

## 5. Module 3: Code Runner

### 5.1 Multi-Runtime Routing

```
User clicks ▶ Run (or AI triggers verification)
    │
    ▼
languageDetector.js: detect from file extension
    │
    ├─ .js / .ts / .mjs → WebContainers (in-browser Node.js WASM)
    ├─ .py             → Pyodide (in-browser Python 3 WASM)
    └─ .java / .c / .cpp / .go / .rs / .rb / .php / .kt / .cs / .sh
                        → Judge0 CE (Docker containers on server)
    │
    ▼
Output → Socket.io stream → Terminal Panel (xterm.js)
```

### 5.2 Execution Engines

| Language                                            | Engine        | Location        | How It Works                                           |
| --------------------------------------------------- | ------------- | --------------- | ------------------------------------------------------ |
| JavaScript/TypeScript                               | WebContainers | Browser (WASM)  | Full Node.js in browser, npm support, zero server cost |
| Python                                              | Pyodide       | Browser (WASM)  | Python 3 interpreter, includes stdlib + numpy          |
| Java, C, C++, Go, Rust, Ruby, PHP, Kotlin, C#, Bash | Judge0 CE     | Server (Docker) | Self-hosted Docker containers, sandboxed execution     |

### 5.3 Socket.io Execution Events

```javascript
// CLIENT → SERVER: Request execution
socket.emit('execute', {
  code: string, // code to run
  language: string, // "javascript" | "python" | "java" | etc.
  stdin: string, // optional stdin input
  timeLimit: 10, // seconds
  memoryLimit: 256, // MB
});

// SERVER → CLIENT: Execution result
socket.on('execution:result', {
  stdout: string, // standard output
  stderr: string, // standard error (empty = success)
  exitCode: number, // 0 = success
  time: number, // execution time (ms)
  memory: number, // memory used (KB)
  status: string, // "accepted" | "error" | "timeout" | "memory_limit"
});

// SERVER → CLIENT: Status updates
socket.on('execution:status', {
  executionId: string,
  status: string, // "queued" | "compiling" | "running" | "done"
});

// CLIENT → SERVER: Kill execution
socket.emit('execute:kill', { executionId: string });
```

### 5.4 Docker Execution Architecture

```
11 Dockerfiles in /docker/:
  node/ python/ java/ gcc/ go/ rust/ ruby/ php/ kotlin/ dotnet/ bash/

Each container:
  1. Receives source code via Judge0 CE API
  2. Compiles (if needed) inside sandbox
  3. Runs with time/memory limits
  4. Returns stdout/stderr/exitCode
  5. Container destroyed after execution
```

---

## 6. Module 4: AI Agent Pipeline

### 6.1 The 12-Phase Pipeline

```
USER TYPES PROMPT + HITS ENTER
         │
         ▼
  ┌────────────────┐
  │ PHASE 1        │  Request Normalization & Health Check (50-100ms)
  │ NORMALIZE      │  • Check provider health + circuit breakers
  │                │  • Check cache (brief cache 24hr, plan cache 6hr)
  │                │  • Allocate token budgets by complexity
  └───────┬────────┘
          │
          ▼
  ┌────────────────┐
  │ PHASE 2        │  Intent & Brief Generation (PARALLEL_RACE, 300-800ms)
  │ CLASSIFY       │  • 3 models race in parallel
  │ + BRIEF        │  • First valid response wins (quality threshold: 0.7)
  │                │  • Output: CanonicalTaskBrief
  │                │  • Intents: ASK | EDIT | CREATE | DEBUG | REFACTOR | MULTI
  └───────┬────────┘
          │
    ┌─────┴─────┐
    │           │
  ASK?      Everything else
    │           │
    ▼           ▼
  Direct     ┌────────────────┐
  Answer     │ PHASE 3        │  Context Assembly (WATERFALL, 200-500ms)
  (done)     │ CONTEXT        │  • File tree scan + git status + recent edits
             │                │  • Import/export graph + type signatures
             │                │  • Vector search (ChromaDB) + keyword fallback
             │                │  • Conversation memory (decay: 5/20/older)
             │                │  • Terminal history + error logs + diagnostics
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 4        │  Plan Generation (CONSENSUS_VOTE, 1-3s)
             │ PLAN           │  • 3-4 models generate plans in parallel
             │                │  • Compare step counts, file targets, deps
             │                │  • 67% consensus threshold required
             │                │  • Output: ExecutionPlan with steps + deps
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 5        │  Plan Validation (CONSENSUS_VOTE, 500ms-1s)
             │ VALIDATE       │  • Dual validator, 100% agreement required
             │                │  • Checks: circular deps, file conflicts,
             │                │    scope creep, missing prerequisites
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 6        │  User Approval
             │ APPROVE        │  • Show plan as visual cards in AI panel
             │                │  • Buttons: Execute / Edit / Cancel
             │                │  • Skipped for ASK and simple single-file EDITs
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 7        │  Step Execution Loop (per step, 1-3s each)
             │ CODE           │  • SPECIALIST_FIRST routing (code-tuned models)
             │                │  • Search-and-replace diffs (not full rewrites)
             │                │  • Shadow workspace staging (not live)
             │                │  • Pre-flight validation (JSON schema, SEARCH
             │                │    block match, path safety, secret scan)
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 8        │  Incremental Verification (200ms-2s per group)
             │ VERIFY         │  • Syntax validation, import resolution
             │                │  • Type checking, lint critical rules
             │                │  • Build config validation
             └───────┬────────┘
                     │
               Pass? │ No → PHASE 9
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 9        │  Repair Loop (max 3 retries per file group)
             │ CRITIC+FIX     │  • Dual critic analysis (root cause, severity)
             │                │  • Fixer: same model → fallback → different family
             │                │  • Failure pattern detection (hash signatures)
             │                │  • Model rotation: NVIDIA→Together→Groq→GitHub→User
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 10       │  Final Verification (PARALLEL_RACE, 2-10s)
             │ FINAL VERIFY   │  • Full lint + type check + unit tests
             │                │  • Security scan + build verification
             │                │  • Partial success: independent groups can commit
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 11       │  Grouped Multi-File Review
             │ PRESENT        │  • Independent groups: approve separately
             │                │  • Dependent groups: approve together
             │                │  • Monaco DiffEditor per file
             │                │  • Accept All / per-file / Reject + undo
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ PHASE 12       │  Commit & Telemetry
             │ COMMIT         │  • Apply to live workspace (memfs)
             │                │  • Capture full telemetry record
             │                │  • Clean up shadow transaction
             └────────────────┘
```

### 6.2 Agent Socket Events

| Event               | Direction     | Purpose                                            |
| ------------------- | ------------- | -------------------------------------------------- |
| `agent:thinking`    | Server→Client | Phase indicator ("Planning...", "Writing code...") |
| `agent:plan`        | Server→Client | Plan JSON for user review                          |
| `agent:step:start`  | Server→Client | Step N started                                     |
| `agent:step:code`   | Server→Client | Streaming code tokens                              |
| `agent:step:verify` | Server→Client | Verification status                                |
| `agent:step:done`   | Server→Client | Step N complete                                    |
| `agent:done`        | Server→Client | All done, final result                             |
| `agent:approve`     | Client→Server | User approves plan                                 |
| `agent:reject`      | Client→Server | User rejects plan                                  |
| `agent:cancel`      | Client→Server | Cancel mid-execution                               |

### 6.3 Agent REST Endpoints

| Method | Path                  | Purpose                     |
| ------ | --------------------- | --------------------------- |
| POST   | `/api/agent/classify` | Classify user intent        |
| POST   | `/api/agent/context`  | Build context + RAG search  |
| POST   | `/api/agent/plan`     | Generate execution plan     |
| POST   | `/api/agent/execute`  | Execute approved plan steps |
| POST   | `/api/agent/chat`     | Simple chat (ASK shortcut)  |
| GET    | `/api/agent/plan/:id` | Retrieve saved plan         |

---

## 7. Module 5: RAG System

### 7.1 Indexing Pipeline (on file save / project open)

```
File saved or project opened
    │
    ▼
chunker.js: Parse file into semantic chunks
    │  • Tree-sitter WASM for function/class boundaries
    │  • NOT fixed line count — semantic boundaries
    │  • MD5 hash per file for incremental re-indexing
    │
    ▼
embedder.js: Convert chunks to vectors
    │  • Nomic Embed v1.5 (free) via embedding_service (Python FastAPI)
    │  • Each chunk → 768-dim vector
    │
    ▼
indexer.js: Store in ChromaDB
    │  • Collection per workspace
    │  • Metadata: filePath, startLine, endLine, language, hash
    │
    ▼
chunkMetaService.js: Store chunk metadata in MongoDB
    • For fast lookup without hitting ChromaDB
```

### 7.2 Search Pipeline (on each user prompt)

```
User prompt arrives
    │
    ▼
embedder.js: Embed query → 768-dim vector
    │
    ▼
searcher.js: ChromaDB similarity search → top 20 results
    │
    ▼
reranker.js: LLM-based re-ranking → top 5 most relevant
    │
    ▼
Expand to full file context (up to 500 lines per file)
    │
    ▼
Feed into contextBundleBuilder.js as RAG context section
```

### 7.3 Incremental Re-Indexing

```
File modified → compute MD5 hash
    │
    ├─ Hash unchanged → skip (already indexed)
    └─ Hash changed → re-chunk → re-embed → update ChromaDB
```

---

## 8. Module 6: LLM Orchestration

### 8.1 Multi-Provider Architecture (8 Providers, All Free)

| Provider          | Models                            | Role                                   | Rate Limits               |
| ----------------- | --------------------------------- | -------------------------------------- | ------------------------- |
| **Groq**          | Llama 3.3 70B, Mixtral 8x7B       | Primary for all interactive tasks      | 30 req/min, 14400/day     |
| **NVIDIA NIM**    | Llama 3.1 70B, Mixtral 8x22B      | Reasoning-heavy planning, code quality | Lower but stable          |
| **GitHub Models** | GPT-4o-mini, Mistral-large, Phi-4 | Consensus voting, A/B experiments      | 15 req/min/model, 150/day |
| **Together AI**   | Llama 3.1 70B Turbo, Qwen2.5 72B  | Code specialist backup                 | Moderate free tier        |
| **OpenRouter**    | Gemini Flash 1.5, Llama 3.2 11B   | Emergency overflow only                | Varies                    |
| **Hugging Face**  | Specialized endpoints             | Task-specific (classification)         | Free inference            |
| **Gemini**        | Gemini Flash                      | Fallback LLM                           | Free tier                 |
| **Cerebras**      | Various                           | High-speed inference                   | Free tier                 |

### 8.2 Routing Strategies

```
FASTEST_FIRST     → Speed critical (chat, intent classification)
                    First available model responds, done.

CONSENSUS_VOTE    → Quality critical (planning, validation)
                    3+ models run in parallel, 67% agreement required.

PARALLEL_RACE     → Reliability critical (brief generation)
                    Multiple models race, first valid response wins.

WATERFALL         → Cost optimized (codegen, fix attempts)
                    Try primary → fallback 1 → fallback 2 → ...

SPECIALIST_FIRST  → Task-specific (code generation)
                    Code-tuned models first, then general models.
```

### 8.3 Circuit Breaker System

```
Provider healthy (CLOSED)
    │
    │ 5 consecutive failures in 5min window
    ▼
Circuit OPEN (all requests rejected for this provider)
    │
    │ After 10min cooldown
    ▼
HALF-OPEN (test single request)
    │
    ├─ Success → back to CLOSED
    └─ Failure → back to OPEN (restart cooldown)
```

### 8.4 Task → Model Matrix

| Task                  | Strategy         | Primary                                      | Fallback           |
| --------------------- | ---------------- | -------------------------------------------- | ------------------ |
| Intent Classification | FASTEST_FIRST    | Groq Llama-3.3-70B                           | GitHub GPT-4o-mini |
| Brief Generation      | PARALLEL_RACE    | Groq Mixtral + NVIDIA Llama-3.1              | Together Llama-3.1 |
| Planning              | CONSENSUS_VOTE   | NVIDIA + GitHub Mistral + Groq Mixtral (67%) | Together Qwen2.5   |
| Code Generation       | SPECIALIST_FIRST | NVIDIA Llama-3.1, Together Qwen2.5           | Groq Mixtral       |
| Critic/Review         | CONSENSUS_VOTE   | Groq Llama-3.3 + GitHub Mistral (100%)       | NVIDIA Llama-3.1   |
| Repair/Fix            | WATERFALL        | Same model → rotate through providers        | Escalate to user   |
| Chat                  | FASTEST_FIRST    | Groq Llama-3.3-70B                           | Groq Mixtral       |

---

## 9. Module 7: Socket Layer

### 9.1 Four Socket Namespaces

```
Socket.io Connection
    │
    ├── agentSocket.js      → AI agent events (plan, code, verify, approve)
    ├── fsSocket.js         → File system sync (create, update, delete, rename)
    ├── terminalSocket.js   → Terminal I/O (stdin, stdout, resize)
    └── executionSocket.js  → Code execution (execute, result, kill, status)
```

### 9.2 File System Socket Events

```javascript
// Real-time file sync between browser clients
socket.emit('fs:create', { path, content, type: 'file' | 'directory' });
socket.emit('fs:update', { path, content });
socket.emit('fs:delete', { path });
socket.emit('fs:rename', { oldPath, newPath });
socket.on('fs:changed', { path, content, type, action });
```

---

## 10. Module 8: Database Layer

### 10.1 MongoDB Collections

| Collection      | Model File            | Purpose                             |
| --------------- | --------------------- | ----------------------------------- |
| workspaces      | workspaceModel.js     | Workspace metadata + embedded files |
| chats           | chatModel.js          | Chat history per workspace          |
| fileIndexes     | fileIndexModel.js     | File index for fast lookup          |
| fileInventories | fileInventoryModel.js | File inventory tracking             |
| chunkMetas      | chunkMetaModel.js     | RAG chunk metadata                  |

### 10.2 Workspace Document Structure

```javascript
{
  _id: ObjectId,
  name: "my-websocket-app",
  userId: "user_123",
  files: {
    "/src/server.js": { content: "const express = ...", language: "javascript" },
    "/src/client.js": { content: "import io from ...", language: "javascript" },
    "/package.json": { content: "{...}", language: "json" },
  },
  settings: { theme: "dark", fontSize: 14 },
  lastModified: ISODate,
  createdAt: ISODate,
}
```

### 10.3 ChromaDB (Vector Database)

```
Collection per workspace: "workspace_{id}"
Each document:
  {
    id: "chunk_{hash}",
    embedding: [768-dim float array],
    metadata: {
      filePath: "/src/server.js",
      startLine: 1,
      endLine: 25,
      language: "javascript",
      functionName: "createServer",
      fileHash: "abc123",
    },
    document: "const express = require('express')..."
  }
```

---

## 11. Module 9: Learning Mode (Future — Designed, Not Yet Built)

### 11.1 Overview

A guided, AI-powered learning system built on top of the existing IDE infrastructure. The AI generates personalized learning roadmaps that teach users by having them write actual code in the IDE, with progressively decreasing assistance.

### 11.2 High-Level Learning Flow

```
User opens Learning Mode (📚 button in Topbar)
    │
    ▼
User enters topic: "I want to learn WebSockets"
    │
    ▼
AI reads codebase context (RAG pipeline):
    ├─ Scans all files for Socket.io / WebSocket usage
    ├─ Identifies: "This is a chat app, server.js uses socket.io"
    ├─ Understands: "User needs WebSockets for their actual project"
    └─ Context: which files use sockets, what patterns exist
    │
    ▼
AI asks clarifying questions:
    • "Do you want to learn raw WebSocket API or Socket.io library?"
    • "What's your experience level with event-driven programming?"
    │
    ▼
AI generates personalized Learning Roadmap (5-8 steps)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│                    LEARNING ROADMAP                           │
│                                                               │
│  Step 1: 📖 Read — What are WebSockets?                [🔓]  │
│  Step 2: 📖 Read — Socket.io vs raw WebSocket          [🔒]  │
│  Step 3: 👀 Study — Read existing server.js socket code [🔒]  │
│  Step 4: ✍️ Guided — Write a basic server with hints    [🔒]  │
│  Step 5: ✍️ Practice — Write client connection (no help) [🔒]  │
│  Step 6: 🔧 Apply — Add rooms/namespaces to YOUR app    [🔒]  │
│  Step 7: 🏆 Challenge — Build reconnection logic        [🔒]  │
│                                                               │
│  Progress: ████░░░░░░░░░░░░░░░░░░░░░░ Step 1/7              │
└──────────────────────────────────────────────────────────────┘
```

### 11.3 Step Types & Progressive Difficulty

```
TYPE 1: 📖 READ (Pure theory)
─────────────────────────────
• AI fetches relevant documentation (NOT just links)
• AI extracts and shows ONLY the relevant sections
• User reads inline in the IDE — no external browsing needed
• Quiz questions at end to verify understanding
• Example:
  ┌─────────────────────────────────────────────┐
  │ 📖 What are WebSockets?                     │
  │                                              │
  │ WebSockets provide a persistent, full-duplex │
  │ communication channel over a single TCP      │
  │ connection. Unlike HTTP which is request-    │
  │ response, WebSockets allow the server to     │
  │ push data to the client at any time.         │
  │                                              │
  │ Key concepts:                                │
  │ • Handshake: HTTP upgrade request            │
  │ • Frames: Messages sent as data frames       │
  │ • Events: open, message, close, error        │
  │                                              │
  │ [Source: MDN Web Docs - WebSocket API]       │
  │                                              │
  │ ✅ Quiz: What protocol does WebSocket use    │
  │    for the initial connection?               │
  │    [HTTP] [TCP] [UDP]                        │
  └─────────────────────────────────────────────┘


TYPE 2: 👀 STUDY (Read existing code)
─────────────────────────────────────
• AI opens the ACTUAL file from user's project that uses the topic
• AI adds inline annotations explaining each line
• Split view: code on left, explanations on right
• Example:
  ┌─── server.js ─────────────────┬─── AI Explanation ────────┐
  │ const io = new Server(server) │ Creates a Socket.io       │
  │                               │ server instance, wrapping │
  │ io.on('connection', (socket)  │ the HTTP server           │
  │   => {                        │                           │
  │   console.log('connected')    │ This event fires every    │
  │                               │ time a new client         │
  │   socket.on('message', (msg)  │ connects. 'socket' is     │
  │     => {                      │ the individual connection │
  │     io.emit('message', msg)   │                           │
  │   })                          │ Broadcasts to ALL clients │
  │ })                            │ including the sender      │
  └───────────────────────────────┴───────────────────────────┘


TYPE 3: ✍️ GUIDED (Write with AI assistance)
────────────────────────────────────────────
• AI pre-fills some code, leaves blanks for user to complete
• Comments guide what to write and WHY
• AI explains the reasoning behind each section
• AI assists in real-time if user gets stuck
• Example:
  ┌─── exercise_server.js ────────────────────────┐
  │ // AI has written the setup for you:           │
  │ const express = require('express')             │
  │ const http = require('http')                   │
  │ const { Server } = require('socket.io')        │
  │                                                │
  │ const app = express()                          │
  │ const server = http.createServer(app)          │
  │ const io = new Server(server)                  │
  │                                                │
  │ // YOUR TURN: Write the connection handler     │
  │ // HINT: Use io.on('connection', callback)     │
  │ // WHY: This listens for new client sockets    │
  │ //                                             │
  │ // ✍️ Write your code here:                    │
  │ |                                              │ ← cursor
  │                                                │
  │ server.listen(3000)                            │
  └────────────────────────────────────────────────┘

  AI Panel: "Need help? The connection event gives you
  a 'socket' object. Try: io.on('connection', (socket) => { ... })"


TYPE 4: ✍️ PRACTICE (Write with NO help)
────────────────────────────────────────
• Only comments describe WHAT to build, not HOW
• AI does NOT provide hints unless user explicitly asks
• AI validates the code after user writes it
• Example:
  ┌─── exercise_client.js ────────────────────────┐
  │ // TASK: Connect to the WebSocket server       │
  │ //       and send a message when button clicked │
  │ //                                             │
  │ // Requirements:                               │
  │ //   1. Connect to localhost:3000              │
  │ //   2. Listen for 'message' events            │
  │ //   3. Display received messages in #messages │
  │ //   4. Send input value on form submit        │
  │ //                                             │
  │ // Write everything below:                     │
  │ |                                              │ ← cursor
  └────────────────────────────────────────────────┘


TYPE 5: 🔧 APPLY (Apply to real project)
────────────────────────────────────────
• AI points to the ACTUAL files in user's project
• "Now implement what you learned in YOUR codebase"
• AI opens the relevant file, highlights where to add code
• Example:
  ┌──────────────────────────────────────────────┐
  │ 🔧 APPLY TO YOUR PROJECT                     │
  │                                               │
  │ Now add Socket.io rooms to your chat app:     │
  │                                               │
  │ File: /src/server.js (line 12)                │
  │ What to add: Room joining logic               │
  │                                               │
  │ You already know how to:                      │
  │ ✅ Create Socket.io server (Step 3)           │
  │ ✅ Handle connections (Step 4)                │
  │ ✅ Emit/listen events (Step 5)               │
  │                                               │
  │ Now add socket.join(roomName) and             │
  │ io.to(roomName).emit() patterns.              │
  └──────────────────────────────────────────────┘
```

### 11.4 How AI Knows Which Files Are Relevant

```
User says: "I want to learn WebSockets"
    │
    ▼
AI uses EXISTING RAG pipeline:
    │
    ├─ 1. Vector search: query "websocket socket.io connection" against ChromaDB
    │      → Finds chunks from server.js, client.js mentioning socket
    │
    ├─ 2. File tree scan: look for imports of 'socket.io', 'ws', 'websocket'
    │      → grep-like search across memfs
    │
    ├─ 3. Package.json analysis: check dependencies
    │      → Finds "socket.io": "^4.x" in dependencies
    │
    └─ 4. Context assembly: combine all findings
           → "This project uses Socket.io in server.js and client.js
              for a real-time chat application"
    │
    ▼
AI generates roadmap PERSONALIZED to this context:
    • Steps reference actual files (server.js:12, client.js:5)
    • Examples use the same patterns already in the codebase
    • Final step applies directly to the user's project
```

### 11.5 Documentation Fetching (No External Links)

```
Instead of: "Visit https://socket.io/docs to learn more"

AI does:
    1. Fetch documentation content from the web
    2. Extract ONLY the relevant section (not entire page)
    3. Render it inline in the Learning Panel
    4. User reads everything inside the IDE

This is critical — the user should NEVER leave the IDE to learn.
```

### 11.6 Step Unlocking & Progress

```
Step 1: 🔓 UNLOCKED → User reads content → completes quiz → ✅ DONE
Step 2: 🔓 UNLOCKED (was 🔒) → User reads → quiz → ✅ DONE
Step 3: 🔓 UNLOCKED → User studies code → AI confirms understanding → ✅ DONE
Step 4: 🔓 UNLOCKED → User writes code → AI validates + runs it → ✅ DONE
Step 5: 🔓 UNLOCKED → User writes independently → code passes tests → ✅ DONE
Step 6: 🔓 UNLOCKED → User modifies actual project files → ✅ DONE
Step 7: 🔓 UNLOCKED → Final challenge completed → 🏆 ROADMAP COMPLETE

Progress persisted in:
  • Zustand store (immediate)
  • localForage (survive refresh)
  • MongoDB (survive device switch)
```

### 11.7 Learning Mode Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEARNING MODE SYSTEM                          │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌───────────────┐   │
│  │ LearningPanel│     │ RoadmapEngine│     │ ExerciseRunner│   │
│  │ (React UI)   │────▶│ (AI planner) │────▶│ (Code Runner) │   │
│  └──────────────┘     └──────────────┘     └───────────────┘   │
│         │                    │                      │           │
│         │              ┌─────┴──────┐               │           │
│         │              │ RAG Search │               │           │
│         │              │ (reuse     │               │           │
│         │              │  existing) │               │           │
│         │              └────────────┘               │           │
│         │                                           │           │
│  ┌──────┴──────────────────────────────────────────┴──────┐    │
│  │        SHARED INFRASTRUCTURE (reused from IDE)         │    │
│  │  memfs │ Monaco │ Socket.io │ ChromaDB │ LLM providers │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. End-to-End Workflows

### Example 1: User types "Add a login page with email/password"

```
1. User types prompt in AI Panel → socket.emit('agent:prompt', { text })
2. PHASE 1: Health check all 8 LLM providers → cache check → allocate budgets
3. PHASE 2: Intent = CREATE, complexity = medium, confidence = 0.92
4. PHASE 3: Context assembled:
   ├─ File tree: /src/App.jsx, /src/components/, /package.json
   ├─ RAG search: finds existing auth patterns, route setup
   ├─ Diagnostics: no errors
   └─ Budget: 4000 tokens for context
5. PHASE 4: 3 planners generate plan (CONSENSUS_VOTE):
   Plan: 3 steps
   ├─ Step 1: Create /src/components/Login/Login.jsx (new file)
   ├─ Step 2: Add route in App.jsx (edit file)
   └─ Step 3: Create /src/services/authService.js (new file)
   Consensus: 78% (passes 67% threshold)
6. PHASE 5: Dual validators confirm plan is valid
7. PHASE 6: User sees plan cards → clicks "Execute"
8. PHASE 7: Steps execute in order:
   ├─ Step 1: NVIDIA Llama-3.1 generates Login.jsx → pre-flight passes
   ├─ Step 2: Same model edits App.jsx with SEARCH/REPLACE
   └─ Step 3: Generates authService.js
9. PHASE 8: Verification — lint passes, no type errors
10. PHASE 11: DiffViewer shows 3 file changes → user clicks "Accept All"
11. PHASE 12: Files written to memfs → localForage → MongoDB
12. Telemetry recorded: 4.2s total, 3 files, Groq+NVIDIA used
```

### Example 2: User types "Why is my socket connection failing?"

```
1. PHASE 2: Intent = ASK (simple question, no code changes)
2. PHASE 3: Context gathered:
   ├─ Active file: server.js (has socket code)
   ├─ Terminal output: "Error: Connection refused on port 3000"
   ├─ RAG: finds socket.io setup patterns
   └─ Recent edits: user changed port number 30 min ago
3. AI generates direct answer (FASTEST_FIRST → Groq Llama-3.3):
   "Your socket connection is failing because the port was changed
    to 3001 in server.js but the client still connects to 3000.
    Update line 15 in client.js to match."
4. No plan needed, no approval gate — direct response in AI Panel
```

### Example 3: RAG Indexing on File Save

```
User saves /src/utils/helpers.js (Ctrl+S)
    │
    ├─ 1. memfs.writeFile → localForage → MongoDB (persistence flow)
    │
    └─ 2. RAG indexing triggered:
         ├─ Compute MD5 hash of new content
         ├─ Compare with stored hash in chunkMetaService
         ├─ Hash changed → re-index this file only (incremental)
         ├─ chunker.js: tree-sitter parses into function chunks:
         │   ├─ chunk_1: "function formatDate()" lines 1-15
         │   ├─ chunk_2: "function validateEmail()" lines 17-30
         │   └─ chunk_3: "export default { ... }" lines 32-35
         ├─ embedder.js: each chunk → Nomic Embed → 768-dim vector
         └─ ChromaDB: upsert chunks (replace old versions)
```

---

## 13. Tech Stack

| Layer              | Technology                                                                              | Cost               |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------ |
| **Frontend**       | React 18, Vite, Monaco Editor, Zustand, memfs, localForage, react-arborist, xterm.js    | Free               |
| **Backend**        | Node.js, Express, Socket.io                                                             | Free               |
| **Database**       | MongoDB Atlas (M0 free tier)                                                            | Free               |
| **Vector DB**      | ChromaDB                                                                                | Free (self-hosted) |
| **AI/LLM**         | Groq, NVIDIA NIM, GitHub Models, Together AI, OpenRouter, HuggingFace, Gemini, Cerebras | Free tiers         |
| **Embeddings**     | Nomic Embed v1.5 (via Python FastAPI microservice)                                      | Free               |
| **Code Execution** | Pyodide (Python WASM), WebContainers (JS WASM), Judge0 CE (Docker)                      | Free               |
| **Build**          | pnpm workspaces, Turborepo                                                              | Free               |
| **Hosting**        | Vercel (frontend), Railway (backend)                                                    | Free tier          |

---

## 14. Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/antigv

# LLM Providers
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
NVIDIA_API_KEY=nvapi-...
GITHUB_TOKEN=ghp_...
TOGETHER_API_KEY=...
OPENROUTER_API_KEY=sk-or-...
CEREBRAS_API_KEY=csk-...
HUGGINGFACE_API_KEY=hf_...

# Vector DB
CHROMA_URL=http://localhost:8000

# Embeddings
NOMIC_API_KEY=nk-...

# JWT Auth
JWT_SECRET=<random-string>
JWT_EXPIRES_IN=7d

# Code Execution
JUDGE0_URL=http://localhost:2358
JUDGE0_API_KEY=<key>

# Client
CLIENT_URL=http://localhost:5173
PORT=3001
```

---

> **Note:** Modules 1-8 are **built and implemented**. Module 9 (Learning Mode) is **designed and planned** — the architecture is defined but the code is not yet written. All infrastructure it needs (RAG, LLM, Monaco, Code Runner) already exists and will be reused.
