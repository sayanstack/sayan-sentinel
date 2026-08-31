import { HealthIndicatorService } from "@nestjs/terminus";
import { prisma } from "@sayan-sentinel/database";
import { PrismaHealthIndicator } from "./prisma.health";

jest.mock("@sayan-sentinel/database", () => ({
  prisma: { $queryRaw: jest.fn() },
}));

describe("PrismaHealthIndicator", () => {
  let indicator: PrismaHealthIndicator;

  beforeEach(() => {
    jest.clearAllMocks();
    indicator = new PrismaHealthIndicator(new HealthIndicatorService());
  });

  it("reports up when the database responds", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ "?column?": 1 }]);

    const result = await indicator.check("database");

    expect(result.database.status).toBe("up");
  });

  it("reports down with the real error message when the database is unreachable", async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await indicator.check("database");

    expect(result.database.status).toBe("down");
    expect(result.database.message).toContain("ECONNREFUSED");
  });
});
