import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';
import { ROUTING_STRATEGY } from '../llm/modelRegistry.js';

const criticSystemPrompt = `You are an expert Senior Software Engineer acting as a Code Critic.
Review a proposed patch and return JSON only:
{"isCorrect": boolean, "feedback": "explanation"}

Fail the patch if the "search" block does not appear verbatim in the file context provided, if the change does not satisfy the request, or if it introduces obvious syntax/import issues. Be extremely pedantic.`;

export async function runCritic(params) {
  const { prompt, fileContent, filePath, proposedEdits, runId, options = {} } = params;

  try {
    const messages = [
      { role: 'system', content: criticSystemPrompt },
      {
        role: 'user',
        content: `User Request:\n${prompt}\n\nFile Path:\n${filePath}\n\nCurrent File Content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nProposed Edits:\n\`\`\`json\n${JSON.stringify(proposedEdits, null, 2)}\n\`\`\``,
      },
    ];

    // Get the base response - the router natively executes parallel requests based on ROUTING_STRATEGY.CONSENSUS_VOTE
    // Note: To fully implement consensus at the *executor* level, we wrap this in our own parallel logic
    // in Phase 4 to aggregate the boolean results, since `llmRouter.js` only auto-resolves FASTEST_FIRST for now,
    // and returns the first sequential waterfall result for CONSENSUS_VOTE.
    
    // We explicitly implement parallel voting here to enforce the 100% agreement rule.
    const { route, candidates } = await import('../llm/taskRouter.js').then(m => m.selectRoute(AGENT_TASK_TYPES.PATCH_REVIEW));
    
    // Take the primary pool models for the critic (limit to parallelCount)
    const voters = candidates.slice(0, route.parallelCount || 2);
    
    if (voters.length === 0) {
      throw new Error('No critic models available.');
    }

    const startMs = Date.now();
    
    const votePromises = voters.map(candidate => 
      generateTaskResponse(messages, {
        runId,
        taskType: AGENT_TASK_TYPES.PATCH_REVIEW,
        routeOverrides: { strategy: ROUTING_STRATEGY.WATERFALL }, // Force single execution for this sub-request
        model: candidate.modelId, // Explicitly target this voter
        jsonMode: true,
        max_tokens: 2048,
        temperature: 0.0, // Strict deterministic voting
      }).catch(err => {
        console.warn(`[CriticAgent] Voter ${candidate.modelId} failed: ${err.message}`);
        return null;
      })
    );

    const rawVotes = await Promise.all(votePromises);
    const validVotes = rawVotes.filter(Boolean).map(v => ({ ...v, data: JSON.parse(v.content) }));

    if (validVotes.length === 0) {
      // Fallback behavior if all evaluation API calls fail
      return { isCorrect: false, feedback: '[Consensus Failed] All critics timed out or failed to parse.' };
    }

    // 100% Agreement logic
    const allAgree = validVotes.every(vote => vote.data.isCorrect === true);
    
    if (allAgree) {
      return {
        isCorrect: true,
        feedback: `Consensus Reached (${validVotes.length}/${validVotes.length} critics approved). ${validVotes[0].data.feedback}`
      };
    } else {
      // Find the dissenting feedback
      const dissenter = validVotes.find(vote => vote.data.isCorrect === false);
      return {
        isCorrect: false,
        feedback: `[Critic ${dissenter.model}] Rejected Patch: ${dissenter.data.feedback}`
      };
    }

  } catch (error) {
    console.error('[CriticAgent] Consensus Evaluation failed:', error);
    return { isCorrect: false, feedback: `Critic execution failed: ${error.message}` };
  }
}
