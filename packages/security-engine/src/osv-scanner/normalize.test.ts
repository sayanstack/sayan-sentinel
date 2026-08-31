import { describe, expect, it } from "vitest";
import { normalizeOsvOutput } from "./normalize";
import type { OsvOutput } from "./types";

// Fixture shaped after OSV-Scanner's documented JSON output
// (https://google.github.io/osv-scanner/output/): results[].source,
// results[].packages[].package, and each vulnerability's OSV entry.
const fixture: OsvOutput = {
  results: [
    {
      source: { path: "package-lock.json", type: "lockfile" },
      packages: [
        {
          package: { name: "lodash", version: "4.17.15", ecosystem: "npm" },
          vulnerabilities: [
            {
              id: "GHSA-p6mc-m468-83gw",
              aliases: ["CVE-2020-8203"],
              summary: "Prototype Pollution in lodash",
              details: "Versions of lodash prior to 4.17.19 are vulnerable to Prototype Pollution.",
              database_specific: { severity: "HIGH" },
              affected: [
                {
                  ranges: [
                    {
                      type: "SEMVER",
                      events: [{ introduced: "0" }, { fixed: "4.17.19" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
          vulnerabilities: [],
        },
      ],
    },
  ],
};

describe("normalizeOsvOutput", () => {
  it("produces one FindingDraft per package vulnerability, skipping clean packages", () => {
    const drafts = normalizeOsvOutput(fixture);
    expect(drafts).toHaveLength(1);
  });

  it("maps a declared database_specific severity and extracts the fixed version", () => {
    const [draft] = normalizeOsvOutput(fixture);
    expect(draft?.severity).toBe("high");
    expect(draft?.remediation).toBe("Upgrade lodash to 4.17.19 or later.");
    expect(draft?.category).toBe("GHSA-p6mc-m468-83gw");
    expect(draft?.symbol).toBe("lodash@4.17.15");
    expect(draft?.filePath).toBe("package-lock.json");
  });

  it("treats a database-confirmed dependency match as 'confirmed' confidence", () => {
    const [draft] = normalizeOsvOutput(fixture);
    expect(draft?.confidence).toBe("confirmed");
  });

  it("falls back to medium severity when no severity is declared anywhere", () => {
    const noSeverity: OsvOutput = {
      results: [
        {
          source: { path: "requirements.txt", type: "lockfile" },
          packages: [
            {
              package: { name: "flask", version: "1.0.0", ecosystem: "PyPI" },
              vulnerabilities: [{ id: "GHSA-xxxx-xxxx-xxxx", summary: "Some issue" }],
            },
          ],
        },
      ],
    };
    const [draft] = normalizeOsvOutput(noSeverity);
    expect(draft?.severity).toBe("medium");
    expect(draft?.remediation).toBeUndefined();
  });
});
