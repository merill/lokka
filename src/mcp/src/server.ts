#!/usr/bin/env node
import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Client } from '@microsoft/microsoft-graph-client';
import fetch from 'isomorphic-fetch';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AuthManager, AuthConfig, AuthMode } from './auth.js';
import { EliGraphDefaultClientId, EliGraphDefaultTenantId, EliGraphDefaultRedirectUri } from './constants.js';
import { createEliGraphServer, EliGraphContext } from './app.js';
import { logger } from './logger.js';

(global as any).fetch = fetch;

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

interface Session {
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, Session>();

async function createAuthContext(bearerToken?: string): Promise<EliGraphContext> {
  const ctx: EliGraphContext = { authManager: null, graphClient: null };

  let authConfig: AuthConfig;

  if (bearerToken) {
    // Delegated mode: token provided by the MCP client (Claude.ai OBO flow)
    authConfig = {
      mode: AuthMode.ClientProvidedToken,
      accessToken: bearerToken,
    };
  } else {
    // Fallback: use env var config for local dev/testing
    const useCertificate = process.env.USE_CERTIFICATE === 'true';
    const useInteractive = process.env.USE_INTERACTIVE === 'true';
    const useClientToken = process.env.USE_CLIENT_TOKEN === 'true';
    const initialAccessToken = process.env.ACCESS_TOKEN;

    let authMode: AuthMode;

    if (useClientToken) {
      authMode = AuthMode.ClientProvidedToken;
    } else if (useInteractive) {
      authMode = AuthMode.Interactive;
    } else if (useCertificate) {
      authMode = AuthMode.Certificate;
    } else if (process.env.TENANT_ID && process.env.CLIENT_ID && process.env.CLIENT_SECRET) {
      authMode = AuthMode.ClientCredentials;
    } else {
      authMode = AuthMode.Interactive;
    }

    const tenantId = authMode === AuthMode.Interactive
      ? (process.env.TENANT_ID || EliGraphDefaultTenantId)
      : process.env.TENANT_ID;
    const clientId = authMode === AuthMode.Interactive
      ? (process.env.CLIENT_ID || EliGraphDefaultClientId)
      : process.env.CLIENT_ID;

    authConfig = {
      mode: authMode,
      tenantId,
      clientId,
      clientSecret: process.env.CLIENT_SECRET,
      accessToken: initialAccessToken,
      redirectUri: process.env.REDIRECT_URI || EliGraphDefaultRedirectUri,
      certificatePath: process.env.CERTIFICATE_PATH,
      certificatePassword: process.env.CERTIFICATE_PASSWORD,
    };
  }

  ctx.authManager = new AuthManager(authConfig);

  if (authConfig.mode !== AuthMode.ClientProvidedToken || authConfig.accessToken) {
    await ctx.authManager.initialize();
    const authProvider = ctx.authManager.getGraphAuthProvider();
    ctx.graphClient = Client.initWithMiddleware({ authProvider });
  }

  return ctx;
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

app.all('/mcp', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Route to existing session
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        res.status(404).json({ error: `Session ${sessionId} not found or expired` });
        return;
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session: only POST allowed
    if (req.method !== 'POST') {
      res.status(400).json({ error: 'New connections require a POST request' });
      return;
    }

    // Extract delegated token from Authorization header (Claude.ai OBO flow)
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });

    transport.onclose = () => {
      sessions.delete(newSessionId);
      logger.info(`MCP session closed: ${newSessionId}`);
    };

    const ctx = await createAuthContext(bearerToken);
    const server = createEliGraphServer(ctx);
    await server.connect(transport);

    sessions.set(newSessionId, { transport });
    logger.info(`New MCP session created: ${newSessionId}`);

    await transport.handleRequest(req, res, req.body);

  } catch (error: any) {
    logger.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.listen(PORT, () => {
  logger.info(`EliGraph HTTP server listening on port ${PORT}`);
  console.log(`EliGraph MCP Server running`);
  console.log(`  Health : http://localhost:${PORT}/health`);
  console.log(`  MCP    : http://localhost:${PORT}/mcp`);
});
