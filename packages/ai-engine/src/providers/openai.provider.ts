import OpenAI from "openai";
import type { AICompletionCallOptions, AICompletionRequest, AICompletionResponse, AIProvider } from "../provider";

/** Uses OpenAI's current Responses API (`responses.create`), not the legacy Chat Completions API. */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(
    request: AICompletionRequest,
    options: AICompletionCallOptions = {},
  ): Promise<AICompletionResponse> {
    const response = await this.client.responses.create(
      {
        model: request.model,
        instructions: request.system,
        input: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: request.maxTokens,
        temperature: request.temperature,
      },
      { timeout: options.timeoutMs },
    );

    return {
      text: response.output_text,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      model: response.model,
    };
  }
}
