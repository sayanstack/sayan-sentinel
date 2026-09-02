import {
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
import { GithubWebhookService } from "../github/github-webhook.service";
import {
  RepositoriesService,
  type RepositoryAttackSurface,
  type RepositoryGraph,
} from "./repositories.service";

@Controller("repositories")
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(
    private readonly repositoriesService: RepositoriesService,
    private readonly githubWebhookService: GithubWebhookService,
  ) {}

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

  /**
   * Manual counterpart to the webhook-triggered scan (push/PR) — same
   * enqueue path, against the repository's current default-branch HEAD.
   * Tenant-checked here (404 for cross-tenant/nonexistent, matching every
   * other lookup on this controller) before ever touching GitHub or the
   * queue.
   */
  @Post(":id/scan")
  async scan(@CurrentUser() userId: string, @Param("id") id: string) {
    const repository = await this.repositoriesService.getRepositoryForUser(userId, id);
    if (!repository) throw new NotFoundException();

    const outcome = await this.githubWebhookService.triggerManualScan(id);
    if (!outcome.ok && outcome.reason === "not_found") throw new NotFoundException();
    if (!outcome.ok) {
      throw new ConflictException(
        "GitHub App isn't configured on this deployment, so a scan can't be enqueued.",
      );
    }
    return { scanId: outcome.scanId };
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
