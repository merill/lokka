# Lokka

[![npm version](https://badge.fury.io/js/@merill%2Flokka.svg)](https://badge.fury.io/js/@merill%2Flokka)

Lokka is a model-context-protocol server for the Microsoft Graph and Azure RM APIs that allows you to query and manage your Azure and Microsoft 365 tenants with AI.

<img src="https://github.com/merill/lokka/blob/main/assets/lokka-demo-1.gif?raw=true" alt="Lokka Demo - user create demo" width="500"/>

Please see [Lokka.dev](https://lokka.dev) for how to use Lokka with your favorite AI model and chat client.

Lokka lets you use Claude Desktop, or any MCP Client, to use natural language to accomplish things in your Azure and Microsoft 365 tenant through the Microsoft APIs.

e.g.:

- `Create a new security group called 'Sales and HR' with a dynamic rule based on the department attribute.` 
- `Find all the conditional access policies that haven't excluded the emergency access account`
- `Show me all the Intune device configuration policies assigned to the 'Call center' group`
- `What was the most expensive service in Azure last month?`

![How does Lokka work?](https://github.com/merill/lokka/blob/main/website/docs/assets/how-does-lokka-mcp-server-work.png?raw=true)

## Authentication Methods

Lokka now supports multiple authentication methods to accommodate different deployment scenarios:

### Interactive Auth

For user-based authentication with interactive login, you can use the following configuration:

This is the simplest config and uses the default Lokka app.

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"]
    }
  }
}
```

#### Interactive auth with custom app

If you wish to use a custom Microsoft Entra app, you can create a new app registration in Microsoft Entra and configure it with the following environment variables:

```json
{
  "mcpServers": {
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
}
```

### App-Only Auth

Traditional app-only authentication. You can use either certificate (recommended) or client secret authentication with the following configuration.

See [Install Guide](https://lokka.dev/docs/install) for more details on how to create an Entra app.

#### App-Only Auth with Certificate

App only authentication using a PEM-encoded client certificate:

```json
{
  "mcpServers": {
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
}
```

For comfort, in order to convert a PFX client certificate to a PEM-encoded certificate:

```bash
openssl pkcs12 -in /path/to/cert.pfx -out /path/to/cert.pem -nodes -clcerts
```

#### #### App-Only Auth with Client Secret

```json
{
  "mcpServers": {
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
}
```

### Client-Provided Token

Token-based authentication where the MCP Client provides access tokens:

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"],
      "env": {
        "USE_CLIENT_TOKEN": "true"
      }
    }
  }
}
```

When using client-provided token mode:

1. Start the MCP server with `USE_CLIENT_TOKEN=true`
2. Use the `set-access-token` tool to provide a valid Microsoft Graph access token
3. Use the `get-auth-status` tool to verify authentication status
4. Refresh tokens as needed using `set-access-token`

## New Tools

### Token Management Tools

- **`set-access-token`**: Set or update access tokens for Microsoft Graph authentication
- **`get-auth-status`**: Check current authentication status and capabilities
- **`add-graph-permission`**: Request additional Microsoft Graph permission scopes interactively

### Graph API Version Control

Lokka now supports controlling the default Microsoft Graph API version used for all requests:

- **Default behavior**: Uses `beta` version for access to latest features
- **Production mode**: Set `USE_GRAPH_BETA=false` to force all requests to use `v1.0` version
- **Per-request override**: You can still specify `graphApiVersion` parameter in individual requests (unless `USE_GRAPH_BETA=false`)

When `USE_GRAPH_BETA=false`, all Graph API calls will use the stable `v1.0` version, even if `beta` is explicitly requested in the `graphApiVersion` parameter.

## Getting started

See the docs for more information on how to install and configure Lokka.

- [Introduction](https://lokka.dev/)
- [Install guide](https://lokka.dev/docs/install)
- [Developer guide](https://lokka.dev/docs/developer-guide)

## Components

### Tools

1. `Lokka-Microsoft`
   - Call Microsoft Graph & Azure APIs. Supports querying Azure and Microsoft 365 tenants. Updates are also supported if permissions are provided.
   - Input:
     - `apiType` (string): Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra) or 'azure' for Azure Resource Management.
     - `path` (string): The Azure or Graph API URL path to call (e.g. '/users', '/groups', '/subscriptions').
     - `method` (string): HTTP method to use (e.g., get, post, put, patch, delete)
     - `apiVersion` (string): Azure Resource Management API version (required for apiType Azure)
     - `subscriptionId` (string): Azure Subscription ID (for Azure Resource Management).
     - `queryParams` (string): Array of query parameters like $filter, $select, etc. All parameters are strings.
     - `body` (JSON): The request body (for POST, PUT, PATCH)
   - Returns: Results from the Azure or Graph API call.

2. `set-access-token` *(New in v0.2.0)*
   - Set or update an access token for Microsoft Graph authentication when using client-provided token mode.
   - Input:
     - `accessToken` (string): The access token obtained from Microsoft Graph authentication
     - `expiresOn` (string, optional): Token expiration time in ISO format
   - Returns: Confirmation of token update

3. `get-auth-status` *(New in v0.2.0)*
   - Check the current authentication status and mode of the MCP Server
   - Returns: Authentication mode, readiness status, and capabilities

### Environment Variables

The configuration of the server is done using environment variables. The following environment variables are supported:

| Name | Description | Required |
|------|-------------|----------|
| `TENANT_ID` | The ID of the Microsoft Entra tenant. | Yes (except for client-provided token mode) |
| `CLIENT_ID` | The ID of the application registered in Microsoft Entra. | Yes (except for client-provided token mode) |
| `CLIENT_SECRET` | The client secret of the application registered in Microsoft Entra. | Yes (for client credentials mode only) |
| `USE_INTERACTIVE` | Set to "true" to enable interactive authentication mode. | No |
| `USE_CLIENT_TOKEN` | Set to "true" to enable client-provided token authentication mode. | No |
| `USE_CERTIFICATE` | Set to "true" to enable certificate authentication mode. | No |
| `CERTIFICATE_PATH` | Path to the PEM-encoded certificate file for certificate authentication. | Yes (for certificate mode only) |
| `CERTIFICATE_PASSWORD` | Password for the certificate file (if encrypted). | No |
| `REDIRECT_URI` | Redirect URI for interactive authentication (default: `http://localhost:3200`). | No |
| `ACCESS_TOKEN` | Initial access token for client-provided token mode. | No |
| `USE_GRAPH_BETA` | Set to "false" to force all Graph API calls to use v1.0 instead of beta (default: true, allows beta). | No |

## Contributors

- Interactive and Token-based Authentication (v0.2.0) - [@darrenjrobinson](https://github.com/darrenjrobinson)
- Certificate Authentication (v0.2.1) - [@nitzpo](https://github.com/nitzpo)

## Installation

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your
`claude_desktop_config.json`:

### Interactive Authentication

```json
{
  "mcpServers": {
    "Lokka-Microsoft": {
      "command": "npx",
      "args": ["-y", "@merill/lokka"]
    }
  }
}
```

### Client Credentials Authentication

```json
{
  "mcpServers": {
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
}
```

Make sure to replace `<tenant-id>`, `<client-id>`, and `<client-secret>` with the actual values from your Microsoft Entra application. (See [Install Guide](https://lokka.dev/docs/install) for more details on how to create an Entra app and configure the agent.)
