import { generateResponse as generateGroqResponse } from '../llm/llmRouter.js';
import { planJsonSchemaInstructions } from './schemas/planSchema.js';

const SYSTEM_PROMPT = `
You are an expert Software Architect Planner Agent.
Your job is to read the user's prompt and the provided codebase context, and output a strict JSON array of steps required to implement the requested changes.

RULES:
1. Break down the work into ATOMIC steps. 
2. **CRITICAL:** You must formulate exactly ONE step per file. DO NOT create multiple MODIFY steps for the same file. Group all modifications for a single file into a single MODIFY step.
3. Order the steps correctly using "depends_on". You cannot import a file before it is created in an earlier step!
4. DO NOT write the actual code. You only write the plan and the general description for each file change.
5. Your response must be ONLY valid JSON matching the exact schema requested, with no markdown code block wrapping.
6. **CRITICAL:** Only operate on FILES. DO NOT emit steps to CREATE, MODIFY, or DELETE directories/folders. The file system creates folders automatically when you create a file inside them.

SCHEMA:
${planJsonSchemaInstructions}
`;

/**
 * Planner Agent
 * Takes the assembled context and user prompt, outputs a structured plan.
 */
export const generatePlan = async (prompt, fullContext) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `CONTEXT:\n${fullContext}\n\nUSER PROMPT:\n${prompt}\n\nPlease generate the JSON execution plan.`,
    },
  ];

  try {
    const response = await generateGroqResponse(messages, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // Keep it deterministic for planning
      jsonMode: true,
    });

    const plan = JSON.parse(response);
    return plan;
  } catch (error) {
    console.error('[PlannerAgent] Failed to generate plan:', error);
    throw new Error('Failed to generate execution plan: ' + error.message);
  }
};
