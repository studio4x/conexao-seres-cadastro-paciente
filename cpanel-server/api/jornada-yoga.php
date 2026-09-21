<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const JORNADA_OBSERVATIONS_SAFETY_BUDGET_BYTES = 550;

$journeyStage = 'bootstrap';

register_shutdown_function(static function () use (&$journeyStage): void {
    $error = error_get_last();
    if (!is_array($error)) {
        return;
    }

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array((int) ($error['type'] ?? 0), $fatalTypes, true)) {
        return;
    }

    error_log(
        'Journey fatal error at stage ' . $journeyStage
        . ': ' . (string) ($error['message'] ?? 'unknown')
        . ' in ' . basename((string) ($error['file'] ?? 'unknown'))
        . ':' . (int) ($error['line'] ?? 0)
    );

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }

    echo json_encode(
        [
            'success' => false,
            'message' => 'O servidor encontrou uma falha ao processar a inscrição. Tente novamente em instantes.',
            'code' => 'JOURNEY_SERVER_ERROR',
            'stage' => $journeyStage,
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
});

function reply(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function digits(string $value): string
{
    return preg_replace('/\D+/', '', $value) ?? '';
}

function clean_text(string $value): string
{
    return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
}

function valid_cpf(string $value): bool
{
    $cpf = digits($value);
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }

    for ($position = 9; $position <= 10; $position++) {
        $sum = 0;
        $factor = $position + 1;
        for ($index = 0; $index < $position; $index++) {
            $sum += (int) $cpf[$index] * ($factor - $index);
        }
        $digit = ($sum * 10) % 11;
        if ($digit === 10) {
            $digit = 0;
        }
        if ($digit !== (int) $cpf[$position]) {
            return false;
        }
    }

    return true;
}

function valid_phone(string $value): bool
{
    $number = digits($value);
    if (strlen($number) === 13 && str_starts_with($number, '55')) {
        $number = substr($number, 2);
    }

    return strlen($number) === 11 && $number[2] === '9';
}

function national_phone(string $value): string
{
    $number = digits($value);
    return strlen($number) === 13 && str_starts_with($number, '55')
        ? substr($number, 2)
        : $number;
}

function valid_cep(string $value): bool
{
    return preg_match('/^\d{8}$/', digits($value)) === 1;
}

function valid_birth_date(string $value): bool
{
    $birth = DateTimeImmutable::createFromFormat(
        '!Y-m-d',
        $value,
        new DateTimeZone('America/Sao_Paulo')
    );
    $errors = DateTimeImmutable::getLastErrors();

    if (
        !$birth
        || ($errors !== false && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0))
        || $birth->format('Y-m-d') !== $value
        || (int) $birth->format('Y') < 1900
    ) {
        return false;
    }

    $today = new DateTimeImmutable('today', new DateTimeZone('America/Sao_Paulo'));
    if ($birth > $today) {
        return false;
    }

    $age = $birth->diff($today)->y;
    return $age >= 18 && $age <= 120;
}

function valid_discovery_source(string $value): bool
{
    return in_array(
        $value,
        [
            'Instagram',
            'Facebook',
            'WhatsApp',
            'Google / pesquisa na internet',
            'Site da Conexão Seres',
            'Indicação de amigo(a) ou familiar',
            'Indicação de profissional',
            'Já conhecia a Conexão Seres',
            'Outro',
        ],
        true
    );
}

function format_birth_date_br(string $value): string
{
    $parts = explode('-', $value);
    return count($parts) === 3
        ? $parts[2] . '/' . $parts[1] . '/' . $parts[0]
        : $value;
}

function journey_observations_block(
    string $birthDate,
    string $discoverySource,
    string $discoveryOther = ''
): string {
    $discoveryLabel = $discoverySource === 'Outro'
        ? 'Outro — ' . clean_text($discoveryOther)
        : $discoverySource;

    return 'Jornada 2026: Nasc. ' . format_birth_date_br($birthDate)
        . ' | Origem: ' . $discoveryLabel;
}

function merge_journey_observations(
    string $current,
    string $birthDate,
    string $discoverySource,
    string $discoveryOther = ''
): string {
    $legacyStartMarker = '[JORNADA DE EXPANSÃO MENTAL E CORPORAL 2026]';
    $legacyEndMarker = '[/JORNADA DE EXPANSÃO MENTAL E CORPORAL 2026]';
    $compactPrefix = 'Jornada 2026:';
    $block = journey_observations_block(
        $birthDate,
        $discoverySource,
        $discoveryOther
    );
    $existing = trim($current);

    if ($existing === '') {
        return $block;
    }

    $legacyStart = strpos($existing, $legacyStartMarker);
    $legacyEnd = strpos($existing, $legacyEndMarker);
    if ($legacyStart !== false && $legacyEnd !== false && $legacyEnd >= $legacyStart) {
        $after = $legacyEnd + strlen($legacyEndMarker);
        $existing = trim(
            substr($existing, 0, $legacyStart)
            . "\n"
            . substr($existing, $after)
        );
    }

    $lines = preg_split('/\r?\n/', $existing) ?: [];
    $preserved = [];
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), $compactPrefix)) {
            continue;
        }
        $preserved[] = $line;
    }

    $base = trim(implode("\n", $preserved));
    return $base === '' ? $block : $base . "\n" . $block;
}

function journey_observations_utf8_bytes(string $value): int
{
    return strlen($value);
}

function journey_observations_within_safety_budget(string $value): bool
{
    return journey_observations_utf8_bytes($value)
        <= JORNADA_OBSERVATIONS_SAFETY_BUDGET_BYTES;
}

function api(string $method, string $url, string $key, ?array $payload = null): array
{
    $method = strtoupper($method);
    $maxAttempts = in_array($method, ['GET', 'PUT'], true) ? 2 : 1;
    $last = ['ok' => false, 'status' => 0, 'data' => [], 'curlError' => ''];

    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        $curl = curl_init($url);
        if (!$curl) {
            return ['ok' => false, 'status' => 0, 'data' => [], 'curlError' => 'curl_init failed'];
        }

        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'User-Agent: ConexaoSeresJornadaYoga/1.0',
                'access_token: ' . $key,
            ],
        ];

        if ($payload !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode(
                $payload,
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
        }

        curl_setopt_array($curl, $options);
        $raw = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $errorNumber = curl_errno($curl);
        $errorMessage = curl_error($curl);
        curl_close($curl);

        $parsed = is_string($raw) ? json_decode($raw, true) : null;
        $last = [
            'ok' => $errorNumber === 0 && $status >= 200 && $status < 300,
            'status' => $status,
            'data' => is_array($parsed) ? $parsed : [],
            'curlError' => $errorMessage,
        ];

        if ($last['ok']) {
            return $last;
        }

        $retryable = $errorNumber !== 0 || $status === 429 || $status >= 500;
        if (!$retryable || $attempt >= $maxAttempts) {
            break;
        }

        usleep(250000);
    }

    return $last;
}

function api_error_summary(array $result): string
{
    $messages = [];
    foreach (($result['data']['errors'] ?? []) as $error) {
        if (!is_array($error)) {
            continue;
        }
        $description = clean_text((string) ($error['description'] ?? $error['message'] ?? ''));
        if ($description !== '') {
            $messages[] = mb_substr($description, 0, 180);
        }
    }

    $curlError = clean_text((string) ($result['curlError'] ?? ''));
    if ($curlError !== '') {
        $messages[] = mb_substr($curlError, 0, 180);
    }

    return implode(' | ', array_slice($messages, 0, 3));
}

function log_api_failure(string $stage, array $result): void
{
    error_log(
        'Journey Asaas failure at stage ' . $stage
        . ' HTTP ' . (int) ($result['status'] ?? 0)
        . ' ' . api_error_summary($result)
    );
}

function customer_list(
    string $base,
    string $key,
    string $field,
    string $value
): ?array {
    $result = api(
        'GET',
        $base . '/customers?' . http_build_query([$field => $value, 'limit' => 100]),
        $key
    );

    if (!$result['ok']) {
        log_api_failure('customer-list-' . $field, $result);
        return null;
    }

    return is_array($result['data']['data'] ?? null) ? $result['data']['data'] : [];
}

function customer_ids(array $items): array
{
    $ids = [];
    foreach ($items as $item) {
        $id = is_array($item) ? trim((string) ($item['id'] ?? '')) : '';
        if ($id !== '') {
            $ids[$id] = true;
        }
    }
    return array_keys($ids);
}

function resolve_customer(array $cpfMatches, array $emailMatches): array
{
    $cpfIds = customer_ids($cpfMatches);
    $emailIds = customer_ids($emailMatches);
    $both = array_values(array_intersect($cpfIds, $emailIds));

    if (count($cpfIds) > 1 || count($emailIds) > 1) {
        return ['id' => '', 'conflict' => true];
    }
    if (count($both) === 1) {
        return ['id' => $both[0], 'conflict' => false];
    }
    if (count($cpfIds) === 1 && !$emailIds) {
        return ['id' => $cpfIds[0], 'conflict' => false];
    }
    if (count($emailIds) === 1 && !$cpfIds) {
        return ['id' => $emailIds[0], 'conflict' => false];
    }
    if (!$cpfIds && !$emailIds) {
        return ['id' => '', 'conflict' => false];
    }

    return ['id' => '', 'conflict' => true];
}

function payment_ref(string $cpf): string
{
    return 'cs-jornada-yoga-2026-' .
        substr(hash('sha256', 'jornada-yoga-2026:' . digits($cpf)), 0, 24);
}

function customer_ref(string $cpf): string
{
    return 'cs-jornada-cliente-' .
        substr(hash('sha256', 'conexao-seres-jornada-cliente:' . digits($cpf)), 0, 24);
}

function due_date(): string
{
    $date = new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo'));
    $weekday = (int) $date->format('N');
    return $date
        ->modify('+' . ($weekday === 5 ? 3 : ($weekday === 6 ? 2 : 1)) . ' day')
        ->format('Y-m-d');
}

function find_payment(string $base, string $key, string $reference): array
{
    $result = api(
        'GET',
        $base . '/payments?' . http_build_query([
            'externalReference' => $reference,
            'limit' => 10,
        ]),
        $key
    );

    if (!$result['ok']) {
        log_api_failure('payment-lookup', $result);
        return ['ok' => false, 'payment' => null];
    }

    foreach (($result['data']['data'] ?? []) as $payment) {
        if (
            is_array($payment)
            && ($payment['externalReference'] ?? '') === $reference
            && trim((string) ($payment['id'] ?? '')) !== ''
        ) {
            return ['ok' => true, 'payment' => $payment];
        }
    }

    return ['ok' => true, 'payment' => null];
}

function get_payment(string $base, string $key, string $paymentId): ?array
{
    $result = api('GET', $base . '/payments/' . rawurlencode($paymentId), $key);
    if (!$result['ok']) {
        log_api_failure('payment-get', $result);
        return null;
    }
    return $result['data'];
}

function get_customer(string $base, string $key, string $customerId): ?array
{
    $result = api('GET', $base . '/customers/' . rawurlencode($customerId), $key);
    if (!$result['ok']) {
        log_api_failure('customer-get', $result);
        return null;
    }
    return $result['data'];
}

function update_customer_registration(
    string $base,
    string $key,
    string $customerId,
    string $expectedCpf,
    array $address,
    string $birthDate,
    string $discoverySource,
    string $discoveryOther
): array {
    $current = get_customer($base, $key, $customerId);
    if (!is_array($current)) {
        error_log(
            'Journey customer lookup before update failed. Customer prefix '
            . substr($customerId, 0, 20)
        );
        return [
            'ok' => false,
            'code' => 'customer-get-failed',
            'stage' => 'customer-get',
            'providerStatus' => 0,
        ];
    }

    $currentCpf = digits((string) ($current['cpfCnpj'] ?? ''));
    if ($currentCpf === '' || $currentCpf !== digits($expectedCpf)) {
        error_log(
            'Journey linked customer CPF mismatch. Customer prefix '
            . substr($customerId, 0, 20)
        );
        return [
            'ok' => false,
            'code' => 'customer-mismatch',
            'stage' => 'customer-identity-check',
            'providerStatus' => 409,
        ];
    }

    if (($current['deleted'] ?? false) === true) {
        $restore = api(
            'POST',
            $base . '/customers/' . rawurlencode($customerId) . '/restore',
            $key
        );

        if (!$restore['ok']) {
            log_api_failure('customer-restore', $restore);
            return [
                'ok' => false,
                'code' => 'customer-restore-failed',
                'stage' => 'customer-restore',
                'providerStatus' => (int) ($restore['status'] ?? 0),
            ];
        }

        $current = get_customer($base, $key, $customerId);
        if (!is_array($current) || (($current['deleted'] ?? false) === true)) {
            return [
                'ok' => false,
                'code' => 'customer-restore-not-confirmed',
                'stage' => 'customer-restore-confirmation',
                'providerStatus' => 0,
            ];
        }
    }

    $observations = merge_journey_observations(
        (string) ($current['observations'] ?? ''),
        $birthDate,
        $discoverySource,
        $discoveryOther
    );

    if (!journey_observations_within_safety_budget($observations)) {
        error_log(
            'Journey customer observations exceed safety budget. UTF-8 bytes: '
            . journey_observations_utf8_bytes($observations)
            . '. Safety budget bytes: ' . JORNADA_OBSERVATIONS_SAFETY_BUDGET_BYTES
        );
        return [
            'ok' => false,
            'code' => 'observations-too-long',
            'stage' => 'observations-budget',
        ];
    }

    $addressPayload = [
        'postalCode' => (string) ($address['postalCode'] ?? ''),
        'address' => (string) ($address['address'] ?? ''),
        'addressNumber' => (string) ($address['addressNumber'] ?? ''),
        'province' => (string) ($address['province'] ?? ''),
    ];

    $complement = trim((string) ($address['complement'] ?? ''));
    if ($complement !== '') {
        $addressPayload['complement'] = $complement;
    }

    $addressResult = api(
        'PUT',
        $base . '/customers/' . rawurlencode($customerId),
        $key,
        $addressPayload
    );

    if (!$addressResult['ok']) {
        log_api_failure('customer-address-update', $addressResult);
        return [
            'ok' => false,
            'code' => 'address-update-failed',
            'stage' => 'customer-address-update',
            'providerStatus' => (int) ($addressResult['status'] ?? 0),
        ];
    }

    $observationsResult = api(
        'PUT',
        $base . '/customers/' . rawurlencode($customerId),
        $key,
        ['observations' => $observations]
    );

    if (!$observationsResult['ok']) {
        log_api_failure('customer-observations-update', $observationsResult);
        return [
            'ok' => false,
            'code' => 'observations-update-failed',
            'stage' => 'customer-observations-update',
            'providerStatus' => (int) ($observationsResult['status'] ?? 0),
        ];
    }

    return [
        'ok' => true,
        'code' => 'ok',
        'stage' => 'customer-update-complete',
    ];
}

function verify_turnstile(
    string $secret,
    string $token,
    string $hostname
): bool {
    $curl = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    if (!$curl) {
        return false;
    }

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode([
            'secret' => $secret,
            'response' => $token,
        ]),
    ]);

    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    $data = is_string($raw) ? json_decode($raw, true) : null;

    return $status >= 200
        && $status < 300
        && is_array($data)
        && ($data['success'] ?? false) === true
        && ($data['action'] ?? '') === 'jornada_yoga'
        && ($hostname === '' || ($data['hostname'] ?? '') === $hostname);
}

function post_n8n(string $url, string $authToken, array $payload): void
{
    if (
        $url === ''
        || $authToken === ''
        || str_starts_with($authToken, 'COLE_AQUI')
    ) {
        return;
    }

    $curl = curl_init($url);
    if (!$curl) {
        return;
    }

    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 3,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $authToken,
        ],
        CURLOPT_POSTFIELDS => json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ),
    ]);

    curl_exec($curl);
    curl_close($curl);
}

function payment_payload(
    array $payment,
    bool $existingRegistration,
    bool $existingCustomer
): array {
    return [
        'success' => true,
        'eventId' => 'jornada-yoga-2026',
        'paymentId' => (string) ($payment['id'] ?? ''),
        'invoiceUrl' => (string) ($payment['invoiceUrl'] ?? ''),
        'status' => (string) ($payment['status'] ?? 'PENDING'),
        'value' => 297,
        'existingRegistration' => $existingRegistration,
        'existingCustomer' => $existingCustomer,
    ];
}

try {
$journeyStage = 'request-validation';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    reply(['message' => 'Método não permitido.'], 405);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 12000) {
    reply(['message' => 'Dados enviados são muito extensos.'], 413);
}

$config = [];
$configFile = __DIR__ . '/config.php';
if (is_file($configFile)) {
    $loaded = require $configFile;
    if (is_array($loaded)) {
        $config = $loaded;
    }
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) {
    reply(['message' => 'Dados inválidos.'], 400);
}

$name = clean_text((string) ($body['name'] ?? ''));
$cpf = digits((string) ($body['cpf'] ?? ''));
$email = strtolower(trim((string) ($body['email'] ?? '')));
$phone = national_phone((string) ($body['whatsapp'] ?? ''));
$birthDate = trim((string) ($body['birthDate'] ?? ''));
$discoverySource = clean_text((string) ($body['discoverySource'] ?? ''));
$discoveryOther = clean_text((string) ($body['discoveryOther'] ?? ''));
$postalCode = digits((string) ($body['postalCode'] ?? ''));
$addressLine = clean_text((string) ($body['address'] ?? ''));
$addressNumber = clean_text((string) ($body['addressNumber'] ?? ''));
$complement = clean_text((string) ($body['complement'] ?? ''));
$province = clean_text((string) ($body['province'] ?? ''));
$turnstile = trim((string) ($body['turnstileToken'] ?? ''));

if (
    mb_strlen($name) < 5
    || mb_strlen($name) > 120
    || count(preg_split('/\s+/u', $name) ?: []) < 2
    || !valid_cpf($cpf)
    || filter_var($email, FILTER_VALIDATE_EMAIL) === false
    || mb_strlen($email) > 150
    || !valid_phone($phone)
    || !valid_birth_date($birthDate)
    || !valid_discovery_source($discoverySource)
    || mb_strlen($discoveryOther) > 160
    || ($discoverySource === 'Outro' && mb_strlen($discoveryOther) < 2)
    || !valid_cep($postalCode)
    || mb_strlen($addressLine) < 3
    || mb_strlen($addressLine) > 180
    || $addressNumber === ''
    || mb_strlen($addressNumber) > 30
    || mb_strlen($complement) > 255
    || mb_strlen($province) < 2
    || mb_strlen($province) > 120
    || ($body['consent'] ?? false) !== true
    || (string) ($body['website'] ?? '') !== ''
    || $turnstile === ''
) {
    reply(['message' => 'Confira os dados informados e tente novamente.'], 400);
}

$address = [
    'postalCode' => $postalCode,
    'address' => $addressLine,
    'addressNumber' => $addressNumber,
    'complement' => $complement,
    'province' => $province,
];
$observations = journey_observations_block(
    $birthDate,
    $discoverySource,
    $discoverySource === 'Outro' ? $discoveryOther : ''
);

if (!journey_observations_within_safety_budget($observations)) {
    reply(
        [
            'success' => false,
            'message' => 'Os dados da inscrição ficaram extensos demais para serem gravados com segurança. Entre em contato com a Conexão Seres.',
            'code' => 'JOURNEY_OBSERVATIONS_TOO_LONG',
        ],
        400
    );
}

$key = trim((string) ($config['asaas_api_key'] ?? ''));
$base = rtrim(
    (string) ($config['asaas_api_url'] ?? 'https://api.asaas.com/v3'),
    '/'
);
$secret = trim((string) ($config['turnstile_secret_key'] ?? ''));
$hostname = trim((string) ($config['turnstile_expected_hostname'] ?? ''));

if ($key === '' || $secret === '' || !function_exists('curl_init')) {
    reply(['message' => 'As inscrições estão temporariamente indisponíveis.'], 503);
}

if (!verify_turnstile($secret, $turnstile, $hostname)) {
    reply(
        ['message' => 'Não foi possível confirmar a verificação de segurança.'],
        400
    );
}

$journeyStage = 'payment-lookup';
$reference = payment_ref($cpf);
$found = find_payment($base, $key, $reference);

if (!$found['ok']) {
    reply(
        [
            'success' => false,
            'message' => 'Não conseguimos confirmar sua inscrição agora.',
            'code' => 'JOURNEY_PAYMENT_LOOKUP_FAILED',
            'stage' => $journeyStage,
        ],
        424
    );
}

if (is_array($found['payment'])) {
    $payment = $found['payment'];
    $paymentId = trim((string) ($payment['id'] ?? ''));
    if ($paymentId !== '') {
        $payment = get_payment($base, $key, $paymentId) ?? $payment;
    }

    $customerId = trim((string) ($payment['customer'] ?? ''));
    if ($customerId === '') {
        reply(
            [
                'success' => false,
                'message' =>
                    'Localizamos sua inscrição, mas não conseguimos identificar o cadastro necessário para processá-la.',
                'code' => 'JOURNEY_PAYMENT_CUSTOMER_MISSING',
                'stage' => $journeyStage,
            ],
            424
        );
    }

    $journeyStage = 'existing-registration-customer-update';
    $updateResult = update_customer_registration(
        $base,
        $key,
        $customerId,
        $cpf,
        $address,
        $birthDate,
        $discoverySource,
        $discoverySource === 'Outro' ? $discoveryOther : ''
    );
    if (!($updateResult['ok'] ?? false)) {
        $updateCode = (string) ($updateResult['code'] ?? 'customer-update-failed');
        $tooLong = $updateCode === 'observations-too-long';
        $addressFailed = $updateCode === 'address-update-failed';
        $observationsFailed = $updateCode === 'observations-update-failed';
        $restoreFailed = in_array(
            $updateCode,
            ['customer-restore-failed', 'customer-restore-not-confirmed'],
            true
        );
        $customerMismatch = $updateCode === 'customer-mismatch';

        reply(
            [
                'success' => false,
                'message' => $tooLong
                    ? 'Seu cadastro já possui muitas informações nas observações. Entre em contato com a Conexão Seres para concluirmos sua inscrição sem perder dados anteriores.'
                    : ($restoreFailed
                        ? 'Localizamos uma inscrição anterior vinculada a um cadastro removido, mas não conseguimos reativá-lo automaticamente. Entre em contato com a Conexão Seres.'
                        : ($customerMismatch
                            ? 'Localizamos uma inscrição anterior que não corresponde ao CPF informado. Entre em contato com a Conexão Seres.'
                            : ($addressFailed
                                ? 'Localizamos sua inscrição, mas o endereço para emissão fiscal não pôde ser atualizado. Confira os dados e tente novamente.'
                                : ($observationsFailed
                                    ? 'Localizamos sua inscrição, mas os dados complementares da Jornada não puderam ser registrados. Tente novamente.'
                                    : 'Localizamos sua inscrição, mas não conseguimos atualizar os dados necessários para a inscrição e emissão fiscal. Tente novamente.'))),
                'code' => $tooLong
                    ? 'JOURNEY_OBSERVATIONS_TOO_LONG'
                    : ($restoreFailed
                        ? 'JOURNEY_CUSTOMER_RESTORE_FAILED'
                        : ($customerMismatch
                            ? 'JOURNEY_CUSTOMER_MISMATCH'
                            : ($addressFailed
                                ? 'JOURNEY_ADDRESS_UPDATE_FAILED'
                                : ($observationsFailed
                                    ? 'JOURNEY_OBSERVATIONS_UPDATE_FAILED'
                                    : 'JOURNEY_EXISTING_REGISTRATION_UPDATE_FAILED')))),
                'stage' => (string) ($updateResult['stage'] ?? $journeyStage),
                'providerStatus' => (int) ($updateResult['providerStatus'] ?? 0),
            ],
            ($tooLong || $customerMismatch) ? 409 : 424
        );
    }

    post_n8n(
        trim((string) ($config['n8n_jornada_webhook_url'] ?? '')),
        trim((string) ($config['n8n_jornada_webhook_token'] ?? '')),
        [
            'eventType' => 'jornada_yoga_registration_created',
            'eventId' => 'jornada-yoga-2026',
            'customerName' => $name,
            'customerEmail' => $email,
            'customerWhatsapp' => $phone,
            'asaasCustomerId' => $customerId,
            'paymentId' => (string) ($payment['id'] ?? ''),
            'invoiceUrl' => (string) ($payment['invoiceUrl'] ?? ''),
            'value' => 297,
            'status' => (string) ($payment['status'] ?? 'PENDING'),
            'externalReference' => $reference,
            'existingCustomer' => true,
        ]
    );

    reply(payment_payload($payment, true, true));
}

$journeyStage = 'customer-lookup';
$cpfMatches = customer_list($base, $key, 'cpfCnpj', $cpf);
$emailMatches = customer_list($base, $key, 'email', $email);

if ($cpfMatches === null || $emailMatches === null) {
    reply(
        [
            'success' => false,
            'message' => 'Não conseguimos consultar seu cadastro agora.',
            'code' => 'JOURNEY_CUSTOMER_LOOKUP_FAILED',
            'stage' => $journeyStage,
        ],
        424
    );
}

$resolved = resolve_customer($cpfMatches, $emailMatches);
if ($resolved['conflict']) {
    reply(
        [
            'message' =>
                'Encontramos mais de um cadastro relacionado aos dados informados. Entre em contato com a Conexão Seres.',
        ],
        409
    );
}

$customer = (string) $resolved['id'];
$existingCustomer = $customer !== '';

if ($customer !== '') {
    $journeyStage = 'customer-update';
    $updateResult = update_customer_registration(
        $base,
        $key,
        $customer,
        $cpf,
        $address,
        $birthDate,
        $discoverySource,
        $discoverySource === 'Outro' ? $discoveryOther : ''
    );
    if (!($updateResult['ok'] ?? false)) {
        $updateCode = (string) ($updateResult['code'] ?? 'customer-update-failed');
        $tooLong = $updateCode === 'observations-too-long';
        $addressFailed = $updateCode === 'address-update-failed';
        $observationsFailed = $updateCode === 'observations-update-failed';
        $restoreFailed = in_array(
            $updateCode,
            ['customer-restore-failed', 'customer-restore-not-confirmed'],
            true
        );
        $customerMismatch = $updateCode === 'customer-mismatch';

        reply(
            [
                'success' => false,
                'message' => $tooLong
                    ? 'Seu cadastro já possui muitas informações nas observações. Entre em contato com a Conexão Seres para concluirmos sua inscrição sem perder dados anteriores.'
                    : ($restoreFailed
                        ? 'Seu cadastro foi localizado como removido, mas não conseguimos reativá-lo automaticamente. Entre em contato com a Conexão Seres.'
                        : ($customerMismatch
                            ? 'O cadastro localizado não corresponde ao CPF informado. Entre em contato com a Conexão Seres.'
                            : ($addressFailed
                                ? 'Seu cadastro foi localizado, mas o endereço para emissão fiscal não pôde ser atualizado. Confira os dados e tente novamente.'
                                : ($observationsFailed
                                    ? 'Seu cadastro foi localizado, mas os dados complementares da Jornada não puderam ser registrados. Tente novamente.'
                                    : 'Seu cadastro foi localizado, mas não conseguimos atualizar os dados necessários para a inscrição e emissão fiscal.'))),
                'code' => $tooLong
                    ? 'JOURNEY_OBSERVATIONS_TOO_LONG'
                    : ($restoreFailed
                        ? 'JOURNEY_CUSTOMER_RESTORE_FAILED'
                        : ($customerMismatch
                            ? 'JOURNEY_CUSTOMER_MISMATCH'
                            : ($addressFailed
                                ? 'JOURNEY_ADDRESS_UPDATE_FAILED'
                                : ($observationsFailed
                                    ? 'JOURNEY_OBSERVATIONS_UPDATE_FAILED'
                                    : 'JOURNEY_CUSTOMER_UPDATE_FAILED')))),
                'stage' => (string) ($updateResult['stage'] ?? $journeyStage),
                'providerStatus' => (int) ($updateResult['providerStatus'] ?? 0),
            ],
            ($tooLong || $customerMismatch) ? 409 : 424
        );
    }
} else {
    $journeyStage = 'customer-create';
    $created = api(
        'POST',
        $base . '/customers',
        $key,
        [
            'name' => $name,
            'cpfCnpj' => $cpf,
            'email' => $email,
            'mobilePhone' => $phone,
            ...$address,
            'observations' => $observations,
            'externalReference' => customer_ref($cpf),
            'notificationDisabled' => false,
        ]
    );

    $customer = trim((string) ($created['data']['id'] ?? ''));
    if (!$created['ok'] || $customer === '') {
        log_api_failure('customer-create', $created);
        reply(
            [
                'success' => false,
                'message' => 'Não conseguimos concluir seu cadastro agora.',
                'code' => 'JOURNEY_CUSTOMER_CREATE_FAILED',
                'stage' => $journeyStage,
            ],
            424
        );
    }
}

$journeyStage = 'charge-lookup';
$charge = find_payment($base, $key, $reference);
if (!$charge['ok']) {
    reply(
        [
            'success' => false,
            'message' => 'Não conseguimos gerar a cobrança agora.',
            'code' => 'JOURNEY_CHARGE_LOOKUP_FAILED',
            'stage' => $journeyStage,
        ],
        424
    );
}

$createdPayment = false;

if (!is_array($charge['payment'])) {
    $journeyStage = 'charge-create';
    $made = api(
        'POST',
        $base . '/payments',
        $key,
        [
            'customer' => $customer,
            'billingType' => 'UNDEFINED',
            'value' => 297,
            'dueDate' => due_date(),
            'description' =>
                'Jornada de Expansão Mental e Corporal — 8 encontros online, de 07/10/2026 a 25/11/2026.',
            'externalReference' => $reference,
        ]
    );

    if ($made['ok'] && trim((string) ($made['data']['id'] ?? '')) !== '') {
        $charge['payment'] = $made['data'];
        $createdPayment = true;
    } else {
        log_api_failure('charge-create', $made);
        $journeyStage = 'charge-reconcile';
        $reconcile = find_payment($base, $key, $reference);
        if (!$reconcile['ok'] || !is_array($reconcile['payment'])) {
            reply(
                [
                    'success' => false,
                    'message' => 'Não conseguimos gerar a cobrança da Jornada agora.',
                    'code' => 'JOURNEY_CHARGE_CREATE_FAILED',
                    'stage' => $journeyStage,
                ],
                424
            );
        }
        $charge['payment'] = $reconcile['payment'];
    }
}

$payment = $charge['payment'];

$journeyStage = 'n8n-registration-notify';
post_n8n(
    trim((string) ($config['n8n_jornada_webhook_url'] ?? '')),
    trim((string) ($config['n8n_jornada_webhook_token'] ?? '')),
    [
        'eventType' => 'jornada_yoga_registration_created',
        'eventId' => 'jornada-yoga-2026',
        'customerName' => $name,
        'customerEmail' => $email,
        'customerWhatsapp' => $phone,
        'asaasCustomerId' => $customer,
        'paymentId' => (string) ($payment['id'] ?? ''),
        'invoiceUrl' => (string) ($payment['invoiceUrl'] ?? ''),
        'value' => 297,
        'status' => (string) ($payment['status'] ?? 'PENDING'),
        'externalReference' => $reference,
        'existingCustomer' => $existingCustomer,
    ]
);

reply(
    payment_payload($payment, !$createdPayment, $existingCustomer),
    $createdPayment ? 201 : 200
);
} catch (Throwable $error) {
    error_log(
        'Journey uncaught exception at stage ' . $journeyStage
        . ': ' . $error->getMessage()
        . ' in ' . basename($error->getFile())
        . ':' . $error->getLine()
    );
    reply(
        [
            'success' => false,
            'message' => 'O servidor encontrou uma falha ao processar a inscrição. Tente novamente em instantes.',
            'code' => 'JOURNEY_SERVER_EXCEPTION',
            'stage' => $journeyStage,
        ],
        500
    );
}
