#!/usr/bin/env bash
# Builds host + both micro-apps and deploys the built artifacts into
# nginx/html/, simulating what a real "online" deployment would serve.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[build-online] building host (v1, demo-only, deprecated)..."
(cd "$ROOT/host" && npm run build >/dev/null)

echo "[build-online] building host-v2 (current: no extension hooks, Vue Router)..."
(cd "$ROOT/host-v2" && npm run build >/dev/null)

echo "[build-online] building app-alpha..."
(cd "$ROOT/app-alpha" && npx vite build --config vite.production.config.js >/dev/null)

echo "[build-online] building app-beta..."
(cd "$ROOT/app-beta" && npx vite build --config vite.production.config.js >/dev/null)

for APP_NAME in alpha beta; do
  cat > "$ROOT/app-$APP_NAME/dist/index.html" <<HTML
<!doctype html><html><head><link rel="stylesheet" href="/app-$APP_NAME/style.css"></head><body><div id="app-$APP_NAME-root"></div><script src="/app-$APP_NAME/app.umd.js"></script></body></html>
HTML
  CSS_FILE=$(find "$ROOT/app-$APP_NAME/dist" -maxdepth 1 -name '*.css' | head -1)
  if [ -n "$CSS_FILE" ] && [ "$CSS_FILE" != "$ROOT/app-$APP_NAME/dist/style.css" ]; then cp "$CSS_FILE" "$ROOT/app-$APP_NAME/dist/style.css"; fi
done

echo "[build-online] deploying to nginx/html (v1) ..."
rm -rf "$ROOT/nginx/html"
mkdir -p "$ROOT/nginx/html/app-alpha" "$ROOT/nginx/html/app-beta"
cp -r "$ROOT/host/dist/." "$ROOT/nginx/html/"
cp -r "$ROOT/app-alpha/dist/." "$ROOT/nginx/html/app-alpha/"
cp -r "$ROOT/app-beta/dist/." "$ROOT/nginx/html/app-beta/"

echo "[build-online] deploying to nginx/html-v2 (current) ..."
rm -rf "$ROOT/nginx/html-v2"
mkdir -p "$ROOT/nginx/html-v2"
cp -r "$ROOT/host-v2/dist/." "$ROOT/nginx/html-v2/"

echo "[build-online] computing checksums for host-v2 business bundle (for on/off identity proof)..."
mkdir -p "$ROOT/evidence"
(cd "$ROOT/nginx/html-v2" && shasum -a 256 assets/*.js) > "$ROOT/evidence/host-v2-bundle-checksums.txt"
cat "$ROOT/evidence/host-v2-bundle-checksums.txt"

echo "[build-online] done."
