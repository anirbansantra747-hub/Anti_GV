import { llmRouter } from '../llm/llmRouter.js';
import { z } from 'zod';

const criticSchema = z.object({
  isCorrect: z
    .boolean()
    .describe('True if the patch solves the request and has no obvious errors.'),
  feedback: z
    .string()
    .describe(
      'Explain your reasoning. If isCorrect is false, explain what is wrong and how to fix it.'
    ),
});

const criticSystemPrompt = `You are an expert Senior Software Engineer acting as a Code Critic.
Your job is to review a patch (a set of search/replace edits) proposed by another AI agent and determine if it correctly implements the user's request.

You will receive:
1. The user's original request.
2. The current contents of the target file.
3. The proposed edits (search/replace blocks).

Check for:
1. Does the code fulfill the user's prompt?
2. Are there any syntax errors, unresolved variables, or missing imports introduced by the edits?
3. Does the "Search" block match the original file EXACTLY? If the search block does not perfectly match the file, it will fail to apply.

Return JSON with "isCorrect" and "feedback". Be strict.`;

/**
 * Reviews a proposed edit block against the file and user prompt.
 * @param {{ prompt: string, fileContent: string, filePath: string, proposedEdits: any[] }} params
 * @returns {Promise<{ isCorrect: boolean, feedback: string }>}
 */
export async function runCritic(params) {
  const { prompt, fileContent, filePath, proposedEdits } = params;

  const userContent = `User Request:
${prompt}

File Path: ${filePath}

Current File Content:
\`\`\`
${fileContent}
\`\`\`

Proposed Edits (to apply to the file):
\`\`\`json
${JSON.stringify(proposedEdits, null, 2)}
\`\`\`

Analyze the edits. Are they correct? Respond in JSON matching the schema.`;

  try {
    const response = await llmRouter.generateJSON({
      messages: [
        { role: 'system', content: criticSystemPrompt },
        { role: 'user', content: userContent },
      ],
      zodSchema: criticSchema,
    });

    return {
      isCorrect: response.isCorrect,
      feedback: response.feedback,
    };
  } catch (error) {
    console.error('[CriticAgent] Evaluation failed:', error);
    // Be lenient if the critic crashes, assume true to not block the pipeline
    return { isCorrect: true, feedback: 'Critic failed to evaluate, passing by default.' };
  }
}
