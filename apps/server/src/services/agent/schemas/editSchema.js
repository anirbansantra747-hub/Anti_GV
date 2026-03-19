import { z } from 'zod';

export const editChunkSchema = z.object({
  search: z
    .string()
    .describe(
      'The exact existing lines of code to replace. Must match the original file exactly, including whitespace and indentation. Leave empty if CREATE action.'
    ),
  replace: z
    .string()
    .describe(
      'The new lines of code that will replace the search block. If CREATE action, this is the entire file content.'
    ),
});

export const editSchema = z.object({
  stepId: z.number().describe('The step ID this edit applies to.'),
  filePath: z.string().describe('The primary file being edited or created.'),
  fileGroupId: z.string().optional().describe('Logical file group id for this patch.'),
  files: z.array(z.string()).optional().describe('All files touched by this patch group.'),
  rationale: z.string().optional().describe('Short explanation of the patch intent.'),
  verificationHints: z.array(z.string()).optional().describe('Hints for post-patch verification.'),
  retryCount: z.number().optional().describe('How many retry attempts produced this patch.'),
  edits: z.array(editChunkSchema).describe('An array of search/replace blocks for this file.'),
});

export const editJsonSchemaInstructions = `
You MUST respond with a valid JSON object matching this schema:
{
  "stepId": 1,
  "filePath": "path/to/file.js",
  "fileGroupId": "group-1",
  "files": ["path/to/file.js"],
  "rationale": "why this change exists",
  "verificationHints": [],
  "retryCount": 0,
  "edits": [
    {
      "search": "exact string to replace (empty if creating new file)\\n",
      "replace": "new string to insert\\n"
    }
  ]
}

CRITICAL RULES FOR SEARCH/REPLACE:
1. The "search" string MUST EXACTLY MATCH the existing file content, line by line, including all leading whitespace and indentation.
2. If the action is CREATE, leave "search" as an empty string "" and put the entire new file content in "replace".
3. Do not include markdown formatting like \`\`\`json in your response, just the raw JSON object.
`;
