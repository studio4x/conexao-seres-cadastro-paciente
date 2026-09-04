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
    $allowedStatuses = $event === 'PAYMENT_CONFIRMED' ? ['CONFIRMED'] : ['RECEIVED', 'RECEIVED_IN_CASH'];
    return is_first_session_payment($payment) && in_array(($payment['status'] ?? ''), $allowedStatuses, true);
}

function optional_payment_string(array $payment, string $field): string
{
    return is_string($payment[$field] ?? null) ? $payment[$field] : '';
}

function observation_date_is_valid(string $value): bool
{
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $value) !== 1) {
        return false;
    }

    $date = DateTimeImmutable::createFromFormat('!d/m/Y', $value);
    $errors = DateTimeImmutable::getLastErrors();
    return $date !== false
        && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))
        && $date->format('d/m/Y') === $value;
}

function parse_first_session_from_observations(mixed $observations): array
{
    $lines = is_string($observations) ? preg_split('/\r\n|\r|\n/', $observations) : [];
    $patientName = '';
    $patientNameLinePresent = false;
    $firstSessionDate = '';
    $firstSessionTime = '';
    $firstSessionMode = '';

    foreach ($lines as $line) {
        if (!is_string($line)) {
            continue;
        }
        if (preg_match('/^Pessoa atendida:(.*)$/u', $line, $matches) === 1) {
            $patientNameLinePresent = true;
            $patientName = trim($matches[1]);
            continue;
        }
        if (
            preg_match(
                '/^Primeira sessão: (\d{2}\/\d{2}\/\d{4}) às ((?:[01]\d|2[0-3]):[0-5]\d)$/u',
                $line,
                $matches
            ) === 1
            && observation_date_is_valid($matches[1])
        ) {
            $firstSessionDate = $matches[1];
            $firstSessionTime = $matches[2];
            continue;
        }
        if ($line === 'Modalidade da primeira sessão: Presencial') {
            $firstSessionMode = 'IN_PERSON';
        } elseif (
            $line === 'Modalidade da primeira sessão: Online via Google Meet'
            || $line === 'Modalidade da primeira sessão: Online'
        ) {
            $firstSessionMode = 'ONLINE';
        }
    }

    return [
        'patientName' => $patientName,
        'patientNameLinePresent' => $patientNameLinePresent,
        'firstSessionDate' => $firstSessionDate,
        'firstSessionTime' => $firstSessionTime,
        'firstSessionMode' => $firstSessionMode,
    ];
}

function notify_n8n_first_session_paid_safely(
    string $baseUrl,
    string $apiKey,
    string $webhookUrl,
    string $webhookToken,
    array $payment,
    string $event,
    ?string $asaasEventId
): bool {
    $paymentId = trim((string) ($payment['id'] ?? ''));
    if ($webhookUrl === '' || $webhookToken === '' || $webhookToken === 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N') {
        error_log('n8n first-session-paid webhook is not configured. Payment ' . $paymentId . ' Event ' . $event);
        return false;
    }

    $parsedUrl = parse_url($webhookUrl);
    if (!is_array($parsedUrl) || !in_array($parsedUrl['scheme'] ?? '', ['http', 'https'], true)) {
        error_log('n8n first-session-paid webhook URL is invalid. Payment ' . $paymentId . ' Event ' . $event);
        return false;
    }

    $customerId = trim((string) ($payment['customer'] ?? ''));
    $customer = asaas_request('GET', $baseUrl . '/customers/' . rawurlencode($customerId), $apiKey);
    $customerName = trim((string) ($customer['data']['name'] ?? ''));
    if ($customer['error'] !== '' || $customer['status'] < 200 || $customer['status'] >= 300 || $customerName === '') {
        error_log('n8n first-session-paid customer lookup failed. Payment ' . $paymentId . ' Event ' . $event . ' HTTP ' . (int) ($customer['status'] ?? 0));
        return false;
    }
    $mobilePhone = is_string($customer['data']['mobilePhone'] ?? null) ? trim($customer['data']['mobilePhone']) : '';
    $phone = is_string($customer['data']['phone'] ?? null) ? trim($customer['data']['phone']) : '';
    $customerWhatsapp = $mobilePhone !== '' ? $mobilePhone : $phone;
    $firstSession = parse_first_session_from_observations($customer['data']['observations'] ?? null);
    $patientName = $firstSession['patientName'] !== ''
        ? $firstSession['patientName']
        : ($firstSession['patientNameLinePresent'] ? '' : $customerName);

    $invoiceNumber = optional_payment_string($payment, 'invoiceNumber');
    $invoiceUrl = optional_payment_string($payment, 'invoiceUrl');
    if ($invoiceNumber === '' || $invoiceUrl === '') {
        $paymentDetails = asaas_request('GET', $baseUrl . '/payments/' . rawurlencode($paymentId), $apiKey);
        if ($paymentDetails['status'] >= 200 && $paymentDetails['status'] < 300) {
            if ($invoiceNumber === '') {
                $invoiceNumber = optional_payment_string($paymentDetails['data'], 'invoiceNumber');
            }
            if ($invoiceUrl === '') {
                $invoiceUrl = optional_payment_string($paymentDetails['data'], 'invoiceUrl');
            }
        } else {
            error_log(
                'n8n first-session-paid payment invoice lookup failed. Payment ' . $paymentId
                . ' Event ' . $event . ' HTTP ' . (int) ($paymentDetails['status'] ?? 0)
                . ' Error ' . ($paymentDetails['error'] ?? '')
            );
        }
    }

    $payload = [
        'eventType' => 'asaas_first_session_paid',
        'asaasEventId' => $asaasEventId,
        'asaasEvent' => $event,
        'paymentId' => $paymentId,
        'asaasCustomerId' => $customerId,
        'customerName' => $customerName,
        'customerWhatsapp' => $customerWhatsapp,
        'patientName' => $patientName,
        'firstSessionDate' => $firstSession['firstSessionDate'],
        'firstSessionTime' => $firstSession['firstSessionTime'],
        'firstSessionMode' => $firstSession['firstSessionMode'],
        'invoiceNumber' => $invoiceNumber,
        'invoiceUrl' => $invoiceUrl,
        'value' => is_numeric($payment['value'] ?? null) ? (float) $payment['value'] : 0,
        'billingType' => trim((string) ($payment['billingType'] ?? '')),
        'status' => trim((string) ($payment['status'] ?? '')),
        'paymentDate' => effective_date_from_payment($payment),
        'externalReference' => trim((string) ($payment['externalReference'] ?? '')),
    ];
    $encodedPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encodedPayload)) {
        error_log('n8n first-session-paid webhook payload could not be encoded. Payment ' . $paymentId . ' Event ' . $event);
        return false;
    }

    try {
        $curl = curl_init($webhookUrl);
        if ($curl === false) {
            error_log('n8n first-session-paid webhook could not initialize cURL. Payment ' . $paymentId . ' Event ' . $event);
            return false;
        }
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $encodedPayload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $webhookToken,
            ],
        ]);
        curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);
        if ($error !== '' || $status < 200 || $status >= 300) {
            error_log('n8n first-session-paid webhook failed. Payment ' . $paymentId . ' Event ' . $event . ' HTTP ' . $status . ' TimedOut ' . (int) ($error !== '' && stripos($error, 'timed out') !== false));
            return false;
        }
        return true;
    } catch (Throwable) {
        error_log('n8n first-session-paid webhook request failed. Payment ' . $paymentId . ' Event ' . $event);
        return false;
    }
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
    $codeMatches = [];
    $descriptionMatches = [];
    foreach ($services as $service) {
        if (!is_array($service)) {
            continue;
        }
        $code = normalize_code($service['code'] ?? $service['municipalServiceCode'] ?? '');
        $description = strtolower(service_name($service));
        $description = function_exists('iconv')
            ? strtolower((string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $description) ?: $description))
            : $description;
        if ($code === normalize_code('04510')) {
            $codeMatches[] = $service;
        } elseif (str_contains($description, '04510') && str_contains($description, '4.08') && str_contains($description, 'terapia ocupacional')) {
            $descriptionMatches[] = $service;
        }
    }
    $candidates = count($codeMatches) > 0 ? $codeMatches : $descriptionMatches;
    if (count($candidates) !== 1) {
        return null;
    }
    $selected = $candidates[0];
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

function service_diagnostics(array $services): array
{
    $diagnostics = [];
    foreach (array_slice($services, 0, 5) as $service) {
        if (!is_array($service)) {
            continue;
        }
        $diagnostics[] = [
            'id' => substr(trim((string) ($service['id'] ?? '')), 0, 80),
            'description' => substr(service_name($service), 0, 160),
        ];
    }
    return $diagnostics;
}

function list_municipal_services(string $baseUrl, string $apiKey): array
{
    $services = [];
    $limit = 100;
    $offset = 0;
    while (true) {
        $result = asaas_request(
            'GET',
            $baseUrl . '/fiscalInfo/services?' . http_build_query(['offset' => $offset, 'limit' => $limit]),
            $apiKey
        );
        if ($result['error'] !== '' || $result['status'] < 200 || $result['status'] >= 300) {
            log_asaas_failure('Asaas municipal service lookup failed', $result, ['offset' => $offset, 'limit' => $limit]);
            return ['services' => [], 'failed' => true, 'retry' => is_transient_asaas_failure($result)];
        }
        $page = is_array($result['data']['data'] ?? null) ? $result['data']['data'] : [];
        $services = array_merge($services, $page);
        $totalCount = is_numeric($result['data']['totalCount'] ?? null) ? (int) $result['data']['totalCount'] : null;
        $hasMore = ($result['data']['hasMore'] ?? false) === true
            || ($totalCount !== null && $offset + count($page) < $totalCount);
        if (!$hasMore || count($page) === 0) {
            break;
        }
        $offset += count($page);
    }
    return ['services' => $services, 'failed' => false, 'retry' => false];
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

    $servicesResult = list_municipal_services($baseUrl, $apiKey);
    if ($servicesResult['failed']) {
        return (bool) $servicesResult['retry'];
    }
    $serviceList = $servicesResult['services'];
    $service = select_municipal_service($serviceList);
    $codeMatches = array_values(array_filter($serviceList, static function (mixed $candidate): bool {
        return is_array($candidate)
            && normalize_code($candidate['code'] ?? $candidate['municipalServiceCode'] ?? '') === normalize_code('04510');
    }));
    $descriptionMatches = array_values(array_filter($serviceList, static function (mixed $candidate): bool {
        if (!is_array($candidate)) {
            return false;
        }
        $description = strtolower(service_name($candidate));
        $description = function_exists('iconv')
            ? strtolower((string) (iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $description) ?: $description))
            : $description;
        return str_contains($description, '04510')
            && str_contains($description, '4.08')
            && str_contains($description, 'terapia ocupacional');
    }));
    $matches = count($codeMatches) > 0 ? $codeMatches : $descriptionMatches;
    if (!$service && count($matches) > 1) {
        error_log('Asaas municipal service 04510 matched multiple services; invoice was not created. ' . json_encode([
            'paymentId' => $paymentId,
            'customerId' => $customerId,
            'matches' => service_diagnostics($matches),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        return false;
    }
    if (!$service) {
        $service = [
            'code' => '04510',
            'name' => '04510 | 4.08 - Terapia ocupacional.',
            'source' => 'configured-code',
        ];
        error_log('Asaas municipal service 04510 was not returned; using configured municipalServiceCode. Payment ' . $paymentId);
    } elseif (!empty($service['id'])) {
        error_log('Asaas municipal service selected by id. Payment ' . $paymentId . ' Service ' . substr((string) $service['id'], 0, 80));
    } else {
        error_log('Asaas municipal service selected by code. Payment ' . $paymentId . ' Service ' . substr((string) ($service['code'] ?? ''), 0, 80));
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
$n8nPaymentWebhookUrl = trim((string) (getenv('N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_URL') ?: ($fileConfig['n8n_pagamento_webhook_url'] ?? '')));
$n8nPaymentWebhookToken = trim((string) (getenv('N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_TOKEN') ?: ($fileConfig['n8n_pagamento_webhook_token'] ?? '')));
$asaasEventId = is_string($payload['id'] ?? null) ? trim((string) $payload['id']) : null;
notify_n8n_first_session_paid_safely(
    $baseUrl,
    $apiKey,
    $n8nPaymentWebhookUrl,
    $n8nPaymentWebhookToken,
    $payment,
    $event,
    $asaasEventId !== '' ? $asaasEventId : null
);
$retry = process_with_payment_lock($baseUrl, $apiKey, $payment, $event);
if ($retry) {
    respond(['message' => 'Processamento fiscal temporariamente indisponível.'], 500);
}
respond(['received' => true, 'processed' => true], 200);
