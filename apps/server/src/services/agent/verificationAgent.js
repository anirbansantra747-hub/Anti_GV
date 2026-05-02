import { AGENT_RUN_PHASES } from '@antigv/shared';
import { activeShadowWorkspace } from './shadowWorkspace.js';
import { recordStageMetric } from '../llm/telemetryService.js';
import * as acorn from 'acorn'; // Use acorn for fast native JS/TS syntax checking

export async function runIncrementalVerification(fileGroupId, options = {}) {
  const startedAt = Date.now();
  const files = activeShadowWorkspace.getGroupFiles(fileGroupId);
  const issues = [];

  for (const filePath of files) {
    const content = await activeShadowWorkspace.getFileContent(filePath);
    if (!content) continue;

    const ext = filePath.split('.').pop().toLowerCase();
    
    // 1. Basic Syntax Parse
    if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
      try {
        // Use loose acorn parsing just to catch catastrophic syntax errors
        acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'module' });
      } catch (err) {
        issues.push({
          type: 'syntax_error',
          file: filePath,
          message: `Syntax Error at line ${err.loc?.line || 'unknown'}: ${err.message}`,
          line: err.loc?.line,
          severity: 'high'
        });
      }
    } else if (ext === 'json') {
      try {
        JSON.parse(content);
      } catch (err) {
        issues.push({
          type: 'json_error',
          file: filePath,
          message: `Invalid JSON: ${err.message}`,
          severity: 'high'
        });
      }
    }

    // 2. Secret Leakage Scan (Basic heuristic)
    const secretRegex = /(?:export )?(?:const|let|var)\s+.*(?:api_key|secret|token|password).*\s*=\s*(?:'|")(?!\$\{)[a-zA-Z0-9_\-\.]{16,}(?:'|")/i;
    if (secretRegex.test(content)) {
      issues.push({
        type: 'security_warning',
        file: filePath,
        message: 'Possible hardcoded secret detected. Use environment variables.',
        severity: 'medium'
      });
    }
  }

  // Record Telemetry
  if (options.runId) {
    recordStageMetric(options.runId, {
      stage: `${AGENT_RUN_PHASES.VERIFICATION}_${fileGroupId}`,
      latencyMs: Date.now() - startedAt,
      issuesCount: issues.length
    });
  }

  return {
    verified: issues.filter(i => i.severity === 'high').length === 0,
    issues,
    latencyMs: Date.now() - startedAt
  };
}
