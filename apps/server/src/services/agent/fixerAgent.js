import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';

const fixerSystemPrompt = `
You are an expert Software Engineer FIXER Agent.
The previous code generation produced incorrect edits. Fix them and return valid JSON only.

RULES:
1. The "search" text must exist verbatim in the supplied file content.
2. Keep the patch minimal and focused.
3. For create-file steps, use an empty search string and full file content in replace.

SCHEMA:
${editJsonSchemaInstructions}
`;

export async function runFixer(params) {
  const { prompt, fileContent, filePath, previousEdits, errorFeedback, runId } = params;

  try {
    const { content } = await generateTaskResponse(
      [
        { role: 'system', content: fixerSystemPrompt },
        {
          role: 'user',
          content: `<User Request>\n${prompt}\n</User Request>\n\n<File Path>\n${filePath}\n</File Path>\n\n<Current File Content>\n\`\`\`\n${fileContent}\n\`\`\`\n</Current File Content>\n\n<Your Previous Attempt>\n\`\`\`json\n${JSON.stringify({ edits: previousEdits }, null, 2)}\n\`\`\`\n</Your Previous Attempt>\n\n<Error / Critic Feedback>\n${errorFeedback}\n</Error / Critic Feedback>`,
        },
      ],
      {
        runId,
        taskType: AGENT_TASK_TYPES.FIX_GENERATION,
        jsonMode: true,
      }
    );

    return JSON.parse(content).edits || [];
  } catch (error) {
    console.error('[FixerAgent] Failed to fix edit:', error);
    return [];
  }
}
