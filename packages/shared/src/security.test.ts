import { describe, expect, it } from "vitest";
import { isFindingStatus, isSeverity } from "./security";

describe("isSeverity", () => {
  it("accepts known severities", () => {
    expect(isSeverity("critical")).toBe(true);
    expect(isSeverity("info")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isSeverity("catastrophic")).toBe(false);
    expect(isSeverity("")).toBe(false);
  });
});

describe("isFindingStatus", () => {
  it("accepts known statuses", () => {
    expect(isFindingStatus("accepted_risk")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isFindingStatus("ignored")).toBe(false);
  });
});
