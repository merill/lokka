// Shared constants for the EliGraph MCP Server

// Default interactive client — override via CLIENT_ID env var with your own app registration
export const EliGraphDefaultClientId = "a9bac4c3-af0d-4292-9453-9da89e390140";
export const EliGraphDefaultTenantId = "common";
export const EliGraphDefaultRedirectUri = "http://localhost:3000";

// Default Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== 'false' ? "beta" : "v1.0";
};
