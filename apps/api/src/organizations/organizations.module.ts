import { Module } from "@nestjs/common";
import { MembershipLookupService } from "../repositories/membership-lookup.service";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, MembershipLookupService],
})
export class OrganizationsModule {}
