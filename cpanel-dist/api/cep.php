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

$cep = preg_replace('/\D+/', '', (string) ($_GET['cep'] ?? ''));
if (strlen($cep) !== 8) {
    respond(['message' => 'Informe um CEP válido.'], 400);
}

if (!function_exists('curl_init')) {
    respond(['message' => 'A consulta de CEP não está disponível no servidor.'], 503);
}

$curl = curl_init('https://viacep.com.br/ws/' . rawurlencode($cep) . '/json/');
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_HTTPHEADER => ['Accept: application/json', 'User-Agent: ConexaoSeresCadastro/1.0'],
]);
$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
    respond(['message' => 'Não foi possível consultar o CEP agora.'], 502);
}

$result = json_decode($body, true);
if (!is_array($result) || !empty($result['erro'])) {
    respond(['message' => 'CEP não encontrado. Confira os números.'], 404);
}

respond([
    'address' => trim((string) ($result['logradouro'] ?? '')),
    'province' => trim((string) ($result['bairro'] ?? '')),
    'city' => trim((string) ($result['localidade'] ?? '')),
    'state' => strtoupper(trim((string) ($result['uf'] ?? ''))),
]);
