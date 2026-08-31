import { Router } from "express";
import { prisma } from "./db";

const router = Router();

class AccountService {
  async getAccount(accountId: string) {
    // The unsafe lookup lives two layers away from the route handler —
    // Sentinel must resolve `accountService.getAccount(...)` to this method
    // via the call graph, not just scan the handler's own body.
    return prisma.account.findUnique({ where: { id: accountId } });
  }
}

const accountService = new AccountService();

// VULNERABLE: the route handler never touches Prisma directly — the unsafe
// lookup happens inside AccountService.getAccount, reached through one hop
// of interprocedural resolution.
router.get("/api/accounts/:accountId", async (req, res) => {
  const accountId = req.params.accountId;
  const account = await accountService.getAccount(accountId);
  res.json(account);
});

export default router;
