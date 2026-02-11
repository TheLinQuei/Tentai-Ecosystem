# Milestone 3 Completion: Authentication & Multi-User

Date: 2025-12-23

## Summary
Adds user accounts, JWT-based authentication, refresh tokens, and conversation ownership. Protected endpoints enforce Bearer tokens and ownership constraints.

## Canonical Implementation
- Server: [src/runtime/server.ts](src/runtime/server.ts)
- Auth routes: [src/auth/routes.ts](src/auth/routes.ts)
- Auth middleware: [src/auth/middleware.ts](src/auth/middleware.ts)
- Auth service: [src/auth/AuthService.ts](src/auth/AuthService.ts)
- Migrations: [src/db/migrations.ts](src/db/migrations.ts)
- Verification script: [scripts/verify-m3.ps1](scripts/verify-m3.ps1)

## Verification Artifact
- Verification Log: [docs/verification/2025-12-23_182824-m3-verification.log](docs/verification/2025-12-23_182824-m3-verification.log)
- Verified: 2025-12-23 18:28 (Local) / 00:28 UTC

## Exact Command Sequence
```
pwsh scripts/verify-m3.ps1
```

## Proof (from verification log)
- Register/Login: access and refresh tokens returned (201/200).
- Protected without token: POST /v1/conversations returns 401.
- Protected with token: POST /v1/conversations returns 201 and assigns `userId`.
- Ownership enforcement: foreign GET /v1/conversations/:id/messages returns 403.
- Refresh: POST /v1/auth/refresh returns 200 with new access token.
- Logout then refresh: POST /v1/auth/refresh returns 401 (revoked).
- Tests: `tests/integration/auth.e2e.test.ts` passes with `VI_AUTH_ENABLED=true`.

## Exit Criteria (Met)
- Register/login/refresh/logout function correctly.
- Protected endpoints require Bearer tokens.
- Ownership enforced on conversations.
- Unit tests pass; auth integration passes with auth enabled.
