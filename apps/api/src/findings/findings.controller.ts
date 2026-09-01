import { Controller, Get, Headers, Query, UnauthorizedException } from "@nestjs/common";
import type { Finding } from "@sayan-sentinel/database";
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

/** `x-demo-user-id` stands in for a real session, matching every other controller in this app. */
@Controller("findings")
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Get()
  async list(
    @Headers("x-demo-user-id") userId: string | undefined,
    @Query("repositoryId") repositoryId: string | undefined,
    @Query("severity") severity: string | undefined,
    @Query("status") status: string | undefined,
  ) {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");

    return this.findingsService.listFindingsForUser(userId, {
      repositoryId,
      severity: VALID_SEVERITIES.has(severity ?? "")
        ? (severity as Finding["severity"])
        : undefined,
      status: VALID_STATUSES.has(status ?? "") ? (status as Finding["status"]) : undefined,
    });
  }
}
