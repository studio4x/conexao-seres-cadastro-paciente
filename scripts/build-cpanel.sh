#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

bash scripts/sites-env.sh -- vite build --config vite.cpanel.config.ts

mkdir -p cpanel-dist/api
cp cpanel-server/.htaccess cpanel-dist/.htaccess
cp cpanel-server/api/.htaccess cpanel-dist/api/.htaccess
cp cpanel-server/api/cep.php cpanel-dist/api/cep.php
cp cpanel-server/api/patients.php cpanel-dist/api/patients.php
cp cpanel-server/api/asaas-webhook.php cpanel-dist/api/asaas-webhook.php
cp cpanel-server/api/turnstile.php cpanel-dist/api/turnstile.php
cp cpanel-server/api/jornada-yoga.php cpanel-dist/api/jornada-yoga.php
cp cpanel-server/api/jornada-admin-login.php cpanel-dist/api/jornada-admin-login.php
cp cpanel-server/api/jornada-admin-logout.php cpanel-dist/api/jornada-admin-logout.php
cp cpanel-server/api/jornada-admin-registrations.php cpanel-dist/api/jornada-admin-registrations.php
cp cpanel-server/api/deploy-webhook.php cpanel-dist/api/deploy-webhook.php
cp cpanel-server/api/config.example.php cpanel-dist/api/config.example.php

echo "Pacote para o cPanel criado em cpanel-dist/"
