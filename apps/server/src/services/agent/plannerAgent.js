import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';
import { planJsonSchemaInstructions } from './schemas/planSchema.js';

const SYSTEM_PROMPT = `
You are an expert Software Architect Planner Agent.
Your job is to read the canonical task brief and codebase context, then output a precise JSON plan.

CRITICAL RULES:
1. Break work into atomic steps. Use "fileGroupId" when related files should be reviewed together.
2. Only operate on files, never on directories.
3. Do not write code. Describe what to change, where, and why.
4. Every step should list its impacted files and its dependency order.
5. Use verificationHints to indicate what should be tested or reviewed after the step.
6. Avoid scope creep. Keep the plan aligned to the user's requested outcome.
7. Output valid JSON only.

SCHEMA:
${planJsonSchemaInstructions}
`;

export async function generatePlan(prompt, taskBrief, fullContext, options = {}) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `CANONICAL TASK BRIEF:\n${JSON.stringify(taskBrief, null, 2)}\n\nCODEBASE CONTEXT:\n${fullContext}\n\nUSER REQUEST:\n${prompt}\n\nGenerate the JSON execution plan.`,
    },
  ];

  const { content, provider, model } = await generateTaskResponse(messages, {
    runId: options.runId,
    taskType: AGENT_TASK_TYPES.PLANNING,
    temperature: 0.1,
    jsonMode: true,
    max_tokens: 4096,
  });

  return { ...JSON.parse(content), route: { provider, model } };
}
