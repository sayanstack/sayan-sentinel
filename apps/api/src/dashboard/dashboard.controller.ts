import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  async summary(@Headers("x-demo-user-id") userId: string | undefined) {
    if (!userId) {
      throw new UnauthorizedException("x-demo-user-id header is required");
    }
    return this.dashboardService.getSummaryForUser(userId);
  }
}
