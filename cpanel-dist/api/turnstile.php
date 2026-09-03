<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(['message' => 'Método não permitido.'], 405);
}

$fileConfig = [];
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) {
        $fileConfig = $loaded;
    }
}

$siteKey = trim((string) (getenv('TURNSTILE_SITE_KEY') ?: ($fileConfig['turnstile_site_key'] ?? '')));
if ($siteKey === '' || $siteKey === 'COLE_AQUI_A_CHAVE_PUBLICA_DO_TURNSTILE') {
    respond(['message' => 'A verificação de segurança ainda não foi configurada.'], 503);
}

respond(['siteKey' => $siteKey]);
