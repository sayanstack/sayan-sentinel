process.env.DATABASE_URL ??= "postgresql://sentinel:sentinel@localhost:5432/sentinel";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.SESSION_SECRET ??= "e2e-test-session-secret";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createSessionToken } from "@sayan-sentinel/auth";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("Health (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("GET /health/live always reports ok, independent of any dependency", async () => {
    const response = await request(app.getHttpServer()).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("GET /health/ready honestly reports down dependencies instead of faking success", async () => {
    // No Postgres/Redis is running in this test environment, so the
    // endpoint must report 503 with each dependency explicitly down —
    // never a fabricated 200.
    const response = await request(app.getHttpServer()).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("error");
    expect(response.body.details.database.status).toBe("down");
    expect(response.body.details.redis.status).toBe("down");
  }, 20_000);
});

describe("Tenant-scoped endpoints (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("GET /repositories rejects a request with no identity, before ever touching the database", async () => {
    const response = await request(app.getHttpServer()).get("/repositories");
    expect(response.status).toBe(401);
  });

  it("GET /dashboard/summary rejects a request with no identity, before ever touching the database", async () => {
    const response = await request(app.getHttpServer()).get("/dashboard/summary");
    expect(response.status).toBe(401);
  });

  it("GET /repositories with an identity but no reachable database fails honestly (500), never with fabricated data", async () => {
    const token = createSessionToken(
      { userId: "cuid-e2e-user", githubLogin: "e2e-test-user" },
      process.env.SESSION_SECRET!,
    );
    const response = await request(app.getHttpServer())
      .get("/repositories")
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(500);
  }, 15_000);
});
