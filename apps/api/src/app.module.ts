import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { SentinelConfigModule } from "./config/sentinel-config.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { GithubWebhookModule } from "./github/github-webhook.module";
import { HealthModule } from "./health/health.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { RepositoriesModule } from "./repositories/repositories.module";
import { TargetsModule } from "./targets/targets.module";

@Module({
  imports: [
    SentinelConfigModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        genReqId: (req, res) => {
          const header = req.headers["x-request-id"];
          const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            "*.password",
            "*.secret",
            "*.secrets",
            "*.token",
            "*.accessToken",
            "*.refreshToken",
            "*.apiKey",
            "*.privateKey",
          ],
          censor: "[redacted]",
        },
      },
    }),
    HealthModule,
    OrganizationsModule,
    RepositoriesModule,
    TargetsModule,
    DashboardModule,
    GithubWebhookModule,
  ],
})
export class AppModule {}
