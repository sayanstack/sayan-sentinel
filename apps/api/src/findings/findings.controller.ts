import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { Finding } from "@sayan-sentinel/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { FindingsService } from "./findings.service";

const VALID_SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]);
const VALID_STATUSES = new Set([
  "OPEN",
  "CONFIRMED",
  "LIKELY",
  "NEEDS_REVIEW",
  "FALSE_POSITIVE",
  "RESOLVED",
  "ACCEPTED_RISK",
]);

@Controller("findings")
@UseGuards(SessionAuthGuard)
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query("repositoryId") repositoryId: string | undefined,
    @Query("severity") severity: string | undefined,
    @Query("status") status: string | undefined,
  ) {
    return this.findingsService.listFindingsForUser(userId, {
      repositoryId,
      severity: VALID_SEVERITIES.has(severity ?? "")
        ? (severity as Finding["severity"])
        : undefined,
      status: VALID_STATUSES.has(status ?? "") ? (status as Finding["status"]) : undefined,
    });
  }
}
