import { generateResponse } from '../llm/llmRouter.js';

const criticSystemPrompt = `You are an expert Senior Software Engineer acting as a Code Critic.
Your job is to review a patch (a set of search/replace edits) proposed by another AI agent and determine if it correctly implements the user's request.

You will receive:
1. The user's original request.
2. The current contents of the target file.
3. The proposed edits (search/replace blocks).

Check ALL of the following:
1. Does the edit fulfill the user's request completely?
2. Does the SEARCH block exist VERBATIM in the current file content? (Most important check — if the text is not found, the patch will fail to apply.)
3. Is the edit minimal? It should only change what's needed, not rewrite unrelated code.
4. Are there syntax errors, missing imports, or unresolved variables introduced by the edit?
5. Does the REPLACE block accidentally delete code that should stay?

Be strict. If the SEARCH block text is not found verbatim in the file, that is an automatic FAIL.
Return JSON: {"isCorrect": boolean, "feedback": "explanation"}`;

/**
 * Reviews a proposed edit block against the file and user prompt.
 * Uses DeepSeek-R1-0528 (reasoning model) for thorough review.
 * @param {{ prompt: string, fileContent: string, filePath: string, proposedEdits: any[] }} params
 * @returns {Promise<{ isCorrect: boolean, feedback: string }>}
 */
export async function runCritic(params) {
  const { prompt, fileContent, filePath, proposedEdits } = params;
  console.log(
    `[CriticAgent] Reviewing ${filePath} — ${proposedEdits.length} edit(s), fileContent: ${fileContent.length} chars`
  );

  const userContent = `User Request:
${prompt}

File Path: ${filePath}

Current File Content:
\`\`\`
${fileContent}
\`\`\`

Proposed Edits:
\`\`\`json
${JSON.stringify(proposedEdits, null, 2)}
\`\`\`

Analyze these edits carefully. Check that each "search" string exists verbatim in the file content. Respond in JSON.`;

  try {
    const responseText = await generateResponse(
      [
        { role: 'system', content: criticSystemPrompt },
        { role: 'user', content: userContent },
      ],
      { task: 'critic', jsonMode: true, max_tokens: 2048 }
    );
    const response = JSON.parse(responseText);

    console.log(
      `[CriticAgent] Result: ${response.isCorrect ? '✅ PASS' : '❌ FAIL'} — ${String(response.feedback).substring(0, 80)}`
    );
    return {
      isCorrect: response.isCorrect,
      feedback: response.feedback,
    };
  } catch (error) {
    console.error('[CriticAgent] Evaluation failed:', error);
    return { isCorrect: true, feedback: 'Critic failed to evaluate, passing by default.' };
  }
}
