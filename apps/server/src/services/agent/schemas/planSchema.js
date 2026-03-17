import { z } from 'zod';

export const planStepSchema = z.object({
  stepId: z.number().describe('A unique integer representing the step number.'),
  fileGroupId: z
    .string()
    .optional()
    .describe('Logical group id for multi-file execution and review.'),
  action: z
    .enum(['CREATE', 'MODIFY', 'DELETE', 'RUN_COMMAND'])
    .describe('The type of action. RUN_COMMAND is used for terminal commands.'),
  filePath: z
    .string()
    .optional()
    .describe(
      'The absolute or relative path to the primary file to be created, modified, or deleted.'
    ),
  files: z
    .array(z.string())
    .optional()
    .describe('All files impacted by this plan step, including the primary file.'),
  description: z.string().describe('A clear description of what this step will accomplish.'),
  command: z
    .string()
    .optional()
    .describe('The command to run in the terminal (only if action is RUN_COMMAND).'),
  depends_on: z
    .array(z.number())
    .describe('An array of stepIds that must be completed before this step.'),
  verificationHints: z
    .array(z.string())
    .optional()
    .describe('Suggested verification steps or files impacted by this step.'),
});

export const planSchema = z.object({
  summary: z.string().describe('A short summary of the overall plan.'),
  risk_level: z
    .enum(['low', 'medium', 'high'])
    .describe('The estimated risk level of applying this plan.'),
  confidence: z.number().min(0).max(1).optional(),
  assumptions: z.array(z.string()).optional(),
  clarificationsNeeded: z.array(z.string()).optional(),
  verificationPlan: z.array(z.string()).optional(),
  estimatedFilesChanged: z.number().optional(),
  steps: z
    .array(planStepSchema)
    .describe(
      "An array of atomic steps required to execute the user's prompt in the correct dependency order."
    ),
});

/**
 * Zod schema converted to a structured JSON schema for LLM instructions.
 * This instructs the LLM exactly how to shape the JSON.
 */
export const planJsonSchemaInstructions = `
You MUST respond with a valid JSON object matching this schema:
{
  "summary": "Short summary of what you are building",
  "risk_level": "low|medium|high",
  "confidence": 0.0,
  "assumptions": [],
  "clarificationsNeeded": [],
  "verificationPlan": [],
  "estimatedFilesChanged": 1,
  "steps": [
    {
      "stepId": 1,
      "fileGroupId": "group-1",
      "action": "CREATE|MODIFY|DELETE|RUN_COMMAND",
      "filePath": "path/to/file.js",
      "files": ["path/to/file.js"],
      "description": "What this step does",
      "command": "npm install (only if action is RUN_COMMAND)",
      "depends_on": [],
      "verificationHints": []
    }
  ]
}
`;
