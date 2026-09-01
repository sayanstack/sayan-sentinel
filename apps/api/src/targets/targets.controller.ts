import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { AutoConfigureCloudflareDto } from "./dto/auto-configure-cloudflare.dto";
import { CreateTargetDto } from "./dto/create-target.dto";
import { QuickStartTargetDto } from "./dto/quick-start-target.dto";
import { TargetsService } from "./targets.service";

function requireUserId(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedException("x-demo-user-id header is required");
  return userId;
}

function requireOrganizationId(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new UnauthorizedException("x-demo-organization-id header is required");
  }
  return organizationId;
}

/**
 * `x-demo-user-id`/`x-demo-organization-id` stand in for a real session,
 * matching `RepositoriesController`'s documented interim pattern — this
 * exists to demonstrate and regression-test tenant isolation and the
 * verify/revoke lifecycle end to end, not as a finished auth layer.
 */
@Controller("targets")
export class TargetsController {
  constructor(private readonly targetsService: TargetsService) {}

  @Post()
  async create(
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Headers("x-demo-organization-id") organizationIdHeader: string | undefined,
    @Body() body: CreateTargetDto,
  ) {
    const userId = requireUserId(userIdHeader);
    const organizationId = requireOrganizationId(organizationIdHeader);

    const target = await this.targetsService.createTarget(userId, organizationId, body);
    if (!target) {
      // Not a member of that organization — 404, not 403, matching the
      // repositories controller's cross-tenant-existence-leak avoidance.
      throw new NotFoundException();
    }
    return target;
  }

  /**
   * The one-field onboarding path — no `x-demo-organization-id` header
   * required, since the whole point is that the caller hasn't picked an
   * organization yet. See `TargetsService.quickStartTarget`.
   */
  @Post("quick-start")
  async quickStart(
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Body() body: QuickStartTargetDto,
  ) {
    const userId = requireUserId(userIdHeader);
    const result = await this.targetsService.quickStartTarget(userId, body.host);
    if (!result) {
      throw new BadRequestException(
        "Couldn't create a target for that domain — check it's a valid hostname and that your account belongs to an organization.",
      );
    }
    return result;
  }

  @Post(":id/scan")
  async scan(@Headers("x-demo-user-id") userIdHeader: string | undefined, @Param("id") id: string) {
    const userId = requireUserId(userIdHeader);
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
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Param("id") id: string,
    @Body() body: AutoConfigureCloudflareDto,
  ) {
    const userId = requireUserId(userIdHeader);
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
  async list(@Headers("x-demo-user-id") userIdHeader: string | undefined) {
    const userId = requireUserId(userIdHeader);
    return this.targetsService.listTargetsForUser(userId);
  }

  @Get(":id")
  async getOne(
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Param("id") id: string,
  ) {
    const userId = requireUserId(userIdHeader);
    const target = await this.targetsService.getTargetForUser(userId, id);
    if (!target) throw new NotFoundException();
    return target;
  }

  @Post(":id/verify")
  async verify(
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Param("id") id: string,
  ) {
    const userId = requireUserId(userIdHeader);
    const result = await this.targetsService.verifyTarget(userId, id);
    if (!result) throw new NotFoundException();
    return result;
  }

  @Post(":id/revoke")
  async revoke(
    @Headers("x-demo-user-id") userIdHeader: string | undefined,
    @Param("id") id: string,
  ) {
    const userId = requireUserId(userIdHeader);
    const result = await this.targetsService.revokeTarget(userId, id);
    if (!result) throw new NotFoundException();
    return result;
  }
}
