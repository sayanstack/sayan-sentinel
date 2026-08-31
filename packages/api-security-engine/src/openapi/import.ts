import { parse as parseYaml } from "yaml";
import type { ApiEndpoint, ApiParameter } from "../types";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"];

interface OpenApiSecurityRequirement {
  [schemeName: string]: string[];
}

interface OpenApiParameterObject {
  name?: string;
  in?: string;
  required?: boolean;
}

interface OpenApiOperationObject {
  summary?: string;
  security?: OpenApiSecurityRequirement[];
  parameters?: OpenApiParameterObject[];
}

interface OpenApiDocument {
  paths?: Record<
    string,
    Record<string, OpenApiOperationObject> & { parameters?: OpenApiParameterObject[] }
  >;
  security?: OpenApiSecurityRequirement[];
}

export interface ParseOpenApiResult {
  ok: boolean;
  document?: OpenApiDocument;
  error?: string;
}

/**
 * Parses an OpenAPI/Swagger document from either JSON or YAML text — never
 * executes anything in the document (no `$ref` resolution against remote
 * URLs, no code generation), only reads the small subset of structure
 * (`paths`, per-operation `security`/`parameters`) this package's rules
 * need. Malformed input is reported as a parse error, never silently
 * treated as an empty spec.
 */
export function parseOpenApiDocument(content: string, format: "json" | "yaml"): ParseOpenApiResult {
  try {
    const document = format === "json" ? JSON.parse(content) : parseYaml(content);
    if (!document || typeof document !== "object") {
      return { ok: false, error: "Document did not parse to an object" };
    }
    return { ok: true, document: document as OpenApiDocument };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function flattenSecurity(
  requirements: OpenApiSecurityRequirement[] | undefined,
): string[] | undefined {
  if (!requirements) return undefined;
  if (requirements.length === 0) return [];
  const names = new Set<string>();
  for (const requirement of requirements) {
    for (const name of Object.keys(requirement)) names.add(name);
  }
  return [...names];
}

function toApiParameter(param: OpenApiParameterObject): ApiParameter | undefined {
  if (!param.name || !param.in) return undefined;
  const location = param.in;
  if (
    location !== "path" &&
    location !== "query" &&
    location !== "header" &&
    location !== "cookie"
  ) {
    return undefined;
  }
  return { name: param.name, in: location, required: param.required ?? location === "path" };
}

/**
 * Extracts a flat endpoint inventory from a parsed document. An
 * operation's `security` falls back to the document-level default
 * (`document.security`) only when the operation itself doesn't specify
 * one at all — an operation-level `security: []` is preserved as an
 * explicit opt-out, never merged with the document default, since that
 * distinction is exactly what `SENTINEL-API-103` depends on.
 */
export function extractEndpointsFromOpenApi(document: OpenApiDocument): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];
  const paths = document.paths ?? {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const pathLevelParameters = (pathItem.parameters ?? [])
      .map(toApiParameter)
      .filter((p): p is ApiParameter => !!p);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const operationParameters = (operation.parameters ?? [])
        .map(toApiParameter)
        .filter((p): p is ApiParameter => !!p);

      endpoints.push({
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        security: operation.security
          ? flattenSecurity(operation.security)
          : flattenSecurity(document.security),
        parameters: [...pathLevelParameters, ...operationParameters],
      });
    }
  }

  return endpoints;
}
