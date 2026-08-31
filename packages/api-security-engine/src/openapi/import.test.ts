import { describe, expect, it } from "vitest";
import { extractEndpointsFromOpenApi, parseOpenApiDocument } from "./import";

const SAMPLE_JSON = JSON.stringify({
  security: [{ bearerAuth: [] }],
  paths: {
    "/users/{id}": {
      get: {
        summary: "Get a user",
        parameters: [{ name: "id", in: "path", required: true }],
      },
    },
    "/health": {
      get: { summary: "Health check", security: [] },
    },
  },
});

const SAMPLE_YAML = `
paths:
  /widgets:
    get:
      summary: List widgets
`;

describe("parseOpenApiDocument", () => {
  it("parses a valid JSON document", () => {
    const result = parseOpenApiDocument(SAMPLE_JSON, "json");
    expect(result.ok).toBe(true);
    expect(result.document?.paths).toBeDefined();
  });

  it("parses a valid YAML document", () => {
    const result = parseOpenApiDocument(SAMPLE_YAML, "yaml");
    expect(result.ok).toBe(true);
    expect(result.document?.paths?.["/widgets"]).toBeDefined();
  });

  it("reports a parse error for malformed JSON", () => {
    const result = parseOpenApiDocument("{ not valid json", "json");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("reports an error for a document that parses to a non-object", () => {
    const result = parseOpenApiDocument("42", "json");
    expect(result.ok).toBe(false);
  });
});

describe("extractEndpointsFromOpenApi", () => {
  it("extracts endpoints with parameters and inherited document-level security", () => {
    const { document } = parseOpenApiDocument(SAMPLE_JSON, "json");
    const endpoints = extractEndpointsFromOpenApi(document!);

    const getUser = endpoints.find((e) => e.path === "/users/{id}");
    expect(getUser).toBeDefined();
    expect(getUser?.method).toBe("GET");
    expect(getUser?.security).toEqual(["bearerAuth"]);
    expect(getUser?.parameters).toEqual([{ name: "id", in: "path", required: true }]);
  });

  it("preserves an operation-level explicit empty security array rather than inheriting the document default", () => {
    const { document } = parseOpenApiDocument(SAMPLE_JSON, "json");
    const endpoints = extractEndpointsFromOpenApi(document!);

    const health = endpoints.find((e) => e.path === "/health");
    expect(health?.security).toEqual([]);
  });

  it("returns an empty array for a document with no paths", () => {
    expect(extractEndpointsFromOpenApi({})).toEqual([]);
  });
});
