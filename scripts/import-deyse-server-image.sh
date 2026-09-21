#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_HEAD_REF:-}" != "fix/jornada-yoga-foto-deyse" ]]; then
  echo "Importação temporária da foto ignorada fora do PR dedicado."
  exit 0
fi

git fetch origin "${GITHUB_HEAD_REF}"
git checkout -B "${GITHUB_HEAD_REF}" "origin/${GITHUB_HEAD_REF}"

mkdir -p public/jornada-yoga
target="public/jornada-yoga/foto_deyse_jornada yoga_convertida.webp"
tmp="$(mktemp)"
success=0

for url in \
  "https://cadastro.conexaoseres.com.br/jornada-yoga/foto_deyse_jornada%20yoga_convertida.webp" \
  "https://cadastro.conexaoseres.com.br/public/jornada-yoga/foto_deyse_jornada%20yoga_convertida.webp"
do
  echo "Tentando copiar imagem de: $url"
  if curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 --max-time 60 "$url" -o "$tmp"; then
    if python - "$tmp" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
data = p.read_bytes()
valid = len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
print(f"bytes={len(data)} webp={valid}")
raise SystemExit(0 if valid else 1)
PY
    then
      mv "$tmp" "$target"
      success=1
      break
    fi
  fi
done

if [[ "$success" -ne 1 ]]; then
  echo "Não foi possível copiar um WebP válido do servidor." >&2
  exit 1
fi

file "$target"
