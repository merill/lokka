# EliGraph — src/mcp

Serveur MCP EliGraph (Node.js + TypeScript).

Voir le [README principal](../../README.md) pour la documentation complète.

## Commandes

```bash
npm install
npm run build
node build/main.js   # stdio (Claude Desktop)
```

## Structure

```
src/
├── main.ts          ← point d'entrée stdio + définition des tools MCP
├── auth.ts          ← AuthManager (4 modes : ClientCredentials, ClientProvidedToken, Interactive, Certificate)
├── logger.ts        ← logger fichier (sera remplacé par Winston au Chantier 2)
└── constants.ts     ← constantes EliGraph
```
