import {
  buildPatchSuggestionPrompt,
  completeStructured,
  patchSuggestionSchema,
  type AIProvider,
  type PatchSuggestion,
} from "@sayan-sentinel/ai-engine";

export interface GeneratePatchInput {
  category: string;
  title: string;
  description: string;
  filePath: string;
  originalFileContent: string;
}

export interface GeneratePatchDependencies {
  aiProvider: AIProvider | null;
  aiModel?: string;
}

export type GeneratePatchResult =
  { status: "generated"; patch: PatchSuggestion } | { status: "skipped"; reason: string };

/**
 * Generates a candidate patch (Section 26: Explain / Suggested Fix /
 * Generate Patch). This produces a *draft* suggestion only — it never
 * writes anything anywhere. Applying it as a PR requires a separate,
 * explicit human-approval step (`applyApprovedPatchAsPullRequest`).
 */
export async function generatePatchSuggestion(
  input: GeneratePatchInput,
  deps: GeneratePatchDependencies,
): Promise<GeneratePatchResult> {
  if (!deps.aiProvider) {
    return {
      status: "skipped",
      reason: "AI provider unavailable — deterministic analysis completed successfully.",
    };
  }
  if (!deps.aiModel) {
    return { status: "skipped", reason: "AI provider configured but no model specified." };
  }

  const prompt = buildPatchSuggestionPrompt(input);

  try {
    const result = await completeStructured({
      provider: deps.aiProvider,
      model: deps.aiModel,
      applicationInstructions: prompt.applicationInstructions,
      untrustedContent: prompt.untrustedContent,
      userPrompt: prompt.userPrompt,
      schema: patchSuggestionSchema,
    });
    return { status: "generated", patch: result.data };
  } catch (error) {
    return {
      status: "skipped",
      reason: `patch generation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
