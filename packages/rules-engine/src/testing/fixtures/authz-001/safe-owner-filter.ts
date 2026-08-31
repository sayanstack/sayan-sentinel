import { Router } from "express";
import { prisma } from "./db";

const router = Router();

// SAFE: the query is scoped to the authenticated caller's own accounts via
// `ownerId`, so a request for another user's account simply finds no row.
router.get("/api/accounts/:accountId", async (req, res) => {
  const accountId = req.params.accountId;
  const account = await prisma.account.findFirst({
    where: { id: accountId, ownerId: req.user.id },
  });
  res.json(account);
});

export default router;
