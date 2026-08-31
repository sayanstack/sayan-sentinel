export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  model: string;
  system?: string;
  messages: AIMessage[];
  maxTokens: number;
  temperature?: number;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AICompletionResponse {
  text: string;
  usage: AIUsage;
  model: string;
}

export interface AICompletionCallOptions {
  timeoutMs?: number;
}

/**
 * A provider-agnostic AI text-completion interface. Every concrete
 * provider (Anthropic, OpenAI, a local OpenAI-compatible server) speaks
 * this same shape so the rest of the AI engine — prompt construction,
 * schema validation, cost tracking — never needs to know which one is
 * behind it.
 */
export interface AIProvider {
  readonly name: string;
  complete(request: AICompletionRequest, options?: AICompletionCallOptions): Promise<AICompletionResponse>;
}
