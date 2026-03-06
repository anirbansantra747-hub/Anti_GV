import { generateGroqResponse } from '../llm/groqClient.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';

const CODER_SYSTEM_PROMPT = `
You are an expert Software Engineer Coder Agent.
You are given a codebase context, a user prompt, and a specific EXECUTION PLAN STEP to implement.
Your job is to generate the precise code changes required for that specific step using a Search/Replace format.

RULES:
1. Generate exact "search" and "replace" blocks for the specified file.
2. The "search" text MUST exactly match the file content natively, including all whitespace.
3. If the step action is CREATE, leave "search" as an empty string "" and provide the entire file content in "replace".
4. Output ONLY valid JSON matching the schema below. No markdown wrappers.

SCHEMA:
${editJsonSchemaInstructions}
`;

/**
 * Coder Agent
 * Takes the assembled context, original prompt, and the full plan.
 * Iterates through the plan steps and generates the required edits for each.
 */
export const generateCodeEdits = async (plan, fullContext, socket) => {
  const edits = [];

  for (const step of plan.steps) {
    if (step.action === 'RUN_COMMAND') {
      socket.emit('agent:thinking', { message: `Skipping command step: ${step.description}` });
      continue;
    }

    socket.emit('agent:thinking', {
      message: `Writing code for step ${step.stepId}: ${step.description}`,
    });
    socket.emit('agent:step:start', {
      stepId: `code_${step.stepId}`,
      description: `${step.action} ${step.filePath}`,
    });

    const stepPrompt = `
CONTEXT:
${fullContext}

---
CURRENT STEP TO IMPLEMENT:
Action: ${step.action}
File: ${step.filePath}
Description: ${step.description}

Generate the JSON edit response for this step.
`;

    try {
      const messages = [
        { role: 'system', content: CODER_SYSTEM_PROMPT },
        { role: 'user', content: stepPrompt },
      ];

      const responseString = await generateGroqResponse(messages, {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1, // Keep deterministic for accurate code generation
        jsonMode: true,
      });

      const editResult = JSON.parse(responseString);
      edits.push(editResult);

      // In a real flowing app, we would emit these chunks as they stream.
      // For now, we emit the completed JSON chunk for the frontend to apply to the Shadow Tree.
      socket.emit('agent:step:code', {
        stepId: `code_${step.stepId}`,
        chunk: JSON.stringify(editResult, null, 2),
        provider: 'groq',
      });
    } catch (error) {
      console.error(`[CoderAgent] Failed to generate code for step ${step.stepId}:`, error);
      socket.emit('agent:error', {
        message: `Coder failed on step ${step.stepId}: ${error.message}`,
      });
      throw error;
    }

    socket.emit('agent:step:done', { stepId: `code_${step.stepId}` });
  }

  return edits;
};
