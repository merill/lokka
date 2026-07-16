---
title: console.log during interactive auth writes to stdout, corrupting the MCP JSON-RPC stream
labels: bug
---

## Summary

Lokka communicates with MCP clients over stdio, where stdout is reserved for the JSON-RPC protocol stream. Several interactive-auth code paths call `console.log` directly, which writes to stdout during normal (non-error) operation and can corrupt that stream.

## Where

- `src/mcp/src/main.ts:592-594` — status messages before requesting additional Graph permissions (`add-graph-permission` tool).
- `src/mcp/src/main.ts:617-620` — device-code fallback prompt (verification URL + user code) inside the same tool.
- `src/mcp/src/auth.ts:183-185` — the equivalent device-code prompt callback used during initial Interactive-mode authentication.

The project's own `logger` (`src/mcp/src/logger.ts`) correctly writes only to `stderr` + a log file, so this isn't a case of no logger being available — these call sites simply bypass it.

## Why this matters

The best-practices doc's "Output Control" rule requires no stdio output during normal tool operation, specifically because it can disrupt MCP clients. `console.log` writes to stdout; anything written there outside of the JSON-RPC framing can desync or corrupt the client's read loop.

## Suggested fix

Replace these `console.log` calls with `logger.info` (stderr + file), or find another out-of-band channel for the interactive device-code prompt if it needs to be user-visible outside the log file.
