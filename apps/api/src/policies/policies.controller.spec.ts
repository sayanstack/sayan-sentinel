import { UnauthorizedException } from "@nestjs/common";
import { DEFAULT_POLICY_RULES } from "@sayan-sentinel/policy-engine";
import { PoliciesController } from "./policies.controller";

describe("PoliciesController.list", () => {
  it("rejects a request with no x-demo-user-id header", () => {
    const controller = new PoliciesController();
    expect(() => controller.list(undefined)).toThrow(UnauthorizedException);
  });

  it("returns the real, actually-enforced default policy rules", () => {
    const controller = new PoliciesController();
    expect(controller.list("user-alice")).toBe(DEFAULT_POLICY_RULES);
  });
});
