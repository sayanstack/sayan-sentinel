import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  UnauthorizedException,
} from "@nestjs/common";
import { ScansService } from "./scans.service";

/** `x-demo-user-id` stands in for a real session, matching every other controller in this app. */
@Controller("scans")
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Get()
  async list(@Headers("x-demo-user-id") userId: string | undefined) {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
    return this.scansService.listScansForUser(userId);
  }

  @Get(":id")
  async getOne(@Headers("x-demo-user-id") userId: string | undefined, @Param("id") id: string) {
    if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");

    const scan = await this.scansService.getScanForUser(userId, id);
    if (!scan) throw new NotFoundException();
    return scan;
  }
}
