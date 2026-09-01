import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { PullRequestsController } from "./pull-requests.controller";
import { PullRequestsService } from "./pull-requests.service";

@Module({
  controllers: [PullRequestsController],
  providers: [PullRequestsService, MembershipLookupService],
})
export class PullRequestsModule {}
