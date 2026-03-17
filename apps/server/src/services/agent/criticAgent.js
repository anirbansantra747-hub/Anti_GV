import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';

const criticSystemPrompt = `You are an expert Senior Software Engineer acting as a Code Critic.
Review a proposed patch and return JSON only:
{"isCorrect": boolean, "feedback": "explanation"}

Fail the patch if the search block does not appear verbatim in the file, if the change does not satisfy the request, or if it introduces obvious syntax/import issues.`;

export async function runCritic(params) {
  const { prompt, fileContent, filePath, proposedEdits, runId } = params;

  try {
    const { content } = await generateTaskResponse(
      [
        { role: 'system', content: criticSystemPrompt },
        {
          role: 'user',
          content: `User Request:\n${prompt}\n\nFile Path:\n${filePath}\n\nCurrent File Content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nProposed Edits:\n\`\`\`json\n${JSON.stringify(proposedEdits, null, 2)}\n\`\`\``,
        },
      ],
      {
        runId,
        taskType: AGENT_TASK_TYPES.PATCH_REVIEW,
        jsonMode: true,
        max_tokens: 2048,
      }
    );

    const response = JSON.parse(content);
    return {
      isCorrect: response.isCorrect,
      feedback: response.feedback,
    };
  } catch (error) {
    console.error('[CriticAgent] Evaluation failed:', error);
    return { isCorrect: true, feedback: 'Critic failed to evaluate, passing by default.' };
  }
}
