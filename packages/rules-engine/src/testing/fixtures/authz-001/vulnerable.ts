import { Router } from "express";
import { prisma } from "./db";

const router = Router();

// VULNERABLE: no ownership/tenant constraint, no authorization guard — any
// authenticated (or unauthenticated) caller can read any account by ID.
router.get("/api/accounts/:accountId", async (req, res) => {
  const accountId = req.params.accountId;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  res.json(account);
});

export default router;
