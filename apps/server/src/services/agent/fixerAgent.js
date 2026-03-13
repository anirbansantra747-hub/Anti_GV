import { generateResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';

const fixerSystemPrompt = `
You are acting as an expert Software Engineer FIXER Agent.
The previous code generation produced an error (e.g. failing to apply to the file, syntax error, or failing logic).
Review the previous generation, the error feedback, and explicitly correct the mistake following all rules for the JSON edit format.

RULES:
1. Generate exact "search" and "replace" blocks for the specified file.
2. The "search" text MUST exactly match the file content natively, including all whitespace.
3. If the step action is CREATE, leave "search" as an empty string "" and provide the entire file content in "replace".
4. Output ONLY valid JSON matching the schema below. No markdown wrappers.

SCHEMA:
${editJsonSchemaInstructions}
`;

/**
 * Retries generating code edits given critic feedback or patch application errors.
 * @param {{ prompt: string, fileContent: string, filePath: string, previousEdits: any[], errorFeedback: string }} params
 * @returns {Promise<any[]>} The corrected edits
 */
export async function runFixer(params) {
  const { prompt, fileContent, filePath, previousEdits, errorFeedback } = params;
  console.log(`[FixerAgent] Fixing ${filePath} — ${previousEdits.length} previous edit(s)`);
  console.log(`[FixerAgent] Error feedback: ${errorFeedback.substring(0, 100)}`);

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
    const responseText = await generateResponse(
      [
        { role: 'system', content: fixerSystemPrompt },
        { role: 'user', content: userContent },
      ],
      { jsonMode: true }
    );
    const response = JSON.parse(responseText);

    console.log(`[FixerAgent] ✅ Fixed: returned ${response.edits?.length || 0} corrected edit(s)`);
    return response.edits; // Corrected array of { search, replace }
  } catch (error) {
    console.error('[FixerAgent] Failed to fix edit:', error);
    // Return empty array on catastrophic failure so it doesn't break the pipeline entirely
    return [];
  }
}
