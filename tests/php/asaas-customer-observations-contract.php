<?php

declare(strict_types=1);

define('CONEXAO_SERES_OBSERVATIONS_CONTRACT_MODE', true);

ob_start();
require dirname(__DIR__, 2) . '/cpanel-server/api/patients.php';
ob_end_clean();

$fixturePath = dirname(__DIR__) . '/fixtures/asaas-customer-observations.json';
$fixtureJson = file_get_contents($fixturePath);
$fixture = is_string($fixtureJson) ? json_decode($fixtureJson, true) : null;

if (!is_array($fixture) || !is_array($fixture['cases'] ?? null)) {
    fwrite(STDERR, "Could not load observations fixtures.\n");
    exit(1);
}

$assertions = 0;
$failures = [];

foreach ($fixture['cases'] as $case) {
    $name = (string) ($case['name'] ?? 'unnamed');
    $values = $case['phpValues'] ?? null;
    $age = $case['details']['patientAge'] ?? null;
    $expected = $case['expected'] ?? null;
    if (!is_array($values) || !is_int($age) || !is_string($expected)) {
        $failures[] = $name . ': invalid fixture';
        continue;
    }

    $actual = build_observations($values, $age);
    $assertions++;
    if ($actual !== $expected) {
        $failures[] = $name . ': PHP output differs from shared expected output';
    }

    $assertions++;
    if (!is_string($actual) || !asaas_customer_observations_within_safety_budget($actual)) {
        $failures[] = $name . ': PHP output exceeds the internal UTF-8 safety budget';
    }
}

$exact = str_repeat('á', intdiv(ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES, 2));
$assertions++;
if (asaas_customer_observations_utf8_bytes($exact) !== ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES
    || !asaas_customer_observations_within_safety_budget($exact)) {
    $failures[] = 'exact limit: expected 500 UTF-8 bytes to be accepted';
}

$assertions++;
if (asaas_customer_observations_within_safety_budget($exact . 'a')) {
    $failures[] = 'above limit: expected 501 UTF-8 bytes to be rejected';
}

if ($failures !== []) {
    foreach ($failures as $failure) {
        fwrite(STDERR, $failure . "\n");
    }
    exit(1);
}

fwrite(STDOUT, 'PHP observations contract: ' . $assertions . " assertions passed.\n");
