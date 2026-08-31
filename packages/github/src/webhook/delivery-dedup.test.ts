import { describe, expect, it } from "vitest";
import { InMemoryDeliveryStore, isDuplicateDelivery } from "./delivery-dedup";

describe("isDuplicateDelivery", () => {
  it("reports the first delivery of an id as not a duplicate", async () => {
    const store = new InMemoryDeliveryStore();
    expect(await isDuplicateDelivery(store, "delivery-1")).toBe(false);
  });

  it("reports a repeated delivery of the same id as a duplicate", async () => {
    const store = new InMemoryDeliveryStore();
    await isDuplicateDelivery(store, "delivery-1");
    expect(await isDuplicateDelivery(store, "delivery-1")).toBe(true);
  });

  it("treats different delivery ids independently", async () => {
    const store = new InMemoryDeliveryStore();
    await isDuplicateDelivery(store, "delivery-1");
    expect(await isDuplicateDelivery(store, "delivery-2")).toBe(false);
  });

  it("persists across direct hasSeen calls after markSeen", async () => {
    const store = new InMemoryDeliveryStore();
    expect(await store.hasSeen("delivery-1")).toBe(false);
    await store.markSeen("delivery-1");
    expect(await store.hasSeen("delivery-1")).toBe(true);
  });
});
