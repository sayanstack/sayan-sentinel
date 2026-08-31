import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db";

const router = Router();

// VULNERABLE: the identifier is renamed twice and passed through a format
// validator before reaching the query — none of that establishes ownership.
// A UUID-shaped ID is still an arbitrary resource identifier.
router.get("/api/accounts/:accountId", async (req, res) => {
  const rawId = req.params.accountId;
  const validatedId = z.string().uuid().parse(rawId);
  const targetId = validatedId;
  const account = await prisma.account.findUnique({ where: { id: targetId } });
  res.json(account);
});

export default router;
