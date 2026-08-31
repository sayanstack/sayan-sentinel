import { describe, expect, it } from "vitest";
import { classifyChangedFile, classifyChangedFiles, type ChangedFile } from "./changed-files";

function file(overrides: Partial<ChangedFile>): ChangedFile {
  return { path: "src/index.ts", status: "modified", additions: 1, deletions: 1, ...overrides };
}

describe("classifyChangedFile", () => {
  it("classifies an auth-related file path", () => {
    const result = classifyChangedFile(file({ path: "src/auth/login.controller.ts" }));
    expect(result.categories).toContain("auth_logic");
  });

  it("classifies an authorization/permissions-related file path", () => {
    const result = classifyChangedFile(file({ path: "src/guards/roles.guard.ts" }));
    expect(result.categories).toContain("authorization_logic");
  });

  it("classifies a Prisma schema change as database access", () => {
    const result = classifyChangedFile(file({ path: "packages/database/prisma/schema.prisma" }));
    expect(result.categories).toContain("database_access");
  });

  it("classifies an env/config file as sensitive configuration", () => {
    const result = classifyChangedFile(file({ path: ".env.production" }));
    expect(result.categories).toContain("sensitive_configuration");
  });

  it("classifies a lockfile as a dependency manifest change", () => {
    const result = classifyChangedFile(file({ path: "pnpm-lock.yaml" }));
    expect(result.categories).toContain("dependency_manifest");
  });

  it("classifies a GitHub Actions workflow as CI/CD configuration", () => {
    const result = classifyChangedFile(file({ path: ".github/workflows/ci.yml" }));
    expect(result.categories).toContain("ci_cd_configuration");
  });

  it("classifies an external HTTP call found in the patch content, independent of file path", () => {
    const result = classifyChangedFile(
      file({ path: "src/utils/helpers.ts", patch: '+  const res = await fetch("https://api.example.com");' }),
    );
    expect(result.categories).toContain("external_requests");
  });

  it("does not classify external_requests from the file path alone without patch content", () => {
    const result = classifyChangedFile(file({ path: "src/utils/helpers.ts" }));
    expect(result.categories).not.toContain("external_requests");
  });

  it("returns no categories for an ordinary, unremarkable file", () => {
    const result = classifyChangedFile(file({ path: "src/components/Button.tsx" }));
    expect(result.categories).toEqual([]);
  });

  it("can match multiple categories for a single file", () => {
    const result = classifyChangedFile(
      file({ path: "src/auth/session.repository.ts" }), // matches both auth_logic and database_access
    );
    expect(result.categories).toEqual(expect.arrayContaining(["auth_logic", "database_access"]));
  });
});

describe("classifyChangedFiles", () => {
  it("reports hasSensitiveChanges: false when nothing sensitive changed", () => {
    const report = classifyChangedFiles([file({ path: "README.md" }), file({ path: "src/Button.tsx" })]);
    expect(report.hasSensitiveChanges).toBe(false);
  });

  it("reports hasSensitiveChanges: true when at least one file is sensitive", () => {
    const report = classifyChangedFiles([file({ path: "README.md" }), file({ path: "src/auth/login.ts" })]);
    expect(report.hasSensitiveChanges).toBe(true);
  });

  it("preserves one classification entry per input file, in order", () => {
    const files = [file({ path: "a.ts" }), file({ path: "b.ts" }), file({ path: "c.ts" })];
    const report = classifyChangedFiles(files);
    expect(report.classifications.map((c) => c.file.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});
