---
title: 🛠️ Advanced install
sidebar_position: 3
---

# Advanced Install Guide

Use this guide if you want to configure Lokka with advanced options or use a custom Microsoft Entra application.

The quick start guide is sufficient for most users and you can find it [here](/docs/install). 

Lokka supports multiple authentication options. Here's a quick summary of all the options.

- 1️⃣ → [Interactive Auth](interactive-auth)
  - Interactive auth with default app
  - Interactive auth with custom app
  - Guest (B2B) access to other tenants
- 2️⃣ → [App-Only Auth](app-only-auth)
  - App-Only Auth with Certificate
  - App-Only Auth with Client Secret
  - Querying multiple tenants in a single session
- 3️⃣ → [Token Auth](token-auth)

:::tip Multi-tenant queries
Lokka supports querying **different tenants in the same session** via the optional `tenantId` parameter on the `Lokka-Microsoft` tool. Available in both interactive (guest/B2B) and app-only (multi-tenant app) modes. See the relevant guide above for details.
:::
