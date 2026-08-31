import { describe, expect, it } from "vitest";
import { RuleEngine } from "../../engine/RuleEngine";

async function scan(source: string) {
  const engine = new RuleEngine();
  return engine.scanSources({
    sources: { "app/blog/[slug]/page.tsx": source },
    onlyRuleIds: ["SENTINEL-INJ-003"],
  });
}

describe("SENTINEL-INJ-003", () => {
  it("flags untrusted search params reaching dangerouslySetInnerHTML", async () => {
    const result = await scan(`
      export default function Page({ searchParams }: { searchParams: { html: string } }) {
        return <div dangerouslySetInnerHTML={{ __html: searchParams.html }} />;
      }
    `);
    expect(result.findings).toHaveLength(1);
  });

  it("does not flag content sanitized with DOMPurify first", async () => {
    const result = await scan(`
      import DOMPurify from "dompurify";
      export default function Page({ searchParams }: { searchParams: { html: string } }) {
        const safe = DOMPurify.sanitize(searchParams.html);
        return <div dangerouslySetInnerHTML={{ __html: safe }} />;
      }
    `);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag ordinary text interpolation", async () => {
    const result = await scan(`
      export default function Page({ searchParams }: { searchParams: { name: string } }) {
        return <div>{searchParams.name}</div>;
      }
    `);
    expect(result.findings).toHaveLength(0);
  });
});
