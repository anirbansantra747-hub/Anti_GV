import { AGENT_TASK_TYPES, createEmptyTaskBrief } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';

const TASK_BRIEF_SYSTEM_PROMPT = `You normalize software-engineering requests for an autonomous coding agent.
Return strict JSON only.

Schema:
{
  "userGoal": "short canonical goal",
  "requestedOutcome": "what the user expects as an outcome",
  "constraints": ["explicit constraints or non-goals"],
  "namedTargets": ["paths, symbols, or components the user named"],
  "inferredTargets": ["likely files or subsystems implied by the request"],
  "ambiguityFlags": ["missing or ambiguous requirements"],
  "riskHints": ["signals like broad refactor, dangerous delete, auth, secrets, infra"],
  "verificationIntent": "targeted|broad|none",
  "executionMode": "plan_and_diff_review|chat_only"
}`;

export async function buildTaskBrief(prompt, context = {}, options = {}) {
  const fallback = createEmptyTaskBrief(prompt);
  const activeFile = context?.activeFile || '';
  const openTabs = (context?.openTabs || []).slice(0, 6).join(', ');

  try {
    const { content, provider, model } = await generateTaskResponse(
      [
        { role: 'system', content: TASK_BRIEF_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `USER PROMPT:\n${prompt}\n\nACTIVE FILE:\n${activeFile}\n\nOPEN TABS:\n${openTabs}`,
        },
      ],
      {
        runId: options.runId,
        taskType: AGENT_TASK_TYPES.TASK_BRIEF,
        jsonMode: true,
        temperature: 0.1,
      }
    );

    return {
      ...fallback,
      ...JSON.parse(content),
      _route: { provider, model },
    };
  } catch {
    return {
      ...fallback,
      ambiguityFlags: ['task_brief_fallback'],
      _route: { provider: 'fallback', model: 'heuristic' },
    };
  }
}
