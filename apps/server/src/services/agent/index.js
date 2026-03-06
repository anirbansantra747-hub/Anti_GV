import { classifyIntent } from './intentClassifier.js';
import { assembleContext } from './contextAssembler.js';
import { generatePlan } from './plannerAgent.js';
import { generateCodeEdits } from './coderAgent.js';
import { generateResponse } from '../llm/llmRouter.js';

/**
 * Main Agent Orchestrator Pipeline
 * Runs the sequence: Intent -> Context -> Plan -> Code -> Verify
 */
export const runAgentPipeline = async ({ prompt, frontendContext, serverContext, socket }) => {
  try {
    socket.emit('agent:thinking', { message: 'Classifying intent...' });

    // 1. Classify Intent
    const { intent, confidence } = await classifyIntent(prompt);
    socket.emit('agent:thinking', {
      message: `Intent classified as ${intent} (${Math.round(confidence * 100)}% confidence)`,
    });

    // Handle non-coding intents early
    if (intent === 'ASK') {
      socket.emit('agent:thinking', { message: 'Assembling codebase context...' });
      const fullContext = assembleContext(frontendContext, serverContext);

      socket.emit('agent:thinking', { message: 'Answering question...' });

      const askPrompt = `
You are an expert Senior Software Engineer.
Answer the user's question accurately and concisely based on the following codebase context.

CONTEXT:
${fullContext}

USER QUESTION:
${prompt}
`;
      const answer = await generateResponse([
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: askPrompt },
      ]);

      socket.emit('agent:done', { message: answer });
      return;
    }

    // 2. Assemble Context
    socket.emit('agent:thinking', { message: 'Assembling codebase context...' });
    const fullContext = assembleContext(frontendContext, serverContext);

    // 3. Planning (Module 5)
    socket.emit('agent:thinking', { message: 'Generating execution plan...' });
    socket.emit('agent:step:start', { stepId: 'plan', description: 'Proposed Plan' });

    const plan = await generatePlan(prompt, fullContext);

    socket.emit('agent:plan', plan);
    socket.emit('agent:step:done', { stepId: 'plan' });

    // In a real flow, we wait for 'agent:approve' here before continuing to Coding
    // For now, we simulate continuing immediately

    // 4. Coding (Module 6)
    socket.emit('agent:thinking', { message: 'Applying edits based on plan...' });

    // Instead of mock code generation, we pass the plan + context to the real Coder Agent
    const edits = await generateCodeEdits(plan, fullContext, socket);

    // Once the edits are fully generated, signal that the coding phase is done
    socket.emit('agent:step:done', { stepId: 'code-generation' });

    // 5. Verification (Module 8 placeholder)
    // socket.emit('agent:thinking', { message: 'Verifying code...' });

    socket.emit('agent:done', { message: 'Pipeline complete.' });
  } catch (error) {
    console.error('[AgentPipeline] Error:', error);
    socket.emit('agent:error', {
      message: error.message || 'An unknown error occurred in the agent pipeline',
    });
  }
};
