import { generateResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';

const fixerSystemPrompt = `
You are an expert Software Engineer FIXER Agent.
The previous code generation produced incorrect edits. Your job is to fix them.

RULES:
1. The "search" text MUST exist VERBATIM in the file content shown below — copy it exactly, character for character.
2. Only change what is needed. Do not rewrite the entire file or unrelated sections.
3. If the step action is CREATE (new file), leave "search" as "" and put the full file content in "replace".
4. Output ONLY valid JSON matching the schema. No markdown wrappers.
5. After writing a search block, mentally verify it appears in the provided file content.

SCHEMA:
${editJsonSchemaInstructions}
`;

/**
 * Retries generating code edits given critic feedback or patch application errors.
 * Uses Codestral-2501 (code-specialized model) for fixing.
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

Fix the error and return corrected JSON edits. The search block MUST be text that exists verbatim in the file shown above.`;

  try {
    const responseText = await generateResponse(
      [
        { role: 'system', content: fixerSystemPrompt },
        { role: 'user', content: userContent },
      ],
      { task: 'fixer', jsonMode: true }
    );
    const response = JSON.parse(responseText);

    console.log(`[FixerAgent] ✅ Fixed: returned ${response.edits?.length || 0} corrected edit(s)`);
    return response.edits;
  } catch (error) {
    console.error('[FixerAgent] Failed to fix edit:', error);
    return [];
  }
}
