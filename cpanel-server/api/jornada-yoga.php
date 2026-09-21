<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

function api(string $method, string $url, string $key, ?array $payload = null): array
{
    $curl = curl_init($url);
    if (!$curl) {
        return ['ok' => false, 'status' => 0, 'data' => []];
    }

    $options = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
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
    $error = curl_errno($curl);
    curl_close($curl);

    $parsed = is_string($raw) ? json_decode($raw, true) : null;

    return [
        'ok' => $error === 0 && $status >= 200 && $status < 300,
        'status' => $status,
        'data' => is_array($parsed) ? $parsed : [],
    ];
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

    return $result['ok']
        ? (is_array($result['data']['data'] ?? null) ? $result['data']['data'] : [])
        : null;
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
    return $result['ok'] ? $result['data'] : null;
}

function update_customer_address(
    string $base,
    string $key,
    string $customerId,
    array $address
): bool {
    $result = api(
        'PUT',
        $base . '/customers/' . rawurlencode($customerId),
        $key,
        $address
    );

    if (!$result['ok']) {
        error_log(
            'Journey customer address update failed. Customer prefix '
            . substr($customerId, 0, 20)
            . ' HTTP '
            . (int) ($result['status'] ?? 0)
        );
    }

    return (bool) $result['ok'];
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

$reference = payment_ref($cpf);
$found = find_payment($base, $key, $reference);

if (!$found['ok']) {
    reply(['message' => 'Não conseguimos confirmar sua inscrição agora.'], 502);
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
                'message' =>
                    'Localizamos sua inscrição, mas não conseguimos identificar o cadastro necessário para processá-la.',
            ],
            502
        );
    }

    if (!update_customer_address($base, $key, $customerId, $address)) {
        reply(
            [
                'message' =>
                    'Localizamos sua inscrição, mas não conseguimos atualizar o endereço para a emissão fiscal. Tente novamente.',
            ],
            502
        );
    }

    reply(payment_payload($payment, true, true));
}

$cpfMatches = customer_list($base, $key, 'cpfCnpj', $cpf);
$emailMatches = customer_list($base, $key, 'email', $email);

if ($cpfMatches === null || $emailMatches === null) {
    reply(['message' => 'Não conseguimos consultar seu cadastro agora.'], 502);
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
    if (!update_customer_address($base, $key, $customer, $address)) {
        reply(
            [
                'message' =>
                    'Seu cadastro foi localizado, mas não conseguimos atualizar o endereço necessário para a emissão fiscal.',
            ],
            502
        );
    }
} else {
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
            'externalReference' => customer_ref($cpf),
            'notificationDisabled' => false,
        ]
    );

    $customer = trim((string) ($created['data']['id'] ?? ''));
    if (!$created['ok'] || $customer === '') {
        reply(['message' => 'Não conseguimos concluir seu cadastro agora.'], 502);
    }
}

$charge = find_payment($base, $key, $reference);
if (!$charge['ok']) {
    reply(['message' => 'Não conseguimos gerar a cobrança agora.'], 502);
}

$createdPayment = false;

if (!is_array($charge['payment'])) {
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
        $reconcile = find_payment($base, $key, $reference);
        if (!$reconcile['ok'] || !is_array($reconcile['payment'])) {
            reply(
                ['message' => 'Não conseguimos gerar a cobrança da Jornada agora.'],
                502
            );
        }
        $charge['payment'] = $reconcile['payment'];
    }
}

$payment = $charge['payment'];

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
