# Multi-Provider Agent Control Plane for Anti_GV

## Summary

Upgrade the current agent into a provider-aware control plane that uses `Groq` as the primary interactive path, `NVIDIA NIM` as the secondary open-model/code path, `OpenRouter` as brokered overflow, and `GitHub Models` for eval and shadow testing. Keep the existing Anti_GV plan approval and diff approval workflow, but insert stronger contracts between stages: canonical task brief, scored context bundle, validated execution plan, step-local codegen, targeted repair loops, and telemetry-driven routing.

This version incorporates dynamic routing, provider health, plan validation, partial multi-file review, circuit breakers, and earlier observability so routing decisions can be tuned from real behavior instead of static assumptions.

## Core Architecture

- Add a `Model Registry` and `Routing Engine` in the server. Registry fields:
  `provider`, `modelId`, `taskFit[]`, `contextWindow`, `maxOutputTokens`, `jsonModeSupport`, `toolUseSupport`, `streamingSupport`, `specialCapabilities[]`, `costTier`, `latencyP95`, `errorRate`, `availabilityState`, `deprecationDate`, `fallbackPriority`.
- Route models with a hybrid score instead of fixed primary/secondary only:
  `score = 0.4 taskFit + 0.3 availability + 0.2 latency + 0.1 cost`.
  Allow per-task weight overrides so interactive chat favors latency while planning/codegen favors task fit.
- Add provider health and circuit breakers before broad multi-provider rollout:
  health probes, quota/rate-limit detection, rolling error windows, and automatic suppression of unstable routes.
  `OpenRouter` gets a stricter breaker: disable after repeated recent failures because free-model churn is expected.
- Introduce a `CanonicalTaskBrief` stage before planning:
  normalize the request, capture goal, requested outcome, constraints, named files, inferred files, ambiguity flags, risk hints, and expected verification type.
- Replace flat context strings with a scored `ContextBundle`:
  `workspaceFocus`, `retrievedChunks`, `symbolGraph`, `dependencyGraph`, `conversationMemory`, `terminalEvidence`, `diagnostics`, `verificationEvidence`.
  Each section has its own token budget, confidence score, and cross-reference index to files/symbols.
- Insert a `Plan Validator` between planning and codegen:
  catch circular step dependencies, file conflicts, scope creep, missing prerequisites, missing context, and unsafe multi-file ordering before spending codegen tokens.
- Change codegen to `step-local synthesis`:
  each step gets only the canonical brief, approved plan slice, relevant files, required contracts, and nearby verification evidence.
- Keep the existing shadow-tree transaction model, but support grouped multi-file review with dependency-aware approval, conflict detection, and partial commit/defer flows.
- Split verification into:
  `pre-flight validation` before patch apply,
  `incremental verification` during grouped execution,
  `targeted runtime verification` after accepted staged changes.
- Persist full run records:
  stage inputs, selected provider/model, health snapshots, token usage, plan issues, staged patches, verification output, and user approval outcome.

## Provider Roles

- `Groq`
  Primary for `intent`, `task brief`, `planner`, `ASK/chat`, and most `critic/fixer` calls because of low-latency interactive use and current model breadth. Source: [GroqCloud](https://console.groq.com/home).
- `NVIDIA NIM`
  Secondary for planning/code/reasoning and future self-hosted portability. Prefer for code-heavy fallbacks and experiments with open code models. Source: [NVIDIA model catalog](https://build.nvidia.com/models?filters=usecase%3Ausecase_code_gen).
- `OpenRouter`
  Brokered overflow for free-tier-first failover and model experimentation only. Treat model identity as unstable and enforce provider/result telemetry separately from your first-party routes. Source: [OpenRouter models](https://openrouter.ai/models?max_price=0&order=most-popular).
- `GitHub Models`
  Use for prompt comparison, regression suites, shadow evaluation, and limited A/B testing, not as the default live socket path in v1. Source: [GitHub Models marketplace](https://github.com/marketplace?page=2&type=models).

## Public Contracts

- `TaskRouteConfig`
  `{ taskType, preferredModels[], scoreWeights, maxInputTokens, maxOutputTokens, timeoutMs, temperature, jsonMode, stream, toolUse, circuitBreakerPolicy }`
- `CanonicalTaskBrief`
  `{ userGoal, requestedOutcome, constraints[], namedTargets[], inferredTargets[], ambiguityFlags[], riskHints[], verificationIntent, executionMode }`
- `ContextBundle`
  `{ sections[], totalBudget, perSectionBudget, retrievalConfidence, crossReferences, staleSections[] }`
- `ExecutionPlan`
  `{ summary, risk, confidence, assumptions[], clarificationsNeeded[], steps[], verificationPlan, estimatedFilesChanged }`
- `PlanValidationReport`
  `{ valid, blockingIssues[], warnings[], scopeDelta, missingContext[], dependencyGraph }`
- `StepPatch`
  `{ stepId, fileGroupId, files[], operations[], rationale, dependsOn[], verificationHints, retryCount }`
- `RunState`
  `{ runId, phase, taskType, provider, model, confidence?, risk?, status, stepId?, filePaths?, latencyMs?, tokenUsage?, message }`

## Execution Flow

1. Run provider health snapshot and load registry candidates.
2. Build `CanonicalTaskBrief` from the raw user request.
3. Classify intent and execution mode using the brief, not the raw prompt alone.
4. Assemble `ContextBundle` with per-section budgets, temporal decay on old chat turns, and retrieval confidence.
5. Generate plan using the planner route.
6. Run `Plan Validator`; if blocking issues exist, pause and ask for clarification or re-plan.
7. For each approved step group, run codegen on step-local context only.
8. Run pre-flight checks before applying each patch:
   syntax/schema sanity, patch shape validity, search-match confidence, secret/path leakage checks.
9. Stage patches into one review transaction with dependency metadata and file conflict checks.
10. Let the user approve all, subset, or defer risky file groups.
11. Run incremental and final targeted verification on accepted changes.
12. If verification fails, retry only the affected step/group with critic/fixer loops.
13. Commit accepted changes, persist run record, and emit final summary.

## Multi-File UX and Safety

- Show dependency visualization so users can see which file groups are coupled.
- Allow partial commit when groups are independent and the plan validator marks them separable.
- Detect user edits that happened after planning or during staging; require rebase/replan if a staged file drifted.
- Support rollback at two levels:
  per-file-group rollback before commit,
  whole-transaction rollback at any time before final commit.
- Default policy for partial execution:
  if a grouped change has hard dependencies, it must be approved together;
  if groups are independent, allow accept/defer/reject per group.

## Repair and Retry Policy

- Set `max retry count` to `3` per step/group.
- If the same failure pattern repeats twice, stop blind retries and either switch provider or surface the issue to the user.
- Escalation order:
  same provider different model profile,
  secondary provider,
  user clarification.
- Record failure signatures so repeated patch-apply mismatches or verification failures are detected as the same class of problem.

## Verification Policy

- Pre-flight checks:
  structured output validation, patch-apply feasibility, syntax parse where cheap, unsafe output scan.
- Incremental verification:
  run lightweight checks after each file group when the group changes imports, exports, types, or build-critical config.
- Final targeted verification:
  lint/test/run commands only for accepted paths and affected languages.
- Enforce timeouts on all verification steps.
- Partial success policy:
  accepted file groups that pass can remain staged;
  failing groups are marked `needs_fix` and do not auto-commit.

## Telemetry and Observability

- Track token usage per `provider/model/taskType`.
- Track latency breakdown per stage:
  `brief`, `intent`, `context`, `plan`, `validate`, `codegen`, `critic`, `fixer`, `verification`.
- Track success metrics:
  plan validation pass rate, patch apply rate, verification pass rate, user approval rate, retry rate, commit rate.
- Track provider health:
  response latency, error rate, rate-limit hits, quota exhaustion, breaker state.
- Track model drift:
  rolling quality score from verification outcomes and user approval/rejection patterns.
- Build telemetry dashboard before routing optimization so model selection can be tuned with real data.

## Evaluation Strategy

- Add `GitHub Models` regression suite with stored tasks covering ASK, EDIT, CREATE, DEBUG, and MULTI.
- Add shadow evaluation for a sample of live runs:
  async compare a candidate model’s brief/plan/code output without affecting the user-visible result.
- Add limited A/B testing after telemetry is stable:
  start with low-volume planner or critic experiments, not live codegen by default.
- Keep OpenRouter candidates out of promotion unless they show stable quality and availability over time.

## Implementation Order

1. Model registry and routing engine.
2. Provider health monitoring and circuit breakers.
3. Canonical task brief generation.
4. Context bundle with token budgets, confidence, decay, and cross-references.
5. Telemetry pipeline and basic dashboard.
6. Planner upgrade.
7. Plan validator.
8. Step-local codegen.
9. Pre-flight patch and syntax checks.
10. Grouped multi-file diff review with dependency/conflict handling.
11. Incremental plus final targeted verification.
12. Critic/fixer retry controls and escalation policy.
13. Eval harness, shadow testing, and selective A/B experiments.

## Test Plan

- Routing tests:
  healthy primary, degraded primary, breaker-open overflow, dynamic scoring preference change.
- Brief/context tests:
  ambiguous prompt, old chat decay, retrieval confidence drop, section budget overflow.
- Plan validation tests:
  circular dependencies, conflicting file edits, scope creep, missing dependency symbols.
- Patch tests:
  exact match, failed search block, pre-flight syntax reject, grouped multi-file staging.
- UX tests:
  partial approval, dependent-group lockstep approval, user-edited-file conflict, per-group rollback.
- Retry tests:
  repeated identical failures, provider switch after retry limit, clarification escalation.
- Verification tests:
  incremental checks, final checks, timeout behavior, partial-success retention.
- Telemetry tests:
  token and latency capture, provider health metrics, breaker transitions, run persistence completeness.

## Assumptions

- Default autonomy stays `plan approval + diff approval`.
- Groq remains the default live provider until telemetry proves another route superior for a given task.
- NVIDIA is the preferred non-broker secondary route for code and reasoning.
- OpenRouter remains overflow/experimentation because of free-tier churn and inconsistent backend provenance.
- GitHub Models is primarily for evaluation and shadow testing in v1, with live routing only after measured validation.
