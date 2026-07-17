import { AccessToken, TokenCredential, ClientSecretCredential, ClientCertificateCredential, InteractiveBrowserCredential, DeviceCodeCredential, DeviceCodeInfo } from "@azure/identity";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { LokkaClientId, LokkaDefaultTenantId, LokkaDefaultRedirectUri } from "./constants.js";

// Constants
const ONE_HOUR_IN_MS = 60 * 60 * 1000; // One hour in milliseconds

// Helper function to parse JWT and extract scopes
function parseJwtScopes(token: string): string[] {
  try {
    // Decode JWT without verifying signature (we trust the token from Azure Identity)
    const decoded = jwt.decode(token) as any;
    
    if (!decoded || typeof decoded !== 'object') {
      logger.info("Failed to decode JWT token");
      return [];
    }

    // Extract scopes from the 'scp' claim (space-separated string)
    const scopesString = decoded.scp;
    if (typeof scopesString === 'string') {
      return scopesString.split(' ').filter(scope => scope.length > 0);
    }

    // Some tokens might have roles instead of scopes
    const roles = decoded.roles;
    if (Array.isArray(roles)) {
      return roles;
    }

    logger.info("No scopes found in JWT token");
    return [];
  } catch (error) {
    logger.error("Error parsing JWT token for scopes", error);
    return [];
  }
}

// Simple authentication provider that works with Azure Identity TokenCredential
export class TokenCredentialAuthProvider implements AuthenticationProvider {
  private credential: TokenCredential;

  constructor(credential: TokenCredential) {
    this.credential = credential;
  }

  async getAccessToken(): Promise<string> {
    const token = await this.credential.getToken("https://graph.microsoft.com/.default");
    if (!token) {
      throw new Error("Failed to acquire access token");
    }
    return token.token;
  }
}

export interface TokenBasedCredential extends TokenCredential {
  getToken(scopes: string | string[]): Promise<AccessToken | null>;
}

export class ClientProvidedTokenCredential implements TokenBasedCredential {
  private accessToken: string | undefined;
  private expiresOn: Date | undefined;
  constructor(accessToken?: string, expiresOn?: Date) {
    if (accessToken) {
      this.accessToken = accessToken;
      this.expiresOn = expiresOn || new Date(Date.now() + ONE_HOUR_IN_MS); // Default 1 hour
    } else {
      this.expiresOn = new Date(0); // Set to epoch to indicate no valid token
    }
  }
  async getToken(scopes: string | string[]): Promise<AccessToken | null> {
    if (!this.accessToken || !this.expiresOn || this.expiresOn <= new Date()) {
      logger.error("Access token is not available or has expired");
      return null;
    }

    return {
      token: this.accessToken,
      expiresOnTimestamp: this.expiresOn.getTime()
    };
  }  updateToken(accessToken: string, expiresOn?: Date): void {
    this.accessToken = accessToken;
    this.expiresOn = expiresOn || new Date(Date.now() + ONE_HOUR_IN_MS);
    logger.info("Access token updated successfully");
  }
  isExpired(): boolean {
    return !this.expiresOn || this.expiresOn <= new Date();
  }

  getExpirationTime(): Date {
    return this.expiresOn || new Date(0);
  }

  // Getter for access token (for internal use by AuthManager)
  getAccessToken(): string | undefined {
    return this.accessToken;
  }
}

export enum AuthMode {
  ClientCredentials = "client_credentials",
  ClientProvidedToken = "client_provided_token", 
  Interactive = "interactive",
  Certificate = "certificate"
}

export interface AuthConfig {
  mode: AuthMode;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  expiresOn?: Date;
  redirectUri?: string;
  certificatePath?: string;
  certificatePassword?: string;
}

export class AuthManager {
  private credential: TokenCredential | null = null;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    switch (this.config.mode) {
      case AuthMode.ClientCredentials:
        if (!this.config.tenantId || !this.config.clientId || !this.config.clientSecret) {
          throw new Error("Client credentials mode requires tenantId, clientId, and clientSecret");
        }
        logger.info("Initializing Client Credentials authentication");
        this.credential = new ClientSecretCredential(
          this.config.tenantId,
          this.config.clientId,
          this.config.clientSecret
        );
        break;

      case AuthMode.ClientProvidedToken:
        logger.info("Initializing Client Provided Token authentication");
        this.credential = new ClientProvidedTokenCredential(
          this.config.accessToken,
          this.config.expiresOn
        );
        break;
        
      case AuthMode.Certificate:
        if (!this.config.tenantId || !this.config.clientId || !this.config.certificatePath) {
          throw new Error("Certificate mode requires tenantId, clientId, and certificatePath");
        }
        logger.info("Initializing Certificate authentication");
        this.credential = new ClientCertificateCredential(this.config.tenantId, this.config.clientId, {
          certificatePath: this.config.certificatePath,
          certificatePassword: this.config.certificatePassword
        });
        break;

      case AuthMode.Interactive:
        // Use defaults if not provided
        const tenantId = this.config.tenantId || LokkaDefaultTenantId;
        const clientId = this.config.clientId || LokkaClientId;
        
        logger.info(`Initializing Interactive authentication with tenant ID: ${tenantId}, client ID: ${clientId}`);
        
        try {
          // Try Interactive Browser first
          this.credential = new InteractiveBrowserCredential({
            tenantId: tenantId,
            clientId: clientId,
            redirectUri: this.config.redirectUri || LokkaDefaultRedirectUri,
          });
        } catch (error) {
          // Fallback to Device Code flow
          logger.info("Interactive browser failed, falling back to device code flow");
          this.credential = new DeviceCodeCredential({
            tenantId: tenantId,
            clientId: clientId,
            userPromptCallback: (info: DeviceCodeInfo) => {
              logger.info(`Device code authentication required. Visit: ${info.verificationUri} and enter code: ${info.userCode}`);
              return Promise.resolve();
            },
          });
        }
        break;

      default:
        throw new Error(`Unsupported authentication mode: ${this.config.mode}`);
    }

    // Test the credential
    await this.testCredential();
  }

  updateAccessToken(accessToken: string, expiresOn?: Date): void {
    if (this.config.mode === AuthMode.ClientProvidedToken && this.credential instanceof ClientProvidedTokenCredential) {
      this.credential.updateToken(accessToken, expiresOn);
    } else {
      throw new Error("Token update only supported in client provided token mode");
    }
  }
  private async testCredential(): Promise<void> {
    if (!this.credential) {
      throw new Error("Credential not initialized");
    }

    // Skip testing if ClientProvidedToken mode has no initial token
    if (this.config.mode === AuthMode.ClientProvidedToken && !this.config.accessToken) {
      logger.info("Skipping initial credential test as no token was provided at startup.");
      return;
    }

    try {
      const token = await this.credential.getToken("https://graph.microsoft.com/.default");
      if (!token) {
        throw new Error("Failed to acquire token");
      }
      logger.info("Authentication successful");
    } catch (error) {
      logger.error("Authentication test failed", error);
      throw error;
    }
  }
  getGraphAuthProvider(): TokenCredentialAuthProvider {
    if (!this.credential) {
      throw new Error("Authentication not initialized");
    }

    return new TokenCredentialAuthProvider(this.credential);
  }

  getAzureCredential(): TokenCredential {
    if (!this.credential) {
      throw new Error("Authentication not initialized");
    }
    return this.credential;
  }

  getAuthMode(): AuthMode {
    return this.config.mode;
  }

  isClientCredentials(): boolean {
    return this.config.mode === AuthMode.ClientCredentials;
  }

  isClientProvidedToken(): boolean {
    return this.config.mode === AuthMode.ClientProvidedToken;
  }

  isInteractive(): boolean {
    return this.config.mode === AuthMode.Interactive;
  }

  async getTokenStatus(): Promise<{ isExpired: boolean; expiresOn?: Date; scopes?: string[] }> {
    if (this.credential instanceof ClientProvidedTokenCredential) {
      const tokenStatus = {
        isExpired: this.credential.isExpired(),
        expiresOn: this.credential.getExpirationTime()
      };

      // If we have a valid token, parse it to extract scopes
      if (!tokenStatus.isExpired) {
        const accessToken = this.credential.getAccessToken();
        if (accessToken) {
          try {
            const scopes = parseJwtScopes(accessToken);
            return {
              ...tokenStatus,
              scopes: scopes
            };
          } catch (error) {
            logger.error("Error parsing token scopes in getTokenStatus", error);
            return tokenStatus;
          }
        }
      }

      return tokenStatus;
    } else if (this.credential) {
      // For other credential types, try to get a fresh token and parse it
      try {
        const accessToken = await this.credential.getToken("https://graph.microsoft.com/.default");
        if (accessToken && accessToken.token) {
          const scopes = parseJwtScopes(accessToken.token);
          return {
            isExpired: false,
            expiresOn: new Date(accessToken.expiresOnTimestamp),
            scopes: scopes
          };
        }
      } catch (error) {
        logger.error("Error getting token for scope parsing", error);
      }
    }
    
    return { isExpired: false };
  }
}
