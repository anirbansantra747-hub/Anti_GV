import { llmRouter } from '../llm/llmRouter.js';
import { editSchema, coderSystemPrompt } from './schemas/editSchema.js';

const fixerSystemPrompt = `${coderSystemPrompt}

You are acting as a FIXER. The previous code generation produced an error (e.g. failing to apply to the file, syntax error, or failing logic).
Review the previous generation, the error feedback, and explicitly correct the mistake following all rules for the JSON edit format.`;

/**
 * Retries generating code edits given critic feedback or patch application errors.
 * @param {{ prompt: string, fileContent: string, filePath: string, previousEdits: any[], errorFeedback: string }} params
 * @returns {Promise<any[]>} The corrected edits
 */
export async function runFixer(params) {
  const { prompt, fileContent, filePath, previousEdits, errorFeedback } = params;

  const userContent = `<User Request>
${prompt}
</User Request>

<File Path>
${filePath}
</File Path>

<Current File Content>
\`\`\`
${fileContent}
\`\`\`
</Current File Content>

<Your Previous Attempt>
\`\`\`json
${JSON.stringify({ edits: previousEdits }, null, 2)}
\`\`\`
</Your Previous Attempt>

<Error / Critic Feedback>
${errorFeedback}
</Error / Critic Feedback>

Your task: Fix the error and return a NEW set of valid JSON edits. Remember: The \`search\` block must EXACTLY match the file's current text snippet.`;

  try {
    const response = await llmRouter.generateJSON({
      messages: [
        { role: 'system', content: fixerSystemPrompt },
        { role: 'user', content: userContent },
      ],
      zodSchema: editSchema,
    });

    return response.edits; // Corrected array of { search, replace }
  } catch (error) {
    console.error('[FixerAgent] Failed to fix edit:', error);
    // Return empty array on catastrophic failure so it doesn't break the pipeline entirely
    return [];
  }
}
