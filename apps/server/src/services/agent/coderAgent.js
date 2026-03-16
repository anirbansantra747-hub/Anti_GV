import { generateResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';
import { runCritic } from './criticAgent.js';
import { runFixer } from './fixerAgent.js';

import { readFile, exists, getWorkspaceRoot } from '../fs/fileService.js';
import path from 'path';

const CODER_SYSTEM_PROMPT = `
You are an expert Software Engineer Coder Agent.
You are given the EXACT current file content WITH LINE NUMBERS and a specific step to implement using Search/Replace.

CRITICAL RULES FOR SEARCH BLOCKS:
1. The "search" string must be COPIED VERBATIM from the file content shown to you — every space, tab, comma, semicolon, and newline must match exactly. Do NOT include line numbers in the search string.
2. Use the MINIMUM lines needed to uniquely identify the location — typically 2–5 lines covering the exact function/element to change. Never include more than necessary.
3. Never paraphrase, summarize, or reconstruct the search text from memory. Only copy directly from the provided file content.
4. If the step action is CREATE (new file), leave "search" as "" and put the entire file in "replace".
5. If you need to INSERT code at a specific location, include the 2–3 surrounding lines in "search" and add the new code inside "replace" at the correct position.
6. NEVER replace an entire file unless the action is CREATE.
7. NEVER append code at the end of a file. Always find the exact location to edit using a search block.
8. After writing each search block, mentally verify: "Does this exact text appear in the file content shown above?" If not, re-read and correct it.
9. Output ONLY valid JSON matching the schema. No markdown, no explanation outside the JSON.

SCHEMA:
${editJsonSchemaInstructions}
`;

/**
 * Adds 1-based line numbers to file content for LLM reference.
 * The LLM sees line numbers but must NOT include them in search blocks.
 */
function addLineNumbers(content) {
  return content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4, ' ')}: ${line}`)
    .join('\n');
}

/**
 * Pre-validates all search blocks before sending to critic.
 * Returns { valid: boolean, failedSearch: string | null }
 */
function validateSearchBlocks(edits, fileContent) {
  if (!edits || !Array.isArray(edits)) return { valid: true, failedSearch: null };
  for (const edit of edits) {
    if (edit.search && edit.search.trim() !== '') {
      if (!fileContent.includes(edit.search)) {
        return { valid: false, failedSearch: edit.search };
      }
    }
  }
  return { valid: true, failedSearch: null };
}

/**
 * Coder Agent
 * Takes the assembled context, original prompt, and the full plan.
 * Iterates through the plan steps and generates the required edits for each.
 *
 * @param {Object} plan - The execution plan from plannerAgent
 * @param {string} fullContext - The assembled codebase context
 * @param {import('socket.io').Socket} socket
 * @param {() => boolean} isCancelled - Returns true if the pipeline was terminated
 */
export const generateCodeEdits = async (plan, fullContext, socket, isCancelled = () => false) => {
  const edits = [];

  for (const step of plan.steps) {
    // Check for cancellation before each step
    if (isCancelled()) {
      console.log('[CoderAgent] Pipeline cancelled — stopping code generation');
      socket.emit('agent:thinking', { message: 'Generation stopped.' });
      break;
    }

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

    // Read EXACT file content from disk before coding
    let actualFileContent = 'File not found or is new.';
    let effectiveFilePath = step.filePath;
    try {
      if (step.filePath) {
        effectiveFilePath = await normalizeWorkspacePath(step.filePath);
        if (await exists(effectiveFilePath)) {
          actualFileContent = await readFile(effectiveFilePath);
        }
      }
    } catch (e) {
      console.warn(`[CoderAgent] Could not read ${effectiveFilePath} from disk:`, e.message);
    }

    const isExistingFile = actualFileContent !== 'File not found or is new.';

    const stepPrompt = `
CONTEXT:
${fullContext}

---
CURRENT STEP TO IMPLEMENT:
Action: ${step.action}
File: ${effectiveFilePath}
Description: ${step.description}
${step.task ? `Specific Task: ${step.task}` : ''}

EXACT CURRENT FILE CONTENT (line numbers shown for reference — do NOT include them in search blocks):
\`\`\`
${isExistingFile ? addLineNumbers(actualFileContent) : '(new file — use CREATE action with empty search)'}
\`\`\`

Generate the JSON edit response for this step. Copy search text EXACTLY from the file above (without line numbers).
`;

    try {
      const messages = [
        { role: 'system', content: CODER_SYSTEM_PROMPT },
        { role: 'user', content: stepPrompt },
      ];

      // 1. Initial Generation
      console.log(`\n[CoderAgent] ── Step ${step.stepId}: ${step.action} ${step.filePath} ──`);
      console.log(`[CoderAgent]   Generating initial edits...`);

      const responseString = await generateResponse(messages, {
        task: 'code',
        temperature: 0.1,
        jsonMode: true,
      });

      let editResult = JSON.parse(responseString);
      const editCount = editResult.edits?.length || 0;
      console.log(`[CoderAgent]   ✅ Initial generation: ${editCount} edit(s)`);

      // 2. Pre-validate search blocks (before even calling critic)
      //    This catches the "appending code" and "wrong location" bugs immediately.
      if (isExistingFile) {
        const preCheck = validateSearchBlocks(editResult.edits, actualFileContent);
        if (!preCheck.valid) {
          console.warn(
            `[CoderAgent]   ⚠️  Search block not found in file — forcing fixer immediately`
          );
          const failedPreview = String(preCheck.failedSearch).substring(0, 80);
          const autoFeedback = `SEARCH BLOCK NOT FOUND. The following search text does not exist verbatim in ${effectiveFilePath}:\n"${failedPreview}"\nYou MUST copy the search text character-for-character from the file content provided. Do not reconstruct from memory.`;

          try {
            const fixedEdits = await runFixer({
              prompt: step.task || step.description,
              fileContent: actualFileContent,
              filePath: effectiveFilePath,
              previousEdits: editResult.edits || [],
              errorFeedback: autoFeedback,
            });
            editResult = { edits: fixedEdits };
            console.log(
              `[CoderAgent]   🔧 Pre-validation fixer returned ${fixedEdits?.length || 0} edit(s)`
            );
          } catch (fixErr) {
            console.error('[CoderAgent]   Pre-validation fixer failed:', fixErr.message);
          }
        }
      }

      // 3. Self-Healing Verification Loop (Critic → Fixer → Retry)
      let isCorrect = false;
      let feedback = '';
      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (!isCorrect && retryCount <= MAX_RETRIES) {
        if (isCancelled()) break;

        const attemptNum = retryCount + 1;
        console.log(
          `[CoderAgent]   🔍 Critic review (attempt ${attemptNum}/${MAX_RETRIES + 1})...`
        );
        socket.emit('agent:thinking', {
          message: `Verifying step ${step.stepId} (Attempt ${attemptNum})...`,
        });

        const criticResult = await runCritic({
          prompt: step.task || step.description,
          fileContent: actualFileContent,
          filePath: effectiveFilePath,
          proposedEdits: editResult.edits || [],
        });

        isCorrect = criticResult.isCorrect;
        feedback = criticResult.feedback;

        console.log(`[CoderAgent]   🔍 Critic verdict: ${isCorrect ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`[CoderAgent]   🔍 Feedback: ${String(feedback).substring(0, 120)}`);

        if (isCorrect) {
          socket.emit('agent:thinking', {
            message: `Step ${step.stepId} verified successfully. ✅`,
          });
          break;
        }

        retryCount++;
        if (retryCount > MAX_RETRIES) {
          console.warn(
            `[CoderAgent]   ⚠️  Max retries reached for step ${step.stepId}, using last attempt`
          );
          break;
        }

        console.log(`[CoderAgent]   🔧 Fixer attempt ${retryCount}/${MAX_RETRIES}...`);
        socket.emit('agent:thinking', {
          message: `Fixing step ${step.stepId} (Retry ${retryCount}/${MAX_RETRIES}): ${String(feedback).substring(0, 40)}...`,
        });

        try {
          const fixedEdits = await runFixer({
            prompt: step.task || step.description,
            fileContent: actualFileContent,
            filePath: effectiveFilePath,
            previousEdits: editResult.edits || [],
            errorFeedback: String(feedback || ''),
          });

          console.log(
            `[CoderAgent]   🔧 Fixer returned ${fixedEdits?.length || 0} corrected edit(s)`
          );
          editResult = { edits: fixedEdits };
        } catch (fixError) {
          console.error(
            `[CoderAgent]   🔧 Fixer crashed on step ${step.stepId}:`,
            fixError.message
          );
          break;
        }
      }

      console.log(
        `[CoderAgent]   📦 Final result: ${editResult.edits?.length || 0} edit(s), verified=${isCorrect}`
      );
      edits.push(editResult);

      // 4. Emit completed edits to frontend
      socket.emit('agent:step:code', {
        stepId: `code_${step.stepId}`,
        chunk: JSON.stringify(editResult, null, 2),
        provider: 'ai',
        criticFeedback: String(feedback) || 'Approved on first pass.',
        file: effectiveFilePath,
        baseContent: isExistingFile ? actualFileContent : null,
      });
    } catch (error) {
      console.error(
        `[CoderAgent] ❌ Failed to generate code for step ${step.stepId}:`,
        error.message
      );
      socket.emit('agent:error', {
        message: `Coder failed on step ${step.stepId}: ${error.message}`,
      });
    }

    socket.emit('agent:step:done', { stepId: `code_${step.stepId}` });
  }

  return edits;
};

export async function normalizeWorkspacePath(filePath) {
  if (!filePath) return '/';

  let normalized = filePath.replace(/\\/g, '/').trim();
  if (!normalized.startsWith('/')) normalized = '/' + normalized;

  const workspaceRoot = getWorkspaceRoot();
  const rootName = path.basename(workspaceRoot);

  const absoluteRoot = path.resolve(workspaceRoot);
  const absoluteFilePath = path.resolve(filePath);
  if (absoluteFilePath.toLowerCase().startsWith(absoluteRoot.toLowerCase())) {
    const relative = path.relative(absoluteRoot, absoluteFilePath);
    console.log(`[CoderAgent] Converted absolute path to relative: "${filePath}" -> "${relative}"`);
    return '/' + relative.replace(/\\/g, '/');
  }

  console.log(
    `[CoderAgent] Normalizing: "${filePath}" | Root: "${workspaceRoot}" | rootName: "${rootName}"`
  );

  if (!rootName) return normalized;

  const rootNameLower = rootName.toLowerCase();
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length > 0 && segments[0].toLowerCase() === rootNameLower) {
    return '/' + segments.slice(1).join('/');
  }

  return normalized;
}
