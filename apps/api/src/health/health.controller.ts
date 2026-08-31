import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { PrismaHealthIndicator } from "./indicators/prisma.health";
import { RedisHealthIndicator } from "./indicators/redis.health";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  /**
   * Liveness: is the process itself up? No dependency checks, so this
   * never fails due to Postgres/Redis being unavailable — that's what
   * /health/ready is for.
   */
  @Get("live")
  live() {
    return { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
  }

  /**
   * Readiness: are this process's actual dependencies reachable? Reports
   * real down/up status per dependency — never fabricated as healthy.
   */
  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prismaIndicator.check("database"),
      () => this.redisIndicator.check("redis"),
    ]);
  }
}
