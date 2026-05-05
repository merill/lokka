import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client, PageIterator, PageCollection } from "@microsoft/microsoft-graph-client";
import { AuthManager, AuthConfig, AuthMode } from "./auth.js";
import { EliGraphDefaultClientId, EliGraphDefaultTenantId, EliGraphDefaultRedirectUri, getDefaultGraphApiVersion } from "./constants.js";
import { logger } from "./logger.js";

export interface EliGraphContext {
  authManager: AuthManager | null;
  graphClient: Client | null;
}

export function createEliGraphServer(ctx: EliGraphContext): McpServer {
  const useGraphBeta = process.env.USE_GRAPH_BETA !== 'false';
  const defaultGraphApiVersion = getDefaultGraphApiVersion();

  const server = new McpServer({
    name: "EliGraph",
    version: "1.0.0",
  });

  logger.info(`Graph API default version: ${defaultGraphApiVersion} (USE_GRAPH_BETA=${process.env.USE_GRAPH_BETA || 'undefined'})`);

  server.tool(
    "EliGraph",
    "A versatile tool to interact with Microsoft APIs including Microsoft Graph (Entra) and Azure Resource Management. IMPORTANT: For Graph API GET requests using advanced query parameters ($filter, $count, $search, $orderby), you are ADVISED to set 'consistencyLevel: \"eventual\"'.",
    {
      apiType: z.enum(["graph", "azure"]).describe("Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra) or 'azure' for Azure Resource Management."),
      path: z.string().describe("The Azure or Graph API URL path to call (e.g. '/users', '/groups', '/subscriptions')"),
      method: z.enum(["get", "post", "put", "patch", "delete"]).describe("HTTP method to use"),
      apiVersion: z.string().optional().describe("Azure Resource Management API version (required for apiType Azure)"),
      subscriptionId: z.string().optional().describe("Azure Subscription ID (for Azure Resource Management)."),
      queryParams: z.record(z.string()).optional().describe("Query parameters for the request"),
      body: z.record(z.string(), z.any()).optional().describe("The request body (for POST, PUT, PATCH)"),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional().default(defaultGraphApiVersion as "v1.0" | "beta").describe(`Microsoft Graph API version to use (default: ${defaultGraphApiVersion})`),
      fetchAll: z.boolean().optional().default(false).describe("Set to true to automatically fetch all pages for list results (e.g., users, groups). Default is false."),
      consistencyLevel: z.string().optional().describe("Graph API ConsistencyLevel header. ADVISED to be set to 'eventual' for Graph GET requests using advanced query parameters ($filter, $count, $search, $orderby)."),
    },
    async ({
      apiType,
      path,
      method,
      apiVersion,
      subscriptionId,
      queryParams,
      body,
      graphApiVersion,
      fetchAll,
      consistencyLevel
    }: {
      apiType: "graph" | "azure";
      path: string;
      method: "get" | "post" | "put" | "patch" | "delete";
      apiVersion?: string;
      subscriptionId?: string;
      queryParams?: Record<string, string>;
      body?: any;
      graphApiVersion: "v1.0" | "beta";
      fetchAll: boolean;
      consistencyLevel?: string;
    }) => {
      const effectiveGraphApiVersion = !useGraphBeta ? "v1.0" : graphApiVersion;

      logger.info(`Executing EliGraph tool: apiType=${apiType}, path=${path}, method=${method}, graphApiVersion=${effectiveGraphApiVersion}, fetchAll=${fetchAll}, consistencyLevel=${consistencyLevel}`);
      let determinedUrl: string | undefined;

      try {
        let responseData: any;

        if (apiType === 'graph') {
          if (!ctx.graphClient) {
            throw new Error("Graph client not initialized");
          }
          determinedUrl = `https://graph.microsoft.com/${effectiveGraphApiVersion}`;

          let request = ctx.graphClient.api(path).version(effectiveGraphApiVersion);

          if (queryParams && Object.keys(queryParams).length > 0) {
            request = request.query(queryParams);
          }

          if (consistencyLevel) {
            request = request.header('ConsistencyLevel', consistencyLevel);
            logger.info(`Added ConsistencyLevel header: ${consistencyLevel}`);
          }

          switch (method.toLowerCase()) {
            case 'get':
              if (fetchAll) {
                logger.info(`Fetching all pages for Graph path: ${path}`);
                const firstPageResponse: PageCollection = await request.get();
                const odataContext = firstPageResponse['@odata.context'];
                let allItems: any[] = firstPageResponse.value || [];

                const callback = (item: any) => {
                  allItems.push(item);
                  return true;
                };

                const pageIterator = new PageIterator(ctx.graphClient!, firstPageResponse, callback);
                await pageIterator.iterate();

                responseData = { '@odata.context': odataContext, value: allItems };
                logger.info(`Finished fetching all Graph pages. Total items: ${allItems.length}`);
              } else {
                logger.info(`Fetching single page for Graph path: ${path}`);
                responseData = await request.get();
              }
              break;
            case 'post':
              responseData = await request.post(body ?? {});
              break;
            case 'put':
              responseData = await request.put(body ?? {});
              break;
            case 'patch':
              responseData = await request.patch(body ?? {});
              break;
            case 'delete':
              responseData = await request.delete();
              if (responseData === undefined || responseData === null) {
                responseData = { status: "Success (No Content)" };
              }
              break;
            default:
              throw new Error(`Unsupported method: ${method}`);
          }

        } else {
          if (!ctx.authManager) {
            throw new Error("Auth manager not initialized");
          }
          determinedUrl = "https://management.azure.com";

          const azureCredential = ctx.authManager.getAzureCredential();
          const tokenResponse = await azureCredential.getToken("https://management.azure.com/.default");
          if (!tokenResponse || !tokenResponse.token) {
            throw new Error("Failed to acquire Azure access token");
          }

          let url = determinedUrl;
          if (subscriptionId) {
            url += `/subscriptions/${subscriptionId}`;
          }
          url += path;

          if (!apiVersion) {
            throw new Error("API version is required for Azure Resource Management queries");
          }
          const urlParams = new URLSearchParams({ 'api-version': apiVersion });
          if (queryParams) {
            for (const [key, value] of Object.entries(queryParams)) {
              urlParams.append(String(key), String(value));
            }
          }
          url += `?${urlParams.toString()}`;

          const headers: Record<string, string> = {
            'Authorization': `Bearer ${tokenResponse.token}`,
            'Content-Type': 'application/json',
          };
          const requestOptions: RequestInit = {
            method: method.toUpperCase(),
            headers,
          };
          if (["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
            requestOptions.body = body ? JSON.stringify(body) : JSON.stringify({});
          }

          if (fetchAll && method === 'get') {
            logger.info(`Fetching all pages for Azure RM starting from: ${url}`);
            let allValues: any[] = [];
            let currentUrl: string | null = url;

            while (currentUrl) {
              logger.info(`Fetching Azure RM page: ${currentUrl}`);
              const pageTokenResponse = await ctx.authManager!.getAzureCredential().getToken("https://management.azure.com/.default");
              if (!pageTokenResponse || !pageTokenResponse.token) {
                throw new Error("Failed to acquire Azure access token during pagination");
              }
              const pageOptions: RequestInit = {
                method: 'GET',
                headers: { ...headers, 'Authorization': `Bearer ${pageTokenResponse.token}` },
              };

              const pageResponse = await fetch(currentUrl, pageOptions);
              const pageText = await pageResponse.text();
              let pageData: any;
              try {
                pageData = pageText ? JSON.parse(pageText) : {};
              } catch (_e) {
                logger.error(`Failed to parse JSON from Azure RM page: ${currentUrl}`, pageText);
                pageData = { rawResponse: pageText };
              }

              if (!pageResponse.ok) {
                logger.error(`API error on Azure RM page ${currentUrl}:`, pageData);
                throw new Error(`API error (${pageResponse.status}) during Azure RM pagination on ${currentUrl}: ${JSON.stringify(pageData)}`);
              }

              if (pageData.value && Array.isArray(pageData.value)) {
                allValues = allValues.concat(pageData.value);
              } else if (currentUrl === url && !pageData.nextLink) {
                allValues.push(pageData);
              } else if (currentUrl !== url) {
                logger.info(`[Warning] Azure RM response from ${currentUrl} did not contain a 'value' array.`);
              }
              currentUrl = pageData.nextLink || null;
            }
            responseData = { allValues };
            logger.info(`Finished fetching all Azure RM pages. Total items: ${allValues.length}`);

          } else {
            logger.info(`Fetching single page for Azure RM: ${url}`);
            const apiResponse = await fetch(url, requestOptions);
            const responseText = await apiResponse.text();
            try {
              responseData = responseText ? JSON.parse(responseText) : {};
            } catch (_e) {
              logger.error(`Failed to parse JSON from single Azure RM page: ${url}`, responseText);
              responseData = { rawResponse: responseText };
            }
            if (!apiResponse.ok) {
              logger.error(`API error for Azure RM ${method} ${path}:`, responseData);
              throw new Error(`API error (${apiResponse.status}) for Azure RM: ${JSON.stringify(responseData)}`);
            }
          }
        }

        let resultText = `Result for ${apiType} API (${apiType === 'graph' ? effectiveGraphApiVersion : apiVersion}) - ${method} ${path}:\n\n`;
        resultText += JSON.stringify(responseData, null, 2);

        if (!fetchAll && method === 'get') {
          const nextLinkKey = apiType === 'graph' ? '@odata.nextLink' : 'nextLink';
          if (responseData && responseData[nextLinkKey]) {
            resultText += `\n\nNote: More results are available. To retrieve all pages, add the parameter 'fetchAll: true' to your request.`;
          }
        }

        return { content: [{ type: "text" as const, text: resultText }] };

      } catch (error: any) {
        logger.error(`Error in EliGraph tool (apiType: ${apiType}, path: ${path}, method: ${method}):`, error);
        if (!determinedUrl) {
          determinedUrl = apiType === 'graph'
            ? `https://graph.microsoft.com/${effectiveGraphApiVersion}`
            : "https://management.azure.com";
        }
        const errorBody = error.body
          ? (typeof error.body === 'string' ? error.body : JSON.stringify(error.body))
          : 'N/A';
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              statusCode: error.statusCode || 'N/A',
              errorBody,
              attemptedBaseUrl: determinedUrl,
            }),
          }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "set-access-token",
    "Set or update the access token for Microsoft Graph authentication. Use this when the MCP Client has obtained a fresh token through interactive authentication.",
    {
      accessToken: z.string().describe("The access token obtained from Microsoft Graph authentication"),
      expiresOn: z.string().optional().describe("Token expiration time in ISO format (optional, defaults to 1 hour from now)"),
    },
    async ({ accessToken, expiresOn }) => {
      try {
        const expirationDate = expiresOn ? new Date(expiresOn) : undefined;

        if (ctx.authManager?.getAuthMode() === AuthMode.ClientProvidedToken) {
          ctx.authManager.updateAccessToken(accessToken, expirationDate);
          const authProvider = ctx.authManager.getGraphAuthProvider();
          ctx.graphClient = Client.initWithMiddleware({ authProvider });

          return {
            content: [{ type: "text" as const, text: "Access token updated successfully. You can now make Microsoft Graph requests on behalf of the authenticated user." }],
          };
        } else {
          return {
            content: [{ type: "text" as const, text: "Error: MCP Server is not configured for client-provided token authentication. Set USE_CLIENT_TOKEN=true in environment variables." }],
            isError: true,
          };
        }
      } catch (error: any) {
        logger.error("Error setting access token:", error);
        return {
          content: [{ type: "text" as const, text: `Error setting access token: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get-auth-status",
    "Check the current authentication status and mode of the MCP Server and also returns the current graph permission scopes of the access token for the current session.",
    {},
    async () => {
      try {
        const authMode = ctx.authManager?.getAuthMode() || "Not initialized";
        const isReady = ctx.authManager !== null;
        const tokenStatus = ctx.authManager ? await ctx.authManager.getTokenStatus() : { isExpired: false };

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ authMode, isReady, supportsTokenUpdates: authMode === AuthMode.ClientProvidedToken, tokenStatus, timestamp: new Date().toISOString() }, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `Error checking auth status: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "add-graph-permission",
    "Request additional Microsoft Graph permission scopes by performing a fresh interactive sign-in. This tool only works in interactive authentication mode and should be used if any Graph API call returns permissions related errors.",
    {
      scopes: z.array(z.string()).describe("Array of Microsoft Graph permission scopes to request (e.g., ['User.Read', 'Mail.ReadWrite', 'Directory.Read.All'])"),
    },
    async ({ scopes }) => {
      try {
        if (!ctx.authManager || ctx.authManager.getAuthMode() !== AuthMode.Interactive) {
          const currentMode = ctx.authManager?.getAuthMode() || "Not initialized";
          const clientId = process.env.CLIENT_ID;

          let errorMessage = `Error: add-graph-permission tool is only available in interactive authentication mode. Current mode: ${currentMode}.\n\n`;

          if (currentMode === AuthMode.ClientCredentials) {
            errorMessage += `To add permissions in Client Credentials mode:\n`;
            errorMessage += `1. Open the Microsoft Entra admin center (https://entra.microsoft.com)\n`;
            errorMessage += `2. Navigate to Applications > App registrations\n`;
            errorMessage += `3. Find your application${clientId ? ` (Client ID: ${clientId})` : ''}\n`;
            errorMessage += `4. Go to API permissions\n`;
            errorMessage += `5. Click "Add a permission" and select Microsoft Graph\n`;
            errorMessage += `6. Choose "Application permissions" and add the required scopes:\n`;
            errorMessage += `   ${scopes.map(s => `• ${s}`).join('\n   ')}\n`;
            errorMessage += `7. Click "Grant admin consent" to approve the permissions\n`;
            errorMessage += `8. Restart the MCP server to use the new permissions`;
          } else if (currentMode === AuthMode.ClientProvidedToken) {
            errorMessage += `To add permissions in Client Provided Token mode:\n`;
            errorMessage += `1. Obtain a new access token that includes the required scopes:\n`;
            errorMessage += `   ${scopes.map(s => `• ${s}`).join('\n   ')}\n`;
            errorMessage += `2. Use the set-access-token tool to update the server with the new token`;
          } else {
            errorMessage += `To use interactive permission requests, set USE_INTERACTIVE=true in environment variables and restart the server.`;
          }

          return { content: [{ type: "text" as const, text: errorMessage }], isError: true };
        }

        if (!scopes || scopes.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: At least one permission scope must be specified." }], isError: true };
        }

        const invalidScopes = scopes.filter(scope => !scope.includes('.') || scope.trim() !== scope);
        if (invalidScopes.length > 0) {
          return { content: [{ type: "text" as const, text: `Error: Invalid scope format detected: ${invalidScopes.join(', ')}. Scopes should be in format like 'User.Read' or 'Mail.ReadWrite'.` }], isError: true };
        }

        logger.info(`Requesting additional Graph permissions: ${scopes.join(', ')}`);

        const tenantId = process.env.TENANT_ID || EliGraphDefaultTenantId;
        const clientId = process.env.CLIENT_ID || EliGraphDefaultClientId;
        const redirectUri = process.env.REDIRECT_URI || EliGraphDefaultRedirectUri;

        const { InteractiveBrowserCredential, DeviceCodeCredential } = await import("@azure/identity");

        ctx.authManager = null;
        ctx.graphClient = null;

        const scopeString = scopes.map(scope => `https://graph.microsoft.com/${scope}`).join(' ');
        logger.info(`Requesting fresh token with scopes: ${scopeString}`);

        console.log(`\nEliGraph — Requesting Additional Graph Permissions:`);
        console.log(`Scopes: ${scopes.join(', ')}`);
        console.log(`You will be prompted to sign in to grant these permissions.\n`);

        let newCredential;
        let tokenResponse;

        try {
          newCredential = new InteractiveBrowserCredential({ tenantId, clientId, redirectUri });
          tokenResponse = await newCredential.getToken(scopeString);
        } catch (_err) {
          logger.info("Interactive browser failed, falling back to device code flow");
          newCredential = new DeviceCodeCredential({
            tenantId,
            clientId,
            userPromptCallback: (info) => {
              console.log(`\nEliGraph — Additional Permissions Required:`);
              console.log(`Please visit: ${info.verificationUri}`);
              console.log(`And enter code: ${info.userCode}`);
              console.log(`Requested scopes: ${scopes.join(', ')}\n`);
              return Promise.resolve();
            },
          });
          tokenResponse = await newCredential.getToken(scopeString);
        }

        if (!tokenResponse) {
          return { content: [{ type: "text" as const, text: "Error: Failed to acquire access token with the requested scopes. Please check your permissions and try again." }], isError: true };
        }

        const authConfig: AuthConfig = { mode: AuthMode.Interactive, tenantId, clientId, redirectUri };
        ctx.authManager = new AuthManager(authConfig);
        (ctx.authManager as any).credential = newCredential;

        const authProvider = ctx.authManager.getGraphAuthProvider();
        ctx.graphClient = Client.initWithMiddleware({ authProvider });

        const tokenStatus = await ctx.authManager.getTokenStatus();
        logger.info(`Successfully acquired fresh token with additional scopes: ${scopes.join(', ')}`);

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ message: "Successfully acquired additional Microsoft Graph permissions with fresh authentication", requestedScopes: scopes, tokenStatus, note: "A fresh sign-in was performed to ensure the new permissions are properly granted", timestamp: new Date().toISOString() }, null, 2) }],
        };

      } catch (error: any) {
        logger.error("Error requesting additional Graph permissions:", error);
        return {
          content: [{ type: "text" as const, text: `Error requesting additional permissions: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
