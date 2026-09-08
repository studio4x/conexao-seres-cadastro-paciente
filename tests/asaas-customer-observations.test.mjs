import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES,
  asaasCustomerObservationsUtf8Bytes,
  buildAsaasCustomerObservations,
  isAsaasCustomerObservationsWithinSafetyBudget,
} from "../lib/asaas-customer-observations.ts";
import { parseFirstSessionFromObservations } from "../lib/first-session.ts";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/asaas-customer-observations.json", import.meta.url), "utf8"),
);
const typescriptBackend = await readFile(new URL("../app/api/patients/route.ts", import.meta.url), "utf8");
const phpBackend = await readFile(new URL("../cpanel-server/api/patients.php", import.meta.url), "utf8");
const phpWebhook = await readFile(new URL("../cpanel-server/api/asaas-webhook.php", import.meta.url), "utf8");
const observationsModule = await readFile(
  new URL("../lib/asaas-customer-observations.ts", import.meta.url),
  "utf8",
);

const cases = Object.fromEntries(fixture.cases.map((item) => [item.name, item]));

function buildLegacyResponsibleObservations(details) {
  return [
    `Pessoa atendida: ${details.patientName}`,
    `CPF da pessoa atendida: ${details.patientCpf}`,
    `Nascimento da pessoa atendida: ${details.patientBirthDate}`,
    `Contato da pessoa atendida: ${details.patientPhone} | ${details.patientEmail}`,
    `Endereço da pessoa atendida: ${details.patientAddress}`,
    `Nascimento do responsável: ${details.responsibleBirthDate}`,
    `Tipo de atendimento: ${details.serviceType}`,
    `Modalidade de atendimento: ${details.attendanceMode}`,
    `Primeira sessão: ${details.firstSessionDate} às ${details.firstSessionTime}`,
    `Modalidade da primeira sessão: ${details.firstSessionMode}`,
    `Autorização de imagens e vídeos: ${details.mediaConsent}`,
  ].join("\n");
}

test("builds every observations fixture exactly without external requests", () => {
  for (const item of fixture.cases) {
    assert.equal(buildAsaasCustomerObservations(item.details), item.expected, item.name);
  }
});

test("keeps an adult without responsible free of duplicated personal data", () => {
  const output = buildAsaasCustomerObservations(cases.adult_without_responsible.details);
  for (const personalValue of ["Paciente Exemplo", "00000000000", "11900000000", "Rua Exemplo"]) {
    assert.doesNotMatch(output, new RegExp(personalValue));
  }
  assert.match(output, /^Tipo de atendimento:/);
  assert.match(output, /Autorização de imagens e vídeos: Autorizado$/);
});

test("preserves every required adult value for financial and legal responsible scenarios", () => {
  for (const name of ["adult_with_financial_responsible", "adult_with_legal_responsible_online"]) {
    const { details } = cases[name];
    const output = buildAsaasCustomerObservations(details);
    for (const value of [
      details.patientName,
      details.patientCpf,
      details.patientBirthDate,
      details.patientPhone,
      details.patientEmail,
      details.patientAddress,
      details.responsibleBirthDate,
      details.serviceType,
      details.attendanceMode,
      details.firstSessionDate,
      details.firstSessionTime,
      details.firstSessionMode,
      details.mediaConsent,
    ]) {
      assert.ok(output.includes(value), `${name} must preserve ${value}`);
    }
  }
});

test("keeps the minor contract without inventing patient contact or address", () => {
  const output = buildAsaasCustomerObservations(cases.minor_with_responsible.details);
  for (const value of [
    "Criança Exemplo da Silva",
    "33333333333",
    "05/03/2017",
    "30/07/1985",
    "Terapia Ocupacional com Integração Sensorial",
    "Processo Avaliativo Completo",
  ]) {
    assert.ok(output.includes(value));
  }
  assert.doesNotMatch(output, /^Contato:|^Endereço:/m);
});

test("represents in-person, online, authorized and non-authorized session data", () => {
  assert.match(cases.adult_with_financial_responsible.expected, /Modo 1ª sessão: Presencial, na clínica Conexão Seres/);
  assert.match(cases.adult_with_financial_responsible.expected, /Mídia: Autorizado/);
  assert.match(cases.adult_with_legal_responsible_online.expected, /Modo 1ª sessão: Online via Google Meet/);
  assert.match(cases.adult_with_legal_responsible_online.expected, /Mídia: Não autorizado/);
});

test("keeps representative responsible observations inside the UTF-8 safety budget", () => {
  for (const name of [
    "adult_with_financial_responsible",
    "adult_with_legal_responsible_online",
    "minor_with_responsible",
  ]) {
    const output = buildAsaasCustomerObservations(cases[name].details);
    assert.ok(isAsaasCustomerObservationsWithinSafetyBudget(output), name);
  }

  const representative = cases.adult_with_financial_responsible.details;
  const legacy = buildLegacyResponsibleObservations(representative);
  const compact = buildAsaasCustomerObservations(representative);
  assert.ok(asaasCustomerObservationsUtf8Bytes(legacy) > ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES);
  assert.ok(asaasCustomerObservationsUtf8Bytes(compact) <= ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES);
});

test("accepts the exact UTF-8 byte budget and rejects one byte above it", () => {
  const exact = "á".repeat(ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES / 2);
  assert.equal(asaasCustomerObservationsUtf8Bytes(exact), ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES);
  assert.equal(isAsaasCustomerObservationsWithinSafetyBudget(exact), true);
  assert.equal(isAsaasCustomerObservationsWithinSafetyBudget(`${exact}a`), false);
});

test("blocks oversized observations before any Asaas lookup or create request", () => {
  const post = typescriptBackend.slice(typescriptBackend.indexOf("export async function POST"));
  const phpMain = phpBackend.slice(phpBackend.indexOf("if ($_SERVER['REQUEST_METHOD']"));

  const typescriptGuard = post.indexOf("if (!isAsaasCustomerObservationsWithinSafetyBudget(observations))");
  const typescriptLookup = post.indexOf("const searchUrl = new URL(`${baseUrl}/customers`)");
  const phpGuard = phpMain.indexOf("!asaas_customer_observations_within_safety_budget($observations)");
  const phpLookup = phpMain.indexOf("$lookup = asaas_request('GET'");

  assert.ok(typescriptGuard >= 0 && typescriptGuard < typescriptLookup);
  assert.ok(phpGuard >= 0 && phpGuard < phpLookup);
  assert.match(post.slice(typescriptGuard, typescriptLookup), /status: 400/);
  assert.match(phpMain.slice(phpGuard, phpLookup), /400/);
});

test("does not silently truncate observations or personal values", () => {
  assert.doesNotMatch(observationsModule, /\.slice\(|\.substring\(|\.substr\(/);
  const phpBuilder = phpBackend.slice(
    phpBackend.indexOf("function build_observations"),
    phpBackend.indexOf("function normalized_name"),
  );
  assert.doesNotMatch(phpBuilder, /substr|mb_substr/);
  assert.match(observationsModule, /return \[\.\.\.lines, \.\.\.attendanceLines\]\.join\("\\n"\)/);
  assert.match(phpBuilder, /return implode\("\\n", array_merge\(\$lines, \$attendanceLines\)\)/);
});

test("keeps holder and company rules unchanged when a responsible exists", () => {
  assert.match(typescriptBackend, /const holder = patient\.hasResponsible \? "responsible" : "patient"/);
  assert.match(typescriptBackend, /patient\.hasResponsible \? \{ company: clean\(patient\.patientName\) \}/);
  assert.match(phpBackend, /\$holder = \$values\['hasResponsible'\] \? 'responsible' : 'patient'/);
  assert.match(phpBackend, /\$customer\['company'\] = clean_text\(\$values\['patientName'\]\)/);
});

test("keeps TypeScript and PHP compact labels and UTF-8 byte semantics aligned", () => {
  for (const label of [
    "Paciente: ",
    "CPF: ",
    "Nasc.: ",
    "Contato: ",
    "Endereço: ",
    "Nasc. resp.: ",
    "Atendimento: ",
    "Modo: ",
    "1ª sessão: ",
    "Modo 1ª sessão: ",
    "Mídia: ",
  ]) {
    assert.ok(
      fixture.cases.some((item) => item.expected.includes(label)),
      `TypeScript fixture label ${label}`,
    );
    assert.ok(phpBackend.includes(label), `PHP label ${label}`);
  }
  assert.match(phpBackend, /function asaas_customer_observations_utf8_bytes[\s\S]*?return strlen\(\$value\)/);
  assert.match(phpBackend, /ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES = 500/);
});

test("parses both compact and legacy first-session observations", () => {
  const compact = parseFirstSessionFromObservations(cases.adult_with_financial_responsible.expected);
  assert.deepEqual(compact, {
    patientName: "Mariana de Oliveira Santos",
    patientNameLinePresent: true,
    firstSessionDate: "12/09/2026",
    firstSessionTime: "14:30",
    firstSessionMode: "IN_PERSON",
  });

  const legacy = parseFirstSessionFromObservations([
    "Pessoa atendida: Paciente Legado",
    "Primeira sessão: 12/09/2026 às 14:30",
    "Modalidade da primeira sessão: Presencial, na clínica Conexão Seres",
  ].join("\n"));
  assert.deepEqual(legacy, {
    patientName: "Paciente Legado",
    patientNameLinePresent: true,
    firstSessionDate: "12/09/2026",
    firstSessionTime: "14:30",
    firstSessionMode: "IN_PERSON",
  });

  for (const token of ["Paciente", "1ª sessão", "Modo 1ª sessão"]) {
    assert.ok(phpWebhook.includes(token));
  }
});

test("redacts an unformatted Brazilian mobile phone before the generic CPF pattern", () => {
  for (const source of [typescriptBackend, phpBackend]) {
    const sanitizer = source.slice(
      source.indexOf(source === typescriptBackend ? "function sanitizeAsaasLogText" : "function sanitize_asaas_log_text"),
      source.indexOf(source === typescriptBackend ? "async function asaasErrorDetails" : "function asaas_error_summary"),
    );
    assert.ok(sanitizer.indexOf("[PHONE_REDACTED]") < sanitizer.indexOf("[CPF_REDACTED]"));
  }
});
