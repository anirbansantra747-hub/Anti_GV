// Dynamically assigns token limits based on inferred task complexity
import { AGENT_TASK_TYPES } from '@antigv/shared';

const MAX_WINDOW = 128000; // standard llama3.1 window

const COMPLEXITY_MODIFIERS = {
  simple: { multiplier: 0.1, base: 4000 },
  medium: { multiplier: 0.3, base: 16000 },
  complex: { multiplier: 0.8, base: 64000 },
};

/**
 * Parses user input or brief to guess complexity roughly
 */
export function estimateTaskComplexity(prompt) {
  if (!prompt || typeof prompt !== 'string') return 'simple';
  
  const length = prompt.length;
  // If the prompt mentions many files or is very long, assume complex
  if (length > 2000 || prompt.includes('refactor') || prompt.includes('architecture')) {
    return 'complex';
  } else if (length > 500) {
    return 'medium';
  }
  return 'simple';
}

/**
 * Calculates adaptive caps for incoming LM requests.
 * @param {string} taskType 
 * @param {string} complexity 'simple' | 'medium' | 'complex'
 */
export function allocateTokenBudget(taskType, complexity = 'medium') {
  const mod = COMPLEXITY_MODIFIERS[complexity] || COMPLEXITY_MODIFIERS.medium;

  switch (taskType) {
    case AGENT_TASK_TYPES.CHAT_ANSWER:
    case AGENT_TASK_TYPES.INTENT_CLASSIFICATION:
      return {
        input_limit: Math.min(8000, mod.base),
        output_limit: 1024,
      };

    case AGENT_TASK_TYPES.TASK_BRIEF:
      return {
        input_limit: Math.floor(MAX_WINDOW * mod.multiplier),
        output_limit: 2048,
      };

    case AGENT_TASK_TYPES.PLANNING:
      return {
        input_limit: Math.floor(MAX_WINDOW * Math.min(1.0, mod.multiplier * 1.5)), // Planning needs more context
        output_limit: 4096,
      };

    case AGENT_TASK_TYPES.STEP_CODEGEN:
      return {
        // Codegen focuses mostly on the active file and direct imports
        input_limit: Math.floor(64000 * mod.multiplier),
        output_limit: 8192,
      };

    case AGENT_TASK_TYPES.FIX_GENERATION:
    case AGENT_TASK_TYPES.PATCH_REVIEW:
      return {
        input_limit: Math.floor(32000 * mod.multiplier),
        output_limit: 2048,
      };

    default:
      return {
        input_limit: Math.floor(MAX_WINDOW * mod.multiplier),
        output_limit: 2048,
      };
  }
}
