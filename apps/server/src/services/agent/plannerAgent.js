import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateTaskResponse } from '../llm/llmRouter.js';
import { planJsonSchemaInstructions } from './schemas/planSchema.js';

const SYSTEM_PROMPT = `
You are an expert Software Architect Planner Agent.
Your job is to read the canonical task brief and codebase context, then output a precise JSON plan.

CRITICAL RULES:
1. Break work into atomic steps. Use "fileGroupId" when related files should be reviewed together.
2. Only operate on files, never on directories.
3. Do not write code. Describe what to change, where, and why.
4. Every step should list its impacted files and its dependency order.
5. Use verificationHints to indicate what should be tested or reviewed after the step.
6. Avoid scope creep. Keep the plan aligned to the user's requested outcome.
7. Output valid JSON only.

FILE SAFETY RULES:
8. NEVER modify lock files (pnpm-lock.yaml, package-lock.json, yarn.lock) — these are auto-generated.
9. NEVER modify .env, .env.local, .env.production, .env.development — these contain secrets.
10. NEVER modify .gitignore, .prettierrc, eslint.config.js, tsconfig.json, turbo.json, or Dockerfile unless the user EXPLICITLY asks.
11. NEVER modify package.json unless the user explicitly asks to add/remove dependencies.
12. Prefer "MODIFY" over "DELETE" — only DELETE if the user explicitly requests file removal.
13. List ALL files that will be impacted in the "files" array for each step.
14. If a step touches any config or infrastructure file, set risk_level to "high".
15. Review the "Critical Files" section in the context carefully. Any file listed there must NOT be modified unless the user explicitly requests it.

FRAMEWORK & PROJECT SCAFFOLDING RULES:
16. When the user asks to create a new React, Next.js, Vite, Angular, Vue, Svelte, Remix, or any framework-based project:
    - The FIRST step MUST be a "RUN_COMMAND" action to scaffold the project using the framework's CLI tool.
    - Examples:
      * Next.js: "npx -y create-next-app@latest ./project-name --ts --tailwind --eslint --app --src-dir --import-alias @/* --use-npm"
      * Vite + React: "npx -y create-vite@latest ./project-name -- --template react"
      * React (CRA): "npx -y create-react-app ./project-name"
      * Vue: "npx -y create-vue@latest ./project-name"
      * Angular: "npx -y @angular/cli new project-name --defaults"
      * Svelte: "npx -y create-svelte@latest ./project-name"
    - ALWAYS use non-interactive flags (--yes, --defaults, --no-git, etc.) so the command runs without user input.
    - ALWAYS add "npm install" or "pnpm install" as a follow-up RUN_COMMAND step if the scaffolding tool doesn't install dependencies automatically.
    - All subsequent CREATE/MODIFY steps MUST have "depends_on" pointing to the scaffolding step.
17. For installing npm packages, ALWAYS use a "RUN_COMMAND" step with "npm install <package>" instead of manually editing package.json.
18. For running build commands, test commands, or any CLI operation, use "RUN_COMMAND" with the "command" field.
19. DO NOT try to manually CREATE framework boilerplate files (like next.config.js, vite.config.js, tsconfig.json, package.json) — let the scaffolding CLI generate them.
20. After scaffolding, you may MODIFY generated files to customize them for the user's specific requirements.

SCHEMA:
${planJsonSchemaInstructions}
`;

const MERGE_PROMPT = `
You are an expert Software Architect Merger Agent.
You have been provided with multiple proposed execution plans for the same user request.
Your job is to read all proposed plans and merge them into a single, definitive, optimized JSON plan.
Combine the best insights, ensure all requested files are targeted, and resolve any conflicts.

SCHEMA REQUIREMENTS:
${planJsonSchemaInstructions}
`;

export async function generatePlan(prompt, taskBrief, fullContext, options = {}) {
  const { route, candidates } = await import('../llm/taskRouter.js').then((m) =>
    m.selectRoute(AGENT_TASK_TYPES.PLANNING, options.routeOverrides)
  );
  const parallelCount = route.parallelCount || 3;
  const planners = candidates.slice(0, parallelCount);

  if (planners.length === 0) {
    throw new Error('No planner models available.');
  }

  const baseMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `CANONICAL TASK BRIEF:\n${JSON.stringify(taskBrief, null, 2)}\n\nCODEBASE CONTEXT:\n${fullContext}\n\nUSER REQUEST:\n${prompt}\n\nGenerate the JSON execution plan.`,
    },
  ];

  // 1. Generate parallel plans
  const planPromises = planners.map((candidate) =>
    generateTaskResponse(baseMessages, {
      ...options,
      taskType: AGENT_TASK_TYPES.PLANNING,
      temperature: 0.1,
      jsonMode: true,
      max_tokens: 4096,
      routeOverrides: { strategy: 'WATERFALL', primaryPool: [candidate.modelId] }, // Force this specific model
    }).catch((err) => {
      console.warn(
        `[PlannerAgent] Model ${candidate.modelId} failed plan generation:`,
        err.message
      );
      return null; // Survive individual model failures
    })
  );

  const rawResults = await Promise.all(planPromises);
  const validPlans = rawResults.filter(Boolean);

  if (validPlans.length === 0) {
    throw new Error('All planner models failed to generate a plan.');
  }

  // If only one succeeded, just return it
  if (validPlans.length === 1) {
    return {
      ...JSON.parse(validPlans[0].content),
      route: { provider: validPlans[0].provider, model: validPlans[0].model },
    };
  }

  // 2. Merge parallel plans using a fast/reliable model
  const mergeMessages = [
    { role: 'system', content: MERGE_PROMPT },
    {
      role: 'user',
      content: `USER REQUEST:\n${prompt}\n\nPROPOSED PLANS:\n${validPlans.map((r, i) => `--- PLAN ${i + 1} (${r.model}) ---\n${r.content}`).join('\n\n')}\n\nMerge these into a single JSON plan.`,
    },
  ];

  const mergeResult = await generateTaskResponse(mergeMessages, {
    ...options,
    taskType: AGENT_TASK_TYPES.PLANNING,
    temperature: 0.1,
    jsonMode: true,
    max_tokens: 4096,
    // Use the first candidate pool for merging (usually Llama 70b)
  });

  return {
    ...JSON.parse(mergeResult.content),
    route: {
      provider: mergeResult.provider,
      model: mergeResult.model,
      mergedFrom: validPlans.map((v) => v.model),
    },
  };
}
