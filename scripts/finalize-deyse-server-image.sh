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

git show origin/main:package.json > package.json
rm -f scripts/import-deyse-server-image.sh
rm -f scripts/finalize-deyse-server-image.sh
rm -f .github/workflows/import-deyse-server-image.yml

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git status --short

if git diff --cached --quiet; then
  echo "Nenhuma alteração final para versionar." >&2
  exit 1
fi

git commit -m "fix: versionar foto da Deyse na Jornada (v1.0.145)"
git push origin HEAD:"${GITHUB_HEAD_REF}"
