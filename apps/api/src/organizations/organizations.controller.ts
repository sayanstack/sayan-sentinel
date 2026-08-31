import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";

/** `x-demo-user-id` stands in for a real session — matches every other controller in this codebase. */
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async list(@Headers("x-demo-user-id") userId: string | undefined) {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
    return this.organizationsService.listOrganizationsForUser(userId);
  }
}
