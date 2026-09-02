import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(SessionAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.organizationsService.listOrganizationsForUser(userId);
  }

  @Get(":id")
  async getOne(@CurrentUser() userId: string, @Param("id") id: string) {
    const detail = await this.organizationsService.getOrganizationDetail(userId, id);
    if (!detail) throw new NotFoundException();
    return detail;
  }

  @Get(":id/ai-usage")
  async getAiUsage(@CurrentUser() userId: string, @Param("id") id: string) {
    const summary = await this.organizationsService.getAiUsageSummary(userId, id);
    if (!summary) throw new NotFoundException();
    return summary;
  }
}
