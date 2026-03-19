import { createEmptyPlanValidation, LIMITS, AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';

const VALIDATOR_PROMPT = `
You are a Senior Security & Architecture Code Reviewer.
Your job is to validate a proposed AI execution plan to ensure it's safe and effective for the user's request.
Output ONLY JSON in the following format:
{
  "isValid": boolean, // false ONLY if you find critical, dangerous flaws
  "blockingIssues": ["Issue 1", "Issue 2"], // empty array if valid
  "warnings": ["Warning 1"]
}

Fail the plan (isValid: false) IF AND ONLY IF:
1. It proposes destructive actions without explicit user consent (e.g. deleting important files).
2. It completely hallucinates files or paths not in the context.
3. It clearly fails to address the user's core request.
Be lenient on minor stylistic things, strict on safety and functionality.
`;

export async function validatePlan(plan, taskBrief = {}, contextBundle = {}) {
  const report = createEmptyPlanValidation();
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];

  const ids = new Set(steps.map((step) => step.stepId));
  const graph = {};
  const fileOwners = new Map();

  // Structural checks
  for (const step of steps) {
    const deps = step.depends_on || step.dependsOn || [];
    graph[step.stepId] = deps;

    for (const dep of deps) {
      if (!ids.has(dep)) {
        report.blockingIssues.push(`Step ${step.stepId} depends on missing step ${dep}.`);
      }
    }

    const files = normalizeStepFiles(step);
    for (const file of files) {
      const previous = fileOwners.get(file);
      if (previous && !deps.includes(previous)) {
        report.warnings.push(
          `File conflict: ${file} is edited by steps ${previous} and ${step.stepId}.`
        );
      }
      fileOwners.set(file, step.stepId);
    }
  }

  if (hasCycle(graph)) {
    report.blockingIssues.push('Plan contains circular dependencies.');
  }

  const targetHints = new Set([
    ...(taskBrief.namedTargets || []),
    ...(taskBrief.inferredTargets || []),
  ]);
  const referencedFiles = new Set(Object.keys(contextBundle.crossReferences || {}));
  const missingContext = [];
  for (const target of targetHints) {
    if (!referencedFiles.has(target) && target.includes('/')) {
      missingContext.push(target);
    }
  }
  report.missingContext = missingContext.slice(0, LIMITS.MAX_PLAN_WARNINGS);
  if (missingContext.length > 0) {
    report.warnings.push(`Missing context for ${missingContext.length} named targets.`);
  }

  const scopeBase = Math.max(1, targetHints.size || 1);
  report.scopeDelta = Number((steps.length / scopeBase).toFixed(2));
  if (report.scopeDelta > 4) {
    report.warnings.push('Planned scope is substantially broader than the explicit brief.');
  }

  report.dependencyGraph = graph;

  // If structurally invalid, fail early
  if (report.blockingIssues.length > 0) {
    report.valid = false;
    return report;
  }

  // --- LLM Dual-Validator Consensus ---
  try {
    const { route, candidates } = await import('../llm/taskRouter.js').then((m) =>
      m.selectRoute(AGENT_TASK_TYPES.PATCH_REVIEW)
    );
    const voters = candidates.slice(0, 2); // Dual validators

    if (voters.length > 0) {
      const messages = [
        { role: 'system', content: VALIDATOR_PROMPT },
        {
          role: 'user',
          content: `USER REQUEST:\n${taskBrief.requestedOutcome || 'N/A'}\n\nPROPOSED PLAN:\n${JSON.stringify(plan, null, 2)}`,
        },
      ];

      const votes = await Promise.all(
        voters.map((candidate) =>
          generateTaskResponse(messages, {
            taskType: AGENT_TASK_TYPES.PATCH_REVIEW,
            temperature: 0.05,
            jsonMode: true,
            max_tokens: 1024,
            routeOverrides: { strategy: 'WATERFALL', primaryPool: [candidate.modelId] },
          }).catch((e) => {
            console.warn(`[PlanValidator] Validator ${candidate.modelId} failed:`, e.message);
            return null;
          })
        )
      );

      const validVotes = votes.filter(Boolean);
      for (const vote of validVotes) {
        try {
          const parsed = JSON.parse(vote.content);
          if (!parsed.isValid) {
            report.blockingIssues.push(
              `[Validator ${vote.model}] ${parsed.blockingIssues?.[0] || 'Plan deemed unsafe/invalid.'}`
            );
          }
          if (parsed.warnings?.length > 0) {
            report.warnings.push(...parsed.warnings.map((w) => `[Validator ${vote.model}] ${w}`));
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    }
  } catch (err) {
    console.warn(`[PlanValidator] LLM validation failed to execute:`, err.message);
  }

  report.valid = report.blockingIssues.length === 0;
  return report;
}

function normalizeStepFiles(step) {
  const files = Array.isArray(step.files) ? step.files : [];
  if (files.length > 0) return files;
  return step.filePath ? [step.filePath] : [];
}

function hasCycle(graph) {
  const visited = new Set();
  const active = new Set();

  function visit(node) {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    active.add(node);
    const deps = graph[node] || [];
    for (const dep of deps) {
      if (visit(dep)) return true;
    }
    active.delete(node);
    return false;
  }

  return Object.keys(graph).some((node) => visit(Number(node)));
}
