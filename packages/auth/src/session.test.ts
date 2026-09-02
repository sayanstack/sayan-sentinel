import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const SECRET = "test-secret-value";

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken({ userId: "user-1", githubLogin: "octocat" }, SECRET);
    const payload = verifySessionToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user-1");
    expect(payload?.githubLogin).toBe("octocat");
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken({ userId: "user-1", githubLogin: "octocat" }, SECRET);
    expect(verifySessionToken(token, "wrong-secret")).toBeNull();
  });

  it("rejects a token with a tampered payload", () => {
    const token = createSessionToken({ userId: "user-1", githubLogin: "octocat" }, SECRET);
    const [body, signature] = token.split(".") as [string, string];
    const tamperedPayload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    tamperedPayload.userId = "user-2";
    const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload), "utf8").toString("base64url");
    expect(verifySessionToken(`${tamperedBody}.${signature}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createSessionToken({ userId: "user-1", githubLogin: "octocat" }, SECRET, -1000);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("a.b.c", SECRET)).toBeNull();
  });

  it("rejects a signature of the wrong length", () => {
    const token = createSessionToken({ userId: "user-1", githubLogin: "octocat" }, SECRET);
    const [body] = token.split(".");
    expect(verifySessionToken(`${body}.short`, SECRET)).toBeNull();
  });
});
