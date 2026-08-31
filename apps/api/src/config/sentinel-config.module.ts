import { Global, Module, type DynamicModule } from "@nestjs/common";
import { loadConfig } from "@sayan-sentinel/config";
import { SENTINEL_CONFIG } from "./sentinel-config.constants";

/**
 * Loads and validates process.env once at boot (via @sayan-sentinel/config)
 * and makes the result injectable everywhere via the SENTINEL_CONFIG token.
 * Fails fast on a genuinely missing required var; optional integrations
 * degrade to their documented "not configured" feature flag instead of
 * throwing.
 */
@Global()
@Module({})
export class SentinelConfigModule {
  static forRoot(): DynamicModule {
    const config = loadConfig(process.env);
    return {
      module: SentinelConfigModule,
      providers: [{ provide: SENTINEL_CONFIG, useValue: config }],
      exports: [SENTINEL_CONFIG],
    };
  }
}
