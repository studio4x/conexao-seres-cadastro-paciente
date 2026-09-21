<?php

declare(strict_types=1);

return [
    'asaas_api_key' => 'COLE_AQUI_A_CHAVE_DA_API_DO_ASAAS',
    'asaas_api_url' => 'https://api.asaas.com/v3',
    'asaas_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_ASAAS',
    'turnstile_site_key' => 'COLE_AQUI_A_CHAVE_PUBLICA_DO_TURNSTILE',
    'turnstile_secret_key' => 'COLE_AQUI_A_CHAVE_SECRETA_DO_TURNSTILE',
    'turnstile_expected_hostname' => 'cadastro.conexaoseres.com.br',
    'e2e_turnstile_enabled' => 'false',
    'e2e_turnstile_hmac_secret' => 'COLE_AQUI_O_SEGREDO_HMAC_E2E_FORA_DO_GIT',
    'n8n_cadastro_webhook_url' => 'https://webhook.studio4x.com.br/webhook/conexao-seres-cadastro-realizado',
    'n8n_cadastro_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N',
    'n8n_pagamento_webhook_url' => 'COLE_AQUI_A_URL_DO_WEBHOOK_N8N_DE_PAGAMENTO',
    'n8n_pagamento_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N_DE_PAGAMENTO',
    'n8n_jornada_webhook_url' => 'https://webhook.studio4x.com.br/webhook/conexao-seres-jornada-yoga',
    'n8n_jornada_webhook_token' => 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N_DA_JORNADA',
    'jornada_admin_email' => 'contato@conexaoseres.com.br',
    'jornada_admin_password_pbkdf2' => 'COLE_AQUI_O_VERIFICADOR_PBKDF2_DA_SENHA',
    'jornada_admin_session_secret' => 'COLE_AQUI_UM_SEGREDO_ALEATORIO_COM_PELO_MENOS_32_CARACTERES',
];
