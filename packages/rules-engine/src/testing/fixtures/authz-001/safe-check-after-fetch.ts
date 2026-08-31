import { Router } from "express";
import { prisma } from "./db";
import { canAccessOrganization } from "./authz";

const router = Router();

// SAFE: the resource is fetched unscoped (its tenant isn't known until
// after the read), then gated before it's ever returned. Checking
// authorization after a *read* (not a mutation) is a legitimate pattern —
// SENTINEL-AUTHZ-001 must not treat "guard runs after the fetch" as
// equivalent to "no guard at all" when the guard still dominates the return.
router.get("/api/repositories/:repositoryId", async (req, res) => {
  const repositoryId = req.params.repositoryId;
  const repository = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repository) {
    return res.status(404).json({ error: "not found" });
  }
  if (!canAccessOrganization(req.user.id, repository.organizationId)) {
    return res.status(404).json({ error: "not found" });
  }
  res.json(repository);
});

export default router;
