import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AutoConfigureCloudflareDto } from "./dto/auto-configure-cloudflare.dto";
import { CreateTargetRequestDto } from "./dto/create-target.dto";
import { QuickStartTargetDto } from "./dto/quick-start-target.dto";
import { TargetsService } from "./targets.service";

@Controller("targets")
@UseGuards(SessionAuthGuard)
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: CreateTargetRequestDto) {
    const target = await this.targetsService.createTarget(userId, body.organizationId, body);
    if (!target) {
      // Not a member of that organization — 404, not 403, matching the
      // repositories controller's cross-tenant-existence-leak avoidance.
      throw new NotFoundException();
    }
    return target;
  }

  /**
   * The one-field onboarding path — no organization picker required,
   * since the whole point is that the caller hasn't picked one yet. See
   * `TargetsService.quickStartTarget`.
   */
  @Post("quick-start")
  async quickStart(@CurrentUser() userId: string, @Body() body: QuickStartTargetDto) {
    const result = await this.targetsService.quickStartTarget(userId, body.host);
    if (!result) {
      throw new BadRequestException(
        "Couldn't create a target for that domain — check it's a valid hostname and that your account belongs to an organization.",
      );
    }
    return result;
  }

  @Post(":id/scan")
  async scan(@CurrentUser() userId: string, @Param("id") id: string) {
    const outcome = await this.targetsService.runScanForUser(userId, id);
    if (!outcome.ok && outcome.reason === "not_found") throw new NotFoundException();
    if (!outcome.ok) {
      throw new ConflictException(
        "This target must be verified (and not revoked or expired) before it can be scanned.",
      );
    }
    return outcome.result;
  }

  /**
   * The Cloudflare-only "do it for me" alternative to copying the DNS TXT
   * record by hand — see `TargetsService.autoConfigureCloudflareForUser`.
   * The token is read from the request body once and never stored.
   */
  @Post(":id/auto-configure/cloudflare")
  async autoConfigureCloudflare(
    @CurrentUser() userId: string,
    @Param("id") id: string,
    @Body() body: AutoConfigureCloudflareDto,
  ) {
    const outcome = await this.targetsService.autoConfigureCloudflareForUser(
      userId,
      id,
      body.apiToken,
    );
    if (!outcome.ok && outcome.reason === "not_found") throw new NotFoundException();
    if (!outcome.ok) {
      throw new ConflictException("This target isn't awaiting verification.");
    }
    if (!outcome.result.ok) {
      throw new BadRequestException(outcome.result.detail);
    }
    return { detail: outcome.result.detail };
  }

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.targetsService.listTargetsForUser(userId);
  }

  @Get(":id")
  async getOne(@CurrentUser() userId: string, @Param("id") id: string) {
    const target = await this.targetsService.getTargetForUser(userId, id);
    if (!target) throw new NotFoundException();
    return target;
  }

  @Post(":id/verify")
  async verify(@CurrentUser() userId: string, @Param("id") id: string) {
    const result = await this.targetsService.verifyTarget(userId, id);
    if (!result) throw new NotFoundException();
    return result;
  }

  @Post(":id/revoke")
  async revoke(@CurrentUser() userId: string, @Param("id") id: string) {
    const result = await this.targetsService.revokeTarget(userId, id);
    if (!result) throw new NotFoundException();
    return result;
  }
}
