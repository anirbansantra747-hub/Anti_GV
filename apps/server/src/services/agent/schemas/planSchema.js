import { z } from 'zod';

export const planStepSchema = z.object({
  stepId: z.number().describe('A unique integer representing the step number.'),
  action: z
    .enum(['CREATE', 'MODIFY', 'DELETE', 'RUN_COMMAND'])
    .describe('The type of action. RUN_COMMAND is used for terminal commands.'),
  filePath: z
    .string()
    .describe('The absolute or relative path to the file to be created, modified, or deleted.'),
  description: z.string().describe('A clear description of what this step will accomplish.'),
  depends_on: z
    .array(z.number())
    .describe('An array of stepIds that must be completed before this step.'),
});

export const planSchema = z.object({
  summary: z.string().describe('A short summary of the overall plan.'),
  risk_level: z
    .enum(['low', 'medium', 'high'])
    .describe('The estimated risk level of applying this plan.'),
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
  "steps": [
    {
      "stepId": 1,
      "action": "CREATE|MODIFY|DELETE|RUN_COMMAND",
      "filePath": "path/to/file.js",
      "description": "What this step does",
      "depends_on": [] // array of stepIds
    }
  ]
}
`;
