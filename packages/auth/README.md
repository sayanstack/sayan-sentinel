# @sayan-sentinel/auth

Tenant-access authorization logic.

**Status:** `canAccessOrganization()`/`assertOrganizationAccess()` implemented and tested — the cross-tenant IDOR regression coverage from Section 35. Full session-based authentication (Section 3) is not yet built; `apps/api` currently stands in with a header-based placeholder identity for the one endpoint that uses this package.

## What's here

A framework-agnostic authorization check: given a user id, a resource's
`organizationId`, and the user's memberships, decide whether access is
allowed. Deliberately dependency-free of HTTP/session concepts so it's
identically reusable from a NestJS controller, a guard, or a worker job.

## Testing

```bash
pnpm --filter @sayan-sentinel/auth test
```
