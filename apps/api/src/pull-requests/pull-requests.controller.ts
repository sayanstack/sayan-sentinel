import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { PullRequestsService } from "./pull-requests.service";

/** `x-demo-user-id` stands in for a real session, matching every other controller in this app. */
@Controller("pull-requests")
export class PullRequestsController {
  constructor(private readonly pullRequestsService: PullRequestsService) {}

  @Get()
  async list(@Headers("x-demo-user-id") userId: string | undefined) {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
    return this.pullRequestsService.listPullRequestsForUser(userId);
  }
}
