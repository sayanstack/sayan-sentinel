import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { CreateTargetDto } from "./dto/create-target.dto";
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
