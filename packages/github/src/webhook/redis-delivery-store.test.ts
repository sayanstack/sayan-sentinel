import { describe, expect, it, vi } from "vitest";
import { RedisDeliveryStore, type RedisDeliveryStoreClient } from "./redis-delivery-store";
import { isDuplicateDelivery } from "./delivery-dedup";

function fakeClient(): RedisDeliveryStoreClient & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    exists: vi.fn(async (key: string) => (data.has(key) ? 1 : 0)),
    set: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
      return "OK";
    }),
  };
}

describe("RedisDeliveryStore", () => {
  it("reports a fresh delivery id as unseen, then seen after marking", async () => {
    const client = fakeClient();
    const store = new RedisDeliveryStore(client);

    expect(await store.hasSeen("delivery-1")).toBe(false);
    await store.markSeen("delivery-1");
    expect(await store.hasSeen("delivery-1")).toBe(true);
  });

  it("namespaces keys under the configured prefix so it can't collide with unrelated keys", async () => {
    const client = fakeClient();
    const store = new RedisDeliveryStore(client, 3600, "my-prefix:");

    await store.markSeen("delivery-1");

    expect([...client.data.keys()]).toEqual(["my-prefix:delivery-1"]);
  });

  it("passes the configured TTL to the underlying SET call", async () => {
    const client = fakeClient();
    const store = new RedisDeliveryStore(client, 120);

    await store.markSeen("delivery-1");

    expect(client.set).toHaveBeenCalledWith(expect.stringContaining("delivery-1"), "1", "EX", 120);
  });

  it("integrates correctly with isDuplicateDelivery: first call proceeds, second is flagged as a duplicate", async () => {
    const client = fakeClient();
    const store = new RedisDeliveryStore(client);

    expect(await isDuplicateDelivery(store, "delivery-42")).toBe(false);
    expect(await isDuplicateDelivery(store, "delivery-42")).toBe(true);
  });
});
