import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "@sayan-sentinel/ai-engine";
import { describe, expect, it } from "vitest";
import { generatePatchSuggestion } from "./generate-patch";

class FakeAIProvider implements AIProvider {
  readonly name = "fake";
  constructor(
    private readonly respond: (req: AICompletionRequest) => AICompletionResponse | Error,
  ) {}
  complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const result = this.respond(request);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  }
}

function baseInput() {
  return {
    category: "sql-injection",
    title: "SQL Injection via string concatenation",
    description: "User input is concatenated directly into a SQL query.",
    filePath: "src/app.js",
    originalFileContent:
      'function q(u) { return "SELECT * FROM users WHERE name = \'" + u + "\'"; }',
  };
}

describe("generatePatchSuggestion", () => {
  it("skips with the Section 43 message when no AI provider is configured", async () => {
    const result = await generatePatchSuggestion(baseInput(), { aiProvider: null });
    expect(result).toEqual({
      status: "skipped",
      reason: "AI provider unavailable — deterministic analysis completed successfully.",
    });
  });

  it("skips with a clear reason when a provider is configured but no model is given", async () => {
    const provider = new FakeAIProvider(() => ({
      text: "{}",
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "x",
    }));
    const result = await generatePatchSuggestion(baseInput(), { aiProvider: provider });
    expect(result.status).toBe("skipped");
  });

  it("returns the generated patch suggestion on success", async () => {
    const suggestion = {
      explanation: "Use a parameterized query instead of string concatenation.",
      updatedFileContent:
        "function q(u) { return db.query('SELECT * FROM users WHERE name = ?', [u]); }",
    };
    const provider = new FakeAIProvider(() => ({
      text: JSON.stringify(suggestion),
      usage: { inputTokens: 10, outputTokens: 10 },
      model: "test-model",
    }));

    const result = await generatePatchSuggestion(baseInput(), {
      aiProvider: provider,
      aiModel: "test-model",
    });

    expect(result.status).toBe("generated");
    if (result.status === "generated") {
      expect(result.patch.updatedFileContent).toContain("db.query");
    }
  });

  it("never throws — reports 'skipped' with the real error when the AI call fails", async () => {
    const provider = new FakeAIProvider(() => new Error("provider unreachable"));

    const result = await generatePatchSuggestion(baseInput(), {
      aiProvider: provider,
      aiModel: "test-model",
    });

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") {
      expect(result.reason).toContain("provider unreachable");
    }
  });

  it("wraps the original file content as untrusted before sending it to the provider", async () => {
    const provider = new FakeAIProvider(() => ({
      text: JSON.stringify({ explanation: "x", updatedFileContent: "y" }),
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "test-model",
    }));
    let capturedPrompt = "";
    const spyingProvider: AIProvider = {
      name: "spy",
      complete: (req) => {
        capturedPrompt = req.messages[0]?.content ?? "";
        return provider.complete(req);
      },
    };

    await generatePatchSuggestion(baseInput(), {
      aiProvider: spyingProvider,
      aiModel: "test-model",
    });

    expect(capturedPrompt).toContain("BEGIN UNTRUSTED REPOSITORY CONTENT");
    expect(capturedPrompt).toContain("SELECT * FROM users");
  });
});
