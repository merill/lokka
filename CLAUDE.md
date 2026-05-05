# EliGraph — CLAUDE.md

> Fichier de contexte projet pour Claude. À placer à la racine du repo `eligraph/`.
> Mis à jour à chaque évolution majeure de l'architecture ou des conventions.

---

## Présentation du projet

**EliGraph** est un fork personnalisé de [Lokka](https://github.com/merill/lokka) (licence MIT),
développé par Ishak CHENNOUF (consultant Microsoft 365 / Power Platform chez Eliadis).

C'est un **serveur MCP (Model Context Protocol)** qui permet d'interroger et de gérer
un tenant Microsoft 365 / Azure en langage naturel, via les APIs Microsoft Graph et Azure ARM.

### Objectifs

- Exposer un endpoint MCP remote (HTTPS) déployé sur VPS
- Supporter plusieurs clients MCP : Claude Desktop, Claude.ai (navigateur), Copilot Studio (roadmap)
- Authentification **delegated** (OAuth 2.0, login utilisateur) — chaque appel Graph s'exécute
  avec les droits réels de l'utilisateur signé (OBO flow)
- Périmètre Graph complet : read + write sur Entra, M365, Azure ARM, Intune
- Ajouter des **règles métier** et **garde-fous** absents de Lokka upstream
- **Logger toutes les actions** dans un audit trail structuré (JSON → Log Analytics Azure)

### Positionnement par rapport à Lokka upstream

| Fonctionnalité | Lokka upstream | EliGraph |
|---|---|---|
| Microsoft Graph (read) | ✅ | ✅ |
| Microsoft Graph (write) | ✅ | ✅ |
| Azure ARM | ✅ | ✅ |
| Mode stdio (Claude Desktop local) | ✅ | ✅ |
| Mode HTTP remote (MCP Streamable) | ❌ | ✅ (Chantier 1) |
| Logging structuré audit trail | ❌ | ✅ (Chantier 2) |
| Règles métier / garde-fous | ❌ | ✅ (Chantier 3) |
| Intégration Copilot Studio | ❌ | ✅ (Chantier 4) |
| Auth delegated OBO | ✅ | ✅ |
| Auth app-only (client secret) | ✅ | ✅ |
| Auth certificat | ✅ | ✅ |

---

## Architecture

```
Clients MCP
├── Claude Desktop (stdio, local)
├── Claude.ai navigateur (HTTPS remote)
└── Copilot Studio (HTTPS remote + OAuth connector) [roadmap]
         │
         │ MCP Streamable 1.0 (HTTPS)
         ▼
┌─────────────────────────────────────┐
│         EliGraph MCP Server         │
│         (Node.js + Express)         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │   Middleware stack          │    │
│  │   1. Auth OBO (MSAL)        │    │
│  │   2. Audit logger           │    │
│  │   3. Business rules         │    │
│  │   4. Rate limiter           │    │
│  └──────────────┬──────────────┘    │
│                 │                   │
│  ┌──────────────▼──────────────┐    │
│  │   Lokka Graph Client        │    │
│  │   (fork de graphClient.ts)  │    │
│  └──────────────┬──────────────┘    │
└─────────────────┼───────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
  Microsoft Graph      Azure ARM
  (Entra, M365,        (subscriptions,
   Intune, Exchange)    resources, costs)
         │
         ▼
  Log Analytics Workspace
  (audit trail complet)
```

### Stack technique

- **Runtime** : Node.js 20+ (LTS)
- **Langage** : TypeScript (compile vers `build/`)
- **Framework HTTP** : Express 4.x
- **MCP SDK** : `@modelcontextprotocol/sdk` (transport Streamable)
- **Auth** : MSAL Node (`@azure/msal-node`) pour le flow OBO delegated
- **Graph client** : `@microsoft/microsoft-graph-client`
- **Logging** : logger custom stdout (Chantier 1) → `winston` JSON structuré + fichier + Azure Monitor (Chantier 2)
- **Conteneurisation** : Docker multi-stage + docker-compose
- **Reverse proxy** : nginx + Let's Encrypt (certbot) — à configurer lors de l'acquisition du VPS
- **CI/CD** : GitHub Actions (push main → deploy VPS) — à créer lors de l'acquisition du VPS

---

## Structure du projet

```
eligraph/
├── CLAUDE.md                    ← ce fichier
├── README.md
├── docker-compose.yml
├── .env.example                 ← template des variables d'env (jamais .env réel)
├── .gitignore
├── .github/                     ← à créer lors de l'acquisition du VPS
│   └── workflows/
│       └── deploy.yml           ← CI/CD GitHub Actions (à venir)
└── src/
    └── mcp/
        ├── package.json
        ├── tsconfig.json
        ├── Dockerfile
        ├── .dockerignore
        └── src/
            ├── main.ts          ← point d'entrée stdio (Lokka upstream, conservé)
            ├── app.ts           ← factory createEliGraphServer() (ajout EliGraph)
            ├── server.ts        ← wrapper HTTP Express + gestion sessions MCP (ajout EliGraph)
            ├── logger.ts        ← logger stdout + fichier opt-in (Chantier 1, migre vers winston au Chantier 2)
            ├── auth.ts          ← gestion des modes d'auth (fork Lokka)
            ├── constants.ts     ← constantes projet
            ├── middleware/
            │   ├── auditLogger.ts    ← logging structuré (Chantier 2)
            │   ├── businessRules.ts  ← garde-fous métier (Chantier 3)
            │   └── rateLimiter.ts    ← rate limiting (Chantier 3)
            └── config/
                └── rules.json        ← règles métier externalisées (Chantier 3)
```

---

## Variables d'environnement

Toujours utiliser `.env` en local (jamais commité). En prod, injectées via docker-compose ou CI/CD.

| Variable | Obligatoire | Description |
|---|---|---|
| `TENANT_ID` | Oui | Directory (tenant) ID Entra |
| `CLIENT_ID` | Oui | Application (client) ID de l'app registration |
| `CLIENT_SECRET` | Mode secret | Client secret (app-only). Ne pas utiliser en mode delegated |
| `USE_INTERACTIVE` | Non | `"true"` pour le login navigateur (dev local seulement) |
| `USE_CERTIFICATE` | Non | `"true"` pour le mode certificat |
| `CERTIFICATE_PATH` | Mode cert | Chemin vers le fichier PEM dans le container |
| `CERTIFICATE_PASSWORD` | Non | Mot de passe du certificat si chiffré |
| `USE_GRAPH_BETA` | Non | `"false"` pour forcer v1.0 stable (défaut: beta autorisé) |
| `PORT` | Non | Port HTTP interne (défaut: 3000) |
| `LOG_LEVEL` | Non | `debug` / `info` / `warn` / `error` (défaut: `info`) |
| `LOG_FILE` | Non | Chemin du fichier de log (ex: `/app/logs/eligraph.log`) |
| `AZURE_MONITOR_CONNECTION_STRING` | Non | Pour envoyer les logs vers Log Analytics Azure |
| `ELIGRAPH_ENV` | Non | `development` / `production` (active/désactive les garde-fous) |

---

## Chantiers de développement

### Chantier 1 — Fork + VPS + Docker *(en cours — déploiement VPS en attente)*

**Objectif** : transformer Lokka local (stdio) en service HTTP déployable sur VPS.

**Tâches** :

- [x] Fork `merill/lokka` → `eligraph` (rebrand commit 225e0d2)
- [x] Explorer et documenter `src/mcp/src/` (fichiers existants)
- [x] Extraire `createEliGraphServer()` dans `app.ts` (factory MCP server)
- [x] Créer `server.ts` : wrapper Express avec endpoint `/mcp` (MCP Streamable) et `/health`
- [x] Corriger `logger.ts` : stdout prioritaire, fichier opt-in via `LOG_FILE`, niveaux configurables
- [x] Créer `Dockerfile` multi-stage (builder + runtime non-root `eligraph`)
- [x] Créer `docker-compose.yml` avec bind `127.0.0.1:3000`
- [x] Créer `.env.example` (template variables d'env)
- [ ] Valider en local avec Docker Desktop : `curl http://localhost:3000/health`
- [ ] Acquérir VPS (Contabo ou Hetzner CX22) + domaine
- [ ] Configurer nginx + Let's Encrypt sur VPS
- [ ] Créer workflow GitHub Actions pour CI/CD
- [ ] Valider avec `curl https://mcp.domaine.com/health`

**Statut actuel** : code complet et fonctionnel en localhost. Déploiement VPS bloqué sur l'acquisition d'un serveur et d'un domaine.

---

### Chantier 2 — Logging et audit trail *(à venir)*

**Objectif** : tracer toutes les opérations Graph dans un audit trail structuré et exploitable.

**Format de log cible** :

```json
{
  "timestamp": "2026-04-28T10:23:45.123Z",
  "level": "info",
  "event": "graph_call",
  "user": "ichennouf@tenant.onmicrosoft.com",
  "method": "PATCH",
  "endpoint": "/users/b8182a02/assignLicense",
  "statusCode": 200,
  "durationMs": 342,
  "resourceType": "user",
  "operation": "assignLicense",
  "tenantId": "xxx-xxx",
  "appId": "xxx-xxx",
  "sessionId": "mcp-session-abc123",
  "ruleTriggered": null,
  "ruleAction": null
}
```

**Destinations** :

1. Stdout (toujours — capturé par Docker)
2. Fichier JSON rotatif dans `/app/logs/` (monté en volume)
3. Azure Monitor / Log Analytics (optionnel, via `AZURE_MONITOR_CONNECTION_STRING`)

**Tâches** :

- [ ] Installer `winston` + `winston-daily-rotate-file`
- [ ] Créer `middleware/auditLogger.ts`
- [ ] Intercepter les appels dans `graphClient.ts` (avant + après chaque requête)
- [ ] Ajouter les headers de corrélation MCP (`mcp-session-id` → `sessionId` dans les logs)
- [ ] Requête KQL de base pour interroger les logs dans Azure Monitor

---

### Chantier 3 — Règles métier et garde-fous *(à venir)*

**Objectif** : ajouter une couche de sécurité et de gouvernance absente de Lokka upstream.

**Règles à implémenter** (externalisées dans `config/rules.json`) :

```json
{
  "protectedAccounts": [
    "admin@*.onmicrosoft.com",
    "breakglass*",
    "emergency*"
  ],
  "protectedRoles": [
    "Global Administrator",
    "Privileged Role Administrator"
  ],
  "requireConfirmation": [
    "DELETE /users/*",
    "POST /users/*/assignLicense",
    "DELETE /groups/*"
  ],
  "dryRunByDefault": false,
  "maxBatchSize": 50
}
```

**Comportements** :

- **Blocage hard** : opération refusée + log `BLOCKED` (ex: modifier un compte Global Admin)
- **Confirmation requise** : l'agent demande validation avant d'exécuter (ex: suppression)
- **Dry run** : liste ce qui serait fait sans exécuter (ex: retrait de licences en masse)
- **Batch limit** : refuse d'opérer sur plus de N ressources en une seule requête

**Tâches** :

- [ ] Créer `middleware/businessRules.ts`
- [ ] Créer `config/rules.json` avec les règles par défaut
- [ ] Implémenter le pattern "propose → confirme → exécute"
- [ ] Ajouter `ruleTriggered` et `ruleAction` dans les logs (Chantier 2)
- [ ] Tester les règles avec des prompts destructifs

---

### Chantier 4 — Intégration Copilot Studio *(roadmap)*

**Objectif** : exposer EliGraph comme tool dans un agent Copilot Studio via custom connector.

**Prérequis** :

- Chantier 1 terminé (endpoint HTTPS public)
- App registration Entra avec redirect URI Copilot Studio
- Federated credentials (managed identity du connector)

**Tâches** :

- [ ] Configurer l'app registration pour Copilot Studio (redirect URI + federated credentials)
- [ ] Créer le custom connector dans Power Apps (oauth2 + managed identity)
- [ ] Tester dans un agent Copilot Studio avec orchestration générative activée
- [ ] Documenter la procédure de déploiement chez un client

---

## Conventions de développement

### Commits

```
feat(server): add HTTP wrapper with MCP Streamable transport
fix(auth): handle token refresh on 401 response
chore(docker): optimize multi-stage build size
docs(claude): update CLAUDE.md with chantier 2 status
```

Format : `type(scope): description` — types : `feat`, `fix`, `chore`, `docs`, `test`, `refactor`

### Branches

```
main          ← production stable, protégée, déclenche CI/CD vers VPS
dev           ← branche d'intégration, base de tout développement actif
chantier/N-*  ← une branche par chantier (ex: chantier/1-http-wrapper)
fix/*         ← hotfixes urgents uniquement (depuis main)
```

**Règles :**
- Pas de commit direct sur `main` (sauf rebrand/init initial)
- `chantier/*` part toujours de `dev`, se merge dans `dev` via PR
- `dev` → `main` via PR quand un chantier est validé et testé (déclenche le deploy VPS)
- Hotfix → branche depuis `main`, merge sur `main` + merge back sur `dev`

**Démarrage d'un chantier :**
```bash
git checkout dev
git checkout -b chantier/1-http-wrapper
```

### TypeScript

- Strict mode activé (`"strict": true` dans tsconfig)
- Pas de `any` sauf cas exceptionnels documentés avec un commentaire `// eslint-disable-next-line`
- Interfaces explicites pour tous les objets de log et de règles métier
- Exports nommés (pas de default exports sauf pour les classes principales)

### Sécurité

- **Jamais** de secrets dans le code ou les commits (utiliser `.env` + GitHub Secrets)
- **Jamais** de `console.log` en prod — utiliser le logger winston
- Toujours valider les inputs avant de les passer à l'API Graph
- Principle of least privilege sur les permissions Graph accordées

---

## App Registration Entra (EliGraph)

| Paramètre | Valeur |
|---|---|
| Nom | `EliGraph-MCP-Client` |
| Type | Single tenant |
| Platform | Web (confidential client) |
| Redirect URI Claude.ai | `https://claude.ai/api/mcp/auth_callback` |
| Redirect URI local | `http://localhost:3000` (dev uniquement) |
| Auth mode | Delegated (OBO) |

### Permissions Graph recommandées (scope complet)

```
User.Read.All, User.ReadWrite.All
Group.Read.All, Group.ReadWrite.All
GroupMember.Read.All, GroupMember.ReadWrite.All
Directory.Read.All, Directory.ReadWrite.All
Application.Read.All
Policy.Read.All, Policy.ReadWrite.ConditionalAccess
RoleManagement.Read.Directory, RoleManagement.ReadWrite.Directory
AuditLog.Read.All
DeviceManagementConfiguration.ReadWrite.All
DeviceManagementManagedDevices.ReadWrite.All
Sites.ReadWrite.All
Files.ReadWrite.All
Mail.ReadWrite, Mail.Send
Reports.Read.All
SecurityAlert.Read.All
IdentityRiskEvent.Read.All
```

---

## Contexte développeur

**Développeur principal** : Ishak CHENNOUF  
**Entreprise** : Eliadis (cabinet de conseil Microsoft 365 / Power Platform)  
**Clients types** : Stago, GALEC (contexte IGA / N2 Identity Support)  
**Environnement de dev** : Windows 11, VS Code, PowerShell 7, Node.js 20, Docker Desktop  
**VPS cible** : Contabo (Ubuntu 24.04) ou Hetzner CX22 (à décider)  
**Tenant de test** : `ishak5.onmicrosoft.com`

### Ce que Claude doit savoir sur ce projet

- Le code source de base (Lokka) est en **TypeScript** compilé vers `src/mcp/build/`
- Le point d'entrée stdio existant (`index.ts`) doit être **conservé intact** pour la compat Claude Desktop
- Tout ajout EliGraph se fait via des **nouveaux fichiers** ou des **extensions** — pas de modification destructive de Lokka upstream (facilite les merges futurs)
- Les règles métier sont externalisées dans `config/rules.json` pour être modifiables sans recompilation
- Le logging doit être **opt-in** par destination (stdout toujours, fichier et Azure Monitor configurables)
- En cas de doute sur une opération Graph destructive, **toujours proposer avant d'exécuter**
- Les tests se font sur le tenant `ishak5.onmicrosoft.com` — ne jamais hardcoder ce tenant dans le code

### Style de réponse attendu de Claude

- Réponses techniques directes, sans sur-explication du contexte déjà connu
- Toujours montrer le code complet des fichiers modifiés (pas de `// ... reste inchangé`)
- Signaler explicitement les impacts sur les autres chantiers quand on modifie un fichier partagé
- Utiliser les noms de fichiers exacts du projet (`auditLogger.ts`, pas `logger.ts`)
- En cas d'ambiguïté sur une règle métier, demander plutôt qu'assumer

---

## Commandes utiles

```bash
# Dev local — mode stdio (Claude Desktop)
cd src/mcp
npm install
npm run build
node build/main.js

# Dev local — mode HTTP
cd src/mcp
npm run build
node build/server.js
curl http://localhost:3000/health

# Docker local
docker build -t eligraph:local ./src/mcp
docker-compose up -d
docker logs -f eligraph
curl http://localhost:3000/health

# Tests MCP (inspector interactif)
npx @modelcontextprotocol/inspector http://localhost:3000/mcp

# Deploy (via CI/CD — à configurer lors de l'acquisition du VPS)
git push origin main           # déclenchera GitHub Actions → deploy VPS

# Logs VPS (à configurer)
ssh <user>@<VPS-IP>
docker logs -f eligraph
tail -f /home/<user>/eligraph/logs/eligraph.log
```

---

## Historique des décisions techniques

| Date | Décision | Raison |
|---|---|---|
| 2026-04 | Fork de Lokka (MIT) plutôt que développement from scratch | Base solide, Graph client déjà intégré, auth multi-mode |
| 2026-04 | Mode delegated prioritaire sur app-only | Traçabilité par utilisateur, conformité audit client |
| 2026-04 | Transport MCP Streamable (pas SSE) | SSE déprécié depuis août 2025 côté Anthropic |
| 2026-04 | Règles métier externalisées en JSON | Modifiables sans recompilation, versionables séparément |
| 2026-04 | Winston pour le logging | Mature, multi-transport, format JSON natif, rotation intégrée |
| 2026-04 | Nom du projet : EliGraph | Court, évoque Graph API, portable (pas lié à un client) |
| 2026-05 | Logger custom stdout pour Chantier 1 (pas encore winston) | Winston est prévu au Chantier 2 ; pour le Chantier 1 un logger minimal stdout suffit et évite une dépendance prématurée |
| 2026-05 | GitHub Actions et nginx reportés à l'acquisition du VPS | Pas de domaine ni de serveur cible pour l'instant — le code est prêt, le déploiement est bloquant externe |