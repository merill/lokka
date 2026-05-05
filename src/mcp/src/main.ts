#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@microsoft/microsoft-graph-client";
import fetch from 'isomorphic-fetch';
import { logger } from "./logger.js";
import { AuthManager, AuthConfig, AuthMode } from "./auth.js";
import { EliGraphDefaultClientId, EliGraphDefaultTenantId } from "./constants.js";
import { createEliGraphServer, EliGraphContext } from "./app.js";

(global as any).fetch = fetch;

async function main() {
  const useCertificate = process.env.USE_CERTIFICATE === 'true';
  const useInteractive = process.env.USE_INTERACTIVE === 'true';
  const useClientToken = process.env.USE_CLIENT_TOKEN === 'true';
  const initialAccessToken = process.env.ACCESS_TOKEN;

  let authMode: AuthMode;

  const enabledModes = [useClientToken, useInteractive, useCertificate].filter(Boolean);
  if (enabledModes.length > 1) {
    throw new Error("Multiple authentication modes enabled. Please enable only one of USE_CLIENT_TOKEN, USE_INTERACTIVE, or USE_CERTIFICATE.");
  }

  if (useClientToken) {
    authMode = AuthMode.ClientProvidedToken;
    if (!initialAccessToken) {
      logger.info("Client token mode enabled but no initial token provided. Token must be set via set-access-token tool.");
    }
  } else if (useInteractive) {
    authMode = AuthMode.Interactive;
  } else if (useCertificate) {
    authMode = AuthMode.Certificate;
  } else {
    const hasClientCredentials = process.env.TENANT_ID && process.env.CLIENT_ID && process.env.CLIENT_SECRET;
    if (hasClientCredentials) {
      authMode = AuthMode.ClientCredentials;
    } else {
      authMode = AuthMode.Interactive;
      logger.info("No authentication mode specified and no client credentials found. Defaulting to interactive mode.");
    }
  }

  logger.info(`Starting EliGraph MCP Server (stdio) with authentication mode: ${authMode}`);

  let tenantId: string | undefined;
  let clientId: string | undefined;

  if (authMode === AuthMode.Interactive) {
    tenantId = process.env.TENANT_ID || EliGraphDefaultTenantId;
    clientId = process.env.CLIENT_ID || EliGraphDefaultClientId;
    logger.info(`Interactive mode using tenant ID: ${tenantId}, client ID: ${clientId}`);
  } else {
    tenantId = process.env.TENANT_ID;
    clientId = process.env.CLIENT_ID;
  }

  const clientSecret = process.env.CLIENT_SECRET;
  const certificatePath = process.env.CERTIFICATE_PATH;
  const certificatePassword = process.env.CERTIFICATE_PASSWORD;

  if (authMode === AuthMode.ClientCredentials) {
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("Client credentials mode requires TENANT_ID, CLIENT_ID, and CLIENT_SECRET environment variables");
    }
  } else if (authMode === AuthMode.Certificate) {
    if (!tenantId || !clientId || !certificatePath) {
      throw new Error("Certificate mode requires TENANT_ID, CLIENT_ID, and CERTIFICATE_PATH environment variables");
    }
  }

  const authConfig: AuthConfig = {
    mode: authMode,
    tenantId,
    clientId,
    clientSecret,
    accessToken: initialAccessToken,
    redirectUri: process.env.REDIRECT_URI,
    certificatePath,
    certificatePassword,
  };

  const ctx: EliGraphContext = { authManager: null, graphClient: null };
  ctx.authManager = new AuthManager(authConfig);

  if (authMode !== AuthMode.ClientProvidedToken || initialAccessToken) {
    await ctx.authManager.initialize();
    const authProvider = ctx.authManager.getGraphAuthProvider();
    ctx.graphClient = Client.initWithMiddleware({ authProvider });
    logger.info(`Authentication initialized successfully using ${authMode} mode`);
  } else {
    logger.info("Started in client token mode. Use set-access-token tool to provide authentication token.");
  }

  const server = createEliGraphServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
