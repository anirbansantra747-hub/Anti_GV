import { AGENT_RUN_PHASES, AGENT_TASK_TYPES, LIMITS } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';
import { editJsonSchemaInstructions } from './schemas/editSchema.js';
import { runCritic } from './criticAgent.js';
import { runFixer } from './fixerAgent.js';
import { validatePatchPayload } from './preflightValidator.js';
import { renderContextBundle } from './contextBundleBuilder.js';
import { readFile, exists, getWorkspaceRoot } from '../fs/fileService.js';
import path from 'path';

const CODER_SYSTEM_PROMPT = `
You are an expert Software Engineer Coder Agent.
You are given a canonical task brief, a focused context slice, and a single plan step.
Return valid JSON only using minimal search/replace edits.

CRITICAL RULES:
1. Search text must be copied verbatim from the supplied file content.
2. Keep patches minimal and localized.
3. Never rewrite the whole file unless the file is new.
4. Use the schema exactly.

SCHEMA:
${editJsonSchemaInstructions}
`;

function addLineNumbers(content) {
  return content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(4, ' ')}: ${line}`)
    .join('\n');
}

function createFailureSignature(issues = []) {
  return issues
    .map((issue) => String(issue).trim().toLowerCase())
    .sort()
    .join('|');
}

export async function generateCodeEdits(plan, contextBundle, taskBrief, socket, options = {}) {
  const edits = [];
  const isCancelled = options.isCancelled || (() => false);
  const runId = options.runId;

  for (const step of plan.steps || []) {
    if (isCancelled()) break;

    const files = step.files?.length ? step.files : [step.filePath].filter(Boolean);
    const primaryFile = files[0] || step.filePath;

    // -- Handle RUN_COMMAND explicitly --
    if (step.action === 'RUN_COMMAND') {
      const commandToRun = step.command || step.description;

      socket.emit('agent:thinking', {
        message: `Executing command for step ${step.stepId}: ${commandToRun}`,
      });
      socket.emit('agent:run_state', {
        runId,
        phase: AGENT_RUN_PHASES.CODEGEN,
        taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
        status: 'running',
        stepId: step.stepId,
        message: `Executing command: ${commandToRun}`,
      });
      socket.emit('agent:step:start', {
        stepId: `code_${step.stepId}`,
        description: `Execute: ${commandToRun}`,
      });

      // Dispatch the command to the frontend's active Terminal
      socket.emit('agent:terminal:run', { command: commandToRun });

      // Simulate completion of this command step
      socket.emit('agent:step:done', { stepId: `code_${step.stepId}` });
      continue;
    }

    socket.emit('agent:thinking', {
      message: `Writing code for step ${step.stepId}: ${step.description}`,
    });
    socket.emit('agent:run_state', {
      runId,
      phase: AGENT_RUN_PHASES.CODEGEN,
      taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
      status: 'running',
      stepId: step.stepId,
      filePaths: files,
      message: `Codegen for step ${step.stepId}`,
    });
    socket.emit('agent:step:start', {
      stepId: `code_${step.stepId}`,
      description: `${step.action} ${primaryFile}`,
    });

    let actualFileContent = 'File not found or is new.';
    let effectiveFilePath = primaryFile;

    try {
      if (primaryFile) {
        effectiveFilePath = await normalizeWorkspacePath(primaryFile);
        if (await exists(effectiveFilePath)) {
          actualFileContent = await readFile(effectiveFilePath);
        }
      }
    } catch (error) {
      console.warn(`[CoderAgent] Could not read ${effectiveFilePath}:`, error.message);
    }

    const isExistingFile = actualFileContent !== 'File not found or is new.';
    const focusedContext = renderContextBundle(contextBundle, [
      'workspaceFocus',
      'retrievedChunks',
      'symbolGraph',
      'dependencyGraph',
      'verificationEvidence',
    ]);

    const stepPrompt = `CANONICAL TASK BRIEF:\n${JSON.stringify(taskBrief, null, 2)}\n\nAPPROVED PLAN STEP:\n${JSON.stringify(step, null, 2)}\n\nFOCUSED CONTEXT:\n${focusedContext}\n\nPRIMARY FILE:\n${effectiveFilePath}\n\nCURRENT FILE CONTENT (with line numbers for reference only):\n\`\`\`\n${isExistingFile ? addLineNumbers(actualFileContent) : '(new file)'}\n\`\`\``;

    try {
      const { content, provider, model } = await generateTaskResponse(
        [
          { role: 'system', content: CODER_SYSTEM_PROMPT },
          { role: 'user', content: stepPrompt },
        ],
        {
          runId,
          taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
          temperature: 0.1,
          jsonMode: true,
        }
      );

      let editResult = JSON.parse(content);
      editResult.stepId = step.stepId;
      editResult.filePath = effectiveFilePath;
      editResult.fileGroupId = step.fileGroupId || `group-${step.stepId}`;
      editResult.files = files;
      editResult.verificationHints = step.verificationHints || [];
      editResult.retryCount = 0;

      let retryCount = 0;
      let failureSignature = '';
      let feedback = '';
      let isCorrect = false;

      while (retryCount <= LIMITS.MAX_FIXER_RETRIES) {
        const preflight = validatePatchPayload(editResult, isExistingFile ? actualFileContent : '');
        if (!preflight.valid) {
          feedback = preflight.issues.join(' ');
        } else {
          const criticResult = await runCritic({
            runId,
            prompt: step.description,
            fileContent: actualFileContent,
            filePath: effectiveFilePath,
            proposedEdits: editResult.edits || [],
          });
          isCorrect = criticResult.isCorrect;
          feedback = criticResult.feedback || '';
        }

        if (isCorrect) break;

        retryCount += 1;
        if (retryCount > LIMITS.MAX_FIXER_RETRIES) break;

        const nextSignature = createFailureSignature([feedback]);
        if (nextSignature && nextSignature === failureSignature) {
          feedback = `Repeated failure detected: ${feedback}`;
          break;
        }
        failureSignature = nextSignature;

        const fixedEdits = await runFixer({
          runId,
          prompt: step.description,
          fileContent: actualFileContent,
          filePath: effectiveFilePath,
          previousEdits: editResult.edits || [],
          errorFeedback: feedback,
        });

        editResult = {
          ...editResult,
          edits: fixedEdits,
          retryCount,
        };
      }

      edits.push(editResult);

      socket.emit('agent:step:code', {
        stepId: `code_${step.stepId}`,
        chunk: JSON.stringify(editResult, null, 2),
        provider,
        model,
        criticFeedback: feedback || 'Approved on first pass.',
        file: effectiveFilePath,
        files,
        fileGroupId: editResult.fileGroupId,
        verificationHints: editResult.verificationHints,
      });
    } catch (error) {
      console.error(`[CoderAgent] Failed on step ${step.stepId}:`, error.message);
      socket.emit('agent:error', {
        message: `Coder failed on step ${step.stepId}: ${error.message}`,
      });
    }

    socket.emit('agent:step:done', { stepId: `code_${step.stepId}` });
  }

  return edits;
}

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
    return '/' + relative.replace(/\\/g, '/');
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === rootName.toLowerCase()) {
    return '/' + segments.slice(1).join('/');
  }

  return normalized;
}
