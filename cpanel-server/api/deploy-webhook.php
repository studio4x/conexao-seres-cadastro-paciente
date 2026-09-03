<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DEPLOY_REPOSITORY = 'studio4x/conexao-seres-cadastro-paciente';
const DEPLOY_REF = 'refs/heads/main';
const DEPLOY_ROOT = '/home/conexaoseres/cadastro.conexaoseres.com.br';
const DEPLOY_SECRET_PATH = '/home/conexaoseres/.github-deploy-secret';
const DEPLOY_LOG_PATH = '/home/conexaoseres/github-deploy.log';
const DEPLOY_LOCK_PATH = '/home/conexaoseres/.github-deploy.lock';
const MAX_PAYLOAD_BYTES = 2_000_000;

function respond(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function log_deploy(string $message): void
{
    $line = sprintf('[%s] %s%s', date('c'), $message, PHP_EOL);
    @file_put_contents(DEPLOY_LOG_PATH, $line, FILE_APPEND | LOCK_EX);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'message' => 'Method not allowed']);
}

$secret = @file_get_contents(DEPLOY_SECRET_PATH);
if ($secret === false || trim($secret) === '') {
    log_deploy('Webhook secret is missing.');
    respond(503, ['ok' => false, 'message' => 'Deploy not configured']);
}
$secret = trim($secret);

$body = file_get_contents('php://input');
if ($body === false || strlen($body) > MAX_PAYLOAD_BYTES) {
    respond(400, ['ok' => false, 'message' => 'Invalid payload']);
}

$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
$expectedSignature = 'sha256=' . hash_hmac('sha256', $body, $secret);
if ($signature === '' || !hash_equals($expectedSignature, $signature)) {
    log_deploy('Rejected request with invalid signature.');
    respond(403, ['ok' => false, 'message' => 'Invalid signature']);
}

$event = $_SERVER['HTTP_X_GITHUB_EVENT'] ?? '';
if ($event === 'ping') {
    respond(200, ['ok' => true, 'message' => 'pong']);
}

if ($event !== 'push') {
    respond(202, ['ok' => true, 'message' => 'Event ignored']);
}

$payload = json_decode($body, true);
if (!is_array($payload)) {
    respond(400, ['ok' => false, 'message' => 'Invalid JSON']);
}

$repository = $payload['repository']['full_name'] ?? '';
$ref = $payload['ref'] ?? '';
if ($repository !== DEPLOY_REPOSITORY || $ref !== DEPLOY_REF) {
    respond(202, ['ok' => true, 'message' => 'Push ignored']);
}

$lockHandle = @fopen(DEPLOY_LOCK_PATH, 'c');
if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    respond(409, ['ok' => false, 'message' => 'Deploy already running']);
}

$command = sprintf(
    '/usr/bin/git -C %s pull --ff-only origin main 2>&1',
    escapeshellarg(DEPLOY_ROOT),
);
$output = [];
$exitCode = 1;
exec($command, $output, $exitCode);

flock($lockHandle, LOCK_UN);
fclose($lockHandle);

$commit = (string) ($payload['after'] ?? '');
$summary = implode(' | ', array_slice($output, -8));
log_deploy(sprintf('push=%s exit=%d %s', $commit, $exitCode, $summary));

if ($exitCode !== 0) {
    respond(500, ['ok' => false, 'message' => 'Deploy failed']);
}

respond(200, [
    'ok' => true,
    'message' => 'Deploy completed',
    'commit' => $commit,
]);
