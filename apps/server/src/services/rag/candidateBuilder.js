/**
 * @file candidateBuilder.js
 * @description Build a candidate file set for on-demand embedding.
 */

import { getImpactedFiles, getDependencies } from './dependencyGraph.js';
import { findSymbols } from '../db/fileIndexService.js';
import { searchFilesByName } from '../db/fileInventoryService.js';
import { getRecentFiles } from './recentFiles.js';

export async function buildCandidateFiles({
  workspaceId,
  prompt,
  activeFile,
  openTabs = [],
  limit = 10,
}) {
  const candidates = new Set();

  if (activeFile) candidates.add(activeFile);
  for (const tab of openTabs || []) candidates.add(tab);

  const recent = getRecentFiles(workspaceId, 5);
  for (const file of recent) candidates.add(file);

  const tokens = extractTokens(prompt || '');

  if (tokens.length > 0) {
    const symbolHits = await findSymbols(workspaceId, tokens, 10);
    for (const hit of symbolHits) candidates.add(hit.filePath);

    const nameHits = await searchFilesByName(workspaceId, tokens, 10);
    for (const hit of nameHits) candidates.add(hit.filePath);
  }

  if (activeFile) {
    const deps = await getDependencies(workspaceId, activeFile, { limit: 8 });
    for (const d of deps) candidates.add(d);

    const impacted = await getImpactedFiles(workspaceId, activeFile, { maxDepth: 2, limit: 8 });
    for (const i of impacted) candidates.add(i);
  }

  return Array.from(candidates).filter(Boolean).slice(0, limit);
}

function extractTokens(text) {
  return text
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
}
