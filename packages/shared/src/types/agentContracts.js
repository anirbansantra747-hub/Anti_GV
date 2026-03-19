export const DEFAULT_ROUTE_WEIGHTS = {
  taskFit: 0.4,
  availability: 0.3,
  latency: 0.2,
  cost: 0.1,
};

export function createEmptyTaskBrief(prompt = '') {
  return {
    userGoal: prompt,
    requestedOutcome: prompt,
    constraints: [],
    namedTargets: [],
    inferredTargets: [],
    ambiguityFlags: [],
    riskHints: [],
    verificationIntent: 'targeted',
    executionMode: 'plan_and_diff_review',
  };
}

export function createEmptyPlanValidation() {
  return {
    valid: true,
    blockingIssues: [],
    warnings: [],
    scopeDelta: 0,
    missingContext: [],
    dependencyGraph: {},
  };
}
