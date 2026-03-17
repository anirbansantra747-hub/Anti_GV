export const AGENT_TASK_TYPES = {
  INTENT_CLASSIFICATION: 'intent_classification',
  TASK_BRIEF: 'task_brief',
  CONTEXT_RERANK: 'context_rerank',
  PLANNING: 'planning',
  STEP_CODEGEN: 'step_codegen',
  PATCH_REVIEW: 'patch_review',
  FIX_GENERATION: 'fix_generation',
  VERIFICATION_SUMMARY: 'verification_summary',
  CHAT_ANSWER: 'chat_answer',
};

export const AGENT_RUN_PHASES = {
  HEALTH: 'health',
  BRIEF: 'brief',
  INTENT: 'intent',
  CONTEXT: 'context',
  PLAN: 'plan',
  VALIDATE: 'validate',
  CODEGEN: 'codegen',
  PREFLIGHT: 'preflight',
  REVIEW: 'review',
  VERIFY: 'verify',
  DONE: 'done',
  ERROR: 'error',
};

export const PROVIDER_AVAILABILITY = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  OPEN: 'circuit_open',
  UNKNOWN: 'unknown',
};
