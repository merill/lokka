---
title: Misconfigured env vars crash the MCP server instead of a recoverable error
labels: bug
---

## Summary

When authentication environment variables are missing or inconsistent, Lokka throws during startup and the process calls `process.exit(1)`, killing the whole MCP server. No tool ever becomes callable, so the client/agent has no way to see what's wrong or self-correct — the server just appears dead.

## Where

- `src/mcp/src/main.ts:708-712` — throws if more than one of `USE_CLIENT_TOKEN` / `USE_INTERACTIVE` / `USE_CERTIFICATE` is set.
- `src/mcp/src/main.ts:758-766` — throws if `ClientCredentials` mode is missing `TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET`, or `Certificate` mode is missing `TENANT_ID` / `CLIENT_ID` / `CERTIFICATE_PATH`.
- `src/mcp/src/auth.ts:132-134`, `auth.ts:152-154` — `AuthManager.initialize()` throws the same errors again.
- `src/mcp/src/auth.ts:224-227` — rethrows if the initial credential test fails (e.g. an invalid `CLIENT_SECRET` or expired cert).
- `src/mcp/src/main.ts:801-805` — `main().catch(...)` logs the error and calls `process.exit(1)`.

## Why this matters

This violates the "Configuration Error Handling" principle: misconfiguration should never crash the tool. It should start up and surface a clear, actionable message so the user can fix their setup — for example through a tool call or a status response — rather than exiting before the MCP connection is even usable.

## Suggested fix

Catch configuration/auth-init errors in `main()` and keep the server running: connect the transport regardless, and have the tools (e.g. `Lokka-Microsoft`, `get-auth-status`) report the specific configuration problem when invoked, instead of exiting the process. Reserve `process.exit(1)` for truly unrecoverable errors.
