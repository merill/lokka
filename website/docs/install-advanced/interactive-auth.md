---
title: 👤 Interactive auth
sidebar_position: 2
slug: /install-advanced/interactive-auth
---

This authentication method opens a browser window and prompts the user to sign into their Microsoft tenant.

It currently requires the user to authenticate each time the client application (Claude, VS Code) is started.

Interactive auth also allows the client to dynamically request and consent to additional permissions without having to look up the app in the Entra portal and grant permissions.

## Option 1: Interactive auth with default app

This method is outlined in the quick start [Install Guide](/docs/install)

## Option 2: Interactive auth with custom app

If you wish to use a custom Microsoft Entra app, you can create a new app registration in your Microsoft Entra tenant.

### Create an Entra app for App-Only auth with Lokka 

- Open [Entra admin center](https://entra.microsoft.com) > **Identity** > **Applications** > **App registrations**
  - Tip: [enappreg.cmd.ms](https://enappreg.cmd.ms) is a shortcut to the App registrations page.
- Select **New registration**
- Enter a name for the application (e.g. `Lokka`)
- Leave the **Supported account types** as `Accounts in this organizational directory only (Single tenant)`.
- In the **Redirect URI** section, select `Public client/native (mobile & desktop)` and enter `http://localhost`.
- Select **Register**
- Select **API permissions** > **Add a permission**
  - Select **Microsoft Graph** > **Delegate permissions**
    - Search for each of the permissions and check the box next to each permission you want to allow.
    - Start with at least `User.Read.All` to be able to query users in your tenant (you can add more permissions later).
      - The agent will only be able to perform the actions based on the permissions you grant it.
    - Select **Add permissions**
- Select **Grant admin consent for [your organization]**
- Select **Yes** to confirm

In Claude desktop or VS Code you will need to provide the tenant ID and client ID of the application you just created.

The `USE_INTERACTIVE` needs to be set to `true` when using a custom app for interactive auth.

```json
{
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "TENANT_ID": "<tenant-id>",
        "CLIENT_ID": "<client-id>",
        "USE_INTERACTIVE": "true"
      }
    }
  }
```

## Guest (B2B) access to other tenants

If your account is a guest (B2B collaboration) in another Microsoft Entra tenant, you can query that tenant directly from the same session — no need to sign out or restart Lokka.

The `Lokka-Microsoft` tool accepts an optional `tenantId` parameter. Ask the agent something like:

> *"Get `/organization` from tenant `contoso.onmicrosoft.com` where I'm a guest."*

Lokka will request a token scoped to that tenant for your user account. Depending on your browser session and SSO state, an additional sign-in prompt may appear the first time you target a new tenant — this is the standard cross-tenant authentication flow and is expected.
