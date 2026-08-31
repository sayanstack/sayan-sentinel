import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  UnauthorizedException,
} from "@nestjs/common";
import { RepositoriesService } from "./repositories.service";

/**
 * `x-demo-user-id` stands in for a real session until session-based auth
 * (Section 3's `packages/auth`) grows beyond tenant-access logic — this
 * endpoint exists specifically to demonstrate and regression-test the
 * cross-tenant isolation check end to end, not as a finished auth layer.
 */
@Controller("repositories")
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  async list(@Headers("x-demo-user-id") userId: string | undefined) {
    if (!userId) {
      throw new UnauthorizedException("x-demo-user-id header is required");
    }
    return this.repositoriesService.listRepositoriesForUser(userId);
  }

  @Get(":id")
  async getOne(@Headers("x-demo-user-id") userId: string | undefined, @Param("id") id: string) {
    if (!userId) {
      throw new UnauthorizedException("x-demo-user-id header is required");
    }

    const repository = await this.repositoriesService.getRepositoryForUser(userId, id);
    if (!repository) {
      // Same response for "doesn't exist" and "exists but you can't see
      // it" — confirming cross-tenant existence is itself a leak.
      throw new NotFoundException();
    }

    return repository;
  }
}
