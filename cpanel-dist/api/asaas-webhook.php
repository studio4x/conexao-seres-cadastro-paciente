<?php

declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sanitize_log_text(string $value, int $limit = 800): string
{
    $sanitized = preg_replace(
        '/(access[_-]?token|authorization|asaas[_-]?api[_-]?key|webhook[_-]?token)\s*[:=]\s*("[^"]*"|\'[^\']*\'|[^,\s}]+)/i',
        '$1=[REDACTED]',
        $value
    ) ?? $value;
    $sanitized = preg_replace('/Bearer\s+\S+/i', 'Bearer [REDACTED]', $sanitized) ?? $sanitized;
    return substr($sanitized, 0, $limit);
}

function asaas_request(string $method, string $url, string $apiKey, ?array $payload = null): array
{
    $curl = curl_init($url);
    if ($curl === false) {
        return ['status' => 0, 'data' => [], 'error' => 'curl_init_failed', 'response' => 'Não foi possível iniciar cURL'];
    }
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Content-Type: application/json',
            'User-Agent: ConexaoSeresCadastro/1.0',
            'access_token: ' . $apiKey,
        ],
    ];
    if ($payload !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($curl, $options);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    return [
        'status' => $status,
        'data' => is_array($decoded) ? $decoded : [],
        'error' => $error !== '' ? sanitize_log_text($error) : '',
        'response' => is_string($body) ? sanitize_log_text($body) : 'Resposta indisponível',
    ];
}

function is_transient_asaas_failure(array $result): bool
{
    $status = (int) ($result['status'] ?? 0);
    return ($result['error'] ?? '') !== ''
        || $status === 0
        || in_array($status, [408, 425, 429], true)
        || $status >= 500;
}

function log_asaas_failure(string $label, array $result, array $context = []): void
{
    error_log(
        $label . '. HTTP ' . (int) ($result['status'] ?? 0)
        . '. Response: ' . ($result['response'] ?? 'Resposta indisponível')
        . ' ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
}

function is_first_session_payment(array $payment): bool
{
    $id = trim((string) ($payment['id'] ?? ''));
    $customer = trim((string) ($payment['customer'] ?? ''));
    $externalReference = trim((string) ($payment['externalReference'] ?? ''));
    $value = is_numeric($payment['value'] ?? null) ? (float) $payment['value'] : -1;
    return $id !== ''
        && $customer !== ''
        && abs($value - 230.00) < 0.001
        && preg_match('/^cs-paciente-[a-f0-9]{24}-sessao-1$/', $externalReference) === 1;
}

function is_first_session_payment_event(array $payment, string $event): bool
{
    $expectedStatus = $event === 'PAYMENT_CONFIRMED' ? 'CONFIRMED' : 'RECEIVED';
    return is_first_session_payment($payment) && ($payment['status'] ?? '') === $expectedStatus;
}

function normalize_code(mixed $value): string
{
    $digits = is_string($value) || is_numeric($value) ? preg_replace('/\D+/', '', (string) $value) : '';
    $normalized = ltrim($digits ?? '', '0');
    return $normalized === '' ? '0' : $normalized;
}

function service_name(array $service): string
{
    foreach (['municipalServiceName', 'description', 'name'] as $key) {
        $value = trim((string) ($service[$key] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }
    return '04510 | 4.08 - Terapia ocupacional.';
}

function select_municipal_service(array $services): ?array
{
    $candidates = [];
    foreach ($services as $service) {
        if (!is_array($service)) {
            continue;
        }
        $code = normalize_code($service['code'] ?? $service['municipalServiceCode'] ?? '');
        $description = strtolower(service_name($service));
        $description = function_exists('iconv')
            ? strtolower((string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $description) ?: $description))
            : $description;
        if ($code === normalize_code('04510') || (str_contains($description, 'terapia ocupacional') && str_contains($description, '4.08'))) {
            $candidates[] = $service;
        }
    }
    $defaults = array_values(array_filter(
        $candidates,
        static fn (array $service): bool => ($service['isDefault'] ?? false) === true || ($service['default'] ?? false) === true
    ));
    $selected = count($defaults) === 1 ? $defaults[0] : (count($candidates) === 1 ? $candidates[0] : null);
    if (!is_array($selected)) {
        return null;
    }
    $id = trim((string) ($selected['id'] ?? ''));
    $code = trim((string) ($selected['code'] ?? $selected['municipalServiceCode'] ?? ''));
    if ($id !== '') {
        return ['id' => $id, 'name' => service_name($selected), 'source' => 'asaas-id'];
    }
    return $code !== '' ? ['code' => $code, 'name' => service_name($selected), 'source' => 'asaas-code'] : null;
}

function effective_date_from_payment(array $payment): string
{
    foreach (['confirmedDate', 'paymentDate', 'clientPaymentDate'] as $key) {
        $value = trim((string) ($payment[$key] ?? ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $value) === 1) {
            return substr($value, 0, 10);
        }
    }
    return (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))->format('Y-m-d');
}

function build_invoice_payload(array $payment, array $service, string $effectiveDate): array
{
    $payload = [
        'payment' => $payment['id'],
        'externalReference' => trim((string) $payment['externalReference']) . '-nfse',
        'serviceDescription' => '04510 | 4.08 - Terapia ocupacional.',
        'observations' => '',
        'value' => 230,
        'deductions' => 0,
        'effectiveDate' => $effectiveDate,
        'municipalServiceName' => '04510 | 4.08 - Terapia ocupacional.',
        'updatePayment' => false,
        'taxes' => [
            'retainIss' => false,
            'iss' => 2,
            'cofins' => 0,
            'csll' => 0,
            'inss' => 0,
            'ir' => 0,
            'pis' => 0,
        ],
    ];
    if (!empty($service['id'])) {
        $payload['municipalServiceId'] = $service['id'];
    } else {
        $payload['municipalServiceCode'] = $service['code'] ?? '04510';
    }
    return $payload;
}

function find_invoice_for_payment(string $baseUrl, string $apiKey, string $paymentId): array
{
    $result = asaas_request(
        'GET',
        $baseUrl . '/invoices?' . http_build_query(['payment' => $paymentId, 'limit' => 10]),
        $apiKey
    );
    if ($result['error'] !== '' || $result['status'] < 200 || $result['status'] >= 300) {
        log_asaas_failure('Asaas invoice lookup failed', $result, ['paymentId' => $paymentId]);
        return ['id' => null, 'failed' => true, 'transient' => is_transient_asaas_failure($result)];
    }
    foreach (($result['data']['data'] ?? []) as $invoice) {
        if (
            is_array($invoice)
            && trim((string) ($invoice['payment'] ?? '')) === $paymentId
            && trim((string) ($invoice['id'] ?? '')) !== ''
        ) {
            return ['id' => trim((string) $invoice['id']), 'failed' => false, 'transient' => false];
        }
    }
    return ['id' => null, 'failed' => false, 'transient' => false];
}

function process_payment_event(string $baseUrl, string $apiKey, array $payment, string $event): bool
{
    $paymentId = trim((string) $payment['id']);
    $customerId = trim((string) $payment['customer']);
    $externalReference = trim((string) $payment['externalReference']);
    $existing = find_invoice_for_payment($baseUrl, $apiKey, $paymentId);
    if ($existing['failed']) {
        return (bool) $existing['transient'];
    }
    if (!empty($existing['id'])) {
        error_log('Asaas invoice already exists. Payment ' . $paymentId . ' Invoice ' . $existing['id']);
        return false;
    }

    $fiscalInfo = asaas_request('GET', $baseUrl . '/fiscalInfo/', $apiKey);
    if ($fiscalInfo['error'] !== '' || $fiscalInfo['status'] < 200 || $fiscalInfo['status'] >= 300) {
        log_asaas_failure('Asaas fiscal information lookup failed', $fiscalInfo, [
            'event' => $event,
            'paymentId' => $paymentId,
            'customerId' => $customerId,
            'externalReference' => $externalReference,
        ]);
        return is_transient_asaas_failure($fiscalInfo);
    }

    $services = asaas_request('GET', $baseUrl . '/fiscalInfo/services?limit=100', $apiKey);
    if ($services['error'] !== '' || $services['status'] < 200 || $services['status'] >= 300) {
        log_asaas_failure('Asaas municipal service lookup failed', $services, [
            'event' => $event,
            'paymentId' => $paymentId,
            'customerId' => $customerId,
            'externalReference' => $externalReference,
        ]);
        return is_transient_asaas_failure($services);
    }
    $serviceList = is_array($services['data']['data'] ?? null) ? $services['data']['data'] : [];
    $selected = select_municipal_service($serviceList);
    $service = $selected;
    if (!$service && count($serviceList) === 0) {
        $service = [
            'code' => '04510',
            'name' => '04510 | 4.08 - Terapia ocupacional.',
            'source' => 'configured-code',
        ];
        error_log('Asaas municipal service list was empty; using configured service code without inventing an ID. Payment ' . $paymentId);
    }
    if (!is_array($service)) {
        error_log('Asaas municipal service 04510 was not uniquely found; invoice was not created. Payment ' . $paymentId . ' Customer ' . $customerId);
        return false;
    }

    error_log('Asaas invoice creation requested. Event ' . $event . ' Payment ' . $paymentId);
    $invoice = asaas_request('POST', $baseUrl . '/invoices', $apiKey, build_invoice_payload(
        $payment,
        $service,
        effective_date_from_payment($payment)
    ));
    if ($invoice['error'] !== '' || $invoice['status'] < 200 || $invoice['status'] >= 300) {
        if (is_transient_asaas_failure($invoice)) {
            $reconciled = find_invoice_for_payment($baseUrl, $apiKey, $paymentId);
            if (!empty($reconciled['id'])) {
                error_log('Asaas invoice reconciled after inconclusive creation response. Event ' . $event . ' Payment ' . $paymentId . ' Invoice ' . $reconciled['id']);
                return false;
            }
        }
        log_asaas_failure('Asaas invoice creation failed', $invoice, [
            'event' => $event,
            'paymentId' => $paymentId,
            'customerId' => $customerId,
            'externalReference' => $externalReference,
        ]);
        return is_transient_asaas_failure($invoice);
    }
    $invoiceId = trim((string) ($invoice['data']['id'] ?? ''));
    if ($invoiceId === '') {
        $reconciled = find_invoice_for_payment($baseUrl, $apiKey, $paymentId);
        if (!empty($reconciled['id'])) {
            error_log('Asaas invoice reconciled after inconclusive creation response. Payment ' . $paymentId . ' Invoice ' . $reconciled['id']);
            return false;
        }
        error_log('Asaas invoice creation returned no invoice ID. Payment ' . $paymentId);
        return true;
    }
    error_log('Asaas invoice created. Payment ' . $paymentId . ' Invoice ' . $invoiceId);
    return false;
}

function process_with_payment_lock(string $baseUrl, string $apiKey, array $payment, string $event): bool
{
    $paymentId = trim((string) ($payment['id'] ?? ''));
    $lockPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'conexao-seres-asaas-' . hash('sha256', $paymentId) . '.lock';
    $lockHandle = @fopen($lockPath, 'c');
    if ($lockHandle === false) {
        error_log('Asaas payment lock could not be opened. Payment ' . $paymentId);
        return true;
    }
    if (!@flock($lockHandle, LOCK_EX)) {
        fclose($lockHandle);
        error_log('Asaas payment lock could not be acquired. Payment ' . $paymentId);
        return true;
    }
    try {
        return process_payment_event($baseUrl, $apiKey, $payment, $event);
    } finally {
        flock($lockHandle, LOCK_UN);
        fclose($lockHandle);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['message' => 'Método não permitido.'], 405);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 100000) {
    respond(['message' => 'Dados enviados são muito extensos.'], 413);
}

$fileConfig = [];
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) {
        $fileConfig = $loaded;
    }
}

$expectedToken = trim((string) (getenv('ASAAS_WEBHOOK_TOKEN') ?: ($fileConfig['asaas_webhook_token'] ?? '')));
$receivedToken = trim((string) ($_SERVER['HTTP_ASAAS_ACCESS_TOKEN'] ?? ''));
if ($expectedToken === '' || $expectedToken === 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_ASAAS') {
    respond(['received' => true, 'processed' => false], 200);
}
if (!hash_equals($expectedToken, $receivedToken)) {
    respond(['message' => 'Não autorizado.'], 401);
}

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) ? json_decode($rawBody, true) : null;
if (!is_array($payload)) {
    respond(['message' => 'Payload inválido.'], 400);
}

$event = is_string($payload['event'] ?? null) ? $payload['event'] : '';
if ($event !== 'PAYMENT_CONFIRMED' && $event !== 'PAYMENT_RECEIVED') {
    respond(['received' => true, 'processed' => false], 200);
}

$payment = $payload['payment'] ?? null;
if (!is_array($payment) || !is_first_session_payment_event($payment, $event)) {
    error_log('Asaas payment webhook ignored: not a valid first-session payment event. Event ' . $event);
    respond(['received' => true, 'processed' => false], 200);
}

$apiKey = trim((string) (getenv('ASAAS_API_KEY') ?: ($fileConfig['asaas_api_key'] ?? '')));
if ($apiKey === '' || $apiKey === 'COLE_AQUI_A_CHAVE_DA_API_DO_ASAAS') {
    respond(['received' => true, 'processed' => false], 200);
}
if (!function_exists('curl_init')) {
    respond(['received' => true, 'processed' => false], 200);
}

$baseUrl = rtrim((string) (getenv('ASAAS_API_URL') ?: ($fileConfig['asaas_api_url'] ?? 'https://api.asaas.com/v3')), '/');
$retry = process_with_payment_lock($baseUrl, $apiKey, $payment, $event);
if ($retry) {
    respond(['message' => 'Processamento fiscal temporariamente indisponível.'], 500);
}
respond(['received' => true, 'processed' => true], 200);
