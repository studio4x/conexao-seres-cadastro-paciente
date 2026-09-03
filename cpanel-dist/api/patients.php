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

function digits(string $value): string
{
    return preg_replace('/\D+/', '', $value) ?? '';
}

function clean_text(string $value): string
{
    return trim(preg_replace('/[\r\n]+/', ' ', $value) ?? '');
}

function text_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function value_string(array $payload, string $key, int $maxLength = 150): ?string
{
    if (!array_key_exists($key, $payload) || !is_string($payload[$key])) {
        return null;
    }

    $value = trim($payload[$key]);
    return text_length($value) <= $maxLength ? $value : null;
}

function valid_cpf(string $value): bool
{
    $cpf = digits($value);
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }

    for ($position = 9; $position <= 10; $position++) {
        $sum = 0;
        for ($index = 0; $index < $position; $index++) {
            $sum += ((int) $cpf[$index]) * (($position + 1) - $index);
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

function valid_whatsapp(string $value): bool
{
    static $areaCodes = [
        '11', '12', '13', '14', '15', '16', '17', '18', '19',
        '21', '22', '24', '27', '28',
        '31', '32', '33', '34', '35', '37', '38',
        '41', '42', '43', '44', '45', '46', '47', '48', '49',
        '51', '53', '54', '55',
        '61', '62', '63', '64', '65', '66', '67', '68', '69',
        '71', '73', '74', '75', '77', '79',
        '81', '82', '83', '84', '85', '86', '87', '88', '89',
        '91', '92', '93', '94', '95', '96', '97', '98', '99',
    ];

    $phone = digits($value);
    return preg_match('/^\d{2}9\d{8}$/', $phone) === 1
        && in_array(substr($phone, 0, 2), $areaCodes, true)
        && preg_match('/^(\d)\1{8}$/', substr($phone, 2)) !== 1;
}

function valid_email(string $value): bool
{
    $email = trim($value);
    return strlen($email) <= 150
        && !str_contains($email, '..')
        && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function calculate_age(string $value): ?int
{
    $birth = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$birth || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return null;
    }

    $today = new DateTimeImmutable('today');
    if ($birth > $today || $birth->format('Y-m-d') !== $value) {
        return null;
    }

    return $birth->diff($today)->y;
}

function address_is_valid(array $values, string $prefix): bool
{
    return strlen(digits($values[$prefix . 'PostalCode'])) === 8
        && text_length(trim($values[$prefix . 'Address'])) >= 2
        && text_length(trim($values[$prefix . 'AddressNumber'])) >= 1
        && text_length(trim($values[$prefix . 'Province'])) >= 2
        && text_length(trim($values[$prefix . 'City'])) >= 2
        && preg_match('/^[A-Za-z]{2}$/', trim($values[$prefix . 'State'])) === 1;
}

function full_address(array $values, string $prefix): string
{
    $address = clean_text($values[$prefix . 'Address']);
    $number = clean_text($values[$prefix . 'AddressNumber']);
    $complement = clean_text($values[$prefix . 'Complement']);
    $province = clean_text($values[$prefix . 'Province']);
    $city = clean_text($values[$prefix . 'City']);
    $state = strtoupper(clean_text($values[$prefix . 'State']));
    $postalCode = digits($values[$prefix . 'PostalCode']);

    return $address . ', ' . $number
        . ($complement !== '' ? ', ' . $complement : '')
        . ' — ' . $province . ', ' . $city . '/' . $state
        . ' — CEP ' . $postalCode;
}

function build_observations(array $values, int $patientAge): ?string
{
    if ($patientAge >= 18 && !$values['hasResponsible']) {
        return null;
    }

    $lines = [
        'Pessoa atendida: ' . clean_text($values['patientName']),
        'CPF da pessoa atendida: ' . digits($values['patientCpf']),
        'Nascimento da pessoa atendida: ' . $values['patientBirthDate'],
    ];

    if ($patientAge >= 18) {
        $lines[] = 'Contato da pessoa atendida: ' . digits($values['patientPhone'])
            . ' | ' . clean_text($values['patientEmail']);
        $lines[] = 'Endereço da pessoa atendida: ' . full_address($values, 'patient');
    }

    if ($values['hasResponsible']) {
        $lines[] = 'Nascimento do responsável: ' . $values['responsibleBirthDate'];
    }

    return implode("\n", $lines);
}

function normalized_name(string $name): string
{
    $normalized = trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
    if (function_exists('iconv')) {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $normalized);
        if ($ascii !== false) {
            $normalized = $ascii;
        }
    }
    return strtolower($normalized);
}

function asaas_request(string $method, string $url, string $apiKey, ?array $payload = null): array
{
    $curl = curl_init($url);
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
        'error' => $error,
    ];
}

function configure_whatsapp_only(string $baseUrl, string $customerId, string $apiKey): bool
{
    $list = asaas_request(
        'GET',
        $baseUrl . '/customers/' . rawurlencode($customerId) . '/notifications',
        $apiKey
    );
    if ($list['error'] !== '' || $list['status'] < 200 || $list['status'] >= 300) {
        error_log('Asaas notification lookup failed. HTTP ' . $list['status']);
        return false;
    }

    $notifications = [];
    foreach (($list['data']['data'] ?? []) as $notification) {
        $notificationId = is_array($notification) ? trim((string) ($notification['id'] ?? '')) : '';
        if ($notificationId === '') {
            continue;
        }
        $notifications[] = [
            'id' => $notificationId,
            'enabled' => true,
            'emailEnabledForProvider' => false,
            'smsEnabledForProvider' => false,
            'emailEnabledForCustomer' => false,
            'smsEnabledForCustomer' => false,
            'phoneCallEnabledForCustomer' => false,
            'whatsappEnabledForCustomer' => true,
        ];
    }

    if ($notifications === []) {
        error_log('Asaas notification lookup returned no notification IDs for customer ' . $customerId);
        return false;
    }

    $updated = asaas_request('PUT', $baseUrl . '/notifications/batch', $apiKey, [
        'customer' => $customerId,
        'notifications' => $notifications,
    ]);
    if ($updated['error'] !== '' || $updated['status'] < 200 || $updated['status'] >= 300) {
        error_log('Asaas notification update failed. HTTP ' . $updated['status']);
        return false;
    }

    return true;
}

function turnstile_is_valid(string $secret, string $token, string $expectedHostname): bool
{
    $remoteIp = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''));
    $data = [
        'secret' => $secret,
        'response' => $token,
    ];
    if ($remoteIp !== '') {
        $data['remoteip'] = $remoteIp;
    }

    $curl = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($data),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if (!is_string($body) || $status < 200 || $status >= 300) {
        return false;
    }

    $result = json_decode($body, true);
    return is_array($result)
        && ($result['success'] ?? false) === true
        && ($result['action'] ?? '') === 'cadastro_paciente'
        && ($expectedHostname === '' || ($result['hostname'] ?? '') === $expectedHostname);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['message' => 'Método não permitido.'], 405);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 18000) {
    respond(['message' => 'Dados enviados são muito extensos.'], 413);
}

$rawBody = file_get_contents('php://input');
$payload = is_string($rawBody) ? json_decode($rawBody, true) : null;
if (!is_array($payload)) {
    respond(['message' => 'Não foi possível ler os dados enviados.'], 400);
}

$fieldLimits = [
    'patientName' => 120,
    'patientBirthDate' => 10,
    'patientCpf' => 150,
    'patientPhone' => 150,
    'patientEmail' => 150,
    'patientPostalCode' => 150,
    'patientAddress' => 120,
    'patientAddressNumber' => 20,
    'patientComplement' => 80,
    'patientProvince' => 120,
    'patientCity' => 120,
    'patientState' => 2,
    'responsibleName' => 150,
    'responsibleCpf' => 150,
    'responsibleBirthDate' => 10,
    'responsiblePhone' => 150,
    'responsibleEmail' => 150,
    'responsiblePostalCode' => 150,
    'responsibleAddress' => 120,
    'responsibleAddressNumber' => 20,
    'responsibleComplement' => 80,
    'responsibleProvince' => 120,
    'responsibleCity' => 120,
    'responsibleState' => 2,
    'website' => 1,
    'turnstileToken' => 2048,
];

$values = [];
foreach ($fieldLimits as $field => $limit) {
    $value = value_string($payload, $field, $limit);
    if ($value === null) {
        respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
    }
    $values[$field] = $value;
}

if (!isset($payload['hasResponsible']) || !is_bool($payload['hasResponsible'])) {
    respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
}
$values['hasResponsible'] = $payload['hasResponsible'];

if (($payload['consent'] ?? false) !== true || $values['website'] !== '') {
    respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
}

$patientAge = calculate_age($values['patientBirthDate']);
$valid = $patientAge !== null
    && text_length($values['patientName']) >= 3
    && valid_cpf($values['patientCpf']);

if ($valid && $patientAge >= 18) {
    $valid = valid_whatsapp($values['patientPhone'])
        && valid_email($values['patientEmail'])
        && address_is_valid($values, 'patient');
}

if ($valid && $patientAge < 18 && !$values['hasResponsible']) {
    $valid = false;
}

if ($valid && $values['hasResponsible']) {
    $responsibleAge = calculate_age($values['responsibleBirthDate']);
    $valid = text_length($values['responsibleName']) >= 2
        && valid_cpf($values['responsibleCpf'])
        && $responsibleAge !== null
        && $responsibleAge >= 18
        && valid_whatsapp($values['responsiblePhone'])
        && valid_email($values['responsibleEmail'])
        && address_is_valid($values, 'responsible');
}

if (!$valid) {
    respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
}

$fileConfig = [];
$configPath = __DIR__ . '/config.php';
if (is_file($configPath)) {
    $loaded = require $configPath;
    if (is_array($loaded)) {
        $fileConfig = $loaded;
    }
}

$apiKey = trim((string) (getenv('ASAAS_API_KEY') ?: ($fileConfig['asaas_api_key'] ?? '')));
$baseUrl = rtrim((string) (getenv('ASAAS_API_URL') ?: ($fileConfig['asaas_api_url'] ?? 'https://api.asaas.com/v3')), '/');

if ($apiKey === '' || $apiKey === 'COLE_AQUI_A_CHAVE_DA_API_DO_ASAAS') {
    respond(['message' => 'Não conseguimos receber o cadastro agora. Fale com a clínica para que possamos ajudar.'], 503);
}

if (!function_exists('curl_init')) {
    respond(['message' => 'A integração de cadastro não está disponível no servidor.'], 503);
}

$turnstileSecret = trim((string) (getenv('TURNSTILE_SECRET_KEY') ?: ($fileConfig['turnstile_secret_key'] ?? '')));
$turnstileHostname = trim((string) (getenv('TURNSTILE_EXPECTED_HOSTNAME') ?: ($fileConfig['turnstile_expected_hostname'] ?? '')));
if ($turnstileSecret === '' || $turnstileSecret === 'COLE_AQUI_A_CHAVE_SECRETA_DO_TURNSTILE') {
    respond(['message' => 'A verificação de segurança ainda não foi configurada. Fale com a clínica para que possamos ajudar.'], 503);
}
if (!turnstile_is_valid($turnstileSecret, $values['turnstileToken'], $turnstileHostname)) {
    respond(['message' => 'Não foi possível confirmar a verificação de segurança. Atualize a página e tente novamente.'], 400);
}

$externalReference = 'cs-paciente-' . substr(
    hash('sha256', digits($values['patientCpf']) . ':' . normalized_name($values['patientName'])),
    0,
    24
);

$lookupUrl = $baseUrl . '/customers?' . http_build_query([
    'externalReference' => $externalReference,
    'limit' => 1,
]);
$lookup = asaas_request('GET', $lookupUrl, $apiKey);

if ($lookup['error'] !== '' || $lookup['status'] < 200 || $lookup['status'] >= 300) {
    error_log('Asaas customer lookup failed. HTTP ' . $lookup['status']);
    $message = in_array($lookup['status'], [401, 403], true)
        ? 'Não conseguimos conectar ao sistema de cadastro. Fale com a clínica para que possamos ajudar.'
        : 'Não conseguimos confirmar os dados agora. Tente novamente em instantes.';
    respond(['message' => $message], 502);
}

if (!empty($lookup['data']['data'])) {
    $existingCustomerId = trim((string) ($lookup['data']['data'][0]['id'] ?? ''));
    if ($existingCustomerId === '' || !configure_whatsapp_only($baseUrl, $existingCustomerId, $apiKey)) {
        respond(['message' => 'O cadastro foi localizado, mas não conseguimos finalizar as notificações. Tente novamente em instantes.'], 502);
    }
    respond(['success' => true, 'existing' => true]);
}

$holder = $values['hasResponsible'] ? 'responsible' : 'patient';
$customer = [
    'name' => clean_text($values[$holder . 'Name']),
    'cpfCnpj' => digits($values[$holder . 'Cpf']),
    'email' => strtolower(clean_text($values[$holder . 'Email'])),
    'mobilePhone' => digits($values[$holder . 'Phone']),
    'postalCode' => digits($values[$holder . 'PostalCode']),
    'address' => clean_text($values[$holder . 'Address']),
    'addressNumber' => clean_text($values[$holder . 'AddressNumber']),
    'province' => clean_text($values[$holder . 'Province']),
    'externalReference' => $externalReference,
    'notificationDisabled' => false,
];

$complement = clean_text($values[$holder . 'Complement']);
if ($complement !== '') {
    $customer['complement'] = $complement;
}
if ($patientAge < 18) {
    $customer['company'] = clean_text($values['patientName']);
}
$observations = build_observations($values, $patientAge);
if ($observations !== null) {
    $customer['observations'] = $observations;
}

$created = asaas_request('POST', $baseUrl . '/customers', $apiKey, $customer);
if ($created['error'] !== '' || $created['status'] < 200 || $created['status'] >= 300) {
    error_log('Asaas customer creation failed. HTTP ' . $created['status']);
    if ($created['status'] >= 400 && $created['status'] < 500) {
        respond(['message' => 'Algumas informações precisam ser conferidas. Revise os dados e tente novamente.'], 400);
    }
    respond(['message' => 'Não conseguimos enviar o cadastro agora. Tente novamente em instantes.'], 502);
}

$createdCustomerId = trim((string) ($created['data']['id'] ?? ''));
if ($createdCustomerId === '' || !configure_whatsapp_only($baseUrl, $createdCustomerId, $apiKey)) {
    respond(['message' => 'O cadastro foi recebido, mas não conseguimos finalizar as notificações. Tente novamente em instantes.'], 502);
}

respond(['success' => true, 'existing' => false], 201);
