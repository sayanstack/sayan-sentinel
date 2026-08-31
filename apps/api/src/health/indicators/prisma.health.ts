import { Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import { prisma } from "@sayan-sentinel/database";

@Injectable()
export class PrismaHealthIndicator {
  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async check<const Key extends string>(key: Key) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "unknown database error",
      });
    }
  }
}
