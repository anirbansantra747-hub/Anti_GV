import { generateResponse as generateGroqResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';
import { runCritic } from './criticAgent.js';
import { runFixer } from './fixerAgent.js';

import { readFile, exists } from '../fs/fileService.js';

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

    // Module 10: Fetch exact REAL file contents from disk before coding
    let actualFileContent = 'File not found or is new.';
    try {
      if (step.filePath && (await exists(step.filePath))) {
        actualFileContent = await readFile(step.filePath);
      }
    } catch (e) {
      console.warn(`[CoderAgent] Could not read ${step.filePath} from disk:`, e.message);
    }

    const stepPrompt = `
CONTEXT:
${fullContext}

---
CURRENT STEP TO IMPLEMENT:
Action: ${step.action}
File: ${step.filePath}
Description: ${step.description}

EXACT CURRENT FILE CONTENT (From Disk):
\`\`\`
${actualFileContent}
\`\`\`

Generate the JSON edit response for this step.
`;

    try {
      const messages = [
        { role: 'system', content: CODER_SYSTEM_PROMPT },
        { role: 'user', content: stepPrompt },
      ];

      // 1. Initial Generation
      console.log(`\n[CoderAgent] ── Step ${step.stepId}: ${step.action} ${step.filePath} ──`);
      console.log(`[CoderAgent]   Generating initial edits...`);

      const responseString = await generateGroqResponse(messages, {
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1, // Keep deterministic for accurate code generation
        jsonMode: true,
      });

      let editResult = JSON.parse(responseString);
      const editCount = editResult.edits?.length || 0;
      console.log(`[CoderAgent]   ✅ Initial generation: ${editCount} edit(s)`);

      // 2. Self-Healing Verification Loop (Critic → Fixer → Retry)
      let isCorrect = false;
      let feedback = '';
      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (!isCorrect && retryCount <= MAX_RETRIES) {
        const attemptNum = retryCount + 1;
        console.log(
          `[CoderAgent]   🔍 Critic review (attempt ${attemptNum}/${MAX_RETRIES + 1})...`
        );
        socket.emit('agent:thinking', {
          message: `Verifying step ${step.stepId} (Attempt ${attemptNum})...`,
        });

        // Pass ACTUAL file content (not the full LLM context blob)
        const criticResult = await runCritic({
          prompt: step.task || step.description,
          fileContent: actualFileContent,
          filePath: step.filePath,
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

        // Needs fixing
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
            filePath: step.filePath,
            previousEdits: editResult.edits || [],
            errorFeedback: feedback,
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

      // 3. Emit completed edits to frontend
      socket.emit('agent:step:code', {
        stepId: `code_${step.stepId}`,
        chunk: JSON.stringify(editResult, null, 2),
        provider: 'groq',
        criticFeedback: String(feedback) || 'Approved on first pass.',
        file: step.filePath,
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
