<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const E2E_TURNSTILE_MODE = 'turnstile-test-v1';
const E2E_TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

function e2e_turnstile_authorize(array $fileConfig, string $method, string $rawBody, string $fallbackPath): array
{
    $mode = array_key_exists('HTTP_X_CS_E2E_MODE', $_SERVER) ? (string) $_SERVER['HTTP_X_CS_E2E_MODE'] : null;
    if ($mode === null) {
        return ['authorized' => false, 'error' => null];
    }
    if ($mode !== E2E_TURNSTILE_MODE) {
        return ['authorized' => false, 'error' => 'E2E_AUTH_INVALID'];
    }

    $enabled = strtolower(trim((string) (getenv('E2E_TURNSTILE_ENABLED') ?: ($fileConfig['e2e_turnstile_enabled'] ?? '')))) === 'true';
    if (!$enabled) {
        return ['authorized' => false, 'error' => 'E2E_DISABLED'];
    }

    $runId = array_key_exists('HTTP_X_CS_E2E_RUN', $_SERVER) ? (string) $_SERVER['HTTP_X_CS_E2E_RUN'] : '';
    $timestamp = array_key_exists('HTTP_X_CS_E2E_TIMESTAMP', $_SERVER) ? (string) $_SERVER['HTTP_X_CS_E2E_TIMESTAMP'] : '';
    $signature = array_key_exists('HTTP_X_CS_E2E_SIGNATURE', $_SERVER) ? (string) $_SERVER['HTTP_X_CS_E2E_SIGNATURE'] : '';
    if ($runId === '' || $timestamp === '' || $signature === '') {
        return ['authorized' => false, 'error' => 'E2E_AUTH_MISSING'];
    }
    if (preg_match('/^\d{1,12}$/', $timestamp) !== 1) {
        return ['authorized' => false, 'error' => 'E2E_AUTH_INVALID'];
    }
    if (abs(time() - (int) $timestamp) > 180) {
        return ['authorized' => false, 'error' => 'E2E_AUTH_EXPIRED'];
    }

    $secret = trim((string) (getenv('E2E_TURNSTILE_HMAC_SECRET') ?: ($fileConfig['e2e_turnstile_hmac_secret'] ?? '')));
    if ($secret === '' || preg_match('/^v1=[0-9a-f]{64}$/i', $signature) !== 1) {
        return ['authorized' => false, 'error' => 'E2E_AUTH_INVALID'];
    }

    $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '')));
    if (str_starts_with($host, '[')) {
        $host = preg_replace('/^\[([^\]]+)\](?::\d+)?$/', '$1', $host) ?? $host;
    } else {
        $host = preg_replace('/:\d+$/', '', $host) ?? $host;
    }
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    $pathname = is_string($path) && $path !== '' ? $path : $fallbackPath;
    $canonical = implode("\n", [
        'v1',
        strtoupper($method),
        $host,
        $pathname,
        $timestamp,
        $runId,
        hash('sha256', $rawBody),
    ]);
    $expected = hash_hmac('sha256', $canonical, $secret);
    return hash_equals($expected, substr($signature, 3))
        ? ['authorized' => true, 'error' => null]
        : ['authorized' => false, 'error' => 'E2E_AUTH_INVALID'];
}

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

$e2e = e2e_turnstile_authorize($fileConfig, 'GET', '', '/api/turnstile');
if ($e2e['error'] !== null) {
    respond(['code' => $e2e['error']], 403);
}
if ($e2e['authorized']) {
    respond(['siteKey' => E2E_TURNSTILE_TEST_SITE_KEY]);
}

$siteKey = trim((string) (getenv('TURNSTILE_SITE_KEY') ?: ($fileConfig['turnstile_site_key'] ?? '')));
if ($siteKey === '' || $siteKey === 'COLE_AQUI_A_CHAVE_PUBLICA_DO_TURNSTILE') {
    respond(['message' => 'A verificação de segurança ainda não foi configurada.'], 503);
}

respond(['siteKey' => $siteKey]);
