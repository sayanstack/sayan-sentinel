const PARAM_SEGMENT = /^\{[^{}]+\}$/;

/** Joins path segments into a canonical form: leading slash, no doubled/trailing slashes, "/" for an empty result. */
export function joinPathSegments(...segments: string[]): string {
  return `/${segments.filter(Boolean).join("/")}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/** Splits a path into its segments, ignoring a query string and empty segments from leading/trailing/doubled slashes. */
export function splitPathSegments(path: string): string[] {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.split("/").filter(Boolean);
}

export function isParamSegment(segment: string): boolean {
  return PARAM_SEGMENT.test(segment);
}

/**
 * Converts Express/NestJS `:param` route syntax to the canonical `{param}`
 * form both frameworks' route registration actually uses identically —
 * `router.get("/users/:id", ...)` and `@Get(":id")` under `@Controller("users")`
 * both produce a `:id` segment, so one function covers both rather than
 * two near-duplicate implementations of the same regex.
 */
export function normalizeColonParams(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Derives a normalized route pattern from a Next.js App Router file path
 * relative to the repository root, e.g. `app/api/users/[id]/route.ts` ->
 * `/api/users/{id}`. Route groups `(group)` are stripped (they don't
 * appear in the URL); `[...slug]`/`[[...slug]]` catch-all segments
 * collapse to `{slug}` — an approximation, since a catch-all can match
 * multiple path segments at runtime but `matchPath` treats every
 * `{param}` as exactly one segment. This mirrors the same normalization
 * `@sayan-sentinel/rules-engine`'s route extractor performs internally;
 * duplicated here (rather than imported) so this package has no
 * dependency on the AST-parsing machinery that produces the file path in
 * the first place — it only reasons about strings.
 */
export function normalizeNextAppRouterPath(relativeFilePath: string): string | undefined {
  const normalized = relativeFilePath.replace(/\\/g, "/");
  const match = /(^|\/)app\/(.*)\/route\.[tj]sx?$/.exec(normalized);
  const captured = match?.[2];
  if (!captured) return undefined;

  const segments = captured
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));

  return joinPathSegments(...segments);
}
