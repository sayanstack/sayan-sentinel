/**
 * A discriminated Result type for operations where failure is an expected,
 * typed outcome (e.g. Scope Guard decisions, AI schema validation) rather
 * than an exceptional one.
 */
export type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
