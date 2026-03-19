import crypto from 'crypto';
import { AGENT_RUN_PHASES, AGENT_TASK_TYPES, SOCKET_EVENTS } from '@antigv/shared';
import { addMessage } from '../db/chatService.js';
import {
  startRunTelemetry,
  recordStageMetric,
  finishRunTelemetry,
} from '../llm/telemetryService.js';
import { getProviderHealthSnapshot } from '../llm/providerHealthService.js';
import { streamResponse } from '../llm/llmRouter.js';
import { handleStream } from '../llm/streamHandler.js';
import { buildTaskBrief } from './taskBriefAgent.js';
import { classifyIntent } from './intentClassifier.js';
import { assembleContext } from './contextAssembler.js';
import { generatePlan } from './plannerAgent.js';
import { validatePlan } from './planValidator.js';
import { generateCodeEdits } from './coderAgent.js';
import { activeCache } from './cacheService.js';
import { activeShadowEval } from './shadowEvalService.js';
import { runVerification } from '../verification/verificationRunner.js';
import { activeShadowWorkspace } from './shadowWorkspace.js';

function emitRunState(socket, payload) {
  socket.emit(SOCKET_EVENTS.AGENT_RUN_STATE, payload);
}

async function measureStage(runId, stage, fn) {
  const startedAt = Date.now();
  const result = await fn();
  recordStageMetric(runId, {
    stage,
    latencyMs: Date.now() - startedAt,
  });
  return result;
}

export async function runAgentPipeline({
  prompt,
  frontendContext,
  serverContext,
  socket,
  waitForApproval,
  chatId,
  workspaceId,
  isCancelled = () => false,
}) {
  const runId = crypto.randomUUID();
  startRunTelemetry(runId, { prompt });

  try {
    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.HEALTH,
      taskType: 'pipeline',
      status: 'running',
      message: 'Loading provider health snapshot',
      health: getProviderHealthSnapshot(),
    });

    const cachedBrief = activeCache.get(AGENT_TASK_TYPES.TASK_BRIEF, prompt, '');
    let taskBrief;

    if (cachedBrief) {
      taskBrief = cachedBrief;
      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.BRIEF,
        taskType: AGENT_TASK_TYPES.TASK_BRIEF,
        provider: 'cache',
        model: 'memory',
        status: 'done',
        message: `(Cached) ${taskBrief.requestedOutcome}`,
      });
    } else {
      taskBrief = await measureStage(runId, AGENT_RUN_PHASES.BRIEF, () =>
        buildTaskBrief(prompt, frontendContext, { runId })
      );
      activeCache.set(AGENT_TASK_TYPES.TASK_BRIEF, prompt, taskBrief, 86400000); // 24hr TTL

      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.BRIEF,
        taskType: AGENT_TASK_TYPES.TASK_BRIEF,
        provider: taskBrief?._route?.provider,
        model: taskBrief?._route?.model,
        status: 'done',
        message: taskBrief.requestedOutcome,
      });

      // Dispatch async evaluation to measure brief quality drift
      if (taskBrief._rawMessages) {
        activeShadowEval.dispatchShadowEval(AGENT_TASK_TYPES.TASK_BRIEF, taskBrief._rawMessages, {
          content: taskBrief,
          model: taskBrief._route?.model,
        });
      }
    }

    const intentResult = await measureStage(runId, AGENT_RUN_PHASES.INTENT, () =>
      classifyIntent(prompt, taskBrief, { runId })
    );
    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.INTENT,
      taskType: AGENT_TASK_TYPES.INTENT_CLASSIFICATION,
      provider: intentResult.route?.provider,
      model: intentResult.route?.model,
      confidence: intentResult.confidence,
      status: 'done',
      message: `Intent ${intentResult.intent}`,
    });

    if (isCancelled()) {
      finishRunTelemetry(runId, 'cancelled');
      socket.emit(SOCKET_EVENTS.AGENT_DONE, { message: 'Terminated.' });
      return;
    }

    const { bundle: contextBundle, rendered: fullContext } = await measureStage(
      runId,
      AGENT_RUN_PHASES.CONTEXT,
      () => assembleContext(frontendContext, serverContext, prompt, taskBrief)
    );
    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.CONTEXT,
      taskType: 'context_bundle',
      status: 'done',
      message: `Context bundle with ${contextBundle.sections.length} sections`,
    });

    if (intentResult.intent === 'ASK') {
      socket.emit(SOCKET_EVENTS.AGENT_THINKING, { message: 'Answering question...' });
      socket.emit(SOCKET_EVENTS.AGENT_STEP_DONE, { stepId: 'ask-prep' });

      const askPrompt = `You are an expert Senior Software Engineer.\n\nCANONICAL TASK BRIEF:\n${JSON.stringify(taskBrief, null, 2)}\n\nCONTEXT:\n${fullContext}\n\nUSER QUESTION:\n${prompt}`;
      const messageId = crypto.randomUUID();
      socket.emit('agent:message:start', { messageId });

      const { stream, provider, model } = await streamResponse(
        [
          { role: 'system', content: 'You are a helpful coding assistant.' },
          { role: 'user', content: askPrompt },
        ],
        {
          runId,
          taskType: AGENT_TASK_TYPES.CHAT_ANSWER,
        }
      );

      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.DONE,
        taskType: AGENT_TASK_TYPES.CHAT_ANSWER,
        provider,
        model,
        status: 'streaming',
        message: 'Streaming answer',
      });

      const answer = await handleStream(stream, socket, provider, {
        eventName: 'agent:message:stream',
        extraPayload: { messageId },
      });

      if (workspaceId && chatId) {
        await addMessage(workspaceId, chatId, 'assistant', answer || '');
      }

      finishRunTelemetry(runId, 'completed', { intent: intentResult.intent });
      socket.emit(SOCKET_EVENTS.AGENT_DONE, { messageId, message: '' });
      return;
    }

    socket.emit(SOCKET_EVENTS.AGENT_THINKING, { message: 'Generating execution plan...' });
    socket.emit(SOCKET_EVENTS.AGENT_STEP_START, { stepId: 'plan', description: 'Proposed Plan' });

    const contextFingerprint =
      contextBundle.fingerprint || crypto.createHash('md5').update(fullContext).digest('hex');
    const cachedPlan = activeCache.get(AGENT_TASK_TYPES.PLANNING, prompt, contextFingerprint);
    let plan;

    if (cachedPlan) {
      plan = cachedPlan;
      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.PLAN,
        taskType: AGENT_TASK_TYPES.PLANNING,
        provider: 'cache',
        model: 'memory',
        status: 'done',
        message: '(Cached Plan)',
      });
    } else {
      plan = await measureStage(runId, AGENT_RUN_PHASES.PLAN, () =>
        generatePlan(prompt, taskBrief, fullContext, { runId })
      );
      activeCache.set(AGENT_TASK_TYPES.PLANNING, prompt, plan, 21600000, contextFingerprint); // 6hr TTL

      if (plan._rawMessages) {
        activeShadowEval.dispatchShadowEval(AGENT_TASK_TYPES.PLANNING, plan._rawMessages, {
          content: plan,
          model: plan.route?.model,
        });
      }
    }

    const planValidation = await measureStage(runId, AGENT_RUN_PHASES.VALIDATE, () =>
      validatePlan(plan, taskBrief, contextBundle)
    );

    const planPayload = {
      ...plan,
      validation: planValidation,
    };

    socket.emit(SOCKET_EVENTS.AGENT_PLAN, planPayload);
    socket.emit(SOCKET_EVENTS.AGENT_STEP_DONE, { stepId: 'plan' });

    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.VALIDATE,
      taskType: AGENT_TASK_TYPES.PLANNING,
      provider: plan.route?.provider,
      model: plan.route?.model,
      risk: plan.risk_level,
      status: planValidation.valid ? 'done' : 'blocked',
      message: planValidation.valid
        ? 'Plan validated'
        : `Plan blocked: ${planValidation.blockingIssues.join('; ')}`,
    });

    if (workspaceId && chatId) {
      await addMessage(workspaceId, chatId, 'assistant', `Plan: ${plan.summary || 'No summary'}`);
    }

    if (!planValidation.valid) {
      finishRunTelemetry(runId, 'blocked', {
        intent: intentResult.intent,
        validation: planValidation,
      });
      socket.emit(SOCKET_EVENTS.AGENT_DONE, {
        message: `Plan validation blocked execution: ${planValidation.blockingIssues.join('; ')}`,
      });
      return;
    }

    if (waitForApproval) {
      socket.emit(SOCKET_EVENTS.AGENT_THINKING, { message: 'Waiting for your approval...' });
      const { approved } = await waitForApproval();
      if (!approved) {
        finishRunTelemetry(runId, 'rejected', { intent: intentResult.intent });
        socket.emit(SOCKET_EVENTS.AGENT_DONE, { message: 'Plan rejected. Pipeline stopped.' });
        return;
      }
    }

    if (isCancelled()) {
      finishRunTelemetry(runId, 'cancelled');
      socket.emit(SOCKET_EVENTS.AGENT_DONE, { message: 'Terminated.' });
      return;
    }

    socket.emit(SOCKET_EVENTS.AGENT_THINKING, { message: 'Applying edits based on plan...' });

    const edits = await measureStage(runId, AGENT_RUN_PHASES.CODEGEN, () =>
      generateCodeEdits(planPayload, contextBundle, taskBrief, socket, {
        runId,
        isCancelled,
      })
    );

    if (isCancelled()) {
      finishRunTelemetry(runId, 'cancelled');
      socket.emit(SOCKET_EVENTS.AGENT_DONE, { message: 'Terminated.' });
      return;
    }

    if (workspaceId && chatId) {
      const files = Array.from(
        new Set(
          (plan.steps || [])
            .flatMap((step) => (step.files?.length ? step.files : [step.filePath]))
            .filter(Boolean)
        )
      ).slice(0, 12);
      await addMessage(
        workspaceId,
        chatId,
        'assistant',
        `Staged edits for ${files.length} file(s): ${files.join(', ')}`
      );
    }

    // ─── Phase 11: Final Verification ────────────────────────────────
    const changedFiles = Array.from(
      new Set(
        (plan.steps || [])
          .flatMap((step) => (step.files?.length ? step.files : [step.filePath]))
          .filter(Boolean)
      )
    );

    let verificationResult = { passed: true, checks: 0 };

    if (changedFiles.length > 0 && workspaceId) {
      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.FINAL_VERIFY,
        taskType: AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
        status: 'running',
        filePaths: changedFiles,
        message: `Running final verification on ${changedFiles.length} file(s)`,
      });

      try {
        const rawResult = await measureStage(runId, AGENT_RUN_PHASES.FINAL_VERIFY, () =>
          runVerification({ workspaceId, socket, changedFiles })
        );
        verificationResult = { passed: rawResult.passed, checks: rawResult.checks };

        if (!rawResult.passed && rawResult.logs) {
          // LLM Summarization of verification failure via PARALLEL_RACE
          const summaryPrompt = `
You are an expert Verification Summarizer.
The following logs were produced during the final validation checks of code edits.
Analyze the errors and provide a concise, 1-2 sentence human-readable summary of what failed.
Do not output JSON, just the text.

VERIFICATION LOGS:
\`\`\`
${rawResult.logs.substring(0, 4000)} // truncate to avoid blowing up context
\`\`\`
`;
          try {
            // PARALLEL_RACE is natively handled by router for this task type if configured,
            // or we can explicitly request it via routeOverrides.
            const { content } = await import('../llm/llmRouter.js').then((m) =>
              m.generateTaskResponse([{ role: 'user', content: summaryPrompt }], {
                runId,
                taskType: AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
                temperature: 0.1,
                max_tokens: 256,
                routeOverrides: { strategy: 'PARALLEL_RACE' },
              })
            );
            verificationResult.error = content.trim();
          } catch (e) {
            verificationResult.error = 'Verification logs indicate failure (summarization failed).';
          }

          // Emit REPAIR state to inform frontend, but do NOT enter a repair loop
          emitRunState(socket, {
            runId,
            phase: AGENT_RUN_PHASES.REPAIR,
            taskType: AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
            status: 'warning',
            message: `Verification issues: ${verificationResult.error}`,
          });
        }
      } catch (catastrophicError) {
        console.warn(
          `[Pipeline] Final verification encountered errors:`,
          catastrophicError.message
        );
        verificationResult = {
          passed: false,
          checks: changedFiles.length,
          error: catastrophicError.message,
        };
      }

      emitRunState(socket, {
        runId,
        phase: AGENT_RUN_PHASES.FINAL_VERIFY,
        taskType: AGENT_TASK_TYPES.VERIFICATION_SUMMARY,
        status: verificationResult.passed ? 'done' : 'warning',
        message: verificationResult.passed
          ? `Verification passed for ${changedFiles.length} file(s)`
          : `Verification completed with issues on ${changedFiles.length} file(s)`,
      });
    }

    // ─── Phase 12: Commit & Telemetry ────────────────────────────────
    const shadowConflicts = activeShadowWorkspace.getConflicts();
    const groupInfo = {};
    for (const [groupId] of activeShadowWorkspace.fileGroups || []) {
      groupInfo[groupId] = {
        files: activeShadowWorkspace.getGroupFiles(groupId),
        hasConflicts: activeShadowWorkspace.hasConflicts(groupId),
      };
    }

    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.COMMIT,
      taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
      status: 'done',
      message: `Commit phase: ${edits.length} patch groups ready`,
      metadata: {
        filesChanged: changedFiles.length,
        patchGroups: edits.length,
        verification: verificationResult,
        conflicts: shadowConflicts,
        groupInfo,
      },
    });

    finishRunTelemetry(runId, verificationResult.passed ? 'completed' : 'partial_success', {
      intent: intentResult.intent,
      planValidation,
      edits: edits.length,
      filesChanged: changedFiles.length,
      verification: verificationResult,
      conflicts: shadowConflicts.length,
    });

    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.REVIEW,
      taskType: AGENT_TASK_TYPES.STEP_CODEGEN,
      status: 'done',
      message: `Staged ${edits.length} patch groups for review`,
    });
    socket.emit(SOCKET_EVENTS.AGENT_DONE, { message: 'Pipeline complete.' });
  } catch (error) {
    finishRunTelemetry(runId, 'error', { error: error.message });
    emitRunState(socket, {
      runId,
      phase: AGENT_RUN_PHASES.ERROR,
      taskType: 'pipeline',
      status: 'error',
      message: error.message,
    });
    socket.emit(SOCKET_EVENTS.AGENT_ERROR, {
      message: error.message || 'An unknown error occurred in the agent pipeline',
    });
  }
}
