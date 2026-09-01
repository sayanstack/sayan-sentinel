import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { FindingsController } from "./findings.controller";
import { FindingsService } from "./findings.service";

@Module({
  controllers: [FindingsController],
  providers: [FindingsService, MembershipLookupService],
})
export class FindingsModule {}
