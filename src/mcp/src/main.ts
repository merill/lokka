#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ClientSecretCredential } from "@azure/identity";
import { Client, PageIterator, PageCollection } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import fetch from 'isomorphic-fetch'; // Required polyfill for Graph client
import { logger } from "./logger.js";

// Set up global fetch for the Microsoft Graph client
(global as any).fetch = fetch;

// Create server instance
const server = new McpServer({
  name: "Lokka-Microsoft",
  version: "0.1.9", // Incremented version for refactor
});

logger.info("Starting Lokka Multi-Microsoft API MCP Server (v0.1.9 - Refactored with Graph SDK)");

// Initialize Graph Client and Azure Auth Credential outside the tool function
let graphClient: Client | null = null;
let azureCredential: ClientSecretCredential | null = null; // For Azure RM calls

server.tool(
  "Lokka-Microsoft",
  "A versatile tool to interact with Microsoft APIs including Microsoft Graph (Entra) and Azure Resource Management. IMPORTANT: For Graph API GET requests using advanced query parameters ($filter, $count, $search, $orderby), you are ADVISED to set 'consistencyLevel: \"eventual\"'.",
  {
    apiType: z.enum(["graph", "azure"]).describe("Type of Microsoft API to query. Options: 'graph' for Microsoft Graph (Entra) or 'azure' for Azure Resource Management."),
    path: z.string().describe("The Azure or Graph API URL path to call (e.g. '/users', '/groups', '/subscriptions')"),
    method: z.enum(["get", "post", "put", "patch", "delete"]).describe("HTTP method to use"),
    apiVersion: z.string().optional().describe("Azure Resource Management API version (required for apiType Azure)"),
    subscriptionId: z.string().optional().describe("Azure Subscription ID (for Azure Resource Management)."),
    queryParams: z.record(z.string()).optional().describe("Query parameters for the request"),
    body: z.any().optional().describe("The request body (for POST, PUT, PATCH)"),
    graphApiVersion: z.enum(["v1.0", "beta"]).optional().default("v1.0").describe("Microsoft Graph API version to use (default: v1.0)"),
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
    logger.info(`Executing Lokka-Microsoft tool with params: apiType=${apiType}, path=${path}, method=${method}, graphApiVersion=${graphApiVersion}, fetchAll=${fetchAll}, consistencyLevel=${consistencyLevel}`);
    let determinedUrl: string | undefined;

    try {
      let responseData: any;

      // --- Microsoft Graph Logic ---
      if (apiType === 'graph') {
        if (!graphClient) {
          throw new Error("Graph client not initialized");
        }
        determinedUrl = `https://graph.microsoft.com/${graphApiVersion}`; // For error reporting

        // Construct the request using the Graph SDK client
        let request = graphClient.api(path).version(graphApiVersion);

        // Add query parameters if provided and not empty
        if (queryParams && Object.keys(queryParams).length > 0) {
          request = request.query(queryParams);
        }

        // Add ConsistencyLevel header if provided
        if (consistencyLevel) {
          request = request.header('ConsistencyLevel', consistencyLevel);
          logger.info(`Added ConsistencyLevel header: ${consistencyLevel}`);
        }

        // Handle different methods
        switch (method.toLowerCase()) {
          case 'get':
            if (fetchAll) {
              logger.info(`Fetching all pages for Graph path: ${path}`);
              // Fetch the first page to get context and initial data
              const firstPageResponse: PageCollection = await request.get();
              const odataContext = firstPageResponse['@odata.context']; // Capture context from first page
              let allItems: any[] = firstPageResponse.value || []; // Initialize with first page's items

              // Callback function to process subsequent pages
              const callback = (item: any) => {
                allItems.push(item);
                return true; // Return true to continue iteration
              };

              // Create a PageIterator starting from the first response
              const pageIterator = new PageIterator(graphClient, firstPageResponse, callback);

              // Iterate over all remaining pages
              await pageIterator.iterate();

              // Construct final response with context and combined values under 'value' key
              responseData = {
                '@odata.context': odataContext,
                value: allItems
              };
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
            responseData = await request.delete(); // Delete often returns no body or 204
            // Handle potential 204 No Content response
            if (responseData === undefined || responseData === null) {
              responseData = { status: "Success (No Content)" };
            }
            break;
          default:
            throw new Error(`Unsupported method: ${method}`);
        }
      }
      // --- Azure Resource Management Logic (using direct fetch) ---
      else { // apiType === 'azure'
        if (!azureCredential) {
          throw new Error("Azure credential not initialized");
        }
        determinedUrl = "https://management.azure.com"; // For error reporting

        // Acquire token for Azure RM
        const tokenResponse = await azureCredential.getToken("https://management.azure.com/.default");
        if (!tokenResponse || !tokenResponse.token) {
          throw new Error("Failed to acquire Azure access token");
        }

        // Construct the URL (similar to previous implementation)
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

        // Prepare request options
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json'
        };
        const requestOptions: RequestInit = {
          method: method.toUpperCase(),
          headers: headers
        };
        if (["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
          requestOptions.body = body ? JSON.stringify(body) : JSON.stringify({});
        }

        // --- Pagination Logic for Azure RM (Manual Fetch) ---
        if (fetchAll && method === 'get') {
          logger.info(`Fetching all pages for Azure RM starting from: ${url}`);
          let allValues: any[] = [];
          let currentUrl: string | null = url;

          while (currentUrl) {
            logger.info(`Fetching Azure RM page: ${currentUrl}`);
            // Re-acquire token for each page (Azure tokens might expire)
            const currentPageTokenResponse = await azureCredential.getToken("https://management.azure.com/.default");
            if (!currentPageTokenResponse || !currentPageTokenResponse.token) {
              throw new Error("Failed to acquire Azure access token during pagination");
            }
            const currentPageHeaders = { ...headers, 'Authorization': `Bearer ${currentPageTokenResponse.token}` };
            const currentPageRequestOptions: RequestInit = { method: 'GET', headers: currentPageHeaders };

            const pageResponse = await fetch(currentUrl, currentPageRequestOptions);
            const pageText = await pageResponse.text();
            let pageData: any;
            try {
              pageData = pageText ? JSON.parse(pageText) : {};
            } catch (e) {
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
            currentUrl = pageData.nextLink || null; // Azure uses nextLink
          }
          responseData = { allValues: allValues };
          logger.info(`Finished fetching all Azure RM pages. Total items: ${allValues.length}`);
        } else {
          // Single page fetch for Azure RM
          logger.info(`Fetching single page for Azure RM: ${url}`);
          const apiResponse = await fetch(url, requestOptions);
          const responseText = await apiResponse.text();
          try {
            responseData = responseText ? JSON.parse(responseText) : {};
          } catch (e) {
            logger.error(`Failed to parse JSON from single Azure RM page: ${url}`, responseText);
            responseData = { rawResponse: responseText };
          }
          if (!apiResponse.ok) {
            logger.error(`API error for Azure RM ${method} ${path}:`, responseData);
            throw new Error(`API error (${apiResponse.status}) for Azure RM: ${JSON.stringify(responseData)}`);
          }
        }
      }

      // --- Format and Return Result ---
      // For all requests, format as text
      let resultText = `Result for ${apiType} API (${apiType === 'graph' ? graphApiVersion : apiVersion}) - ${method} ${path}:\n\n`;
      resultText += JSON.stringify(responseData, null, 2); // responseData already contains the correct structure for fetchAll Graph case

      // Add pagination note if applicable (only for single page GET)
      if (!fetchAll && method === 'get') {
         const nextLinkKey = apiType === 'graph' ? '@odata.nextLink' : 'nextLink';
         if (responseData && responseData[nextLinkKey]) { // Added check for responseData existence
             resultText += `\n\nNote: More results are available. To retrieve all pages, add the parameter 'fetchAll: true' to your request.`;
         }
      }

      return {
        content: [{ type: "text" as const, text: resultText }],
      };

    } catch (error: any) {
      logger.error(`Error in Lokka-Microsoft tool (apiType: ${apiType}, path: ${path}, method: ${method}):`, error); // Added more context to error log
      // Try to determine the base URL even in case of error
      if (!determinedUrl) {
         determinedUrl = apiType === 'graph'
           ? `https://graph.microsoft.com/${graphApiVersion}`
           : "https://management.azure.com";
      }
      // Include error body if available from Graph SDK error
      const errorBody = error.body ? (typeof error.body === 'string' ? error.body : JSON.stringify(error.body)) : 'N/A';
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            statusCode: error.statusCode || 'N/A', // Include status code if available from SDK error
            errorBody: errorBody,
            attemptedBaseUrl: determinedUrl
          }),
        }],
        isError: true
      };
    }
  },
);

// Start the server with stdio transport
async function main() {
  // Check for required environment variables
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    logger.error("Missing required environment variables: TENANT_ID, CLIENT_ID, or CLIENT_SECRET");
    throw new Error("Missing required environment variables: TENANT_ID, CLIENT_ID, or CLIENT_SECRET");
  }

  // Initialize Azure Credential
  azureCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  // Initialize Graph Authentication Provider
  const authProvider = new TokenCredentialAuthenticationProvider(azureCredential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  // Initialize Graph Client
  graphClient = Client.initWithMiddleware({
    authProvider: authProvider,
  });

  logger.info("Graph Client and Azure Credential initialized successfully.");

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
