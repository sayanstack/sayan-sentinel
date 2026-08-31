import { Module } from "@nestjs/common";
import { MembershipLookupService } from "./membership-lookup.service";
import { RepositoriesController } from "./repositories.controller";
import { RepositoriesService } from "./repositories.service";

@Module({
  controllers: [RepositoriesController],
  providers: [RepositoriesService, MembershipLookupService],
})
export class RepositoriesModule {}
