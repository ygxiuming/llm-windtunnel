#!/usr/bin/env bash
# Build llm-windtunnel and produce a self-contained release bundle.
#
# Usage:
#   scripts/package.sh [version]
#
# Output:
#   dist/release/llm-windtunnel-v<version>-linux-x64.tar.gz   (runnable without npm install)
#   dist/release/llm-windtunnel-v<version>-linux-x64.tar.gz.sha256
#
# The bundle contains the Fastify server (with production node_modules),
# the prebuilt web SPA, the parameter registry and locales. Extract and run:
#   tar xzf llm-windtunnel-v*.tar.gz
#   cd llm-windtunnel-v*
#   npm start          # → http://127.0.0.1:8787
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(node -p "require('./package.json').version")}"
STAGE_ROOT="dist/release-bundle"
STAGE="$STAGE_ROOT/llm-windtunnel-v$VERSION"
OUT="dist/release"

echo "==> packaging llm-windtunnel v$VERSION"

rm -rf "$STAGE_ROOT" "$OUT"
mkdir -p "$STAGE" "$OUT"

echo "==> installing dependencies"
npm ci --no-audit --no-fund

echo "==> building web frontend"
npm run build

echo "==> pruning dev dependencies"
npm prune --omit=dev

echo "==> assembling bundle"
cp -r node_modules "$STAGE/node_modules"
mkdir -p "$STAGE/shared" "$STAGE/server" "$STAGE/web"
cp -r shared/src shared/package.json "$STAGE/shared/"
cp -r server/src server/package.json server/tsconfig.json "$STAGE/server/"
cp -r web/dist "$STAGE/web/dist"
cp -r registry locales "$STAGE/"
cp package.json package-lock.json tsconfig.base.json README.md README.zh-CN.md LICENSE "$STAGE/"
mkdir -p "$STAGE/docs"
cp -r docs/research docs/architecture.md "$STAGE/docs/" 2>/dev/null || true

echo "==> packing tarball"
tar -czf "$OUT/llm-windtunnel-v$VERSION-linux-x64.tar.gz" -C "$STAGE_ROOT" "llm-windtunnel-v$VERSION"
sha256sum "$OUT/llm-windtunnel-v$VERSION-linux-x64.tar.gz" \
  > "$OUT/llm-windtunnel-v$VERSION-linux-x64.tar.gz.sha256"

echo "==> done:"
ls -lh "$OUT"
