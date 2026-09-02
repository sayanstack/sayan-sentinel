import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import {
  RepositoriesService,
  type RepositoryAttackSurface,
  type RepositoryGraph,
} from "./repositories.service";

@Controller("repositories")
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.repositoriesService.listRepositoriesForUser(userId);
  }

  @Get(":id")
  async getOne(@CurrentUser() userId: string, @Param("id") id: string) {
    const repository = await this.repositoriesService.getRepositoryForUser(userId, id);
    if (!repository) {
      // Same response for "doesn't exist" and "exists but you can't see
      // it" — confirming cross-tenant existence is itself a leak.
      throw new NotFoundException();
    }

    return repository;
  }

  @Get(":id/graph")
  async getGraph(@CurrentUser() userId: string, @Param("id") id: string): Promise<RepositoryGraph> {
    const graph = await this.repositoriesService.getLatestGraphForUser(userId, id);
    if (!graph) {
      throw new NotFoundException();
    }

    return graph;
  }

  @Get(":id/attack-surface")
  async getAttackSurface(
    @CurrentUser() userId: string,
    @Param("id") id: string,
  ): Promise<RepositoryAttackSurface> {
    const attackSurface = await this.repositoriesService.getLatestAttackSurfaceForUser(userId, id);
    if (!attackSurface) {
      throw new NotFoundException();
    }

    return attackSurface;
  }
}
