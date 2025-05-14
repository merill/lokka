[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/merill-lokka-badge.png)](https://mseep.ai/app/merill-lokka)

# Lokka

[![npm version](https://badge.fury.io/js/@merill%2Flokka.svg)](https://badge.fury.io/js/@merill%2Flokka)

Lokka is a model-context-protocol server for the Microsoft Graph and Azure RM APIs that allows you to query and managing your Azure and Microsoft 365 tenants with AI.

<img src="https://github.com/merill/lokka/blob/main/assets/lokka-demo-1.gif?raw=true" alt="Lokka Demo - user create demo" width="500"/>

Please see [Lokka.dev](https://lokka.dev) for how to use Lokka with your favorite AI model and chat client.

Lokka lets you use Claude Desktop, or any MCP Client, to use natural language to accomplish things in your Azure and Microsoft 365 tenant through the Microsoft APIs.

e.g.:

- `Create a new security group called 'Sales and HR' with a dynamic rule based on the department attribute.` 
- `Find all the conditional access policies that haven't excluded the emergency access account`
- `Show me all the Intune device configuration policies assigned to the 'Call center' group`
- `What was the most expensive service in Azure last month?`

![How does Lokka work?](https://github.com/merill/lokka/blob/main/website/docs/assets/how-does-lokka-mcp-server-work.png?raw=true)

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

### Environment Variables

The configuration of the server is done using environment variables. The following environment variables are required:

| Name | Description |
|------|-------------|
| `TENANT_ID` | The ID of the Microsoft Entra tenant. |
| `CLIENT_ID` | The ID of the application registered in Microsoft Entra. |
| `CLIENT_SECRET` | The client secret of the application registered in Microsoft Entra. |

## Installation

To use this server with the Claude Desktop app, add the following configuration to the "mcpServers" section of your
`claude_desktop_config.json`:

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
