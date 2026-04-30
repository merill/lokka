---
title: 📦 App-only auth
sidebar_position: 3
slug: /install-advanced/app-only-auth
---

This authentication method uses the client credentials flow to authenticate the agent with Microsoft Graph API.

You can use either certificate (recommended) or client secret authentication with the following configuration. In both instances, you need to create a Microsoft Entra application and grant it the necessary permissions.

:::warning TENANT_ID must be a specific tenant
The Microsoft identity platform does **not** support `common` or `organizations` as `TENANT_ID` values for app-only (client credentials) authentication. You must provide a specific tenant GUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) or a verified domain (e.g. `contoso.onmicrosoft.com`). Lokka will refuse to start with `common`/`organizations` in app-only mode.
:::

## Create an Entra app for App-Only auth with Lokka

- Open [Entra admin center](https://entra.microsoft.com) > **Identity** > **Applications** > **App registrations**
  - Tip: [enappreg.cmd.ms](https://enappreg.cmd.ms) is a shortcut to the App registrations page.
- Select **New registration**
- Enter a name for the application (e.g. `Lokka`)
- Select **Register**
- Select **API permissions** > **Add a permission**
  - Select **Microsoft Graph** > **Application permissions**
    - Search for each of the permissions and check the box next to each permission you want to allow.
      - The agent will only be able to perform the actions based on the permissions you grant it.
    - Select **Add permissions**
- Select **Grant admin consent for [your organization]**
- Select **Yes** to confirm

## Option 1: App-Only Auth with Certificate (recommended for app-only auth)

Once the app is created and you've added a certificate you can configure the cert's location as shown below.

```json
{
  "Lokka-Microsoft": {
    "command": "npx",
    "args": ["-y", "@merill/lokka"],
    "env": {
      "TENANT_ID": "<tenant-id>",
      "CLIENT_ID": "<client-id>",
      "CERTIFICATE_PATH": "/path/to/certificate.pem",
      "CERTIFICATE_PASSWORD": "<optional-certificate-password>",
      "USE_CERTIFICATE": "true"
    }
  }
}
```

Tip: Use the command below to convert a PFX client certificate to a PEM-encoded certificate.

```bash
openssl pkcs12 -in /path/to/cert.pfx -out /path/to/cert.pem -nodes -clcerts
```

## Option 2: App-Only Auth with Client Secret

### Create a client secret

- In the Entra protal navigate to the app you created earlier
- Select **Certificates & secrets** > **Client secrets** > **New client secret**
- Enter a description for the secret (e.g. `Agent Config`)
- Select **Add**
- Copy the value of the secret, we will use this value in the agent configuration file.

You can now configure Lokka in VSCode, Claude using the config below.

```json
{
  "Lokka-Microsoft": {
    "command": "npx",
    "args": ["-y", "@merill/lokka"],
    "env": {
      "TENANT_ID": "<tenant-id>",
      "CLIENT_ID": "<client-id>",
      "CLIENT_SECRET": "<client-secret>"
    }
  }
}
```

## Querying multiple tenants in a single session

If your Entra application is registered as **multi-tenant** (`Accounts in any organizational directory`) and admin consent has been granted in several tenants, Lokka can query each of them in the same session — no restart required.

The `Lokka-Microsoft` tool exposes an optional `tenantId` parameter. When provided, the request acquires an access token for that specific tenant instead of the default `TENANT_ID`. Just ask the agent in plain language:

> *"Get `/organization` from tenant `contoso.onmicrosoft.com`, then from tenant `fabrikam.onmicrosoft.com`."*

The agent will pass `tenantId` per call and Lokka transparently obtains a token scoped to each target tenant.

**Requirements:**
- The Entra app must be registered as multi-tenant.
- Admin consent must be granted in every target tenant.
- `TENANT_ID` (the default) must still be a specific tenant GUID/domain — it is the home tenant used when no `tenantId` override is provided.
