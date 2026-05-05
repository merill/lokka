# EliGraph

EliGraph est un serveur MCP (Model Context Protocol) pour administrer un tenant Microsoft 365 / Azure en langage naturel. Fork de [Lokka](https://github.com/merill/lokka) (MIT), développé par Ishak CHENNOUF (Eliadis).

Il supporte deux modes de déploiement :
- **Stdio local** — pour Claude Desktop
- **HTTP remote** — endpoint HTTPS sur VPS, compatible Claude.ai navigateur et Copilot Studio

---

## Fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Microsoft Graph (read + write) | ✅ |
| Azure Resource Management | ✅ |
| Mode stdio (Claude Desktop local) | ✅ |
| Mode HTTP remote (MCP Streamable) | ✅ Code prêt — déploiement VPS en attente |
| Logging structuré JSON (audit trail) | 🚧 Chantier 2 |
| Règles métier / garde-fous | 🚧 Chantier 3 |
| Intégration Copilot Studio | 📋 Roadmap |

---

## Authentification

EliGraph supporte plusieurs modes d'authentification via les variables d'environnement.

### Delegated (token fourni par le client MCP)

Mode principal pour Claude.ai remote. Le client fournit un access token via le tool `set-access-token`.

```env
USE_CLIENT_TOKEN=true
```

### Interactive (login navigateur / device code)

Pour le dev local et Claude Desktop.

```env
TENANT_ID=<tenant-id>
CLIENT_ID=<client-id>
USE_INTERACTIVE=true
```

### App-Only — Client Secret

```env
TENANT_ID=<tenant-id>
CLIENT_ID=<client-id>
CLIENT_SECRET=<client-secret>
```

### App-Only — Certificat

```env
TENANT_ID=<tenant-id>
CLIENT_ID=<client-id>
CERTIFICATE_PATH=/path/to/cert.pem
USE_CERTIFICATE=true
```

---

## Variables d'environnement

| Variable | Obligatoire | Description |
|---|---|---|
| `TENANT_ID` | Oui (sauf token mode) | Directory (tenant) ID Entra |
| `CLIENT_ID` | Oui (sauf token mode) | Application (client) ID |
| `CLIENT_SECRET` | Mode secret | Client secret app-only |
| `USE_INTERACTIVE` | Non | `true` pour login navigateur (dev local) |
| `USE_CLIENT_TOKEN` | Non | `true` pour token fourni par le client |
| `USE_CERTIFICATE` | Non | `true` pour auth par certificat |
| `CERTIFICATE_PATH` | Mode cert | Chemin vers le PEM |
| `CERTIFICATE_PASSWORD` | Non | Mot de passe du certificat si chiffré |
| `REDIRECT_URI` | Non | URI de redirection (défaut : `http://localhost:3000`) |
| `ACCESS_TOKEN` | Non | Token initial en mode `USE_CLIENT_TOKEN` |
| `USE_GRAPH_BETA` | Non | `false` pour forcer Graph v1.0 (défaut : beta autorisé) |
| `PORT` | Non | Port HTTP interne (défaut : 3000) |
| `LOG_LEVEL` | Non | `debug` / `info` / `warn` / `error` (défaut : `info`) |
| `LOG_FILE` | Non | Chemin du fichier de log (ex : `/app/logs/eligraph.log`) — stdout toujours actif |

---

## Tools MCP exposés

### `EliGraph`
Appel Microsoft Graph et Azure ARM. Supporte GET, POST, PUT, PATCH, DELETE avec pagination automatique.

Paramètres principaux : `apiType`, `path`, `method`, `queryParams`, `body`, `graphApiVersion`, `fetchAll`, `consistencyLevel`.

### `set-access-token`
Injecter ou renouveler un access token en mode `USE_CLIENT_TOKEN`.

### `get-auth-status`
Vérifier le mode d'auth actif, l'état du token, et les scopes Graph accordés.

### `add-graph-permission`
Déclencher un re-login interactif pour ajouter des scopes Graph (mode interactif uniquement).

---

## Configuration Claude Desktop (mode stdio local)

```json
{
  "mcpServers": {
    "EliGraph": {
      "command": "node",
      "args": ["/chemin/vers/eligraph/src/mcp/build/main.js"],
      "env": {
        "TENANT_ID": "<tenant-id>",
        "CLIENT_ID": "<client-id>",
        "USE_INTERACTIVE": "true"
      }
    }
  }
}
```

---

## Développement local

### Mode stdio (Claude Desktop)

```bash
cd src/mcp
npm install
npm run build
node build/main.js
```

### Mode HTTP (localhost)

```bash
cd src/mcp
npm run build
node build/server.js
# Health check
curl http://localhost:3000/health
# Test MCP interactif
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

---

## Déploiement Docker (mode HTTP remote)

```bash
docker build -t eligraph:local ./src/mcp
docker-compose up -d
docker logs -f eligraph
curl http://localhost:3000/health
```

> **Note** : Le déploiement HTTPS public (VPS + nginx + Let's Encrypt) est en attente de l'acquisition d'un serveur et d'un domaine. Le workflow GitHub Actions (CI/CD) sera créé à ce moment-là.

---

## App Registration Entra

Nom : `EliGraph-MCP-Client` — Single tenant, plateforme Web (confidential client).

Redirect URIs :
- `https://claude.ai/api/mcp/auth_callback` (Claude.ai remote)
- `http://localhost:3000` (dev local)

---

## Contexte

- **Développeur** : Ishak CHENNOUF — Eliadis (conseil Microsoft 365 / Power Platform)
- **Upstream** : [merill/lokka](https://github.com/merill/lokka) (MIT)
- **Tenant de test** : `ishak5.onmicrosoft.com`
