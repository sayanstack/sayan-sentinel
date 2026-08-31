import { Test } from "@nestjs/testing";
import { HealthCheckService } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { PrismaHealthIndicator } from "./indicators/prisma.health";
import { RedisHealthIndicator } from "./indicators/redis.health";

describe("HealthController", () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };

  beforeEach(async () => {
    healthCheckService = { check: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: { check: jest.fn() } },
        { provide: RedisHealthIndicator, useValue: { check: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  describe("live", () => {
    it("reports ok without touching any dependency", () => {
      const result = controller.live();
      expect(result.status).toBe("ok");
      expect(typeof result.uptimeSeconds).toBe("number");
      expect(healthCheckService.check).not.toHaveBeenCalled();
    });
  });

  describe("ready", () => {
    it("delegates to HealthCheckService with both indicators", async () => {
      healthCheckService.check.mockResolvedValue({ status: "ok", info: {}, error: {}, details: {} });

      await controller.ready();

      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      const indicatorFns = healthCheckService.check.mock.calls[0][0];
      expect(indicatorFns).toHaveLength(2);
    });
  });
});
