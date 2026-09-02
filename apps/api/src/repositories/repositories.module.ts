import { Module } from "@nestjs/common";
import { GithubWebhookModule } from "../github/github-webhook.module";
import { MembershipLookupService } from "./membership-lookup.service";
import { RepositoriesController } from "./repositories.controller";
import { RepositoriesService } from "./repositories.service";

@Module({
  imports: [GithubWebhookModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService, MembershipLookupService],
})
export class RepositoriesModule {}
