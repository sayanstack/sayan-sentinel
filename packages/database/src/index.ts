import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

declare global {
  var __sentinelPrisma: PrismaClient | undefined;
}

/**
 * Reuse a single PrismaClient across hot reloads / module re-evaluation in
 * dev instead of opening a new connection pool per reload.
 */
export const prisma: PrismaClient = globalThis.__sentinelPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__sentinelPrisma = prisma;
}
