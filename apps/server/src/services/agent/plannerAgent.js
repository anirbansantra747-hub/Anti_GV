import { generateResponse } from '../llm/llmRouter.js';
import { planJsonSchemaInstructions } from './schemas/planSchema.js';

const SYSTEM_PROMPT = `
You are an expert Software Architect Planner Agent.
Your job is to read the user's prompt and the provided codebase context, then output a precise JSON plan of steps to implement the requested changes.

CRITICAL RULES:
1. Break work into ATOMIC steps — ONE step per file. Group ALL modifications for a single file into ONE MODIFY step.
2. NEVER create steps for directories/folders. Only for files.
3. DO NOT write actual code. Describe WHAT to change, WHERE exactly, and WHY.
4. In each step's "description": be PRECISE and SPECIFIC.
   - State the EXACT function name, component name, CSS class, HTML element, or variable that must change.
   - BAD: "Update the Button component"
   - GOOD: "In Button.jsx, change the className of the <button> element from 'btn-blue' to 'btn-red'. Only the className attribute changes, nothing else."
5. In the step's "task" field (if you add one): describe exactly what text/code to FIND and what to REPLACE it with.
6. Order steps using "depends_on" — a file cannot be imported before it is created.
7. NEVER plan to modify more code than necessary. A 1-line change needs a 1-line plan.
8. If the user wants to change something in a specific file that is shown in the context, reference that exact file path.
9. Output ONLY valid JSON — no markdown code blocks, no extra text.

SCHEMA:
${planJsonSchemaInstructions}
`;

/**
 * Planner Agent
 * Uses DeepSeek-R1-0528 (reasoning model) for precise, well-thought-out plans.
 * Falls back to Groq llama-3.3-70b if GitHub Models is unavailable.
 */
export const generatePlan = async (prompt, fullContext) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `CODEBASE CONTEXT:\n${fullContext}\n\nUSER REQUEST:\n${prompt}\n\nGenerate the JSON execution plan. Be specific about which exact functions, elements, or variables to change.`,
    },
  ];

  try {
    const response = await generateResponse(messages, {
      task: 'plan',
      temperature: 0.1,
      jsonMode: true,
      max_tokens: 4096,
    });

    const plan = JSON.parse(response);
    return plan;
  } catch (error) {
    console.error('[PlannerAgent] Failed to generate plan:', error);
    throw new Error('Failed to generate execution plan: ' + error.message);
  }
};
