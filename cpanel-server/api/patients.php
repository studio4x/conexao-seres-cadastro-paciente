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

set_exception_handler(static function (Throwable $exception): void {
    error_log('Unhandled patient registration error: ' . $exception->getMessage());
    if (headers_sent()) {
        exit;
    }
    respond(
        ['message' => 'Não conseguimos concluir o cadastro agora. Tente novamente em instantes.'],
        500
    );
});

function finish_response_and_continue(array $payload, int $status): bool
{
    if (!function_exists('fastcgi_finish_request')) {
        return false;
    }

    ignore_user_abort(true);
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    fastcgi_finish_request();
    return true;
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

function valid_full_name(string $value): bool
{
    $parts = preg_split('/\s+/u', trim($value), -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($parts) || count($parts) < 2) {
        return false;
    }

    foreach ($parts as $part) {
        if (preg_match('/\p{L}/u', $part) !== 1) {
            return false;
        }
    }

    return true;
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

function parse_first_session_date(string $value): ?DateTimeImmutable
{
    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $value) !== 1) {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat('!d/m/Y', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return null;
    }

    return $date->format('d/m/Y') === $value ? $date : null;
}

function first_session_date_is_valid(string $value): bool
{
    $date = parse_first_session_date($value);
    if (!$date) {
        return false;
    }

    $today = new DateTimeImmutable('today', new DateTimeZone('America/Sao_Paulo'));
    return $date->format('Y-m-d') >= $today->format('Y-m-d');
}

function first_session_time_is_valid(string $value): bool
{
    return preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $value) === 1;
}

function service_type_label(string $value): string
{
    return [
        'ADULT_NEURO_REHAB' => 'Terapia Ocupacional – Reabilitação Neurológica',
        'ADULT_PSYCHOANALYSIS_INTEGRATED' => 'Terapia Ocupacional com Psicanálise Integrada',
        'ADULT_SENSORY_STIMULATION' => 'Terapia Ocupacional com Estimulação Sensorial',
        'CHILD_OT' => 'Terapia Ocupacional',
        'CHILD_NEURO_REHAB' => 'Terapia Ocupacional – Reabilitação Neurológica',
        'CHILD_SENSORY_INTEGRATION' => 'Terapia Ocupacional com Integração Sensorial',
        'UNDEFINED' => 'Ainda não definido',
    ][$value] ?? '';
}

function entry_type_label(string $value): string
{
    return [
        'FULL_ASSESSMENT' => 'Processo Avaliativo Completo',
        'DIRECT_START' => 'Início Direto – Sem Avaliação Completa',
        'UNDEFINED' => 'Ainda não foi definido',
    ][$value] ?? '';
}

function attendance_mode_label(string $value): string
{
    return [
        'IN_PERSON' => 'Presencial',
        'ONLINE' => 'Online',
        'UNDEFINED' => 'Ainda não definida',
    ][$value] ?? '';
}

function media_consent_label(string $value): string
{
    return [
        'AUTHORIZED' => 'Autorizado',
        'NOT_AUTHORIZED' => 'Não autorizado',
    ][$value] ?? '';
}

function first_session_mode_is_valid(string $value): bool
{
    return in_array($value, ['IN_PERSON', 'ONLINE'], true);
}

function first_session_mode_label(string $value): string
{
    return [
        'IN_PERSON' => 'Presencial',
        'ONLINE' => 'Online',
    ][$value] ?? '';
}

function service_type_is_valid_for_age(string $value, int $patientAge): bool
{
    $adultTypes = ['ADULT_NEURO_REHAB', 'ADULT_PSYCHOANALYSIS_INTEGRATED', 'ADULT_SENSORY_STIMULATION', 'UNDEFINED'];
    $childTypes = ['CHILD_OT', 'CHILD_NEURO_REHAB', 'CHILD_SENSORY_INTEGRATION', 'UNDEFINED'];
    return in_array($value, $patientAge >= 18 ? $adultTypes : $childTypes, true);
}

function entry_type_is_valid(string $value): bool
{
    return in_array($value, ['FULL_ASSESSMENT', 'DIRECT_START', 'UNDEFINED'], true);
}

function attendance_mode_is_valid(string $value): bool
{
    return in_array($value, ['IN_PERSON', 'ONLINE', 'UNDEFINED'], true);
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

function format_birth_date(string $value): string
{
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $parts) !== 1) {
        return $value;
    }

    return $parts[3] . '/' . $parts[2] . '/' . $parts[1];
}

function format_cpf(string $value): string
{
    $cpf = substr(digits($value), 0, 11);
    return preg_replace(
        ['/^(\d{3})(\d)/', '/^(\d{3})\.(\d{3})(\d)/', '/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/'],
        ['$1.$2', '$1.$2.$3', '$1.$2.$3-$4'],
        $cpf
    ) ?? $cpf;
}

function next_business_day(?DateTimeImmutable $now = null): string
{
    $timezone = new DateTimeZone('America/Sao_Paulo');
    $date = ($now ?? new DateTimeImmutable('now', $timezone))->setTimezone($timezone)->setTime(0, 0);
    $weekday = (int) $date->format('N');
    $days = $weekday >= 5 ? 8 - $weekday : 1;
    return $date->modify('+' . $days . ' days')->format('Y-m-d');
}

function first_session_external_reference(string $externalReference): string
{
    return $externalReference . '-sessao-1';
}

function build_first_session_description(array $values): string
{
    $article = match ($values['patientSex']) {
        'female' => 'a paciente',
        'male' => 'o paciente',
        default => 'a pessoa atendida',
    };
    return 'Referente a contratação de 1 sessão de Terapia Ocupacional para ' . $article . ' '
        . clean_text($values['patientName']) . ' (CPF: ' . format_cpf($values['patientCpf'])
        . ') realizada na Clínica Conexão Seres.';
}

function find_first_session_payment(
    string $baseUrl,
    string $customerId,
    string $paymentExternalReference,
    string $apiKey
): array {
    $url = $baseUrl . '/payments?' . http_build_query([
        'customer' => $customerId,
        'externalReference' => $paymentExternalReference,
        'limit' => 10,
    ]);
    $lookup = asaas_request('GET', $url, $apiKey);
    if ($lookup['error'] !== '' || $lookup['status'] < 200 || $lookup['status'] >= 300) {
        error_log(
            'Asaas first-session payment lookup failed. HTTP ' . $lookup['status']
            . '. Response: ' . ($lookup['response'] ?? 'Resposta indisponível')
        );
        return ['id' => null, 'failed' => true];
    }

    foreach (($lookup['data']['data'] ?? []) as $payment) {
        if (!is_array($payment)) {
            continue;
        }
        if (
            trim((string) ($payment['customer'] ?? '')) === $customerId
            && trim((string) ($payment['externalReference'] ?? '')) === $paymentExternalReference
            && trim((string) ($payment['id'] ?? '')) !== ''
        ) {
            return ['id' => trim((string) $payment['id']), 'failed' => false];
        }
    }

    return ['id' => null, 'failed' => false];
}

function create_first_session_payment(
    string $baseUrl,
    string $customerId,
    array $values,
    string $externalReference,
    string $apiKey
): array {
    $paymentExternalReference = first_session_external_reference($externalReference);
    $existing = find_first_session_payment($baseUrl, $customerId, $paymentExternalReference, $apiKey);
    if ($existing['failed']) {
        return ['paymentId' => null, 'existing' => false];
    }
    if (is_string($existing['id']) && $existing['id'] !== '') {
        return ['paymentId' => $existing['id'], 'existing' => true];
    }

    $created = asaas_request('POST', $baseUrl . '/payments', $apiKey, [
        'customer' => $customerId,
        'billingType' => 'UNDEFINED',
        'value' => 230.00,
        'dueDate' => next_business_day(),
        'description' => build_first_session_description($values),
        'externalReference' => $paymentExternalReference,
    ]);
    $createdPaymentId = trim((string) ($created['data']['id'] ?? ''));
    if ($created['error'] === '' && $created['status'] >= 200 && $created['status'] < 300 && $createdPaymentId !== '') {
        return ['paymentId' => $createdPaymentId, 'existing' => false];
    }

    error_log(
        'Asaas first-session payment creation failed. HTTP ' . $created['status']
        . '. Response: ' . ($created['response'] ?? 'Resposta indisponível')
    );
    $reconciled = find_first_session_payment($baseUrl, $customerId, $paymentExternalReference, $apiKey);
    return [
        'paymentId' => $reconciled['id'],
        'existing' => is_string($reconciled['id']) && $reconciled['id'] !== '',
    ];
}

function build_observations(array $values, int $patientAge): ?string
{
    $attendanceLines = [
        'Tipo de atendimento: ' . service_type_label($values['serviceType']),
        $patientAge >= 18
        ? 'Modalidade de atendimento: ' . attendance_mode_label($values['attendanceMode'])
        : 'Forma de ingresso: ' . entry_type_label($values['entryType']);
        'Primeira sessão: ' . $values['firstSessionDate'] . ' às ' . $values['firstSessionTime'],
        'Modalidade da primeira sessão: ' . first_session_mode_label($values['firstSessionMode']),
        'Autorização de imagens e vídeos: ' . media_consent_label($values['mediaConsent']),
    ];

    if ($patientAge >= 18 && !$values['hasResponsible']) {
        return implode("\n", $attendanceLines);
    }

    $lines = [
        'Pessoa atendida: ' . clean_text($values['patientName']),
        'CPF da pessoa atendida: ' . digits($values['patientCpf']),
        'Nascimento da pessoa atendida: ' . format_birth_date($values['patientBirthDate']),
    ];
    if ($patientAge >= 18) {
        $lines[] = 'Contato da pessoa atendida: ' . digits($values['patientPhone'])
            . ' | ' . clean_text($values['patientEmail']);
        $lines[] = 'Endereço da pessoa atendida: ' . full_address($values, 'patient');
    }
    if ($values['hasResponsible']) {
        $lines[] = 'Nascimento do responsável: ' . format_birth_date($values['responsibleBirthDate']);
    }

    return implode("\n", array_merge($lines, $attendanceLines));
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

function sanitize_asaas_log_text(string $value, int $limit = 800): string
{
    $sanitized = preg_replace(
        '/(access[_-]?token|authorization|asaas[_-]?api[_-]?key|turnstile[_-]?(?:secret|token))\s*[:=]\s*("[^"]*"|\'[^\']*\'|[^,\s}]+)/i',
        '$1=[REDACTED]',
        $value
    ) ?? $value;
    $sanitized = preg_replace('/Bearer\s+\S+/i', 'Bearer [REDACTED]', $sanitized) ?? $sanitized;
    $sanitized = preg_replace('/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/', '[CPF_REDACTED]', $sanitized) ?? $sanitized;
    $sanitized = preg_replace('/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/', '[EMAIL_REDACTED]', $sanitized) ?? $sanitized;
    $sanitized = preg_replace('/(?<!\d)(?:\+?55\s*)?\(?[1-9]\d\)?[\s-]?9?\d{4}[-\s]?\d{4}(?!\d)/', '[PHONE_REDACTED]', $sanitized) ?? $sanitized;
    return substr($sanitized, 0, $limit);
}

function asaas_error_summary(array $response): string
{
    $transportError = trim((string) ($response['error'] ?? ''));
    if ($transportError !== '') {
        return 'Transport error: ' . sanitize_asaas_log_text($transportError, 400);
    }

    $errors = [];
    foreach (array_slice(is_array($response['data']['errors'] ?? null) ? $response['data']['errors'] : [], 0, 3) as $error) {
        if (!is_array($error)) {
            continue;
        }
        $errors[] = [
            'code' => sanitize_asaas_log_text((string) ($error['code'] ?? 'unknown'), 120),
            'description' => sanitize_asaas_log_text((string) ($error['description'] ?? 'Sem descrição'), 240),
        ];
    }

    if ($errors !== []) {
        $encoded = json_encode($errors, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (is_string($encoded)) {
            return substr('Errors: ' . $encoded, 0, 1200);
        }
    }

    $fallback = trim((string) ($response['response'] ?? ''));
    return 'Response: ' . sanitize_asaas_log_text($fallback !== '' ? $fallback : 'Resposta indisponível', 1000);
}

function log_asaas_failure(string $operation, array $response): void
{
    $status = (int) ($response['status'] ?? 0);
    error_log(substr($operation . '. HTTP ' . $status . '. ' . asaas_error_summary($response), 0, 1400));
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
        'response' => is_string($body) ? sanitize_asaas_log_text($body) : 'Resposta indisponível',
    ];
}

function controlled_notification_event(string $event): bool
{
    return in_array($event, [
        'PAYMENT_CREATED',
        'PAYMENT_UPDATED',
        'PAYMENT_DUEDATE_WARNING',
        'PAYMENT_OVERDUE',
        'PAYMENT_RECEIVED',
        'SEND_LINHA_DIGITAVEL',
    ], true);
}

function desired_schedule_offset(string $event): ?int
{
    return match ($event) {
        'PAYMENT_DUEDATE_WARNING' => 5,
        'PAYMENT_OVERDUE' => 1,
        default => null,
    };
}

function notification_schedule_offset(array $notification): int
{
    return is_numeric($notification['scheduleOffset'] ?? null)
        ? (int) $notification['scheduleOffset']
        : 0;
}

function select_scheduled_notification_ids(array $notifications): array
{
    $selectedIds = [];
    foreach (['PAYMENT_DUEDATE_WARNING' => 5, 'PAYMENT_OVERDUE' => 1] as $event => $desiredOffset) {
        $candidates = array_values(array_filter(
            $notifications,
            static fn (array $notification): bool => ($notification['event'] ?? '') === $event
        ));
        usort($candidates, static function (array $left, array $right) use ($desiredOffset): int {
            $leftOffset = notification_schedule_offset($left);
            $rightOffset = notification_schedule_offset($right);
            $leftRank = $leftOffset === $desiredOffset ? 0 : ($leftOffset > 0 ? 1 : 2);
            $rightRank = $rightOffset === $desiredOffset ? 0 : ($rightOffset > 0 ? 1 : 2);
            return [$leftRank, $leftOffset > 0 ? abs($leftOffset - $desiredOffset) : PHP_INT_MAX, $left['id']]
                <=> [$rightRank, $rightOffset > 0 ? abs($rightOffset - $desiredOffset) : PHP_INT_MAX, $right['id']];
        });
        if (isset($candidates[0]['id'])) {
            $selectedIds[] = $candidates[0]['id'];
        }
    }
    return $selectedIds;
}

function build_notification_update(array $notification, array $scheduledNotificationIds = []): array
{
    $event = trim((string) ($notification['event'] ?? ''));
    $isDigitalLineNotification = $event === 'SEND_LINHA_DIGITAVEL';

    $update = [
        'id' => trim((string) ($notification['id'] ?? '')),
        'enabled' => true,
        'emailEnabledForProvider' => false,
        'smsEnabledForProvider' => false,
        'emailEnabledForCustomer' => false,
        'smsEnabledForCustomer' => false,
        'phoneCallEnabledForCustomer' => false,
        'whatsappEnabledForCustomer' => !$isDigitalLineNotification,
    ];

    $desiredOffset = desired_schedule_offset($event);
    if ($desiredOffset !== null && in_array($update['id'], $scheduledNotificationIds, true)) {
        $update['scheduleOffset'] = $desiredOffset;
    }

    return $update;
}

function notification_matches_update(array $notification, array $update): bool
{
    foreach ([
        'enabled',
        'emailEnabledForProvider',
        'smsEnabledForProvider',
        'emailEnabledForCustomer',
        'smsEnabledForCustomer',
        'phoneCallEnabledForCustomer',
        'whatsappEnabledForCustomer',
    ] as $field) {
        if (($notification[$field] ?? null) !== $update[$field]) {
            return false;
        }
    }

    return !array_key_exists('scheduleOffset', $update)
        || notification_schedule_offset($notification) === (int) $update['scheduleOffset'];
}

function configure_customer_notifications(string $baseUrl, string $customerId, string $apiKey): bool
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
        if (!is_array($notification)) {
            continue;
        }
        $notificationId = trim((string) ($notification['id'] ?? ''));
        $notificationCustomer = trim((string) ($notification['customer'] ?? ''));
        $event = trim((string) ($notification['event'] ?? ''));
        if (
            $notificationId === ''
            || (($notification['deleted'] ?? false) === true)
            || $notificationCustomer !== $customerId
            || !controlled_notification_event($event)
        ) {
            continue;
        }
        $notifications[] = $notification;
    }

    if ($notifications === []) {
        error_log('Asaas notification lookup returned no notification IDs for customer ' . $customerId);
        return false;
    }

    $scheduledNotificationIds = select_scheduled_notification_ids($notifications);
    $notificationUpdates = array_map(
        static fn (array $notification): array => build_notification_update($notification, $scheduledNotificationIds),
        $notifications
    );
    $updated = asaas_request('PUT', $baseUrl . '/notifications/batch', $apiKey, [
        'customer' => $customerId,
        'notifications' => $notificationUpdates,
    ]);
    if ($updated['error'] !== '' || $updated['status'] < 200 || $updated['status'] >= 300) {
        error_log(
            'Asaas notification update failed. HTTP ' . $updated['status']
            . '. Response: ' . ($updated['response'] ?? 'Resposta indisponível')
        );
        return false;
    }

    $verification = asaas_request(
        'GET',
        $baseUrl . '/customers/' . rawurlencode($customerId) . '/notifications',
        $apiKey
    );
    if ($verification['error'] !== '' || $verification['status'] < 200 || $verification['status'] >= 300) {
        error_log(
            'Asaas notification validation failed. HTTP ' . $verification['status']
            . '. Response: ' . ($verification['response'] ?? 'Resposta indisponível')
        );
        return false;
    }
    $verifiedById = [];
    foreach (($verification['data']['data'] ?? []) as $notification) {
        if (is_array($notification) && isset($notification['id'])) {
            $verifiedById[(string) $notification['id']] = $notification;
        }
    }
    foreach ($notificationUpdates as $update) {
        $notification = $verifiedById[$update['id']] ?? null;
        if (!is_array($notification) || !notification_matches_update($notification, $update)) {
            error_log('Asaas notification validation did not match the requested policy. Customer ' . $customerId);
            return false;
        }
    }

    return true;
}

function configure_customer_notifications_safely(string $baseUrl, string $customerId, string $apiKey): bool
{
    try {
        return configure_customer_notifications($baseUrl, $customerId, $apiKey);
    } catch (Throwable $exception) {
        error_log('Asaas notification configuration failed: ' . sanitize_asaas_log_text($exception->getMessage()));
        return false;
    }
}

function notify_n8n_customer_created_safely(string $webhookUrl, string $webhookToken, array $payload): bool
{
    if ($webhookUrl === '' || $webhookToken === '' || $webhookToken === 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N') {
        error_log('n8n customer-created webhook is not configured.');
        return false;
    }

    $parsedUrl = parse_url($webhookUrl);
    if (!is_array($parsedUrl) || !in_array($parsedUrl['scheme'] ?? '', ['http', 'https'], true)) {
        error_log('n8n customer-created webhook URL is invalid.');
        return false;
    }

    try {
        $curl = curl_init($webhookUrl);
        if ($curl === false) {
            error_log('n8n customer-created webhook could not initialize cURL.');
            return false;
        }

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'Authorization: Bearer ' . $webhookToken,
            ],
        ]);
        curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($error !== '' || $status < 200 || $status >= 300) {
            error_log('n8n customer-created webhook failed. HTTP ' . $status);
            return false;
        }

        return true;
    } catch (Throwable $exception) {
        error_log('n8n customer-created webhook request failed: ' . $exception->getMessage());
        return false;
    }
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
    'patientSex' => 10,
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
    'serviceType' => 50,
    'mediaConsent' => 30,
    'firstSessionDate' => 10,
    'firstSessionTime' => 5,
    'firstSessionMode' => 20,
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

foreach (['entryType', 'attendanceMode'] as $optionalField) {
    if (!array_key_exists($optionalField, $payload)) {
        $values[$optionalField] = '';
        continue;
    }
    $value = value_string($payload, $optionalField, 50);
    if ($value === null) {
        respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
    }
    $values[$optionalField] = $value;
}

if (($payload['consent'] ?? false) !== true || $values['website'] !== '') {
    respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
}

$patientAge = calculate_age($values['patientBirthDate']);
if ($patientAge === null) {
    respond(['message' => 'Confira os dados informados e tente novamente.'], 400);
}
if (!in_array($values['mediaConsent'], ['AUTHORIZED', 'NOT_AUTHORIZED'], true)) {
    respond(['message' => 'Confira os dados de autorização de imagens e vídeos e tente novamente.'], 400);
}
if (!first_session_date_is_valid($values['firstSessionDate'])) {
    respond(['message' => 'Confira a data da primeira sessão e tente novamente.'], 400);
}
if (!first_session_time_is_valid($values['firstSessionTime'])) {
    respond(['message' => 'Confira o horário da primeira sessão e tente novamente.'], 400);
}
if (!first_session_mode_is_valid($values['firstSessionMode'])) {
    respond(['message' => 'Confira a modalidade da primeira sessão e tente novamente.'], 400);
}
if (!service_type_is_valid_for_age($values['serviceType'], $patientAge)) {
    respond(['message' => 'Confira os dados do atendimento e tente novamente.'], 400);
}
if ($patientAge >= 18) {
    if (!attendance_mode_is_valid($values['attendanceMode']) || $values['entryType'] !== '') {
        respond(['message' => 'Confira os dados do atendimento e tente novamente.'], 400);
    }
} elseif (!entry_type_is_valid($values['entryType']) || $values['attendanceMode'] !== '') {
    respond(['message' => 'Confira os dados do atendimento e tente novamente.'], 400);
}
if (!in_array($values['patientSex'], ['female', 'male', 'non_binary'], true)) {
    respond(['message' => 'Selecione o sexo do paciente.'], 400);
}
if (!valid_full_name($values['patientName'])) {
    respond(['message' => 'Informe o nome completo do paciente.'], 400);
}
if ($values['hasResponsible'] && !valid_full_name($values['responsibleName'])) {
    respond(['message' => 'Informe o nome completo do responsável.'], 400);
}
if (
    $values['hasResponsible']
    && normalized_name($values['patientName']) === normalized_name($values['responsibleName'])
) {
    respond(['message' => 'O nome do responsável deve ser diferente do nome do paciente.'], 400);
}

$valid = $patientAge !== null && valid_cpf($values['patientCpf']);

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
    $valid = valid_cpf($values['responsibleCpf'])
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
$n8nWebhookUrl = trim((string) (getenv('N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL') ?: ($fileConfig['n8n_cadastro_webhook_url'] ?? '')));
$n8nWebhookToken = trim((string) (getenv('N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN') ?: ($fileConfig['n8n_cadastro_webhook_token'] ?? '')));

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
$customerGroup = $patientAge >= 18 ? 'Adultos' : 'Crianças';
$holder = $values['hasResponsible'] ? 'responsible' : 'patient';
$holderComplement = clean_text($values[$holder . 'Complement']);

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
    respond([
        'message' => 'Já existe um cadastro com este CPF e/ou e-mail. Se precisar atualizar os dados, fale com a clínica.',
    ], 409);
}

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
    'groupName' => $customerGroup,
    'notificationDisabled' => false,
];

if ($holderComplement !== '') {
    $customer['complement'] = $holderComplement;
}
if ($values['hasResponsible']) {
    $customer['company'] = clean_text($values['patientName']);
}
$observations = build_observations($values, $patientAge);
if ($observations !== null) {
    $customer['observations'] = $observations;
}

$created = asaas_request('POST', $baseUrl . '/customers', $apiKey, $customer);
if ($created['error'] !== '' || $created['status'] < 200 || $created['status'] >= 300) {
    log_asaas_failure('Asaas customer creation failed', $created);
    if ($created['status'] >= 400 && $created['status'] < 500) {
        respond(['message' => 'Algumas informações precisam ser conferidas. Revise os dados e tente novamente.'], 400);
    }
    respond(['message' => 'Não conseguimos enviar o cadastro agora. Tente novamente em instantes.'], 502);
}

$createdCustomerId = trim((string) ($created['data']['id'] ?? ''));
if ($createdCustomerId === '') {
    respond(['message' => 'Não conseguimos confirmar o cadastro no Asaas. Tente novamente em instantes.'], 502);
}
if (!configure_customer_notifications_safely($baseUrl, $createdCustomerId, $apiKey)) {
    error_log('Asaas customer was created, but notification configuration was not completed. Customer ' . $createdCustomerId);
}

$payment = create_first_session_payment($baseUrl, $createdCustomerId, $values, $externalReference, $apiKey);
if (!is_string($payment['paymentId'] ?? null) || $payment['paymentId'] === '') {
    respond([
        'success' => true,
        'existing' => false,
        'partial' => true,
        'paymentCreated' => false,
        'message' => 'Seu cadastro foi realizado, mas não conseguimos gerar a cobrança da primeira sessão automaticamente. A equipe da Conexão Seres dará continuidade ao atendimento.',
    ], 201);
}

$responsePayload = [
    'success' => true,
    'existing' => false,
    'paymentCreated' => true,
];
$responseFinished = finish_response_and_continue($responsePayload, 201);
$n8nNotified = notify_n8n_customer_created_safely($n8nWebhookUrl, $n8nWebhookToken, [
    'eventType' => 'asaas_customer_created',
    'customerName' => $customer['name'],
    'customerEmail' => $customer['email'],
    'whatsapp' => $customer['mobilePhone'],
    'asaasCustomerId' => $createdCustomerId,
    'externalReference' => $externalReference,
]);
if (
    !$n8nNotified
    && $n8nWebhookUrl !== ''
    && $n8nWebhookToken !== ''
    && $n8nWebhookToken !== 'COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N'
) {
    error_log('Asaas customer was created, but n8n notification was not completed. Customer ' . $createdCustomerId);
}
if ($responseFinished) {
    exit;
}

respond($responsePayload, 201);
