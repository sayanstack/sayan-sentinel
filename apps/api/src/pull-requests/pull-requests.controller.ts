import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PullRequestsService } from "./pull-requests.service";

@Controller("pull-requests")
@UseGuards(SessionAuthGuard)
export class PullRequestsController {
  constructor(private readonly pullRequestsService: PullRequestsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.pullRequestsService.listPullRequestsForUser(userId);
  }
}
