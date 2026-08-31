import { describe, expect, it } from "vitest";
import { clampLimit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./pagination.js";

describe("clampLimit", () => {
  it("returns the default when undefined", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("returns the default when NaN", () => {
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it("floors fractional values", () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  it("clamps below 1 up to 1", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it("clamps above the max down to the max", () => {
    expect(clampLimit(10_000)).toBe(MAX_PAGE_LIMIT);
  });
});
