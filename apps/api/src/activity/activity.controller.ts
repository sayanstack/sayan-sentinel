import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AuditEvent } from "@sayan-sentinel/database";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ActivityService } from "./activity.service";

@Controller("activity")
@UseGuards(SessionAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<AuditEvent[]> {
    return this.activityService.listActivityForUser(userId);
  }
}
