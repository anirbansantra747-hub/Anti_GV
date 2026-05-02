import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';

/**
 * Classifies the intent of a user prompt to route it to the correct agent pipeline.
 * @param {string} prompt - The user's input prompt
 * @returns {Promise<{ intent: string, confidence: number, reason: string }>}
 */
export const classifyIntent = async (prompt, taskBrief = null, options = {}) => {
  const systemPrompt = `You are an expert intent classifier for an AI coding agent.
Classify the user's prompt into EXACTLY ONE category:

- "ASK": General question, explanation request, or asking for information. Examples: "How does React work?", "Explain this function", "Why is this failing?"
- "EDIT": Modify, update, or fix EXISTING code. Examples: "Add a parameter to this function", "Fix the null reference bug", "Change the button color"
- "CREATE": Generate entirely NEW code, files, or scaffolding. Examples: "Create a new Login component", "Add a new API route for users"
- "DEBUG": Debug a specific error message or terminal output. Examples: "Fix this error: TypeError...", "Why is the test failing?"
- "REFACTOR": Clean up or reorganize code without changing external behavior.
- "MULTI": Multiple complex requests combining create, edit, and debug.

Output valid JSON only, no markdown:
{"intent":"ASK"|"EDIT"|"CREATE"|"DEBUG"|"REFACTOR"|"MULTI","confidence":0.0-1.0,"reason":"brief explanation"}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: taskBrief
        ? `CANONICAL TASK BRIEF:\n${JSON.stringify(taskBrief, null, 2)}\n\nRAW PROMPT:\n${prompt}`
        : prompt,
    },
  ];

  try {
    const { content, provider, model } = await generateTaskResponse(messages, {
      runId: options.runId,
      taskType: AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
      jsonMode: true,
      temperature: 0.1,
      max_tokens: 150,
    });
    return { ...JSON.parse(content), route: { provider, model } };
  } catch (error) {
    console.error('[IntentClassifier] Failed to classify intent:', error);
    return { intent: 'ASK', confidence: 0, reason: 'Fallback due to error', route: null };
  }
};
