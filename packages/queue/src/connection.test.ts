import { describe, expect, it } from "vitest";
import { parseRedisConnection } from "./connection";

describe("parseRedisConnection", () => {
  it("parses host and port from a plain redis URL", () => {
    expect(parseRedisConnection("redis://localhost:6380")).toEqual({
      host: "localhost",
      port: 6380,
      password: undefined,
      username: undefined,
    });
  });

  it("defaults to port 6379 when the URL omits one", () => {
    expect(parseRedisConnection("redis://localhost")).toEqual({
      host: "localhost",
      port: 6379,
      password: undefined,
      username: undefined,
    });
  });

  it("extracts username and password when present", () => {
    expect(parseRedisConnection("redis://user:secret@redis.internal:6379")).toEqual({
      host: "redis.internal",
      port: 6379,
      password: "secret",
      username: "user",
    });
  });
});
