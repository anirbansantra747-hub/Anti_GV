import { generateGroqResponse } from '../llm/groqClient.js';
import { planJsonSchemaInstructions } from './schemas/planSchema.js';

const SYSTEM_PROMPT = `
You are an expert Software Architect Planner Agent.
Your job is to read the user's prompt and the provided codebase context, and output a strict JSON array of steps required to implement the requested changes.

RULES:
1. Break down the work into ATOMIC steps. One step = one file change (CREATE, MODIFY, DELETE) or one command (RUN_COMMAND).
2. Order the steps correctly using "depends_on". You cannot import a file before it is created in an earlier step!
3. DO NOT write the actual code. You only write the plan and the general description for each file change.
4. Your response must be ONLY valid JSON matching the exact schema requested, with no markdown code block wrapping.

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
