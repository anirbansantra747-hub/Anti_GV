import { classifyIntent } from './intentClassifier.js';
import { assembleContext } from './contextAssembler.js';
import { generatePlan } from './plannerAgent.js';
import { generateCodeEdits } from './coderAgent.js';
import { generateResponse, streamResponse } from '../llm/llmRouter.js';
import { handleStream } from '../llm/streamHandler.js';
import crypto from 'crypto';
import { addMessage } from '../db/chatService.js';

/**
 * Main Agent Orchestrator Pipeline
 * Runs the sequence: Intent -> Context -> Plan -> Code -> Verify
 */
export const runAgentPipeline = async ({
  prompt,
  frontendContext,
  serverContext,
  socket,
  waitForApproval,
  chatId,
  workspaceId,
}) => {
  try {
    console.log(`\n[AgentPipeline] ═══════════════════════════════════════════`);
    console.log(`[AgentPipeline] New pipeline started`);
    console.log(`[AgentPipeline] Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}`);
    console.log(`[AgentPipeline] ═══════════════════════════════════════════\n`);

    socket.emit('agent:thinking', { message: 'Classifying intent...' });

    // ── Phase 1: Classify Intent ─────────────────────────────────────────
    const { intent, confidence } = await classifyIntent(prompt);
    console.log(`[AgentPipeline] P0 Intent: ${intent} (${Math.round(confidence * 100)}%)`);
    socket.emit('agent:thinking', {
      message: `Intent classified as ${intent} (${Math.round(confidence * 100)}% confidence)`,
    });

    // Handle non-coding intents early
    if (intent === 'ASK') {
      console.log(`[AgentPipeline] Routing to ASK handler (no code changes)`);
      socket.emit('agent:thinking', { message: 'Assembling codebase context...' });
      const fullContext = await assembleContext(frontendContext, serverContext, prompt);

      socket.emit('agent:thinking', { message: 'Answering question...' });
      // Notify UI we are done "thinking" so the raw message can show up
      socket.emit('agent:step:done', { stepId: 'ask-prep' });

      const askPrompt = `
You are an expert Senior Software Engineer.
Answer the user's question accurately and concisely based on the following codebase context.

CONTEXT:
${fullContext}

USER QUESTION:
${prompt}
`;

      const messageId = crypto.randomUUID();
      // Notify the frontend that a new streaming message is starting
      socket.emit('agent:message:start', { messageId });

      const { stream, provider } = await streamResponse(
        [
          { role: 'system', content: 'You are a helpful coding assistant.' },
          { role: 'user', content: askPrompt },
        ],
        {
          model: 'llama-3.3-70b-versatile', // Force the versatile model for answers
        }
      );

      // Stream the tokens to the frontend
      const answer = await handleStream(stream, socket, provider, {
        eventName: 'agent:message:stream',
        extraPayload: { messageId },
      });

      console.log(`[AgentPipeline] ASK response streamed successfully`);
      socket.emit('agent:done', { messageId, message: '' }); // Send empty message to just resolve the loading state

      if (workspaceId && chatId) {
        await addMessage(workspaceId, chatId, 'assistant', answer || '');
      }
      return;
    }

    // ── Phase 2: Assemble Context ────────────────────────────────────────
    console.log(`[AgentPipeline] P1 Assembling codebase context...`);
    socket.emit('agent:thinking', { message: 'Assembling codebase context...' });
    const fullContext = await assembleContext(frontendContext, serverContext, prompt);
    console.log(`[AgentPipeline] P1 Context assembled (${fullContext.length} chars)`);

    // ── Phase 3: Planning ────────────────────────────────────────────────
    console.log(`[AgentPipeline] P2 Generating execution plan...`);
    socket.emit('agent:thinking', { message: 'Generating execution plan...' });
    socket.emit('agent:step:start', { stepId: 'plan', description: 'Proposed Plan' });

    const plan = await generatePlan(prompt, fullContext);
    console.log(`[AgentPipeline] P2 Plan generated: ${plan.steps?.length || 0} step(s)`);
    plan.steps?.forEach((s, i) =>
      console.log(`[AgentPipeline]   Step ${i + 1}: [${s.action}] ${s.filePath} — ${s.description}`)
    );

    socket.emit('agent:plan', plan);
    socket.emit('agent:step:done', { stepId: 'plan' });

    if (workspaceId && chatId) {
      await addMessage(workspaceId, chatId, 'assistant', `Plan: ${plan.summary || 'No summary'}`);
    }

    // ── Phase 3.5: APPROVAL GATE ─────────────────────────────────────────
    // Pipeline PAUSES here until user clicks Approve or Reject.
    if (waitForApproval) {
      console.log(`[AgentPipeline] P3 ⏸️  Waiting for user approval...`);
      socket.emit('agent:thinking', { message: 'Waiting for your approval...' });

      const { approved } = await waitForApproval();

      if (!approved) {
        console.log(`[AgentPipeline] P3 ❌ Plan rejected by user — pipeline aborted`);
        socket.emit('agent:done', { message: 'Plan rejected. Pipeline stopped.' });
        return;
      }

      console.log(`[AgentPipeline] P3 ✅ Plan approved — continuing to code generation`);
    } else {
      console.log(`[AgentPipeline] P3 ⚠️  No approval gate — auto-continuing (dev mode)`);
    }

    // ── Phase 4+5: Coding + Verification ─────────────────────────────────
    // The critic+fixer self-healing loop runs INSIDE generateCodeEdits()
    // for each step. See coderAgent.js for the verify/fix retry logic.
    console.log(`[AgentPipeline] P4+P5 Coding + Verification starting...`);
    socket.emit('agent:thinking', { message: 'Applying edits based on plan...' });

    const edits = await generateCodeEdits(plan, fullContext, socket);

    console.log(`[AgentPipeline] P4+P5 Complete: ${edits.length} file(s) edited`);
    socket.emit('agent:step:done', { stepId: 'code-generation' });

    if (workspaceId && chatId) {
      const files = (plan.steps || []).map((s) => s.filePath).filter(Boolean);
      const unique = Array.from(new Set(files)).slice(0, 10);
      await addMessage(
        workspaceId,
        chatId,
        'assistant',
        `Applied edits for ${unique.length} file(s): ${unique.join(', ')}`
      );
    }

    console.log(`[AgentPipeline] ═══════════════════════════════════════════`);
    console.log(`[AgentPipeline] Pipeline complete ✅`);
    console.log(`[AgentPipeline] ═══════════════════════════════════════════\n`);
    socket.emit('agent:done', { message: 'Pipeline complete.' });
  } catch (error) {
    console.error('[AgentPipeline] ❌ Error:', error);
    socket.emit('agent:error', {
      message: error.message || 'An unknown error occurred in the agent pipeline',
    });
  }
};
