#!/usr/bin/env node
// Builds a staged export/ directory containing only runtime files, does a
// production-only npm install inside it, and packs *that* into dist/lokka.mcpb.
// The real project directory (and its dev-dependency-laden node_modules) is
// never touched or packed directly.

const { rmSync, mkdirSync, cpSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const exportDir = path.join(root, 'export');
const distDir = path.join(root, 'dist');
const outFile = path.join(distDir, 'lokka.mcpb');

function run(command, cwd = root) {
  execSync(command, { cwd, stdio: 'inherit' });
}

function copy(from, to) {
  cpSync(path.join(root, from), path.join(root, to), { recursive: true });
}

rmSync(exportDir, { recursive: true, force: true });
if (existsSync(outFile)) rmSync(outFile, { force: true });

run('npm run build --prefix src/mcp');

mkdirSync(path.join(exportDir, 'src', 'mcp'), { recursive: true });
copy('manifest.json', 'export/manifest.json');
copy('src/mcp/build', 'export/src/mcp/build');
copy('src/mcp/package.json', 'export/src/mcp/package.json');
copy('src/mcp/package-lock.json', 'export/src/mcp/package-lock.json');

run('npm ci --prefix export/src/mcp --omit=dev');

mkdirSync(distDir, { recursive: true });
run('npx @anthropic-ai/mcpb pack export dist/lokka.mcpb');
