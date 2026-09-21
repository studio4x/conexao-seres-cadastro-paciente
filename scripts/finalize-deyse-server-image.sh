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
