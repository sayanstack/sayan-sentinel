import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ScansService } from "./scans.service";

@Controller("scans")
@UseGuards(SessionAuthGuard)
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.scansService.listScansForUser(userId);
  }

  @Get(":id")
  async getOne(@CurrentUser() userId: string, @Param("id") id: string) {
    const scan = await this.scansService.getScanForUser(userId, id);
    if (!scan) throw new NotFoundException();
    return scan;
  }
}
