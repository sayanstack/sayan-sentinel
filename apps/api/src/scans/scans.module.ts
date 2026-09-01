import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { ScansController } from "./scans.controller";
import { ScansService } from "./scans.service";

@Module({
  controllers: [ScansController],
  providers: [ScansService, MembershipLookupService],
})
export class ScansModule {}
