import { HealthIndicatorService } from "@nestjs/terminus";
import type { SentinelConfig } from "@sayan-sentinel/config";
import { RedisHealthIndicator } from "./redis.health";

const mockClient = {
  connect: jest.fn(),
  ping: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("ioredis", () => jest.fn().mockImplementation(() => mockClient));

const fakeConfig = { env: { REDIS_URL: "redis://localhost:6379" } } as SentinelConfig;

describe("RedisHealthIndicator", () => {
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new RedisHealthIndicator(new HealthIndicatorService(), fakeConfig);
  });

  it("reports up when Redis responds to ping", async () => {
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.ping.mockResolvedValue("PONG");

    const result = await indicator.check("redis");

    expect(result.redis.status).toBe("up");
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it("reports down with the real error when Redis is unreachable, and always disconnects", async () => {
    mockClient.connect.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));

    const result = await indicator.check("redis");

    expect(result.redis.status).toBe("down");
    expect(result.redis.message).toContain("ECONNREFUSED");
    expect(mockClient.disconnect).toHaveBeenCalled();
  });
});
