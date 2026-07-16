---
title: No diagnostic "info" tool; server version is hardcoded instead of read from package.json
labels: enhancement
---

## Summary

Two related gaps against the project's own best-practices guidelines:

1. There's no tool that reports the server version, dependency status, or detected configuration problems (e.g. missing env vars). `get-auth-status` (`src/mcp/src/main.ts:468-500`) reports auth mode and token status, but not version or config diagnostics.
2. The server version is a hardcoded string literal rather than read dynamically from `package.json`.

## Where

- `src/mcp/src/main.ts:28` — `version: "2.1.3"` hardcoded in the `McpServer` constructor.
- `src/mcp/src/main.ts:31` — `logger.info("Starting Lokka Multi-Microsoft API MCP Server (v2.1.3)")` — same hardcoded value repeated.
- No `info`-style tool exists anywhere in `src/mcp/src/main.ts`.

## Why this matters

- Dynamic versioning: reading the version from `package.json` at build/run time avoids the two hardcoded copies drifting out of sync with each other or with the published package version.
- Info command: without a diagnostic tool, there's no way for a user/agent to ask "what's my current config, and is anything wrong?" — this is especially important combined with #1 (config errors crashing the server): if startup fails, there's currently no way to introspect why.

## Suggested fix

- Read the version from `package.json` at startup (e.g. via `createRequire` or a build-time constant) and use it in both the `McpServer` constructor and the startup log line.
- Add an `info` tool that reports: current version, active auth mode, and any detected missing/invalid environment variables — this pairs naturally with the fix for #1, since it becomes the way a user diagnoses a bad config once the server no longer exits on startup errors.
