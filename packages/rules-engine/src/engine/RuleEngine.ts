import { loadProjectFromDirectory, loadProjectFromSources } from "../analysis/project";
import { defaultRules } from "../rules";
import { DEFAULT_CONFIG, type SentinelConfig } from "./config";
import { RuleContext } from "./RuleContext";
import { RuleRegistry } from "./RuleRegistry";
import { runRules, type RuleRunOptions, type RuleRunResult } from "./RuleRunner";

export interface ScanFromDirectoryOptions extends RuleRunOptions {
  rootDir: string;
  filePaths: string[];
  config?: SentinelConfig;
}

export interface ScanFromSourcesOptions extends RuleRunOptions {
  sources: Record<string, string>;
  config?: SentinelConfig;
}

/**
 * The public entry point: builds a registry pre-loaded with every shipped
 * rule, loads a project, and runs the rules against it. Custom rules can be
 * added via `registry.register(...)` before calling `run*` if a caller
 * wants to extend the default set (see `docs/rules-authoring.md`).
 */
export class RuleEngine {
  readonly registry = new RuleRegistry().registerAll(defaultRules);

  async scanDirectory(options: ScanFromDirectoryOptions): Promise<RuleRunResult> {
    const { project, rootDir, sourceFiles } = loadProjectFromDirectory(
      options.rootDir,
      options.filePaths,
    );
    const context = new RuleContext(
      project,
      rootDir,
      sourceFiles,
      options.config ?? DEFAULT_CONFIG,
    );
    return runRules(this.registry, context, options);
  }

  async scanSources(options: ScanFromSourcesOptions): Promise<RuleRunResult> {
    const { project, rootDir, sourceFiles } = loadProjectFromSources(options.sources);
    const context = new RuleContext(
      project,
      rootDir,
      sourceFiles,
      options.config ?? DEFAULT_CONFIG,
    );
    return runRules(this.registry, context, options);
  }
}
