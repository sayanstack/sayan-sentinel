import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { TargetsController } from "./targets.controller";
import { TargetsService } from "./targets.service";

@Module({
  controllers: [TargetsController],
  providers: [TargetsService, MembershipLookupService],
})
export class TargetsModule {}
