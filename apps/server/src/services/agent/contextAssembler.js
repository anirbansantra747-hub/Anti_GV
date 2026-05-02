import { buildContextBundle, renderContextBundle } from './contextBundleBuilder.js';

export async function assembleContext(
  frontendContext,
  serverContext = {},
  userPrompt = '',
  taskBrief = {}
) {
  const bundle = await buildContextBundle(frontendContext, serverContext, taskBrief, userPrompt);
  const rendered = renderContextBundle(bundle);
  return {
    bundle,
    rendered: `--- START CODEBASE CONTEXT ---\n\n${rendered}\n\n--- END CODEBASE CONTEXT ---`,
  };
}
