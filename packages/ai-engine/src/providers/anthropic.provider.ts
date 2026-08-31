import Anthropic from "@anthropic-ai/sdk";
import type {
  AICompletionCallOptions,
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from "../provider";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    request: AICompletionRequest,
    options: AICompletionCallOptions = {},
  ): Promise<AICompletionResponse> {
    const response = await this.client.messages.create(
      {
        model: request.model,
        max_tokens: request.maxTokens,
        system: request.system,
        temperature: request.temperature,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { timeout: options.timeoutMs },
    );

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}
