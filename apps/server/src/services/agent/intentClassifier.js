import { generateResponse } from '../llm/llmRouter.js';

/**
 * Classifies the intent of a user prompt to route it to the correct agent pipeline.
 * @param {string} prompt - The user's input prompt
 * @returns {Promise<{ intent: string, confidence: number, reason: string }>}
 */
export const classifyIntent = async (prompt) => {
  const systemPrompt = `You are an expert intent classifier for an AI coding agent.
Your job is to analyze the user's prompt and classify their core intent into EXACTLY ONE of the following categories:

- "ASK": The user is asking a general question, asking for an explanation, or requesting information. Examples: "How does React work?", "Explain this function", "Why is this failing?"
- "EDIT": The user wants to modify, update, or fix EXISTING code. Examples: "Add a parameter to this function", "Fix the null reference bug", "Refactor this component"
- "CREATE": The user wants to generate entirely NEW code, files, or scaffolding. Examples: "Create a new Login component", "Add a new API route for users"
- "DEBUG": The user explicitly wants to debug an error message or terminal output. Examples: "Fix this error: TypeError...", "Why is the test failing?"
- "REFACTOR": The user explicitly wants to clean up or reorganize code without changing its external behavior.
- "MULTI": The prompt contains multiple complex requests that require a combination of creating, editing, and debugging.

You must output valid JSON in this exact format, with no markdown formatting or extra text:
{
  "intent": "ASK" | "EDIT" | "CREATE" | "DEBUG" | "REFACTOR" | "MULTI",
  "confidence": 0.0 to 1.0,
  "reason": "short explanation of why you chose this intent"
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  try {
    // We use the JSON mode flag which we implemented in the llmRouter
    const responseJsonStr = await generateResponse(messages, {
      jsonMode: true,
      temperature: 0.1, // Low temperature for consistent classification
    });

    return JSON.parse(responseJsonStr);
  } catch (error) {
    console.error('[IntentClassifier] Failed to classify intent:', error);
    // Safe fallback if classification completely fails
    return { intent: 'ASK', confidence: 0, reason: 'Fallback due to error' };
  }
};
