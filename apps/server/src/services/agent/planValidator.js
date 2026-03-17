import { createEmptyPlanValidation, LIMITS } from '@antigv/shared';

export function validatePlan(plan, taskBrief = {}, contextBundle = {}) {
  const report = createEmptyPlanValidation();
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];

  const ids = new Set(steps.map((step) => step.stepId));
  const graph = {};
  const fileOwners = new Map();

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
