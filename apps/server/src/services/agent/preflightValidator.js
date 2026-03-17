import { editSchema } from './schemas/editSchema.js';

const SECRET_PATTERN = /(api[_-]?key|secret|token|password)\s*[:=]\s*['"`][^'"`\n]+['"`]/i;

export function validatePatchPayload(editResult, fileContent = '') {
  const parsed = editSchema.safeParse(editResult);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const issues = [];
  for (const edit of editResult.edits || []) {
    if (edit.search && !fileContent.includes(edit.search)) {
      issues.push('Search block does not match current file content.');
    }
    if (SECRET_PATTERN.test(edit.replace)) {
      issues.push('Replacement content appears to include a secret-like literal.');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
