#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_HEAD_REF:-}" != "fix/jornada-yoga-foto-deyse" ]]; then
  echo "Finalização temporária ignorada fora do PR dedicado."
  exit 0
fi

test -s "public/jornada-yoga/foto_deyse_jornada yoga_convertida.webp"
test -s "cpanel-dist/jornada-yoga/foto_deyse_jornada yoga_convertida.webp"
grep -q 'BUILD_VERSION = "1.0.145"' components/layout/AppVersion.tsx
grep -q '/jornada-yoga/foto_deyse_jornada%20yoga_convertida.webp' components/jornada-yoga/JornadaYogaPage.tsx
echo "Importação e build temporários validados."

echo "DIST_INDEX_BASE64_BEGIN"
base64 -w0 cpanel-dist/index.html
echo
echo "DIST_INDEX_BASE64_END"

js_asset="$(find cpanel-dist/assets -maxdepth 1 -type f -name 'index-*.js' | head -n 1)"
test -n "$js_asset"
echo "DIST_JS_PATH=$js_asset"
echo "DIST_JS_BASE64_BEGIN"
base64 -w0 "$js_asset"
echo
echo "DIST_JS_BASE64_END"
