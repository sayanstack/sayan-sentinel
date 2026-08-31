import OpenAI from "openai";
import type { AICompletionCallOptions, AICompletionRequest, AICompletionResponse, AIProvider } from "../provider";

/**
 * A local/self-hosted OpenAI-compatible endpoint (Ollama, vLLM, LM Studio,
 * etc). These almost universally implement the older Chat Completions
 * surface rather than the newer Responses API, so this adapter targets
 * `chat.completions.create` deliberately, unlike the hosted OpenAIProvider.
 */
export class LocalOpenAICompatibleProvider implements AIProvider {
  readonly name = "local";
  private readonly client: OpenAI;

  constructor(baseURL: string, apiKey = "not-required") {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async complete(
    request: AICompletionRequest,
    options: AICompletionCallOptions = {},
  ): Promise<AICompletionResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(request.system ? [{ role: "system" as const, content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const response = await this.client.chat.completions.create(
      {
        model: request.model,
        messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
      },
      { timeout: options.timeoutMs },
    );

    const choice = response.choices[0];
    return {
      text: choice?.message?.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }
}
