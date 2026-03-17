import { AGENT_TASK_TYPES, LIMITS, PROVIDER_AVAILABILITY } from '@antigv/shared';

export const ROUTING_STRATEGY = {
  FASTEST_FIRST: 'FASTEST_FIRST',
  CONSENSUS_VOTE: 'CONSENSUS_VOTE',
  PARALLEL_RACE: 'PARALLEL_RACE',
  WATERFALL: 'WATERFALL',
  SPECIALIST_FIRST: 'SPECIALIST_FIRST',
};

// Base Circuit Breaker Policies
const CB_POLICIES = {
  STRICT: {
    failureThreshold: 2,
    errorRateThreshold: 0.3,
    windowSizeMs: 300000, // 5 min
    halfOpenAfterMs: 600000, // 10 min
  },
  STANDARD: {
    failureThreshold: 5,
    errorRateThreshold: 0.5,
    windowSizeMs: 300000, // 5 min
    halfOpenAfterMs: 300000, // 5 min
  },
  RELAXED: {
    failureThreshold: 10,
    errorRateThreshold: 0.7,
    windowSizeMs: 600000, // 10 min
    halfOpenAfterMs: 120000, // 2 min
  },
};

export const MODEL_REGISTRY = [
  // --- TIER 1: PRIMARY ENSEMBLE (GROQ & NVIDIA) ---
  {
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Groq Llama-3.3-70B',
    capabilities: {
      taskTypes: [
        AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
        AGENT_TASK_TYPES.TASK_BRIEF,
        AGENT_TASK_TYPES.PLANNING,
        AGENT_TASK_TYPES.PATCH_REVIEW,
        AGENT_TASK_TYPES.CHAT_ANSWER,
        AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
      ],
      contextWindow: 128000,
      maxOutputTokens: 8000,
      supportsJSON: true,
      supportsStreaming: true,
      supportsToolUse: false,
      codingStrength: 85,
      reasoningStrength: 90,
      followingStrength: 95,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.HEALTHY,
      circuitBreakerPolicy: CB_POLICIES.STANDARD,
      costTier: 'free_with_limits',
      priorityTier: 10,
    },
  },
  {
    provider: 'groq',
    modelId: 'mixtral-8x7b-32768',
    displayName: 'Groq Mixtral-8x7b',
    capabilities: {
      taskTypes: [AGENT_TASK_TYPES.TASK_BRIEF, AGENT_TASK_TYPES.CHAT_ANSWER],
      contextWindow: 32768,
      maxOutputTokens: 4096,
      supportsJSON: true,
      supportsStreaming: true,
      supportsToolUse: false,
      codingStrength: 75,
      reasoningStrength: 80,
      followingStrength: 85,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.HEALTHY,
      circuitBreakerPolicy: CB_POLICIES.STANDARD,
      costTier: 'free_with_limits',
      priorityTier: 9,
    },
  },
  {
    provider: 'nvidia',
    modelId: 'meta/llama-3.3-70b-instruct',
    displayName: 'NVIDIA Llama-3.1-70B',
    capabilities: {
      taskTypes: [
        AGENT_TASK_TYPES.PLANNING,
        AGENT_TASK_TYPES.STEP_CODEGEN,
        AGENT_TASK_TYPES.PATCH_REVIEW,
      ],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsJSON: true,
      supportsStreaming: true,
      supportsToolUse: false,
      codingStrength: 95,
      reasoningStrength: 90,
      followingStrength: 90,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.UNKNOWN,
      circuitBreakerPolicy: CB_POLICIES.STANDARD,
      costTier: 'free_with_limits',
      priorityTier: 10,
    },
  },
  {
    provider: 'nvidia',
    modelId: 'ibm/granite-34b-code-instruct',
    displayName: 'NVIDIA Granite Code 34B',
    capabilities: {
      taskTypes: [AGENT_TASK_TYPES.STEP_CODEGEN, AGENT_TASK_TYPES.FIX_GENERATION],
      contextWindow: 32000,
      maxOutputTokens: 4096,
      supportsJSON: true,
      supportsStreaming: true,
      supportsToolUse: false,
      codingStrength: 90,
      reasoningStrength: 80,
      followingStrength: 80,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.UNKNOWN,
      circuitBreakerPolicy: CB_POLICIES.STANDARD,
      costTier: 'free_with_limits',
      priorityTier: 8,
    },
  },

  // --- TIER 2: ENSEMBLE EXPANSION (GITHUB) ---
  {
    provider: 'github',
    modelId: 'gpt-4.1-mini', // Note: using 4.1-mini to represent 4o-mini locally based on existing key
    displayName: 'GitHub GPT-4o-mini',
    capabilities: {
      taskTypes: [
        AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
        AGENT_TASK_TYPES.PLANNING,
        AGENT_TASK_TYPES.PATCH_REVIEW,
        AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
      ],
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsJSON: true,
      supportsStreaming: false,
      supportsToolUse: false,
      codingStrength: 85,
      reasoningStrength: 85,
      followingStrength: 95,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.UNKNOWN,
      circuitBreakerPolicy: CB_POLICIES.RELAXED,
      costTier: 'free_with_limits',
      priorityTier: 7,
    },
  },

  // --- TIER 3: OVERFLOW (OPENROUTER) ---
  {
    provider: 'openrouter',
    modelId: 'openai/gpt-oss-20b:free',
    displayName: 'OpenRouter Overflow',
    capabilities: {
      taskTypes: [
        AGENT_TASK_TYPES.TASK_BRIEF,
        AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
        AGENT_TASK_TYPES.CHAT_ANSWER,
      ],
      contextWindow: 64000,
      maxOutputTokens: 2048,
      supportsJSON: true,
      supportsStreaming: true,
      supportsToolUse: false,
      codingStrength: 60,
      reasoningStrength: 60,
      followingStrength: 70,
    },
    operational: {
      healthState: PROVIDER_AVAILABILITY.UNKNOWN,
      circuitBreakerPolicy: CB_POLICIES.STRICT,
      costTier: 'free',
      priorityTier: 1,
    },
  },
];

export const TASK_ROUTE_CONFIG = {
  [AGENT_TASK_TYPES.INTENT_CLASSIFICATION]: {
    taskType: AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
    strategy: ROUTING_STRATEGY.FASTEST_FIRST,
    primaryPool: ['llama-3.3-70b-versatile'],
    fallbackPool: ['gpt-4.1-mini', 'openai/gpt-oss-20b:free'],
    emergencyPool: [],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 700,
    timeoutMs: 12000,
    temperature: 0.1,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.TASK_BRIEF]: {
    taskType: AGENT_TASK_TYPES.TASK_BRIEF,
    strategy: ROUTING_STRATEGY.PARALLEL_RACE,
    parallelCount: 2,
    primaryPool: ['llama-3.3-70b-versatile', 'meta/llama-3.3-70b-instruct'],
    fallbackPool: ['mixtral-8x7b-32768', 'gpt-4.1-mini'],
    emergencyPool: ['openai/gpt-oss-20b:free'],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 1500,
    timeoutMs: 15000,
    temperature: 0.1,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.PLANNING]: {
    taskType: AGENT_TASK_TYPES.PLANNING,
    strategy: ROUTING_STRATEGY.CONSENSUS_VOTE,
    parallelCount: 3,
    consensusThreshold: 0.67,
    primaryPool: ['meta/llama-3.3-70b-instruct', 'llama-3.3-70b-versatile', 'gpt-4.1-mini'],
    fallbackPool: ['ibm/granite-34b-code-instruct'],
    emergencyPool: [],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 2500,
    timeoutMs: 25000,
    temperature: 0.1,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.STEP_CODEGEN]: {
    taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
    strategy: ROUTING_STRATEGY.SPECIALIST_FIRST,
    primaryPool: ['meta/llama-3.3-70b-instruct', 'ibm/granite-34b-code-instruct'],
    fallbackPool: ['llama-3.3-70b-versatile'],
    emergencyPool: ['gpt-4.1-mini'], // Very basic fallback
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 4000,
    timeoutMs: 30000,
    temperature: 0.1,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.PATCH_REVIEW]: {
    taskType: AGENT_TASK_TYPES.PATCH_REVIEW,
    strategy: ROUTING_STRATEGY.CONSENSUS_VOTE,
    parallelCount: 2,
    consensusThreshold: 1.0, // Strict agreement
    primaryPool: ['gpt-4.1-mini', 'llama-3.3-70b-versatile'],
    fallbackPool: ['meta/llama-3.3-70b-instruct'],
    emergencyPool: [],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 1500,
    timeoutMs: 15000,
    temperature: 0,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.FIX_GENERATION]: {
    taskType: AGENT_TASK_TYPES.FIX_GENERATION,
    strategy: ROUTING_STRATEGY.WATERFALL,
    primaryPool: ['ibm/granite-34b-code-instruct', 'meta/llama-3.3-70b-instruct'],
    fallbackPool: ['llama-3.3-70b-versatile'],
    emergencyPool: [],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 2500,
    timeoutMs: 20000,
    temperature: 0.05,
    jsonMode: true,
    stream: false,
  },
  [AGENT_TASK_TYPES.CHAT_ANSWER]: {
    taskType: AGENT_TASK_TYPES.CHAT_ANSWER,
    strategy: ROUTING_STRATEGY.FASTEST_FIRST,
    primaryPool: ['llama-3.3-70b-versatile'],
    fallbackPool: ['mixtral-8x7b-32768'],
    emergencyPool: ['openai/gpt-oss-20b:free'],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 2000,
    timeoutMs: 20000,
    temperature: 0.2,
    jsonMode: false,
    stream: true,
  },
  [AGENT_TASK_TYPES.VERIFICATION_SUMMARY]: {
    taskType: AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
    strategy: ROUTING_STRATEGY.WATERFALL,
    primaryPool: ['gpt-4.1-mini', 'llama-3.3-70b-versatile'],
    fallbackPool: [],
    emergencyPool: [],
    maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
    maxOutputTokens: 1000,
    timeoutMs: 15000,
    temperature: 0.1,
    jsonMode: false,
    stream: false,
  },
};

export function getTaskRouteConfig(taskType) {
  return (
    TASK_ROUTE_CONFIG[taskType] || {
      taskType,
      strategy: ROUTING_STRATEGY.WATERFALL,
      primaryPool: MODEL_REGISTRY.map((m) => m.modelId),
      fallbackPool: [],
      emergencyPool: [],
      maxInputTokens: LIMITS.MAX_TOKENS_PER_REQUEST,
      maxOutputTokens: 1500,
      timeoutMs: 15000,
      temperature: 0.2,
      jsonMode: false,
      stream: false,
    }
  );
}
