# Anti_GV — Free, Browser-Based AI IDE

> A zero-cost, open-source, browser-based coding IDE with an AI agent that can plan, write, verify, and self-heal code — like Cursor, but free.

**Hackathon Project** | 3 Teammates | Full-Stack | 100% Free Infrastructure

---

## 🏗 Architecture Overview

Anti_GV is built as a **5-module system** inside the browser

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │
│  │① FILE    │  │② MONACO      │  │④ AI      │  │⑤ LEARNING  │ │
│  │  SYSTEM  │──│   EDITOR     │──│  AGENT   │  │   MODE     │ │
│  │ (memfs)  │  │ (code edit)  │  │  PANEL   │  │ (roadmap)  │ │
│  └──────────┘  └──────────────┘  └──────────┘  └────────────┘ │
│                 ┌──────────────┐                                │
│                 │③ CODE RUNNER │                                │
│                 │ (terminal)   │                                │
│                 └──────────────┘                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket + REST (JWT)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NODE.JS BACKEND (Railway)                      │
│  JWT Auth │ Workspace Service │ Agent Service │ Execution Service│
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────┬───────┴───────┬──────────┐
        ▼          ▼               ▼          ▼
   MongoDB    ChromaDB         Groq API    Judge0 CE
   Atlas      (vectors)       (free LLM)   (Docker)
```

### Tech Stack

| Layer          | Technology                                           | Cost      |
| -------------- | ---------------------------------------------------- | --------- |
| Frontend       | React 18, Monaco Editor, Zustand, memfs, localForage | Free      |
| Backend        | Node.js, Express, Socket.io, JWT                     | Free      |
| Database       | MongoDB Atlas (M0 free), ChromaDB                    | Free      |
| AI/LLM         | Groq API (Llama 3.3 70B), Gemini Flash (fallback)    | Free      |
| Vectors        | Nomic Embed v1.5                                     | Free      |
| Code Execution | Pyodide (Python WASM), WebContainers (JS), Judge0 CE | Free      |
| Hosting        | Vercel (frontend), Railway (backend)                 | Free tier |

---

## 👥 Team Roles & Responsibilities

### Teammate 1 — File System & UI

### Teammate 2 — Code Runner & Execution Engine

### Teammate 3 (You) — AI Agent System

---

## 📁 Module 1: File System (Teammate 1)

### What You Own

The left panel of the IDE — file tree, file creation/deletion, and the 3-layer storage architecture.

### Key Architecture

```
Layer 1: memfs (in-memory)     ← All reads/writes go here. ~0ms. Lost on refresh.
    │
    │ auto-sync every 3s
    ▼
Layer 2: IndexedDB (browser)   ← localForage wraps IndexedDB. Survives refresh. 50MB+.
    │
    │ on Ctrl+S or blur
    ▼
Layer 3: MongoDB Atlas (cloud)  ← Source of truth. Cross-device sync.
```

### Libraries to Use

- **memfs** — POSIX-compatible in-memory filesystem
- **localForage** — IndexedDB wrapper with Promise API
- **react-arborist** — Virtualized tree component for the file explorer
- **Zustand** — State management (file tree state, dirty files, open tabs)

### Interfaces You MUST Expose (the AI Agent system needs these)

```javascript
// These are the functions/state that the AI agent service will call.
// Implement them exactly so integration is seamless.

// 1. Read a file by path
memfs.readFileSync(path, 'utf8') → string

// 2. Write content to a file
memfs.writeFileSync(path, content)

// 3. Create a directory (recursive)
memfs.mkdirSync(dirPath, { recursive: true })

// 4. List all files recursively (for file tree context)
memfs.readdirSync('/', { recursive: true }) → string[]

// 5. Check if file/dir exists
memfs.existsSync(path) → boolean

// 6. Delete a file
memfs.unlinkSync(path)

// 7. Zustand store shape (AI agent reads from this)
useEditorStore = {
  activeFile: string,           // currently focused file path
  openTabs: string[],           // all open tabs as file paths
  dirtyFiles: Set<string>,      // files with unsaved changes
  recentlyEdited: string[],     // files edited in last 5 minutes
}
```

### File Structure for This Module

```
frontend/src/
├── stores/
│   ├── editorStore.js        # Zustand: active file, open tabs, dirty state
│   └── fileSystemStore.js    # Zustand: file tree data, selected node
├── services/
│   ├── memfsService.js       # Wrapper around memfs with event hooks
│   ├── persistenceService.js # localForage + MongoDB sync logic
│   └── fileWatcher.js        # Debounced sync, dirty file tracking
├── components/
│   ├── FileTree/
│   │   ├── FileTree.jsx      # react-arborist tree component
│   │   ├── FileNode.jsx      # Single file/folder node
│   │   └── FileTreeActions.jsx # New File, New Folder, Delete buttons
│   ├── Editor/
│   │   ├── MonacoEditor.jsx  # Monaco wrapper component
│   │   ├── TabBar.jsx        # Open tabs with dirty indicators
│   │   └── DiffViewer.jsx    # Monaco DiffEditor for AI patches
│   └── Topbar/
│       └── Topbar.jsx        # Search, Run button, user avatar
```

---

## ▶ Module 3: Code Runner (Teammate 2)

### What You Own

The bottom terminal panel — code execution, output streaming, and the multi-runtime routing system.

### Key Architecture

```
User clicks ▶ Run
    │
    ▼
┌───────────────────┐
│ Language Detector  │ ← Detect from file extension
└────────┬──────────┘
         │
   ┌─────┼──────┐
   ▼     ▼      ▼
 JS/TS  Python  Java/C++/Go
   │     │       │
   ▼     ▼       ▼
WebCont Pyodide  Judge0 CE
(WASM)  (WASM)   (Docker→Railway)
   │     │       │
   └─────┼───────┘
         ▼
  Output → Socket.io → Terminal Panel
```

### Execution Engines

| Language                           | Engine            | How                                                            |
| ---------------------------------- | ----------------- | -------------------------------------------------------------- |
| JavaScript, TypeScript, Node.js    | **WebContainers** | In-browser Node.js (WASM). Zero server cost. Full npm support. |
| Python                             | **Pyodide**       | In-browser Python 3 (WASM). Includes stdlib + numpy.           |
| Java, C, C++, Go, Rust, 60+ others | **Judge0 CE**     | Self-hosted Docker on Railway. Sandboxed.                      |

### Interfaces You MUST Expose (the AI Agent system needs these)

```javascript
// Socket.io events that the AI agent system will use to verify code.

// CLIENT → SERVER: Request code execution
socket.emit('execute', {
  code: string, // The code to run
  language: string, // "javascript" | "python" | "java" | etc
  stdin: string, // Optional stdin input
  timeLimit: 10, // Seconds
  memoryLimit: 256, // MB
});

// SERVER → CLIENT: Execution result
socket.on('execution:result', {
  stdout: string, // Standard output
  stderr: string, // Standard error (empty = no errors)
  exitCode: number, // 0 = success
  time: number, // Execution time in ms
  memory: number, // Memory used in KB
  status: string, // "accepted" | "error" | "timeout" | "memory_limit"
});

// CLIENT → SERVER: Kill a running execution
socket.emit('execute:kill', { executionId: string });

// SERVER → CLIENT: Execution status updates
socket.on('execution:status', {
  executionId: string,
  status: string, // "queued" | "compiling" | "running" | "done"
});
```

### Error → Editor Integration

When execution produces a runtime error with line numbers (e.g., `NullPointerException at line 14`):

1. Backend parses stderr and extracts line/column info
2. Sends back an array of error markers
3. Client calls `monaco.editor.setModelMarkers()` to draw red squiggles on the exact lines

### File Structure for This Module

```
frontend/src/
├── components/
│   └── Terminal/
│       ├── Terminal.jsx         # Terminal panel UI (xterm.js)
│       ├── TerminalTabs.jsx     # Terminal / Output / Problems tabs
│       └── OutputRenderer.jsx   # Color-coded stdout/stderr display
├── services/
│   ├── executionService.js      # Socket.io client for execute events
│   ├── languageDetector.js      # Map file extension → language
│   ├── webContainerRunner.js    # WebContainers integration
│   └── pyodideRunner.js         # Pyodide WASM integration

backend/src/
├── services/
│   ├── execution/
│   │   ├── executionService.js  # Main orchestrator
│   │   ├── judge0Adapter.js     # Judge0 CE REST API client
│   │   ├── errorParser.js       # Parse stderr → error markers
│   │   └── languageMap.js       # Language → Judge0 language_id mapping
│   └── sockets/
│       └── executionSocket.js   # Socket.io handlers for execute events
```

---

## 🤖 Module 4: AI Agent System (Your Module — The Main Event)

This is the core of the entire IDE. Everything else (file system, editor, code runner) exists to serve this.

### The Pipeline — 7 Phases

```
USER TYPES PROMPT + HITS ENTER
          │
          ▼
   ┌──────────────┐
   │ PHASE 0      │  Intent Classifier — What does the user want?
   │ CLASSIFY     │  (ASK / EDIT / CREATE / DEBUG / REFACTOR / MULTI)
   └──────┬───────┘
          │
    ┌─────┴─────┐
    │           │
  ASK?      Everything else
    │           │
    ▼           ▼
  Direct     ┌──────────────┐
  Answer     │ PHASE 1      │  Context Assembly — Gather all relevant code
  (done)     │ CONTEXT      │  (static context + RAG vector search)
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ PHASE 2      │  Planner Agent — Create structured execution plan
             │ PLAN         │  (JSON: steps, file paths, pseudocode, deps)
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ PHASE 3      │  User Approval — Show plan, wait for ✅
             │ APPROVE      │
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ PHASE 4      │  Coder Agent — Write actual code for each step
             │ CODE         │  (search-and-replace diffs)
             └──────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ PHASE 5      │  Verification — Lint + Run + Critic review
             │ VERIFY       │
             └──────┬───────┘
                    │
               Pass?│No → PHASE 6: Fixer (retry ≤3x) → back to Phase 5
                    │
                    ▼
             ┌──────────────┐
             │ PHASE 7      │  Present — Show diffs, Accept/Reject buttons
             │ PRESENT      │
             └──────────────┘
```

### Each Phase in Detail

#### Phase 0: Intent Classification

- **Input**: User prompt (raw text)
- **Model**: Llama 3.1 8B via Groq (cheapest, fastest)
- **Output**: `{ intent, confidence, scope, files_mentioned }`
- **Purpose**: Route to the right pipeline. Simple questions skip the whole plan-code-verify cycle.

#### Phase 1: Context Assembly

- **Static context**: Active file, open tabs (200 lines each), file tree, terminal output, Monaco diagnostics, chat history
- **RAG context**: Embed user query via Nomic → search ChromaDB → top 20 results → re-rank to top 5 → expand to full files (500 lines each)
- **Total budget**: ~6,000 tokens (Groq free tier)

#### Phase 2: Planner Agent

- **Model**: Llama 3.3 70B via Groq
- **System prompt**: Forces JSON output with steps, dependencies, pseudocode
- **Output**: Structured plan with verification criteria
- **Validated with**: Zod schema

#### Phase 3: User Approval

- Show plan as visual cards in the AI panel
- Buttons: Execute / Edit / Cancel
- Skipped for ASK intent and simple single-file EDITs

#### Phase 4: Coder Agent

- **Model**: Llama 3.3 70B via Groq
- Executes plan steps in dependency order
- Uses search-and-replace format (not full-file rewrite)
- Each step is a separate LLM call with focused context

#### Phase 5: Verification

1. **Static analysis**: ESLint/Pyright on modified files
2. **Runtime**: Send to Code Runner → check stderr
3. **Critic Agent**: LLM reviews the diff — "does this solve the request? any bugs?"

#### Phase 6: Self-Healing

- If verification fails, send error + code to Fixer Agent
- Fixer produces corrected code → re-verify
- Max 3 retries. After that, show best attempt + error to user.

#### Phase 7: Presentation

- Monaco DiffEditor for each modified file
- Accept All / Accept per file / Reject
- Undo fully supported (Monaco tracks history)

### RAG System Design

```
INDEXING (on file save / project open):
  files → tree-sitter parse → semantic chunks → Nomic embed → ChromaDB store

SEARCHING (on each prompt):
  query → Nomic embed → ChromaDB top-20 → LLM re-rank → top-5 → expand files
```

**Chunking**: Use tree-sitter WASM to split files by function/class boundaries (not fixed line count).
**Re-indexing**: Incremental — only re-index files whose MD5 hash changed.

### Backend File Structure

```
backend/src/
├── services/
│   ├── agent/
│   │   ├── index.js              # Main orchestrator (all 7 phases)
│   │   ├── intentClassifier.js   # Phase 0
│   │   ├── contextAssembler.js   # Phase 1 (static context)
│   │   ├── ragService.js         # Phase 1 (vector search)
│   │   ├── plannerAgent.js       # Phase 2
│   │   ├── coderAgent.js         # Phase 4
│   │   ├── criticAgent.js        # Phase 5C
│   │   ├── fixerAgent.js         # Phase 6
│   │   ├── prompts/
│   │   │   ├── systemPrompts.js  # All system prompts
│   │   │   └── fewShotExamples.js
│   │   ├── utils/
│   │   │   ├── tokenCounter.js   # Token estimation (tiktoken)
│   │   │   ├── contextTrimmer.js # Trim to fit budget
│   │   │   ├── diffGenerator.js  # Unified diff generation
│   │   │   └── planValidator.js  # Zod validation
│   │   └── schemas/
│   │       ├── planSchema.js     # Zod: plan JSON
│   │       └── editSchema.js     # Zod: code edit JSON
│   ├── rag/
│   │   ├── indexer.js            # Index files into ChromaDB
│   │   ├── chunker.js            # tree-sitter chunking
│   │   ├── embedder.js           # Nomic Embed API
│   │   ├── searcher.js           # ChromaDB query + rerank
│   │   └── treeParser.js         # tree-sitter WASM
│   └── llm/
│       ├── groqClient.js         # Groq API wrapper
│       ├── geminiClient.js       # Gemini fallback
│       ├── rateLimiter.js        # Usage tracking
│       └── streamHandler.js      # SSE stream handling
├── routes/
│   └── agentRoutes.js            # /api/agent/* endpoints
└── sockets/
    └── agentSocket.js            # Socket.io agent events
```

### API Endpoints

| Method | Path                  | Phase | Purpose                    |
| ------ | --------------------- | ----- | -------------------------- |
| `POST` | `/api/agent/classify` | 0     | Classify user intent       |
| `POST` | `/api/agent/context`  | 1     | Build context + RAG        |
| `POST` | `/api/agent/plan`     | 2     | Generate execution plan    |
| `POST` | `/api/agent/execute`  | 4-6   | Execute plan step          |
| `POST` | `/api/agent/chat`     | —     | Simple chat (ASK shortcut) |
| `GET`  | `/api/agent/plan/:id` | —     | Retrieve saved plan        |

### Socket.io Events

| Event               | Direction | Purpose                                            |
| ------------------- | --------- | -------------------------------------------------- |
| `agent:thinking`    | S→C       | Phase indicator ("Planning...", "Writing code...") |
| `agent:plan`        | S→C       | Plan JSON for user review                          |
| `agent:step:start`  | S→C       | Step N started                                     |
| `agent:step:code`   | S→C       | Streaming code tokens                              |
| `agent:step:verify` | S→C       | Verification status                                |
| `agent:step:done`   | S→C       | Step N complete                                    |
| `agent:done`        | S→C       | All done, final result                             |
| `agent:approve`     | C→S       | User approves plan                                 |
| `agent:reject`      | C→S       | User rejects plan                                  |
| `agent:cancel`      | C→S       | Cancel mid-execution                               |

---

## 📚 Module 5: Learning Mode

A guided learning system that generates personalized roadmaps with exercises, using the same AI and code execution infrastructure.

**Flow**: User opens Learn Mode → describes what to learn → AI asks clarifying questions → generates a step-by-step roadmap → exercises run in split-view Monaco → final step applies learning to user's actual project.

_(See HLD architecture document for full details)_

---

## 🚀 Project Setup

```bash
# Clone
git clone https://github.com/<your-repo>/Anti_GV.git
cd Anti_GV

# Frontend
cd frontend
npm install
npm run dev          # → http://localhost:5173

# Backend
cd ../backend
npm install
cp .env.example .env  # Add your API keys
npm run dev          # → http://localhost:3001
```

### Environment Variables (Backend)

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/antigv

# LLM
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...

# Vector DB
CHROMA_URL=http://localhost:8000

# Embeddings
NOMIC_API_KEY=nk-...

# JWT
JWT_SECRET=<random-string>
JWT_EXPIRES_IN=7d

# Judge0
JUDGE0_URL=http://localhost:2358
JUDGE0_API_KEY=<key>
```

---

## 📐 Full Project File Structure

```
Anti_GV/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileTree/          # ← Teammate 1
│   │   │   ├── Editor/            # ← Teammate 1
│   │   │   ├── Terminal/          # ← Teammate 2
│   │   │   ├── AIPanel/           # ← You (Teammate 3)
│   │   │   │   ├── AIPanel.jsx
│   │   │   │   ├── ChatMessages.jsx
│   │   │   │   ├── PlanViewer.jsx
│   │   │   │   ├── StepProgress.jsx
│   │   │   │   └── DiffReview.jsx
│   │   │   ├── LearningPanel/     # ← Shared
│   │   │   └── Topbar/            # ← Teammate 1
│   │   ├── stores/
│   │   │   ├── editorStore.js     # ← Teammate 1
│   │   │   ├── fileSystemStore.js # ← Teammate 1
│   │   │   ├── terminalStore.js   # ← Teammate 2
│   │   │   └── agentStore.js      # ← You
│   │   ├── services/
│   │   │   ├── memfsService.js    # ← Teammate 1
│   │   │   ├── executionService.js # ← Teammate 2
│   │   │   └── agentService.js    # ← You (Socket.io client for agent events)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── authRoutes.js
│   │   │   ├── workspaceRoutes.js
│   │   │   ├── agentRoutes.js     # ← You
│   │   │   ├── executionRoutes.js # ← Teammate 2
│   │   │   └── learnRoutes.js
│   │   ├── services/
│   │   │   ├── agent/             # ← You (entire directory)
│   │   │   ├── rag/               # ← You (entire directory)
│   │   │   ├── llm/               # ← You (entire directory)
│   │   │   ├── execution/         # ← Teammate 2
│   │   │   ├── workspace/         # ← Teammate 1 (backend)
│   │   │   └── auth/
│   │   ├── middleware/
│   │   │   └── authMiddleware.js
│   │   ├── sockets/
│   │   │   ├── agentSocket.js     # ← You
│   │   │   └── executionSocket.js # ← Teammate 2
│   │   └── app.js
│   ├── package.json
│   └── .env
├── hld_architecture.html          # HLD reference document
└── README.md                      # This file
```

---

## 📋 Implementation Roadmap

### Week 1 — MVP (Get it working)

- [ ] Basic intent classifier (rule-based)
- [ ] Static context assembly (no RAG)
- [ ] Planner agent (single LLM call)
- [ ] Coder agent (full-file replacement)
- [ ] Basic Monaco diff display
- [ ] Socket.io streaming

### Week 2 — Intelligence (Make it smart)

- [ ] RAG pipeline (ChromaDB + Nomic Embed)
- [ ] Verification via Code Runner integration
- [ ] Fixer agent (1-retry)
- [ ] User approval gate UI
- [ ] Token budget management

### Week 3 — Reliability (Make it bulletproof)

- [ ] Search-and-replace diffs
- [ ] Critic agent (self-review)
- [ ] 3-retry error loop
- [ ] Multi-file change coordination
- [ ] Incremental re-indexing

### Week 4 — Polish

- [ ] Dependency graph analysis
- [ ] tree-sitter smart chunking
- [ ] Smart context trimming
- [ ] Groq → Gemini fallback chain
- [ ] Learning Mode integration

---

## 📄 License

MIT — Free and open source.

---

_Built with ❤️ for the hackathon. Total infrastructure cost: $0._
