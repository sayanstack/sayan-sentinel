export class AISchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly lastError: unknown,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "AISchemaValidationError";
  }
}

export class AIBudgetExceededError extends Error {
  constructor(public readonly reason: string) {
    super(`AI budget exceeded: ${reason}`);
    this.name = "AIBudgetExceededError";
  }
}

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super(
      'No AI provider is configured (AI_PROVIDER is "none" or its matching API key/base URL is missing). ' +
        "Deterministic analysis continues without it.",
    );
    this.name = "AIProviderNotConfiguredError";
  }
}
