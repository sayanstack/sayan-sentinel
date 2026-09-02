import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { HackerOneController } from "./hackerone.controller";
import { HackerOneService } from "./hackerone.service";

@Module({
  controllers: [HackerOneController],
  providers: [HackerOneService, MembershipLookupService],
})
export class HackerOneModule {}
