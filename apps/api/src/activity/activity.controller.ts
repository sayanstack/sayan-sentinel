import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import type { AuditEvent } from "@sayan-sentinel/database";
import { ActivityService } from "./activity.service";

/** `x-demo-user-id` stands in for a real session, matching every other controller in this app. */
@Controller("activity")
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async list(@Headers("x-demo-user-id") userId: string | undefined): Promise<AuditEvent[]> {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
    return this.activityService.listActivityForUser(userId);
  }
}
