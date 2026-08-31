#!/usr/bin/env node
import { runScanCli, type ScanCliOptions } from "./scan";

function parseArgs(argv: string[]): { command: string; options: ScanCliOptions } {
  const [command, ...rest] = argv;
  const options: ScanCliOptions = { targetDir: ".", format: "table" };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg === "--format") {
      const value = rest[++i];
      if (value === "table" || value === "json" || value === "sarif") options.format = value;
    } else if (arg === "--rule") {
      options.onlyRuleIds = (options.onlyRuleIds ?? []).concat(rest[++i]?.split(",") ?? []);
    } else if (arg === "--baseline") {
      options.baselinePath = rest[++i];
    } else if (!arg.startsWith("--")) {
      options.targetDir = arg;
    }
  }

  return { command: command ?? "scan", options };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command !== "scan") {
    process.stdout.write(
      "Usage: sentinel scan <path> [--format table|json|sarif] [--rule RULE_ID] [--baseline path.json]\n",
    );
    process.exitCode = 2;
    return;
  }

  const result = await runScanCli(options);
  process.stdout.write(result.output + "\n");
  process.exitCode = result.exitCode;
}

void main();
