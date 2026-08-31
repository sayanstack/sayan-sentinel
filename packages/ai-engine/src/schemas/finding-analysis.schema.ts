import { z } from "zod";

/**
 * The AI engine's finding-analysis task (Section 13): correlate a
 * deterministic finding with surrounding code context, judge whether it's
 * likely a false positive, and suggest a remediation — always returned as
 * this validated shape, never as free-form prose.
 */
export const findingAnalysisSchema = z.object({
  isLikelyFalsePositive: z.boolean(),
  confidenceAdjustment: z.enum(["increase", "decrease", "unchanged"]),
  explanation: z.string().min(1).max(2000),
  dataFlowSummary: z.string().max(2000).optional(),
  suggestedRemediation: z.string().max(2000).optional(),
});

export type FindingAnalysis = z.infer<typeof findingAnalysisSchema>;

export interface FindingAnalysisPromptInput {
  category: string;
  title: string;
  description: string;
  filePath?: string;
  /** The matched code snippet/surrounding context — repository-derived, always treated as untrusted. */
  codeContext: string;
}

const APPLICATION_INSTRUCTIONS = [
  "Analyze the security finding described below, using the provided code context.",
  "Judge whether this looks like a likely false positive given the actual code, not just the rule name.",
  "Respond with ONLY a JSON object matching this exact shape (no other text):",
  "{",
  '  "isLikelyFalsePositive": boolean,',
  '  "confidenceAdjustment": "increase" | "decrease" | "unchanged",',
  '  "explanation": string,',
  '  "dataFlowSummary"?: string,',
  '  "suggestedRemediation"?: string',
  "}",
].join("\n");

export function buildFindingAnalysisPrompt(input: FindingAnalysisPromptInput): {
  applicationInstructions: string;
  untrustedContent: { label: string; content: string }[];
  userPrompt: string;
} {
  return {
    applicationInstructions: APPLICATION_INSTRUCTIONS,
    untrustedContent: [
      { label: input.filePath ?? "matched code context", content: input.codeContext },
    ],
    userPrompt: [
      `Finding category: ${input.category}`,
      `Title: ${input.title}`,
      `Description: ${input.description}`,
      input.filePath ? `File: ${input.filePath}` : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
