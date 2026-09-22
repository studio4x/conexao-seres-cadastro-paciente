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
const typescriptWebhook = await readFile(new URL("../app/api/asaas/webhook/route.ts", import.meta.url), "utf8");
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

test("includes the requested adult patient data in observations", () => {
  const output = buildAsaasCustomerObservations(cases.adult_without_responsible.details);
  for (const expectedLine of [
    "Idade: 34 anos",
    "CPF: 00000000000",
    "Celular: 11900000000 | E-mail: paciente@example.invalid",
    "Endereço: Rua Exemplo, 3 - Centro - São Paulo/SP - 00000000",
  ]) {
    assert.ok(output.includes(expectedLine), expectedLine);
  }
  assert.match(output, /^Idade: 34 anos\nCPF: 00000000000\nSexo: Feminino \| Nasc\.: 08\/09\/1992/);
  assert.match(output, /^Endereço: [^\n]+$/m);
  assert.match(output, /Autorização de imagens e vídeos: Autorizado\n/);
  assert.match(output, /Como conheceu a Conexão Seres: Instagram$/);
});

test("preserves every required adult value for financial and legal responsible scenarios", () => {
  for (const name of ["adult_with_financial_responsible", "adult_with_legal_responsible_online"]) {
    const { details } = cases[name];
    const output = buildAsaasCustomerObservations(details);
    for (const value of [
      details.patientName,
      details.patientCpf,
      details.patientSex === "female"
        ? "Feminino"
        : details.patientSex === "male"
          ? "Masculino"
          : "Não binário",
      details.patientBirthDate,
      details.patientPhone,
      details.patientEmail,
      details.patientAddress,
      details.patientCity,
      details.patientState,
      details.responsibleBirthDate,
      details.responsibleCity,
      details.responsibleState,
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
  assert.match(cases.adult_with_financial_responsible.expected, /Img\.: Autorizado/);
  assert.match(cases.adult_with_legal_responsible_online.expected, /Modo 1ª sessão: Online via Google Meet/);
  assert.match(cases.adult_with_legal_responsible_online.expected, /Img\.: Não autorizado/);
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
  const exact = "á".repeat(Math.floor(ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES / 2))
    + (ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES % 2 === 1 ? "a" : "");
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
    "Idade: ",
    "CPF: ",
    "Celular: ",
    "E-mail: ",
    "Endereço: ",
    "Nasc.: ",
    "Sexo: ",
    "Nasc. R.: ",
    "Local R.: ",
    "Atend.: ",
    "Modo: ",
    "1ª sessão: ",
    "Modo 1ª sessão: ",
    "Img.: ",
  ]) {
    assert.ok(
      fixture.cases.some((item) => item.expected.includes(label)),
      `TypeScript fixture label ${label}`,
    );
    assert.ok(phpBackend.includes(label), `PHP label ${label}`);
  }
  assert.match(phpBackend, /function asaas_customer_observations_utf8_bytes[\s\S]*?return strlen\(\$value\)/);
  assert.match(phpBackend, /ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES = 550/);
});

test("parses both compact and legacy first-session observations", () => {
  const compact = parseFirstSessionFromObservations(cases.adult_with_financial_responsible.expected);
  assert.deepEqual(compact, {
    patientName: "Mariana de Oliveira Santos",
    patientNameLinePresent: true,
    firstSessionDate: "12/09/2026",
    firstSessionTime: "14:30",
    firstSessionMode: "IN_PERSON",
    patientAge: 34,
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
    patientAge: null,
  });

  for (const token of ["Paciente", "1ª sessão", "Modo 1ª sessão"]) {
    assert.ok(phpWebhook.includes(token));
  }
});

test("accepts Asaas observations with ASCII 1a instead of ordinal 1ª", () => {
  const observed = [
    "Paciente: Pessoa de Teste",
    "Idade: 67 anos",
    "1a sessão: 23/09/2026 às 10:00",
    "Modo 1a sessão: Presencial, na clínica Conexão Seres",
  ].join("\n");
  assert.deepEqual(parseFirstSessionFromObservations(observed), {
    patientName: "Pessoa de Teste",
    patientNameLinePresent: true,
    firstSessionDate: "23/09/2026",
    firstSessionTime: "10:00",
    firstSessionMode: "IN_PERSON",
    patientAge: 67,
  });

  for (const ordinal of ["1ª", "1a"]) {
    const result = parseFirstSessionFromObservations(
      ["Paciente: Pessoa de Teste", ordinal + " sessão: 23/09/2026 às 10:00",
        "Modo " + ordinal + " sessão: Online via Google Meet"].join("\n"),
    );
    assert.equal(result.firstSessionDate, "23/09/2026");
    assert.equal(result.firstSessionTime, "10:00");
    assert.equal(result.firstSessionMode, "ONLINE");
  }
  assert.match(phpWebhook, /1\[ªa\] sessão/);
  assert.match(phpWebhook, /Modo 1a sessão: Presencial, na clínica Conexão Seres/);
  assert.match(phpWebhook, /Modo 1a sessão: Online via Google Meet/);
});

test("classifies the attended patient by a valid observation age", () => {
  const cases = [
    [36, "ADULT"],
    [18, "ADULT"],
    [17, "CHILD_ADOLESCENT"],
    [8, "CHILD_ADOLESCENT"],
  ];

  for (const [age, contractType] of cases) {
    for (const suffix of ["", " anos"]) {
      const parsed = parseFirstSessionFromObservations(`Paciente: Pessoa Atendida\nIdade: ${age}${suffix}`);
      assert.equal(parsed.patientAge, age);
      assert.equal(parsed.patientAge >= 18 ? "ADULT" : "CHILD_ADOLESCENT", contractType);
    }
  }

  const adultWithResponsible = parseFirstSessionFromObservations(
    ["Paciente: Adulto com Responsável", "Idade: 36 anos", "Responsável: Titular Financeiro"].join("\n"),
  );
  assert.equal(adultWithResponsible.patientAge, 36);
  assert.equal(adultWithResponsible.patientAge >= 18 ? "ADULT" : "CHILD_ADOLESCENT", "ADULT");
});

test("does not classify an absent or invalid observation age", () => {
  for (const line of ["", "Idade:", "Idade: abc", "Idade: -1", "Idade: 121", "Idade: 36.5"]) {
    const parsed = parseFirstSessionFromObservations(line);
    assert.equal(parsed.patientAge, null, line || "absent age");
  }
});

test("conditionally preserves the existing first-session n8n payload contract", () => {
  assert.match(typescriptWebhook, /const contractType = patientAge === null \? null : patientAge >= 18 \? "ADULT" : "CHILD_ADOLESCENT"/);
  assert.match(typescriptWebhook, /\.\.\.\(patientAge !== null && contractType !== null \? \{ patientAge, contractType \} : \{\}\)/);
  assert.match(phpWebhook, /\$payload\['patientAge'\] = \$patientAge;/);
  assert.match(phpWebhook, /\$payload\['contractType'\] = \$contractType;/);
  assert.match(phpWebhook, /if \(\$patientAge !== null && \$contractType !== null\)/);

  for (const field of [
    "eventType",
    "asaasEventId",
    "asaasEvent",
    "paymentId",
    "asaasCustomerId",
    "customerName",
    "customerWhatsapp",
    "patientName",
    "firstSessionDate",
    "firstSessionTime",
    "firstSessionMode",
    "invoiceNumber",
    "invoiceUrl",
    "value",
    "billingType",
    "status",
    "paymentDate",
    "externalReference",
  ]) {
    assert.match(typescriptWebhook, new RegExp(`\\b${field}\\b`), `TypeScript field ${field}`);
    assert.match(phpWebhook, new RegExp(`['"]${field}['"]`), `PHP field ${field}`);
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


test("logs only sanitized diagnostics when first-session metadata cannot be extracted", () => {
  for (const [source, label] of [[typescriptWebhook, "TypeScript"], [phpWebhook, "PHP"]]) {
    assert.match(source, /n8n first-session-paid appointment data unavailable/, label);
    for (const field of ["observationsPresent", "observationsUtf8Bytes", "hasSessionMarker", "hasModeMarker", "missingFields"]) {
      assert.ok(source.includes(field), `${label} missing diagnostic field: ${field}`);
    }
    assert.ok(!source.includes("console.warn(\"observations\""), label);
  }
});
