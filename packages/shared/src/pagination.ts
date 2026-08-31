export interface PageRequest {
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_PAGE_LIMIT);
}
