import { DEFAULT_POLICY_RULES } from "@sayan-sentinel/policy-engine";
import { PoliciesController } from "./policies.controller";

describe("PoliciesController.list", () => {
  it("returns the real, actually-enforced default policy rules", () => {
    const controller = new PoliciesController();
    expect(controller.list()).toBe(DEFAULT_POLICY_RULES);
  });
});
