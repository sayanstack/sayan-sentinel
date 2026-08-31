/**
 * Sayan Sentinel local demo fixture.
 *
 * EVERY vulnerability in this file is intentional and exists so Sentinel
 * has something real to find during local demo/development. This is NOT
 * a real application — it is never deployed, and none of its "secrets"
 * are real credentials. Do not report these as security findings; they
 * are the fixture, not a target.
 *
 * See README.md in this directory for the full list of intentional
 * vulnerabilities and their CWE mappings.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// --- Intentional vulnerability: hard-coded secret (CWE-798) ------------
// This looks like a Stripe test key but is a fabricated string; it exists
// so Gitleaks has a genuine (fake) secret to detect in this fixture.
const STRIPE_API_KEY_FAKE = "sk_test_FAKE00000000000000000000FAKE";

// In-memory "database" — deliberately no real DB dependency, so this
// fixture has zero setup cost for the local demo.
const ORDERS = {
  1001: { id: 1001, ownerId: "user-alice", total: 42.5, item: "Sentinel T-Shirt" },
  1002: { id: 1002, ownerId: "user-bob", total: 19.99, item: "Sentinel Sticker Pack" },
};

const USERS = {
  "user-alice": { id: "user-alice", role: "customer" },
  "user-bob": { id: "user-bob", role: "customer" },
};

function currentUser(req) {
  // Trivial demo auth: the caller just claims a user id via header.
  const userId = req.header("x-demo-user-id") || "user-alice";
  return USERS[userId] ?? null;
}

// --- Intentional vulnerability: broken object-level authorization -------
// (CWE-639 / OWASP API1:2023 Broken Object Level Authorization)
//
// Any authenticated demo user can fetch ANY order by id — there is no
// check that req user (`currentUser`) owns the requested order.
app.get("/api/orders/:id", (req, res) => {
  const order = ORDERS[req.params.id];
  if (!order) return res.status(404).json({ error: "not found" });
  return res.json(order); // <-- missing: order.ownerId !== currentUser(req).id check
});

// --- Intentional vulnerability: open redirect (CWE-601) -----------------
app.get("/redirect", (req, res) => {
  const target = req.query.url;
  res.redirect(target); // unsanitized — never validated against an allowlist
});

// --- Intentional vulnerability: path traversal (CWE-22) ------------------
app.get("/files/:name", (req, res) => {
  const filePath = path.join(__dirname, "public", req.params.name); // no traversal check
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return res.status(404).json({ error: "not found" });
    res.send(data);
  });
});

// --- Intentional vulnerability: unsafe deserialization / eval (CWE-95) ---
app.post("/preview-template", (req, res) => {
  const { expression } = req.body;
  // eslint-disable-next-line no-eval
  const result = eval(expression); // never do this with user input
  res.json({ result });
});

// --- Intentional vulnerability: SQL-injection-shaped string building -----
// (CWE-89) — no real SQL engine is wired up (no DB dependency), but the
// pattern is exactly what a SAST rule for string-concatenated queries
// should flag, and mirrors a real vulnerable query builder.
function buildUserLookupQuery(username) {
  return "SELECT * FROM users WHERE username = '" + username + "'";
}
app.get("/api/lookup", (req, res) => {
  const query = buildUserLookupQuery(req.query.username);
  res.json({ query }); // echoes the constructed (never executed) query for demo purposes
});

const port = process.env.DEMO_PORT || 4100;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Sentinel vulnerable demo app listening on :${port} (local demo fixture only)`);
  });
}

module.exports = { app, STRIPE_API_KEY_FAKE };
