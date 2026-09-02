import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ConnectHackerOneDto } from "./dto/connect-hackerone.dto";
import { OrganizationScopedQueryDto } from "./dto/organization-scoped-query.dto";
import { SyncHackerOneScopeDto } from "./dto/sync-hackerone-scope.dto";
import { HackerOneService } from "./hackerone.service";

@Controller("hackerone")
@UseGuards(SessionAuthGuard)
export class HackerOneController {
  constructor(private readonly hackerOneService: HackerOneService) {}

  private assertConfigured(): void {
    if (!this.hackerOneService.isConfigured) {
      throw new ServiceUnavailableException(
        "HackerOne integration isn't configured on this deployment yet (CREDENTIALS_ENCRYPTION_KEY missing).",
      );
    }
  }

  @Post("connect")
  async connect(@CurrentUser() userId: string, @Body() body: ConnectHackerOneDto) {
    this.assertConfigured();
    const outcome = await this.hackerOneService.connect(
      userId,
      body.organizationId,
      body.apiTokenIdentifier,
      body.apiTokenValue,
    );
    if (!outcome.ok && outcome.reason === "not_member") throw new NotFoundException();
    if (!outcome.ok) {
      throw new BadRequestException(
        "Couldn't verify those HackerOne credentials — check the API token identifier and value.",
      );
    }
    return { programs: outcome.programs };
  }

  @Get("status")
  async status(@CurrentUser() userId: string, @Query() query: OrganizationScopedQueryDto) {
    const outcome = await this.hackerOneService.getStatus(userId, query.organizationId);
    if ("ok" in outcome && !outcome.ok) throw new NotFoundException();
    return outcome;
  }

  @Get("programs")
  async programs(@CurrentUser() userId: string, @Query() query: OrganizationScopedQueryDto) {
    this.assertConfigured();
    const outcome = await this.hackerOneService.listPrograms(userId, query.organizationId);
    if (!outcome.ok && outcome.reason === "not_member") throw new NotFoundException();
    if (!outcome.ok && outcome.reason === "not_connected") {
      throw new BadRequestException("Connect a HackerOne API token first.");
    }
    if (!outcome.ok) {
      throw new BadRequestException(
        "HackerOne rejected the stored credentials — reconnect with a fresh API token.",
      );
    }
    return { programs: outcome.programs };
  }

  @Post("sync")
  async sync(@CurrentUser() userId: string, @Body() body: SyncHackerOneScopeDto) {
    this.assertConfigured();
    const outcome = await this.hackerOneService.syncProgramScope(
      userId,
      body.organizationId,
      body.programHandle,
    );
    if (!outcome.ok && outcome.reason === "not_member") throw new NotFoundException();
    if (!outcome.ok && outcome.reason === "not_connected") {
      throw new BadRequestException("Connect a HackerOne API token first.");
    }
    if (!outcome.ok) {
      throw new BadRequestException(`HackerOne sync failed: ${outcome.detail}`);
    }
    return outcome.result;
  }

  @Post("disconnect")
  async disconnect(@CurrentUser() userId: string, @Body() body: OrganizationScopedQueryDto) {
    const outcome = await this.hackerOneService.disconnect(userId, body.organizationId);
    if (!outcome.ok) throw new NotFoundException();
    return { disconnected: true };
  }
}
