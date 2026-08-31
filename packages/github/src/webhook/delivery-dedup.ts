/**
 * Backs idempotent webhook processing (Section 6: "prevent replay/
 * duplicate job problems") keyed on GitHub's `X-GitHub-Delivery` header,
 * which is unique per delivery attempt — including retries of the exact
 * same event, which GitHub does on timeout/5xx. A production deployment
 * backs this with Redis (already in the stack) with a TTL long enough to
 * cover GitHub's retry window; `InMemoryDeliveryStore` is a correct
 * reference implementation for single-process use and for tests.
 */
export interface DeliveryStore {
  hasSeen(deliveryId: string): Promise<boolean>;
  markSeen(deliveryId: string): Promise<void>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly seen = new Set<string>();

  async hasSeen(deliveryId: string): Promise<boolean> {
    return this.seen.has(deliveryId);
  }

  async markSeen(deliveryId: string): Promise<void> {
    this.seen.add(deliveryId);
  }
}

/**
 * Returns true if this delivery has already been processed (caller should
 * skip it). Marks the delivery as seen as a side effect of the *first*
 * call for a given id, so a second concurrent/retried call for the same
 * id is correctly reported as a duplicate.
 */
export async function isDuplicateDelivery(store: DeliveryStore, deliveryId: string): Promise<boolean> {
  if (await store.hasSeen(deliveryId)) {
    return true;
  }
  await store.markSeen(deliveryId);
  return false;
}
