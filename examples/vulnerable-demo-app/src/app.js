/**
 * Sayan Sentinel local demo fixture — "Sentinel Lab".
 *
 * EVERY vulnerability in this file is intentional and exists so Sentinel
 * has something real to find during local demo/development, both at the
 * source-code level (SAST/rules-engine) and, when this app is actually
 * running, at the running-application level (Web Security Engine, Full
 * Stack Scan, Target Authorization). This is NOT a real application — it
 * is never deployed publicly by this project, and none of its "secrets"
 * are real credentials. Do not report these as security findings; they
 * are the fixture, not a target.
 *
 * See README.md in this directory for the full list of intentional
 * vulnerabilities and their CWE mappings, and docs/sentinel-lab.md for
 * how to point Sentinel's engines at this app once it's running.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const http = require("http");
const https = require("https");

const app = express();
app.use(express.json());

// --- Intentional vulnerability: hard-coded secret (CWE-798) ------------
// This looks like a Stripe test key but is a fabricated string; it exists
// so Gitleaks has a genuine (fake) secret to detect in this fixture.
const STRIPE_API_KEY_FAKE = "sk_test_FAKE00000000000000000000FAKE";

// --- Intentional vulnerability: insecure CORS (CWE-942) -----------------
// Reflects every origin and allows credentials — a real API should never
// combine a wildcard-equivalent origin policy with credentialed requests.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  next();
});

// In-memory "database" — deliberately no real DB dependency, so this
// fixture has zero setup cost for the local demo.
const ORDERS = {
  1001: { id: 1001, ownerId: "user-alice", total: 42.5, item: "Sentinel T-Shirt" },
  1002: { id: 1002, ownerId: "user-bob", total: 19.99, item: "Sentinel Sticker Pack" },
};

const INVOICES = {
  5001: { id: 5001, ownerId: "user-alice", amount: 42.5, status: "paid" },
  5002: { id: 5002, ownerId: "user-bob", amount: 19.99, status: "unpaid" },
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

// --- Intentional vulnerability: a second BOLA instance on a different
// resource type (CWE-639) — deliberately duplicated rather than shared
// with the orders handler, since real codebases usually have the same
// mistake copy-pasted across several endpoints rather than centralized.
app.get("/api/invoices/:id", (req, res) => {
  const invoice = INVOICES[req.params.id];
  if (!invoice) return res.status(404).json({ error: "not found" });
  return res.json(invoice); // <-- same missing ownership check as /api/orders/:id
});

// --- Intentional vulnerability: mass assignment (CWE-915) ---------------
// Spreads the entire request body onto the user record with no allowlist,
// so a client can set `role: "admin"` on themselves.
app.patch("/api/users/:id", (req, res) => {
  const user = USERS[req.params.id];
  if (!user) return res.status(404).json({ error: "not found" });
  Object.assign(user, req.body); // <-- no field allowlist; role/id are attacker-controlled
  return res.json(user);
});

// --- Intentional vulnerability: trusting a client-supplied role claim ---
// (CWE-602 / OWASP API5:2023 Broken Function Level Authorization) — the
// server takes the caller's word for their own privilege level instead of
// checking a real, server-derived session/role.
app.post("/api/admin/reset", (req, res) => {
  if (req.body.role === "admin") {
    return res.json({ ok: true, message: "System reset (demo — nothing actually reset)" });
  }
  return res.status(403).json({ error: "forbidden" });
});

// --- Intentional vulnerability: open redirect (CWE-601) -----------------
app.get("/redirect", (req, res) => {
  const target = req.query.url;
  res.redirect(target); // unsanitized — never validated against an allowlist
});

// --- Intentional vulnerability: path traversal (CWE-22) ------------------
// Built with plain string interpolation rather than `path.join` — Sentinel
// Rules Engine's SENTINEL-FS-001 doesn't yet model taint flowing through
// `path.join`'s return value (it only tracks it through direct string
// interpolation/property access), so this shape is both a faithful,
// common real-world traversal bug *and* the one SENTINEL-FS-001 actually
// catches today. See docs/sentinel-lab.md for the full detection-scope
// notes discovered while building this fixture.
app.get("/files/:name", (req, res) => {
  const filePath = `${__dirname}/public/${req.params.name}`; // no traversal check
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

// --- Intentional vulnerability: reflected XSS (CWE-79) -------------------
// The search term is echoed back into an HTML response with no escaping.
app.get("/search", (req, res) => {
  const q = req.query.q || "";
  res.send(`<html><body><h1>Results for: ${q}</h1></body></html>`); // unescaped
});

// --- Intentional vulnerability: SSRF (CWE-918) ---------------------------
// Fetches whatever URL the caller supplies — no allowlist, no check
// against private/loopback ranges (the exact class of request Scope
// Guard exists to block for Sentinel's OWN outbound requests; this route
// simulates an application that has no equivalent protection of its own).
// Calls `http.get`/`https.get` directly (rather than through an
// intermediate variable) — SENTINEL-SSRF-001's sink matcher recognizes
// the literal receiver text `http`/`https`, not a variable that happens
// to be assigned one of them at runtime; see docs/sentinel-lab.md.
app.get("/fetch-url", (req, res) => {
  const target = req.query.url || "";
  const onResponse = (upstream) => {
    let body = "";
    upstream.on("data", (chunk) => (body += chunk));
    upstream.on("end", () => res.json({ status: upstream.statusCode, body }));
  };
  const onError = (err) => res.status(502).json({ error: err.message });

  if (target.startsWith("https:")) {
    https.get(target, onResponse).on("error", onError);
  } else {
    http.get(target, onResponse).on("error", onError);
  }
});

// --- Intentional vulnerability: OS command injection (CWE-78) -----------
app.post("/ping", (req, res) => {
  const { host } = req.body;
  exec(`ping -n 1 ${host}`, (err, stdout, stderr) => {
    // string-concatenated shell command — a semicolon/backtick in `host`
    // executes arbitrary commands.
    res.json({ stdout, stderr, error: err && err.message });
  });
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

// --- Intentional vulnerability: NoSQL-injection-shaped query (CWE-943) --
// Puts the raw request body directly into a MongoDB-style filter object —
// a caller can pass `{"username": {"$ne": null}}` to bypass an intended
// exact-match lookup. No real MongoDB driver is wired up; this mirrors
// the shape of the vulnerable pattern for the SAST rule to catch.
function buildMongoFilter(req) {
  return { username: req.body.username, password: req.body.password }; // <-- passed through unvalidated
}
app.post("/api/mongo-login", (req, res) => {
  const filter = buildMongoFilter(req);
  res.json({ filter }); // echoes the constructed (never executed) filter for demo purposes
});

// --- Intentional vulnerability: broken JWT verification (CWE-347) -------
// "Verifies" a JWT by decoding its payload without ever checking the
// signature — a forged token with any payload is accepted.
app.get("/api/admin", (req, res) => {
  const auth = req.header("authorization") || "";
  const token = auth.replace(/^Bearer /, "");
  const [, payloadB64] = token.split(".");
  if (!payloadB64) return res.status(401).json({ error: "missing token" });
  const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")); // no signature check
  if (payload.role !== "admin") return res.status(403).json({ error: "forbidden" });
  return res.json({ secret: "admin-only demo data" });
});

// --- Intentional vulnerability: session cookie missing Secure/HttpOnly --
// (CWE-614 / CWE-1004)
app.post("/login", (req, res) => {
  res.setHeader("Set-Cookie", `session=demo-session-token; Path=/`); // no Secure, no HttpOnly
  res.json({ status: "logged in" });
});

// --- Intentional vulnerability: verbose error disclosure (CWE-209) ------
// A route that always throws, wired to an error handler that leaks the
// full stack trace to the client.
app.get("/crash", () => {
  throw new Error("Sentinel Lab demo crash — intentional");
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack }); // stack trace leaked to the client
});

const port = process.env.DEMO_PORT || 4100;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Sentinel Lab (vulnerable demo app) listening on :${port} (local demo fixture only)`);
  });
}

module.exports = { app, STRIPE_API_KEY_FAKE };
