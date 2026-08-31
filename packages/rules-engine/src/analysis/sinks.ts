import { Node, type CallExpression } from "ts-morph";

export type SinkCategory =
  | "database"
  | "raw_query"
  | "command_execution"
  | "filesystem"
  | "http_request"
  | "html_output"
  | "redirect"
  | "logging"
  | "sensitive_response";

export interface SinkMatch {
  category: SinkCategory;
  api: string;
  /** For database sinks: which argument index (if any) carries the query/filter object. */
  filterArgIndex?: number;
  /** For database sinks: true when this verb narrows to a single row (findUnique/findFirst/update/delete), the shape the Authorization Analyzer cares about. */
  isSingleRecordLookup?: boolean;
}

const PRISMA_SINGLE_RECORD_VERBS = new Set(["findUnique", "findFirst", "update", "delete"]);
const PRISMA_MULTI_RECORD_VERBS = new Set(["findMany", "updateMany", "deleteMany", "count"]);
const PRISMA_VERBS = new Set([
  ...PRISMA_SINGLE_RECORD_VERBS,
  ...PRISMA_MULTI_RECORD_VERBS,
  "create",
  "createMany",
  "upsert",
]);

const COMMAND_EXEC_APIS = new Set([
  "exec",
  "execSync",
  "spawn",
  "spawnSync",
  "execFile",
  "execFileSync",
]);
const FS_APIS = new Set([
  "readFile",
  "readFileSync",
  "writeFile",
  "writeFileSync",
  "unlink",
  "unlinkSync",
  "createReadStream",
  "createWriteStream",
  "readdir",
  "readdirSync",
  "appendFile",
  "appendFileSync",
  "rm",
  "rmSync",
  "rmdir",
  "rmdirSync",
]);
const HTTP_CLIENT_APIS = new Set(["fetch", "get", "post", "put", "delete", "patch", "request"]);
const LOGGING_APIS = new Set(["log", "info", "warn", "error", "debug", "trace"]);
const RAW_SQL_PRISMA_APIS = new Set(["$queryRawUnsafe", "$executeRawUnsafe"]);

/**
 * Matches a call expression against the sink catalog. Database matching
 * recognizes Prisma's `<model>.<verb>(...)` shape (the only ORM V1 targets,
 * per the architecture doc — TypeORM/Sequelize/Mongoose adapters are a
 * documented follow-up, not silently pretended to work).
 */
export function matchSink(call: CallExpression): SinkMatch | undefined {
  const expr = call.getExpression();

  if (Node.isPropertyAccessExpression(expr)) {
    const verb = expr.getName();
    const receiver = expr.getExpression();

    if (PRISMA_VERBS.has(verb) && Node.isPropertyAccessExpression(receiver)) {
      const receiverRoot = receiver.getExpression().getText();
      if (/prisma/i.test(receiverRoot)) {
        return {
          category: "database",
          api: `prisma.${receiver.getName()}.${verb}`,
          filterArgIndex: 0,
          isSingleRecordLookup: PRISMA_SINGLE_RECORD_VERBS.has(verb),
        };
      }
    }

    if (COMMAND_EXEC_APIS.has(verb) && /child_process|cp\./i.test(receiver.getText())) {
      return { category: "command_execution", api: `child_process.${verb}` };
    }
    // Bare `exec(...)`/`execSync(...)` imported directly are handled below via identifier match.

    if (RAW_SQL_PRISMA_APIS.has(verb) && /prisma/i.test(receiver.getText())) {
      return { category: "raw_query", api: `prisma.${verb}` };
    }
    if (verb === "query" && /^(connection|pool|db|client)$/i.test(receiver.getText())) {
      return { category: "raw_query", api: `${receiver.getText()}.query` };
    }
    if (verb === "raw" && /^knex$/i.test(receiver.getText())) {
      return { category: "raw_query", api: "knex.raw" };
    }

    if (FS_APIS.has(verb) && /\bfs(\.promises)?$/i.test(receiver.getText())) {
      return { category: "filesystem", api: `fs.${verb}` };
    }

    if (HTTP_CLIENT_APIS.has(verb) && /^(axios|http|https|got)$/i.test(receiver.getText())) {
      return { category: "http_request", api: `${receiver.getText()}.${verb}` };
    }

    if (verb === "redirect") {
      return { category: "redirect", api: `${receiver.getText()}.redirect` };
    }

    if ((verb === "json" || verb === "send") && /^res$/i.test(receiver.getText())) {
      return { category: "sensitive_response", api: `res.${verb}` };
    }

    if (LOGGING_APIS.has(verb) && /console|logger|log$/i.test(receiver.getText())) {
      return { category: "logging", api: `${receiver.getText()}.${verb}` };
    }
  }

  if (Node.isIdentifier(expr)) {
    const name = expr.getText();
    if (COMMAND_EXEC_APIS.has(name)) return { category: "command_execution", api: name };
    if (name === "fetch") return { category: "http_request", api: "fetch" };
    if (name === "redirect") return { category: "redirect", api: "redirect" };
    if (name === "eval") return { category: "command_execution", api: "eval" };
  }

  return undefined;
}

export function isSensitiveModel(modelName: string): boolean {
  return /^(user|account|organization|tenant|payment|invoice|order|credential|session|apikey|api_key)$/i.test(
    modelName,
  );
}
