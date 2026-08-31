import { Router } from "express";
import { prisma } from "./db";
import { assertOwnership } from "./authz";

const router = Router();

// SAFE: an explicit authorization guard dominates the lookup — the handler
// returns before the query runs unless the caller owns the resource.
router.get("/api/accounts/:accountId", async (req, res) => {
  const accountId = req.params.accountId;
  if (!assertOwnership(req.user, accountId)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  res.json(account);
});

export default router;
