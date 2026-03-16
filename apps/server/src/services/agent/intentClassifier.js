import { generateResponse } from '../llm/llmRouter.js';

/**
 * Classifies the intent of a user prompt to route it to the correct agent pipeline.
 * Uses OpenRouter step-3.5-flash (fast, free) with Groq fallback.
 * @param {string} prompt - The user's input prompt
 * @returns {Promise<{ intent: string, confidence: number, reason: string }>}
 */
export const classifyIntent = async (prompt) => {
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
    { role: 'user', content: prompt },
  ];

  try {
    const responseJsonStr = await generateResponse(messages, {
      task: 'classify',
      jsonMode: true,
      temperature: 0.1,
      max_tokens: 150,
    });
    return JSON.parse(responseJsonStr);
  } catch (error) {
    console.error('[IntentClassifier] Failed to classify intent:', error);
    return { intent: 'ASK', confidence: 0, reason: 'Fallback due to error' };
  }
};
