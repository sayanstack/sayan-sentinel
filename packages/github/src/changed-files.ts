export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  /** Unified diff snippet, when GitHub's API provides one (omitted for very large files). */
  patch?: string;
}

export type SensitivityCategory =
  | "auth_logic"
  | "authorization_logic"
  | "database_access"
  | "external_requests"
  | "sensitive_configuration"
  | "dependency_manifest"
  | "ci_cd_configuration";

export interface ChangedFileClassification {
  file: ChangedFile;
  categories: SensitivityCategory[];
}

export interface ChangeSensitivityReport {
  classifications: ChangedFileClassification[];
  hasSensitiveChanges: boolean;
}

interface CategoryRule {
  category: SensitivityCategory;
  /** At least one of pathPattern/patchPattern is set; both may be. */
  pathPattern?: RegExp;
  patchPattern?: RegExp;
}

/**
 * Fast, path/diff-based triage for Section 25's PR security review — "did
 * this change touch something sensitive," not a full re-scan. Deliberately
 * a lighter-weight heuristic than the AST-based code-intelligence graph:
 * this exists to decide whether a PR needs the AI engine's focused
 * attention at all, quickly and without needing a full ingestion pass.
 */
const CATEGORY_RULES: CategoryRule[] = [
  { category: "auth_logic", pathPattern: /auth|login|session|jwt|passport|oauth/i },
  { category: "authorization_logic", pathPattern: /permission|role|rbac|\bacl\b|policy|guard/i },
  { category: "database_access", pathPattern: /prisma|migration|schema\.prisma|\.sql$|repository|\bdao\b/i },
  { category: "sensitive_configuration", pathPattern: /(^|\/)\.env|config|settings|secrets?/i },
  {
    category: "dependency_manifest",
    pathPattern: /package(-lock)?\.json$|pnpm-lock\.yaml$|yarn\.lock$|Gemfile\.lock$|requirements.*\.txt$|go\.sum$/i,
  },
  { category: "ci_cd_configuration", pathPattern: /(^|\/)\.github\/workflows\/|(^|\/)Dockerfile$|docker-compose/i },
  {
    category: "external_requests",
    // Content match only — no file path implies this on its own.
    patchPattern: /\bfetch\(|axios\.\w+\(|https?\.request\(|https?\.get\(/,
  },
];

export function classifyChangedFile(file: ChangedFile): ChangedFileClassification {
  const categories = CATEGORY_RULES.filter((rule) => {
    const pathMatches = rule.pathPattern?.test(file.path) ?? false;
    const patchMatches = Boolean(rule.patchPattern && file.patch && rule.patchPattern.test(file.patch));
    return pathMatches || patchMatches;
  }).map((rule) => rule.category);

  return { file, categories: [...new Set(categories)] };
}

export function classifyChangedFiles(files: ChangedFile[]): ChangeSensitivityReport {
  const classifications = files.map(classifyChangedFile);
  return {
    classifications,
    hasSensitiveChanges: classifications.some((c) => c.categories.length > 0),
  };
}
