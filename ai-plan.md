# Production-Grade Multi-Provider Agent Pipeline for Anti_GV
## Free-Tier Architecture with Enterprise Reliability

---

## Executive Summary

This plan upgrades Anti_GV to a production-ready, cost-free agent control plane with intelligent model orchestration, graceful degradation, and enterprise-grade observability. Unlike the original plan's provider-centric approach, this architecture uses **task-aware model ensembles**, **quality-based routing with real-time fallbacks**, and **parallel verification paths** to maximize reliability while maintaining zero infrastructure costs.

**Key Improvements:**
- Ensemble-based routing (3+ models per critical path)
- Quality voting and consensus mechanisms
- Parallel execution for speed-critical paths
- Smart caching to reduce redundant API calls
- Adaptive token budgeting based on task complexity
- Production observability without vendor lock-in

---

## 1. Core Architecture Redesign

### 1.1 Model Registry Schema v2

```typescript
interface ModelRegistration {
  // Identity
  provider: 'groq' | 'nvidia_nim' | 'github' | 'openrouter' | 'huggingface' | 'together';
  modelId: string;
  displayName: string;
  
  // Capabilities (measured, not assumed)
  capabilities: {
    taskTypes: TaskType[];           // What it's proven good at
    contextWindow: number;
    maxOutputTokens: number;
    supportsJSON: boolean;
    supportsStreaming: boolean;
    supportsToolUse: boolean;
    codingStrength: 0..100;          // Measured via evals
    reasoningStrength: 0..100;
    followingStrength: 0..100;       // Instruction adherence
  };
  
  // Performance (rolling 24hr windows)
  metrics: {
    successRate: number;             // % successful completions
    avgLatencyP50: number;
    avgLatencyP95: number;
    errorRate: number;
    timeoutRate: number;
    rateLimitHitRate: number;
    tokenEfficiency: number;         // Quality/token ratio
    userApprovalRate: number;        // % of outputs accepted by users
  };
  
  // Operational
  operational: {
    healthState: 'healthy' | 'degraded' | 'offline' | 'circuit_open';
    circuitBreakerState: CircuitBreakerConfig;
    quotaRemaining?: number;
    rateLimitReset?: Date;
    costTier: 'free' | 'free_with_limits' | 'paid';
    priorityTier: 1..10;             // Higher = preferred
    lastHealthCheck: Date;
    consecutiveFailures: number;
  };
  
  // Constraints
  constraints: {
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    maxDailyTokens?: number;
    requiresAuth: boolean;
    deprecationDate?: Date;
    unstableBackend?: boolean;       // For OpenRouter free tier
  };
}
```

### 1.2 Task-Aware Ensemble Router

**Replace single-model routing with ensemble strategies:**

```typescript
enum RoutingStrategy {
  FASTEST_FIRST,      // Speed critical (chat, intent classification)
  CONSENSUS_VOTE,     // Quality critical (planning, validation)
  PARALLEL_RACE,      // Reliability critical (brief generation)
  WATERFALL,          // Cost optimized (codegen, fix attempts)
  SPECIALIST_FIRST,   // Task-specific (code > reasoning > general)
}

interface TaskRouteConfig {
  taskType: TaskType;
  strategy: RoutingStrategy;
  
  // Model selection
  primaryPool: ModelSelector[];      // 3-5 models ranked by fit
  fallbackPool: ModelSelector[];     // 2-3 backup options
  emergencyPool: ModelSelector[];    // Always-available last resort
  
  // Execution policy
  parallelCount?: number;             // For CONSENSUS_VOTE/PARALLEL_RACE
  consensusThreshold?: number;        // Min agreement for acceptance
  maxRetries: number;
  retryBackoffMs: number[];
  timeoutMs: number;
  
  // Quality gates
  minConfidenceScore: number;
  requiresValidation: boolean;
  allowPartialSuccess: boolean;
  
  // Resource limits
  maxInputTokens: number;
  maxOutputTokens: number;
  cacheable: boolean;
  cacheTTL?: number;
  
  // Model preferences
  preferredCapabilities: string[];
  requiredCapabilities: string[];
  scoreWeights: {
    taskFit: number;
    latency: number;
    successRate: number;
    approval: number;
    cost: number;
  };
}
```

### 1.3 Enhanced Circuit Breaker System

```typescript
interface CircuitBreakerConfig {
  // Failure thresholds
  failureThreshold: number;          // Consecutive failures before opening
  errorRateThreshold: number;        // % errors in window before opening
  windowSizeMs: number;              // Rolling window duration
  
  // Recovery
  halfOpenAfterMs: number;           // Time before test recovery
  successThreshold: number;          // Successes needed to close
  
  // Provider-specific
  openRouterPolicy: {
    // Stricter for unstable free tier
    failureThreshold: 2;
    errorRateThreshold: 0.3;
    windowSizeMs: 300000;            // 5min window
    halfOpenAfterMs: 600000;         // 10min cooldown
  };
  
  // State
  state: 'closed' | 'half_open' | 'open';
  lastStateChange: Date;
  failureCount: number;
  successCount: number;
  recentErrors: Error[];
}
```

---

## 2. Free Model Strategy

### 2.1 Provider Roles (Production-Optimized)

**Tier 1: Primary Ensemble (High Reliability)**
- **Groq** (llama-3.3-70b-versatile, mixtral-8x7b-32768)
  - Role: Primary for all interactive tasks, fast codegen
  - Strengths: Ultra-low latency (300-500ms), stable API, generous limits
  - Limits: 30 req/min, 14400 req/day
  - Circuit breaker: 5 failures in 5min window

- **NVIDIA NIM** (meta/llama-3.1-70b-instruct, mistralai/mixtral-8x22b-instruct-v0.1)
  - Role: Primary for reasoning-heavy planning and code quality
  - Strengths: Code specialization, function calling, long context
  - Limits: Lower but stable
  - Circuit breaker: 5 failures in 10min window

**Tier 2: Ensemble Expansion (Quality Voting)**
- **GitHub Models** (gpt-4o-mini, Mistral-large-2407, Phi-4)
  - Role: Consensus voting, shadow evaluation, A/B experiments
  - Strengths: Diverse model selection, rate limits less aggressive
  - Limits: 15 req/min per model, 150/day per model
  - Circuit breaker: 3 failures in 5min window

- **Together AI** (Meta-Llama-3.1-70B-Instruct-Turbo, Qwen2.5-72B-Instruct-Turbo)
  - Role: Specialist backup for code and reasoning
  - Strengths: Code-tuned models, function calling, competitive speed
  - Limits: Moderate free tier
  - Circuit breaker: 4 failures in 5min window

**Tier 3: Overflow & Experimentation**
- **OpenRouter** (Free tier models only: google/gemini-flash-1.5-8b, meta-llama/llama-3.2-11b-vision-instruct)
  - Role: Emergency overflow only, experimental features
  - Strengths: Model diversity, vision models
  - Weaknesses: Backend instability, unpredictable quality
  - Limits: Varies by backend
  - Circuit breaker: 2 failures in 3min window (aggressive)

- **Hugging Face Inference** (Selected free endpoints)
  - Role: Specialized tasks (embedding, classification)
  - Strengths: Task-specific models
  - Circuit breaker: 3 failures in 5min window

### 2.2 Model Selection Matrix

| Task Type | Strategy | Primary Pool | Consensus Models | Fallback |
|-----------|----------|--------------|------------------|----------|
| **Intent Classification** | FASTEST_FIRST | Groq Llama-3.3-70B | N/A | GitHub GPT-4o-mini |
| **Task Brief Generation** | PARALLEL_RACE | Groq Mixtral, NVIDIA Llama-3.1 | GitHub Mistral-large | Together Llama-3.1 |
| **Context Assembly** | WATERFALL | Groq Llama-3.3-70B | N/A | NVIDIA Mixtral |
| **Planning** | CONSENSUS_VOTE | NVIDIA Llama-3.1, GitHub Mistral-large, Groq Mixtral | All 3 (67% threshold) | Together Qwen2.5-72B |
| **Plan Validation** | CONSENSUS_VOTE | Groq Llama-3.3, NVIDIA Mixtral | Both (100% agreement) | GitHub GPT-4o-mini |
| **Codegen (per step)** | SPECIALIST_FIRST | NVIDIA Llama-3.1, Together Qwen2.5 | GitHub Phi-4 (shadow) | Groq Mixtral |
| **Critic/Analysis** | CONSENSUS_VOTE | Groq Llama-3.3, GitHub Mistral-large | Both (100%) | NVIDIA Llama-3.1 |
| **Fixer/Repair** | WATERFALL | Same as failed codegen, then rotate | N/A | Escalate to user |
| **Verification** | PARALLEL_RACE | Groq Llama-3.3, GitHub GPT-4o-mini | N/A | NVIDIA Llama-3.1 |
| **Interactive Chat** | FASTEST_FIRST | Groq Llama-3.3-70B | N/A | Groq Mixtral |

---

## 3. Execution Pipeline (Production Flow)

### 3.1 Request Lifecycle with Quality Gates

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: Request Normalization & Health Check (50-100ms)            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Health Snapshot (parallel)                                       │
│     ├─ Query all provider /health endpoints (cached 30s)            │
│     ├─ Check circuit breaker states                                 │
│     ├─ Verify rate limit headroom (>20% capacity)                   │
│     └─ Update model registry availability                           │
│                                                                       │
│  2. Cache Check                                                      │
│     ├─ Hash normalized request + context fingerprint                │
│     ├─ Check brief cache (24hr TTL)                                 │
│     └─ Check plan cache if brief match (6hr TTL)                    │
│                                                                       │
│  3. Token Budget Allocation                                          │
│     ├─ Classify task complexity (simple/medium/complex)             │
│     ├─ Allocate per-stage budgets                                   │
│     └─ Set overflow thresholds                                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: Intent & Brief Generation (PARALLEL_RACE, 300-800ms)       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Parallel execution:                                                 │
│  ├─ Runner 1: Groq Mixtral-8x7b                                     │
│  ├─ Runner 2: NVIDIA Llama-3.1-70b                                  │
│  └─ Runner 3: GitHub Mistral-large (async shadow)                   │
│                                                                       │
│  Selection: First valid response wins (quality threshold: 0.7)      │
│                                                                       │
│  Output: CanonicalTaskBrief {                                        │
│    userGoal: string;                                                 │
│    requestedOutcome: string;                                         │
│    constraints: Constraint[];                                        │
│    namedTargets: FileTarget[];      // Explicitly mentioned         │
│    inferredTargets: FileTarget[];   // Context-derived              │
│    ambiguityFlags: AmbiguityFlag[]; // Requires clarification       │
│    riskHints: RiskHactor[];          // Security/breaking concerns  │
│    verificationIntent: VerificationType;                            │
│    executionMode: 'autonomous' | 'plan_approval' | 'step_approval'; │
│    complexity: 'simple' | 'medium' | 'complex';                     │
│    confidence: number;               // 0-1 score                   │
│  }                                                                    │
│                                                                       │
│  Quality Gate: confidence >= 0.7 or escalate to clarification       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: Context Assembly (WATERFALL, 200-500ms)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Sequential with early termination:                                  │
│                                                                       │
│  1. Workspace Focus (cheap)                                          │
│     ├─ File tree scan (local)                                       │
│     ├─ Git status (local)                                           │
│     └─ Recent edits (from state)                                    │
│                                                                       │
│  2. Symbol & Dependency Graphs (medium)                              │
│     ├─ Parse namedTargets + inferredTargets                         │
│     ├─ Build import/export graph                                    │
│     ├─ Identify affected modules                                    │
│     └─ Extract type signatures                                      │
│                                                                       │
│  3. Smart Retrieval (adaptive)                                       │
│     ├─ Vector search on userGoal (if embedding available)           │
│     ├─ Keyword search fallback                                      │
│     ├─ Relevance scoring                                            │
│     └─ Budget-constrained chunk selection                           │
│                                                                       │
│  4. Conversation Memory (temporal decay)                             │
│     ├─ Last 5 turns: full context                                   │
│     ├─ Last 20 turns: summarized                                    │
│     └─ Older: keyword index only                                    │
│                                                                       │
│  5. Evidence Collection                                              │
│     ├─ Terminal history (last 10 commands)                          │
│     ├─ Error logs (last 50 lines)                                   │
│     ├─ Diagnostics (lint/test output)                               │
│     └─ Previous verification results                                │
│                                                                       │
│  Output: ContextBundle {                                             │
│    sections: Map<SectionType, ContextSection>;                      │
│    totalTokens: number;                                              │
│    perSectionBudget: Map<SectionType, number>;                      │
│    retrievalConfidence: number;                                      │
│    crossReferences: Reference[];                                     │
│    staleSections: SectionType[];                                     │
│    budgetOverflow: boolean;                                          │
│  }                                                                    │
│                                                                       │
│  Quality Gate: retrievalConfidence >= 0.6 or flag missing context   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 4: Plan Generation (CONSENSUS_VOTE, 1-3s)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Parallel execution with voting:                                     │
│                                                                       │
│  ├─ Planner 1: NVIDIA Llama-3.1-70b-instruct (primary)              │
│  ├─ Planner 2: GitHub Mistral-large-2407 (primary)                  │
│  ├─ Planner 3: Groq Mixtral-8x7b-32768 (primary)                    │
│  └─ Planner 4: Together Qwen2.5-72B (shadow, async)                 │
│                                                                       │
│  Consensus Logic:                                                    │
│  1. Parse all plan outputs into normalized ExecutionPlan            │
│  2. Compare step counts, file targets, dependency graphs            │
│  3. Score similarity between plans (>67% threshold)                 │
│  4. If consensus reached: merge with highest-confidence plan        │
│  5. If no consensus: surface differences to user OR re-plan         │
│                                                                       │
│  Output: ExecutionPlan {                                             │
│    summary: string;                                                  │
│    risk: 'low' | 'medium' | 'high';                                 │
│    confidence: number;                                               │
│    assumptions: Assumption[];                                        │
│    clarificationsNeeded: Clarification[];                           │
│    steps: PlanStep[];                                                │
│    verificationPlan: VerificationStrategy;                          │
│    estimatedFilesChanged: number;                                    │
│    consensusScore: number;           // % agreement across planners │
│    plannerVotes: Map<string, Vote>; // Which models agreed          │
│  }                                                                    │
│                                                                       │
│  Quality Gate: consensusScore >= 0.67 AND confidence >= 0.7         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 5: Plan Validation (CONSENSUS_VOTE, 500ms-1s)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Dual-validator with 100% agreement requirement:                     │
│                                                                       │
│  ├─ Validator 1: Groq Llama-3.3-70b-versatile                       │
│  └─ Validator 2: NVIDIA Mixtral-8x22b-instruct                      │
│                                                                       │
│  Validation Checks:                                                  │
│  ├─ Circular dependency detection                                   │
│  ├─ File conflict analysis (same file multiple steps)               │
│  ├─ Scope creep detection (vs. original brief)                      │
│  ├─ Missing prerequisite detection                                  │
│  ├─ Context sufficiency check                                       │
│  ├─ Multi-file ordering safety                                      │
│  └─ Risk amplification detection                                    │
│                                                                       │
│  Output: PlanValidationReport {                                      │
│    valid: boolean;                                                   │
│    blockingIssues: Issue[];          // Must fix before execution   │
│    warnings: Warning[];              // Suggest review              │
│    scopeDelta: number;               // % deviation from brief      │
│    missingContext: ContextGap[];                                     │
│    dependencyGraph: DependencyDAG;                                   │
│    validatorAgreement: boolean;      // Both validators concur      │
│    recommendations: Recommendation[];                                │
│  }                                                                    │
│                                                                       │
│  Quality Gate: valid && validatorAgreement && blockingIssues.length == 0 │
│  If gate fails: clarify, re-plan, or abort                          │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 6: User Approval (Plan Review)                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Present to user:                                                    │
│  ├─ Plan summary with risk assessment                               │
│  ├─ File change visualization (dependency graph)                    │
│  ├─ Validation report (warnings + recommendations)                  │
│  ├─ Consensus metadata (which models agreed)                        │
│  └─ Estimated execution time                                        │
│                                                                       │
│  User actions:                                                       │
│  ├─ Approve all                                                      │
│  ├─ Approve subset (if steps are independent)                       │
│  ├─ Request clarification                                           │
│  ├─ Reject and provide feedback                                     │
│  └─ Modify plan manually                                            │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 7: Step Execution Loop (SPECIALIST_FIRST per step)            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  For each approved step group:                                       │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 7.1: Step-Local Codegen (1-3s per step)                       │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  Model Selection (SPECIALIST_FIRST):                           │ │
│  │  ├─ Primary: NVIDIA Llama-3.1-70b (code specialist)           │ │
│  │  ├─ Fallback 1: Together Qwen2.5-72B (code specialist)        │ │
│  │  ├─ Fallback 2: Groq Mixtral-8x7b                             │ │
│  │  └─ Shadow: GitHub Phi-4 (quality comparison, async)          │ │
│  │                                                                 │ │
│  │  Context: {                                                     │ │
│  │    brief: CanonicalTaskBrief;     // Unchanged goal            │ │
│  │    stepSlice: PlanStep;           // Only this step            │ │
│  │    relevantFiles: File[];         // Named + affected files    │ │
│  │    contracts: Contract[];         // Required interfaces       │ │
│  │    nearbyEvidence: Evidence[];    // Tests, errors, logs       │ │
│  │    dependencyContext: Dependency[]; // What this step needs    │ │
│  │  }                                                              │ │
│  │                                                                 │ │
│  │  Output: StepPatch {                                            │ │
│  │    stepId: string;                                              │ │
│  │    fileGroupId: string;                                         │ │
│  │    operations: FileOperation[];   // SEARCH/REPLACE blocks     │ │
│  │    rationale: string;                                           │ │
│  │    dependsOn: string[];           // Other step IDs            │ │
│  │    verificationHints: string[];                                │ │
│  │    confidence: number;                                          │ │
│  │    modelUsed: string;                                           │ │
│  │  }                                                               │ │
│  │                                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↓                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 7.2: Pre-Flight Validation (100-300ms)                        │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  Structural Checks (local, fast):                              │ │
│  │  ├─ JSON schema validation                                     │ │
│  │  ├─ SEARCH block match verification (all blocks findable)     │ │
│  │  ├─ Patch shape sanity (no malformed operations)              │ │
│  │  ├─ File path safety (no directory traversal)                 │ │
│  │  ├─ Secret leakage scan (API keys, tokens)                    │ │
│  │  └─ Basic syntax parse (if cheap for language)                │ │
│  │                                                                 │ │
│  │  If any check fails:                                           │ │  │  │  ├─ Retry same step with critique (max 3 attempts)            │ │
│  │  ├─ Switch to fallback model if pattern repeats               │ │
│  │  └─ Escalate to user if all retries exhausted                 │ │
│  │                                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↓                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 7.3: Patch Staging (shadow transaction)                       │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  1. Apply patches to shadow tree (not live workspace)          │ │
│  │  2. Track file state per group:                                │ │
│  │     - original content                                          │ │
│  │     - patched content                                           │ │
│  │     - diff visualization                                        │ │
│  │  3. Detect conflicts:                                           │ │
│  │     - Same file modified in multiple groups                     │ │
│  │     - User edited file since planning                           │ │
│  │     - Dependency ordering violated                              │ │
│  │  4. Mark groups as:                                             │ │
│  │     - independent (can approve separately)                      │ │
│  │     - dependent (must approve together)                         │ │
│  │     - conflicted (requires resolution)                          │ │
│  │                                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 8: Incremental Verification (200ms-2s per group)              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Triggered when a file group affects:                                │
│  ├─ Imports/exports                                                  │
│  ├─ Type definitions                                                 │
│  ├─ Build configuration                                              │
│  └─ Critical infrastructure files                                    │
│                                                                       │
│  Lightweight checks:                                                 │
│  ├─ Syntax validation (language-specific)                           │
│  ├─ Import resolution (can find all imports)                        │
│  ├─ Type checking (if TypeScript/typed language)                    │
│  ├─ Lint critical rules only (security, breaking changes)           │
│  └─ Build config validation (does it parse)                         │
│                                                                       │
│  Parallel execution with timeout (10s max per check)                │
│                                                                       │
│  Outcome per group:                                                  │
│  ├─ PASS: mark as verified_pending_approval                         │
│  ├─ FAIL: mark as needs_fix, trigger repair loop                    │
│  └─ TIMEOUT: mark as verification_uncertain, warn user              │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 9: Grouped Multi-File Review                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Present to user:                                                    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ File Group 1: Auth Module (INDEPENDENT)                     │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ Files: auth.ts, auth.test.ts                                │   │
│  │ Status: ✓ Pre-flight passed, ✓ Verified                     │   │
│  │ Risk: LOW                                                    │   │
│  │ [View Diff] [Approve] [Defer] [Reject]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ File Group 2: API Routes (DEPENDS ON: Group 3)              │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ Files: api/users.ts, api/posts.ts                           │   │
│  │ Status: ✓ Pre-flight passed, ⚠ Verification uncertain       │   │
│  │ Risk: MEDIUM                                                 │   │
│  │ Warning: Depends on Group 3, must approve together          │   │
│  │ [View Diff] [Approve with Group 3] [Defer] [Reject]         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ File Group 3: Database Schema (DEPENDED ON BY: Group 2)     │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ Files: schema.prisma, migrations/001_add_posts.sql          │   │
│  │ Status: ✓ Pre-flight passed, ✗ Lint failed                  │   │
│  │ Risk: HIGH                                                   │   │
│  │ Error: Missing index on posts.userId                        │   │
│  │ [View Diff] [Fix & Re-verify] [Approve Anyway] [Reject]     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  User can:                                                           │
│  ├─ Approve independent groups separately                           │
│  ├─ Approve dependent groups as a batch                             │
│  ├─ Reject and provide feedback for repair                          │
│  ├─ Defer groups for later review                                   │
│  ├─ Request fixes for failed verification                           │
│  └─ Rollback entire transaction at any time                         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 10: Repair Loop (for failed verification)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Triggered by: verification failures, user-requested fixes           │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 10.1: Critic Analysis (CONSENSUS_VOTE, 500ms-1s)             │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  Parallel critics:                                             │ │
│  │  ├─ Critic 1: Groq Llama-3.3-70b-versatile                    │ │
│  │  └─ Critic 2: GitHub Mistral-large-2407                       │ │
│  │                                                                 │ │
│  │  Input: {                                                       │ │
│  │    originalPatch: StepPatch;                                   │ │
│  │    failureSignature: ErrorSignature;                           │ │
│  │    verificationOutput: string;                                 │ │
│  │    attemptNumber: number;                                      │ │
│  │  }                                                              │ │
│  │                                                                 │ │
│  │  Output: CriticAnalysis {                                      │ │
│  │    rootCause: string;                                          │ │
│  │    severity: 'trivial' | 'moderate' | 'fundamental';          │ │
│  │    fixStrategy: 'retry' | 'rewrite' | 'escalate';             │ │
│  │    specificGuidance: string[];                                 │ │
│  │    requiresModelSwitch: boolean;                               │ │
│  │  }                                                              │ │
│  │                                                                 │ │
│  │  Agreement requirement: 100% (both critics must concur)        │ │
│  │                                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                              ↓                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ 10.2: Fixer Execution (WATERFALL, 1-2s)                       │ │
│  ├───────────────────────────────────────────────────────────────┤ │
│  │                                                                 │ │
│  │  Retry policy:                                                  │ │
│  │  1. Attempt 1: Same model with critic guidance                 │ │
│  │  2. Attempt 2: Fallback model if pattern repeats               │ │
│  │  3. Attempt 3: Different model family with full context        │ │
│  │  4. Escalate: Surface to user with diagnostic info             │ │
│  │                                                                 │ │
│  │  Failure pattern detection:                                     │ │
│  │  ├─ Hash error signatures                                      │ │
│  │  ├─ Detect identical failures (same hash twice)                │ │
│  │  └─ Switch strategy on repetition                              │ │
│  │                                                                 │ │
│  │  Model rotation:                                                │ │
│  │  NVIDIA → Together → Groq → GitHub → User escalation           │ │
│  │                                                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  Max retry count: 3 per file group                                  │
│  Max total repair time: 30s per group (hard timeout)                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 11: Final Verification (PARALLEL_RACE, 2-10s)                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Triggered after: all groups approved                                │
│                                                                       │
│  Comprehensive checks (parallel):                                    │
│  ├─ Full lint on changed files + affected neighbors                 │
│  ├─ Type checking (if applicable)                                   │
│  ├─ Unit tests (affected test files only)                           │
│  ├─ Integration tests (if explicitly requested)                     │
│  ├─ Build verification (for build-critical changes)                 │
│  └─ Security scan (dependency vulnerabilities, secrets)              │
│                                                                       │
│  Race execution:                                                     │
│  ├─ Runner 1: Groq Llama-3.3-70b (fastest)                          │
│  ├─ Runner 2: GitHub GPT-4o-mini (backup)                           │
│  └─ First valid completion wins                                     │
│                                                                       │
│  Timeout policy:                                                     │
│  ├─ Per-check timeout: 10s                                          │
│  ├─ Total verification timeout: 30s                                 │
│  └─ On timeout: mark as uncertain, warn user                        │
│                                                                       │
│  Partial success policy:                                             │
│  ├─ Groups that pass: mark as ready_to_commit                       │
│  ├─ Groups that fail: mark as needs_fix, return to repair loop      │
│  ├─ Independent groups: can commit successful ones                  │
│  ├─ Dependent groups: all-or-nothing commit                         │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 12: Commit & Telemetry                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Commit Strategy:                                                    │
│  1. Apply ready_to_commit groups to live workspace                  │
│  2. Create git commit with structured message                       │
│  3. Tag commit with runId for traceability                          │
│  4. Update workspace state                                          │
│  5. Clean up shadow transaction                                     │
│                                                                       │
│  Telemetry Capture:                                                  │
│  {                                                                    │
│    runId: UUID;                                                      │
│    timestamp: Date;                                                  │
│    phases: Map<Phase, PhaseMetrics>;                                │
│    models: Map<ModelId, ModelUsage>;                                │
│    tokens: { total, perModel, perPhase };                           │
│    latency: { total, perPhase, p50, p95, p99 };                     │
│    quality: {                                                        │
│      planConsensusScore: number;                                     │
│      validationAgreement: boolean;                                   │
│      preFlightPassRate: number;                                      │
│      verificationPassRate: number;                                   │
│      repairAttempts: number;                                         │
│      userApprovalRate: number;                                       │
│    };                                                                 │
│    health: {                                                          │
│      circuitBreakerEvents: Event[];                                  │
│      providerFailures: Map<Provider, FailureCount>;                 │
│      rateLimitHits: number;                                          │
│      timeouts: number;                                               │
│    };                                                                 │
│    outcome: 'success' | 'partial_success' | 'failure' | 'aborted';  │
│    filesChanged: number;                                             │
│    linesChanged: number;                                             │
│    userFeedback?: string;                                            │
│  }                                                                    │
│                                                                       │
│  Persist to: local SQLite + optional remote analytics               │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Advanced Features

### 4.1 Smart Caching System

```typescript
interface CacheStrategy {
  // Brief caching (reduces redundant normalization)
  briefCache: {
    keyFn: (request, context) => hash;
    ttl: 24 * 60 * 60 * 1000; // 24 hours
    invalidateOn: ['workspace_change', 'context_drift'];
  };
  
  // Plan caching (for repeated similar requests)
  planCache: {
    keyFn: (brief, contextFingerprint) => hash;
    ttl: 6 * 60 * 60 * 1000; // 6 hours
    invalidateOn: ['file_change', 'dependency_update'];
    similarityThreshold: 0.85; // Fuzzy matching
  };
  
  // Provider health caching
  healthCache: {
    ttl: 30 * 1000; // 30 seconds
    staleWhileRevalidate: true;
  };
  
  // Context chunk caching
  chunkCache: {
    keyFn: (filePath, version) => hash;
    ttl: 60 * 60 * 1000; // 1 hour
    maxSize: 100 * 1024 * 1024; // 100MB
  };
}
```

### 4.2 Adaptive Token Budgeting

```typescript
interface TokenBudget {
  // Base allocations by task complexity
  simple: {
    brief: 500,
    context: 2000,
    planning: 4000,
    codegen: 6000,
    verification: 2000,
  };
  
  medium: {
    brief: 800,
    context: 4000,
    planning: 8000,
    codegen: 12000,
    verification: 4000,
  };
  
  complex: {
    brief: 1200,
    context: 8000,
    planning: 16000,
    codegen: 24000,
    verification: 8000,
  };
  
  // Dynamic adjustments
  adjustments: {
    // Expand budgets if high confidence and sufficient headroom
    expandOnConfidence: (confidence: number) => multiplier;
    
    // Shrink budgets if approaching rate limits
    shrinkOnPressure: (headroom: number) => multiplier;
    
    // Redistribute unused tokens
    redistributeUnused: (phase: Phase, unused: number) => allocation;
  };
}
```

### 4.3 Consensus Mechanisms

```typescript
interface ConsensusEngine {
  // Plan consensus (structural similarity)
  planConsensus: {
    compareSteps: (plan1, plan2) => similarity;
    compareFileTargets: (plan1, plan2) => overlap;
    compareDependencies: (plan1, plan2) => graphSimilarity;
    threshold: 0.67; // 67% agreement required
    
    merge: (plans: ExecutionPlan[]) => {
      // Use highest-confidence plan as base
      // Incorporate unique steps from others if >80% agree
      // Flag differences for user review
    };
  };
  
  // Validation consensus (boolean logic)
  validationConsensus: {
    requireFullAgreement: true;
    tieBreaker: 'user_review'; // On disagreement
  };
  
  // Critic consensus (severity agreement)
  criticConsensus: {
    requireFullAgreement: true;
    escalateOnDisagreement: true;
  };
}
```

### 4.4 Failure Pattern Detection

```typescript
interface FailurePatternDetector {
  // Error signature hashing
  hashError: (error: Error, context: Context) => signature;
  
  // Pattern database
  patterns: Map<Signature, {
    count: number;
    lastSeen: Date;
    successfulFixes: FixStrategy[];
    failedFixes: FixStrategy[];
    recommendedAction: Action;
  }>;
  
  // Detection logic
  detect: (signature: Signature) => {
    if (patterns.has(signature)) {
      const pattern = patterns.get(signature);
      
      // Same failure twice with same model
      if (pattern.count >= 2) {
        return {
          action: 'switch_model',
          reason: 'repeated_failure',
          suggestedModel: getNextInRotation(),
        };
      }
      
      // Known unfixable pattern
      if (pattern.failedFixes.length >= 3) {
        return {
          action: 'escalate_to_user',
          reason: 'known_hard_problem',
          context: pattern.failedFixes,
        };
      }
      
      // Try known successful fix
      if (pattern.successfulFixes.length > 0) {
        return {
          action: 'apply_known_fix',
          strategy: pattern.successfulFixes[0],
        };
      }
    }
    
    return { action: 'retry', reason: 'first_occurrence' };
  };
}
```

### 4.5 Rate Limit Management

```typescript
interface RateLimitManager {
  // Per-provider quotas
  quotas: Map<Provider, {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    tokensPerDay?: number;
    currentUsage: Usage;
    resetTimes: Map<Window, Date>;
  }>;
  
  // Headroom calculation
  calculateHeadroom: (provider: Provider) => {
    const quota = quotas.get(provider);
    const headroom = {
      minute: (quota.requestsPerMinute - quota.currentUsage.minute) / quota.requestsPerMinute,
      hour: (quota.requestsPerHour - quota.currentUsage.hour) / quota.requestsPerHour,
      day: (quota.requestsPerDay - quota.currentUsage.day) / quota.requestsPerDay,
    };
    return Math.min(...Object.values(headroom));
  };
  
  // Pressure-based routing
  routeUnderPressure: (task: Task) => {
    const providers = getEligibleProviders(task);
    const headrooms = providers.map(p => ({
      provider: p,
      headroom: calculateHeadroom(p),
    }));
    
    // Filter out providers with <20% headroom
    const available = headrooms.filter(h => h.headroom > 0.2);
    
    if (available.length === 0) {
      // Emergency: use provider with highest headroom regardless
      return headrooms.sort((a, b) => b.headroom - a.headroom)[0].provider;
    }
    
    // Normal: route by task fit among available
    return selectByTaskFit(available.map(h => h.provider));
  };
}
```

---

## 5. Public API Contracts (Updated)

### 5.1 Enhanced Types

```typescript
// Task routing with ensemble support
interface TaskRouteConfig {
  taskType: TaskType;
  strategy: RoutingStrategy;
  primaryPool: ModelSelector[];
  fallbackPool: ModelSelector[];
  emergencyPool: ModelSelector[];
  parallelCount?: number;
  consensusThreshold?: number;
  maxRetries: number;
  retryBackoffMs: number[];
  timeoutMs: number;
  minConfidenceScore: number;
  requiresValidation: boolean;
  allowPartialSuccess: boolean;
  maxInputTokens: number;
  maxOutputTokens: number;
  cacheable: boolean;
  cacheTTL?: number;
  preferredCapabilities: string[];
  requiredCapabilities: string[];
  scoreWeights: {
    taskFit: number;
    latency: number;
    successRate: number;
    approval: number;
    cost: number;
  };
}

// Enhanced canonical brief
interface CanonicalTaskBrief {
  userGoal: string;
  requestedOutcome: string;
  constraints: Constraint[];
  namedTargets: FileTarget[];
  inferredTargets: FileTarget[];
  ambiguityFlags: AmbiguityFlag[];
  riskHints: RiskHint[];
  verificationIntent: VerificationType;
  executionMode: 'autonomous' | 'plan_approval' | 'step_approval';
  complexity: 'simple' | 'medium' | 'complex';
  confidence: number;
  generatedBy: ModelId[];
  consensusScore?: number;
}

// Enhanced context bundle
interface ContextBundle {
  sections: Map<SectionType, ContextSection>;
  totalTokens: number;
  perSectionBudget: Map<SectionType, number>;
  retrievalConfidence: number;
  crossReferences: Reference[];
  staleSections: SectionType[];
  budgetOverflow: boolean;
  fingerprint: string; // For cache invalidation
}

// Enhanced execution plan with consensus
interface ExecutionPlan {
  summary: string;
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  assumptions: Assumption[];
  clarificationsNeeded: Clarification[];
  steps: PlanStep[];
  verificationPlan: VerificationStrategy;
  estimatedFilesChanged: number;
  consensusScore: number;
  plannerVotes: Map<ModelId, Vote>;
  generatedBy: ModelId[];
}

// Enhanced validation report
interface PlanValidationReport {
  valid: boolean;
  blockingIssues: Issue[];
  warnings: Warning[];
  scopeDelta: number;
  missingContext: ContextGap[];
  dependencyGraph: DependencyDAG;
  validatorAgreement: boolean;
  validators: ModelId[];
  recommendations: Recommendation[];
}

// Enhanced step patch with provenance
interface StepPatch {
  stepId: string;
  fileGroupId: string;
  files: string[];
  operations: FileOperation[];
  rationale: string;
  dependsOn: string[];
  verificationHints: string[];
  retryCount: number;
  confidence: number;
  modelUsed: ModelId;
  alternativeModels: ModelId[]; // Shadow evaluations
}

// Comprehensive run state
interface RunState {
  runId: string;
  phase: Phase;
  taskType: TaskType;
  provider: Provider;
  model: ModelId;
  confidence?: number;
  risk?: RiskLevel;
  status: Status;
  stepId?: string;
  filePaths?: string[];
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  message: string;
  metadata: Record<string, any>;
}

// Telemetry record
interface TelemetryRecord {
  runId: string;
  timestamp: Date;
  phases: Map<Phase, PhaseMetrics>;
  models: Map<ModelId, ModelUsage>;
  tokens: TokenBreakdown;
  latency: LatencyBreakdown;
  quality: QualityMetrics;
  health: HealthMetrics;
  outcome: Outcome;
  filesChanged: number;
  linesChanged: number;
  userFeedback?: string;
}
```

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. ✅ Model registry with health tracking
2. ✅ Circuit breaker implementation
3. ✅ Basic routing engine (FASTEST_FIRST, WATERFALL)
4. ✅ Telemetry pipeline
5. ✅ Provider API integrations (Groq, NVIDIA, GitHub)

### Phase 2: Core Pipeline (Week 3-4)
6. ✅ Canonical task brief generation (PARALLEL_RACE)
7. ✅ Context bundle assembly with budgets
8. ✅ Cache system (brief, plan, health)
9. ✅ Plan generation (CONSENSUS_VOTE)
10. ✅ Plan validation (dual validators)

### Phase 3: Execution & Quality (Week 5-6)
11. ✅ Step-local codegen (SPECIALIST_FIRST)
12. ✅ Pre-flight validation checks
13. ✅ Shadow transaction staging
14. ✅ Incremental verification
15. ✅ Grouped multi-file review UX

### Phase 4: Reliability & Repair (Week 7-8)
16. ✅ Critic/fixer loops with consensus
17. ✅ Failure pattern detection
18. ✅ Model rotation and escalation
19. ✅ Final verification (PARALLEL_RACE)
20. ✅ Partial success handling

### Phase 5: Optimization (Week 9-10)
21. ✅ Rate limit management
22. ✅ Adaptive token budgeting
23. ✅ Advanced caching strategies
24. ✅ Provider health monitoring dashboard
25. ✅ Together AI + HuggingFace integration

### Phase 6: Evaluation (Week 11-12)
26. ✅ OpenRouter integration (overflow only)
27. ✅ Shadow evaluation framework
28. ✅ Regression test suite
29. ✅ A/B testing infrastructure
30. ✅ Model drift detection

---

## 7. Testing Strategy

### 7.1 Unit Tests
- Model registry operations
- Circuit breaker state transitions
- Token budget calculations
- Cache hit/miss logic
- Consensus algorithms
- Failure pattern matching

### 7.2 Integration Tests
- End-to-end pipeline execution
- Multi-provider failover
- Rate limit handling
- Cache invalidation
- Telemetry capture

### 7.3 Scenario Tests
1. **Healthy Primary Path**
   - All models available
   - Expected: Fast execution, minimal retries
   
2. **Degraded Primary**
   - Groq circuit breaker open
   - Expected: NVIDIA takes over, latency increase acceptable
   
3. **Multiple Failures**
   - Both Groq and NVIDIA degraded
   - Expected: Graceful fallback to GitHub/Together
   
4. **Rate Limit Pressure**
   - Approaching hourly limits
   - Expected: Intelligent request distribution
   
5. **Consensus Disagreement**
   - Planners produce different plans
   - Expected: User review or intelligent merge
   
6. **Verification Failures**
   - Lint/test failures
   - Expected: Repair loop with model rotation
   
7. **Partial Approval**
   - User approves subset of file groups
   - Expected: Correct dependency handling
   
8. **Cache Effectiveness**
   - Repeated similar requests
   - Expected: <200ms response for cached briefs/plans

### 7.4 Performance Tests
- Latency P50/P95/P99 per phase
- Token efficiency (quality/token ratio)
- Success rate across model combinations
- Circuit breaker recovery time
- Cache hit rates

### 7.5 Chaos Tests
- Random provider failures
- Network latency injection
- Rate limit simulation
- Malformed API responses
- Concurrent request handling

---

## 8. Monitoring & Observability

### 8.1 Real-Time Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ Anti_GV Control Plane - Live Status                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Provider Health                          Last 1 Hour             │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Groq          ████████████████░░░░ 85% (14 req/min)    🟢   │ │
│ │ NVIDIA NIM    ███████████████████░ 95% (8 req/min)     🟢   │ │
│ │ GitHub Models ████████████░░░░░░░░ 62% (9 req/min)     🟡   │ │
│ │ Together AI   ██████████████████░░ 88% (5 req/min)     🟢   │ │
│ │ OpenRouter    ████░░░░░░░░░░░░░░░░ 23% (Circuit Open)  🔴   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Task Performance                     Success Rate / Avg Latency  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Intent Classification    98% ✓    (320ms)                   │ │
│ │ Task Brief               94% ✓    (750ms)                   │ │
│ │ Planning                 89% ✓    (2.1s)                    │ │
│ │ Plan Validation          96% ✓    (680ms)                   │ │
│ │ Codegen                  87% ✓    (1.8s)                    │ │
│ │ Verification             91% ✓    (1.2s)                    │ │
│ │ Repair                   78% ✓    (2.5s)                    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Cache Effectiveness                  Hit Rate / Savings          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Brief Cache              73% (saves ~2.1K tokens/hit)       │ │
│ │ Plan Cache               45% (saves ~8.5K tokens/hit)       │ │
│ │ Health Cache             99% (saves ~150 API calls/min)     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Rate Limit Headroom                  Current / Daily Limit       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Groq          ████████████████░░░░ 9,823 / 14,400 (68%)    │ │
│ │ NVIDIA        ███████████████████░ 4,156 / 5,000 (83%)     │ │
│ │ GitHub        ████████████░░░░░░░░ 89 / 150 (59%)          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ Recent Runs (last 10)                                            │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ #127  EDIT  ✓ success     4.2s  3 files   Groq→NVIDIA      │ │
│ │ #126  ASK   ✓ success     0.8s  -          Groq            │ │
│ │ #125  CREATE ✗ failure    8.1s  -          NVIDIA (repair) │ │
│ │ #124  DEBUG  ✓ partial    6.5s  2 files   GitHub→Together  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Alerting Rules

```typescript
interface AlertConfig {
  // Provider health
  providerUnavailable: {
    condition: 'healthState === "offline" OR circuitBreakerState === "open"';
    severity: 'high';
    action: 'notify + log + switch traffic';
  };
  
  // Performance degradation
  latencySpike: {
    condition: 'p95Latency > 5000ms for 5min';
    severity: 'medium';
    action: 'log + investigate';
  };
  
  // Quality issues
  lowSuccessRate: {
    condition: 'successRate < 80% for 10min';
    severity: 'high';
    action: 'notify + log + review model selection';
  };
  
  // Rate limiting
  quotaExhaustion: {
    condition: 'headroom < 10%';
    severity: 'medium';
    action: 'throttle + redistribute traffic';
  };
  
  // Consensus failures
  planDisagreement: {
    condition: 'consensusScore < 0.5 for 3 consecutive runs';
    severity: 'medium';
    action: 'log + review planner pool';
  };
}
```

---

## 9. Cost Analysis (All Free Tier)

### 9.1 Monthly Estimates (Assuming 1000 requests/day)

| Provider | Daily Limit | Est. Monthly Usage | Headroom |
|----------|-------------|-------------------|----------|
| Groq | 14,400 req/day | ~30,000 total | Comfortable |
| NVIDIA NIM | ~5,000 req/day | ~10,000 total | Moderate |
| GitHub Models | 150/model/day | ~4,500 total (3 models) | Tight |
| Together AI | Varies | ~3,000 total | Comfortable |
| OpenRouter | Varies | <500 total (overflow only) | N/A |

**Total Cost: $0/month** ✅

### 9.2 Efficiency Optimizations

1. **Caching**: 40-60% reduction in redundant API calls
2. **Parallel Racing**: Fastest model wins, slower ones canceled
3. **Consensus Voting**: Only for quality-critical paths (planning, validation)
4. **Smart Routing**: Task-specific model selection avoids waste
5. **Adaptive Budgets**: Token allocation based on task complexity

**Expected savings: 50-70% fewer API calls vs. naive approach**

---

## 10. Migration Path from Original Plan

### 10.1 Backward Compatibility

- Keep existing Anti_GV plan approval + diff approval UX
- Maintain shadow tree transaction model
- Preserve workspace state management
- Support existing verification commands

### 10.2 Incremental Rollout

1. **Week 1-2**: Deploy model registry + routing (no behavior change)
2. **Week 3-4**: Enable PARALLEL_RACE for brief generation (faster UX)
3. **Week 5-6**: Enable CONSENSUS_VOTE for planning (better quality)
4. **Week 7-8**: Enable repair loops with model rotation (better reliability)
5. **Week 9-10**: Enable all ensemble strategies (full production mode)

### 10.3 Feature Flags

```typescript
interface FeatureFlags {
  ensembleRouting: boolean;           // Use multi-model strategies
  consensusVoting: boolean;           // Require agreement for critical paths
  parallelExecution: boolean;         // Race models for speed
  smartCaching: boolean;              // Enable brief/plan caching
  adaptiveBudgeting: boolean;         // Adjust token budgets dynamically
  failurePatternDetection: boolean;   // Learn from repeated failures
  circuitBreakers: boolean;           // Auto-disable unhealthy providers
  shadowEvaluation: boolean;          // Compare models in background
}
```

---

## 11. Success Metrics

### 11.1 Primary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **End-to-End Success Rate** | >85% | % of runs that complete without errors |
| **User Approval Rate** | >80% | % of generated code accepted by users |
| **P95 Latency (Interactive)** | <1s | 95th percentile for ASK/chat tasks |
| **P95 Latency (Planning)** | <3s | 95th percentile for plan generation |
| **First-Time Codegen Success** | >75% | % of steps that pass verification on first try |
| **Repair Success Rate** | >70% | % of failed steps fixed by repair loop |
| **Provider Availability** | >95% | % uptime across primary providers |
| **Cache Hit Rate** | >40% | % of requests served from cache |

### 11.2 Quality Metrics

- Plan consensus score: >0.70 average
- Validation agreement: >90%
- Pre-flight pass rate: >85%
- Verification pass rate: >80%
- Model approval correlation: >0.75

### 11.3 Cost Efficiency

- API calls per successful run: <15 (vs. ~25 naive)
- Token efficiency: >0.7 (quality score / 1K tokens)
- Cache savings: >10K tokens/day

---

## 12. Risk Mitigation

### 12.1 Known Risks

| Risk | Mitigation |
|------|-----------|
| **Provider Instability** | Multi-tier fallbacks, circuit breakers, graceful degradation |
| **Rate Limit Exhaustion** | Headroom monitoring, request distribution, queuing |
| **Consensus Disagreement** | User escalation, plan merging, confidence thresholds |
| **Quality Regression** | Shadow evaluation, regression tests, model drift detection |
| **Latency Spikes** | Parallel racing, timeouts, async shadow paths |
| **Cache Invalidation** | Fingerprinting, TTLs, dependency tracking |
| **Failure Loop** | Max retry limits, escalation policy, pattern detection |

### 12.2 Contingency Plans

- **All providers down**: Local fallback mode (limited functionality)
- **Quota exhaustion**: Queue requests, notify user, reduce features temporarily
- **Persistent failures**: Disable problematic features, log for debugging
- **Data corruption**: Automatic backups, rollback capability

---

## Conclusion

This production-grade pipeline improves upon the original plan by:

1. ✅ **Zero cost** through intelligent use of free tiers
2. ✅ **Higher reliability** via ensemble strategies and graceful degradation
3. ✅ **Better quality** through consensus voting and dual validation
4. ✅ **Faster response** with parallel racing and smart caching
5. ✅ **Smarter routing** using task-aware model selection
6. ✅ **Self-healing** via failure pattern detection and model rotation
7. ✅ **Observable** with comprehensive telemetry and dashboards
8. ✅ **Adaptive** through dynamic budgeting and rate limit management
9. ✅ **Testable** with shadow evaluation and A/B infrastructure
10. ✅ **Production-ready** with circuit breakers, timeouts, and partial success handling

The architecture is **modular**, **incremental**, and **backward-compatible**, allowing for gradual rollout while maintaining the existing Anti_GV UX that users expect.