import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const typescriptBackend = await readFile(
  new URL("../app/api/patients/route.ts", import.meta.url),
  "utf8",
);
const phpBackend = await readFile(
  new URL("../cpanel-server/api/patients.php", import.meta.url),
  "utf8",
);
const typescriptFiscalWebhook = await readFile(
  new URL("../app/api/asaas/webhook/route.ts", import.meta.url),
  "utf8",
);
const phpFiscalWebhook = await readFile(
  new URL("../cpanel-server/api/asaas-webhook.php", import.meta.url),
  "utf8",
);
const frontend = await readFile(
  new URL("../components/cadastro-form.tsx", import.meta.url),
  "utf8",
);

test("sends the patient name as company whenever there is a responsible party", () => {
  assert.match(
    typescriptBackend,
    /patient\.hasResponsible\s*\?\s*\{ company: clean\(patient\.patientName\) \}/,
  );
  assert.match(
    phpBackend,
    /if \(\$values\['hasResponsible'\]\) \{\s*\$customer\['company'\] = clean_text\(\$values\['patientName'\]\);/,
  );
});

test("uses the selected holder's complement when creating an Asaas customer", () => {
  assert.match(
    typescriptBackend,
    /const holderComplement = clean\(patient\[`\$\{holder\}Complement`\]\);/,
  );
  assert.match(
    typescriptBackend,
    /\.\.\.\(holderComplement \? \{ complement: holderComplement \} : \{\}\)/,
  );
  assert.match(
    phpBackend,
    /\$holderComplement = clean_text\(\$values\[\$holder \. 'Complement'\]\);/,
  );
  assert.match(
    phpBackend,
    /\$customer\['complement'\] = \$holderComplement;/,
  );
});

test("returns a friendly conflict when the patient external reference already exists", () => {
  assert.match(
    typescriptBackend,
    /message: "Já existe um cadastro com este CPF e\/ou e-mail\. Se precisar atualizar os dados, fale com a clínica\."[\s\S]*?\{ status: 409 \}/,
  );
  assert.match(
    phpBackend,
    /'message' => 'Já existe um cadastro com este CPF e\/ou e-mail\. Se precisar atualizar os dados, fale com a clínica\.',[\s\S]*?\], 409\)/,
  );
  assert.doesNotMatch(typescriptBackend, /success: true, existing: true/);
  assert.doesNotMatch(phpBackend, /success' => true, 'existing' => true/);
});

test("notifies n8n only after creating a new Asaas customer with the selected holder data", () => {
  assert.match(
    typescriptBackend,
    /if \(existing\.data\?\.length\) \{[\s\S]*?status: 409[\s\S]*?\}[\s\S]*?const createdCustomerId = created\.id\.trim\(\);[\s\S]*?await notifyN8nCustomerCreated\(\{[\s\S]*?eventType: "asaas_customer_created"[\s\S]*?customerName: customer\.name[\s\S]*?whatsapp: customer\.mobilePhone[\s\S]*?asaasCustomerId: createdCustomerId[\s\S]*?externalReference[\s\S]*?\}\);/,
  );
  assert.match(
    phpBackend,
    /if \(!empty\(\$lookup\['data'\]\['data'\]\)\) \{[\s\S]*?\], 409\);[\s\S]*?\$createdCustomerId = trim\(\(string\) \(\$created\['data'\]\['id'\] \?\? ''\)\);[\s\S]*?notify_n8n_customer_created_safely\(\$n8nWebhookUrl, \$n8nWebhookToken, \[[\s\S]*?'eventType' => 'asaas_customer_created'[\s\S]*?'customerName' => \$customer\['name'\][\s\S]*?'whatsapp' => \$customer\['mobilePhone'\][\s\S]*?'asaasCustomerId' => \$createdCustomerId[\s\S]*?'externalReference' => \$externalReference/,
  );
  assert.match(typescriptBackend, /N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL/);
  assert.match(typescriptBackend, /N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN/);
  assert.match(phpBackend, /N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL/);
  assert.match(phpBackend, /N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN/);
});

test("formats patient and responsible birth dates in observations", () => {
  assert.match(
    typescriptBackend,
    /return match \? `\$\{match\[3\]\}\/\$\{match\[2\]\}\/\$\{match\[1\]\}` : value/,
  );
  assert.match(
    typescriptBackend,
    /Nascimento da pessoa atendida: \$\{formatBirthDate\(patient\.patientBirthDate\)\}/,
  );
  assert.match(
    typescriptBackend,
    /Nascimento do responsável: \$\{formatBirthDate\(patient\.responsibleBirthDate\)\}/,
  );
  assert.match(
    phpBackend,
    /return \$parts\[3\] \. '\/' \. \$parts\[2\] \. '\/' \. \$parts\[1\];/,
  );
  assert.match(
    phpBackend,
    /Nascimento da pessoa atendida: ' \. format_birth_date\(\$values\['patientBirthDate'\]\)/,
  );
  assert.match(
    phpBackend,
    /Nascimento do responsável: ' \. format_birth_date\(\$values\['responsibleBirthDate'\]\)/,
  );
});

test("validates birth dates when they change and when the field loses focus", () => {
  assert.match(
    frontend,
    /function birthDateError\(field: BirthDateField, value: string\)[\s\S]*?Informe uma data de nascimento válida\.[\s\S]*?O responsável deve ter 18 anos ou mais\./,
  );
  assert.match(
    frontend,
    /setFieldValidation\("patientBirthDate", birthDateError\("patientBirthDate", value\)\)/,
  );
  assert.match(
    frontend,
    /onChange=\{updateBirthDate\}[\s\S]*?onBlur=\{\(\) => validateBirthDateField\("patientBirthDate"\)\}/,
  );
  assert.match(
    frontend,
    /onChange=\{updateResponsibleBirthDate\}[\s\S]*?onBlur=\{\(\) => validateBirthDateField\("responsibleBirthDate"\)\}/,
  );
});

test("requires full names and rejects equal patient and responsible names", () => {
  assert.match(
    frontend,
    /function isValidFullName\(value: string\)[\s\S]*?parts\.length >= 2[\s\S]*?parts\.every/,
  );
  assert.match(
    frontend,
    /patientName: z\.string\(\)\.trim\(\)\.refine\(isValidFullName, "Informe o nome completo do paciente\."\)/,
  );
  assert.match(
    frontend,
    /O nome do responsável deve ser diferente do nome do paciente\./,
  );
  assert.match(
    frontend,
    /onBlur=\{\(\) => validateNameField\("patientName"\)\}/,
  );
  assert.match(
    frontend,
    /onBlur=\{\(\) => validateNameField\("responsibleName"\)\}/,
  );
  assert.match(
    typescriptBackend,
    /function isValidFullName\(value: string\)[\s\S]*?parts\.length >= 2[\s\S]*?parts\.every/,
  );
  assert.match(
    typescriptBackend,
    /normalizedNameForComparison\(value\.patientName\) === normalizedNameForComparison\(value\.responsibleName\)/,
  );
  assert.match(
    phpBackend,
    /function valid_full_name\(string \$value\): bool[\s\S]*?count\(\$parts\) < 2/,
  );
  assert.match(
    phpBackend,
    /normalized_name\(\$values\['patientName'\]\) === normalized_name\(\$values\['responsibleName'\]\)/,
  );
});

test("builds a safe, customer-scoped Asaas notification batch", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /deleted[^\n]*true/);
    assert.match(backend, /customer[^\n]*customerId/);
    assert.match(backend, /PAYMENT_DUEDATE_WARNING/);
    assert.match(backend, /PAYMENT_OVERDUE/);
    assert.match(backend, /SEND_LINHA_DIGITAVEL/);
    assert.match(backend, /scheduleOffset[\s\S]*?(?:5|1)/);
    assert.match(backend, /notifications\/batch/);
  }
  assert.match(typescriptBackend, /selectScheduledNotificationIds/);
  assert.match(typescriptBackend, /CONTROLLED_NOTIFICATION_EVENTS/);
  assert.match(phpBackend, /select_scheduled_notification_ids/);
  assert.match(phpBackend, /controlled_notification_event/);
});

test("records sanitized Asaas error responses and validates the applied policy", () => {
  assert.match(typescriptBackend, /await response\.text\(\)/);
  assert.match(typescriptBackend, /REDACTED/);
  assert.match(typescriptBackend, /slice\(0, 800\)/);
  assert.match(typescriptBackend, /Asaas notification validation/);
  assert.match(phpBackend, /sanitize_asaas_log_text/);
  assert.match(phpBackend, /Response: ' \./);
  assert.match(phpBackend, /Asaas notification validation/);
});

test("requires explicit patient sex in the shared form and both backends", () => {
  assert.match(frontend, /patientSex: z\.string\(\)\.refine\([\s\S]*?value === "female" \|\| value === "male"/);
  assert.match(frontend, /name="patientSex"/);
  assert.match(frontend, /value: "female"/);
  assert.match(frontend, /value: "male"/);
  assert.match(typescriptBackend, /patientSex: z\.enum\(\["female", "male"\]\)/);
  assert.match(phpBackend, /'patientSex' => 10/);
  assert.match(phpBackend, /in_array\(\$values\['patientSex'\], \['female', 'male'\], true\)/);
});

test("defines the first-session payment contract and patient-specific description", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /payments/);
    assert.match(backend, /UNDEFINED/);
    assert.match(backend, /230(?:\.00)?/);
    assert.match(backend, /sessao-1/);
    assert.match(backend, /next_business_day|getNextBusinessDay/);
    assert.match(backend, /Terapia Ocupacional/);
    assert.match(backend, /Clínica Conexão Seres/);
    assert.match(backend, /format_cpf|formatCpf/);
  }
  assert.match(typescriptBackend, /patient\.patientSex === "female" \? "a paciente" : "o paciente"/);
  assert.match(phpBackend, /\$values\['patientSex'\] === 'female' \? 'a paciente' : 'o paciente'/);
  assert.match(typescriptBackend, /customer: customerId,[\s\S]*?externalReference: paymentExternalReference/);
  assert.match(phpBackend, /'customer' => \$customerId,[\s\S]*?'externalReference' => \$paymentExternalReference/);
});

test("uses the next business day rule and does not invent payment fiscal data", () => {
  assert.match(
    typescriptBackend,
    /parts\.weekday === "Fri" \? 3 : parts\.weekday === "Sat" \? 2 : parts\.weekday === "Sun" \? 1 : 1/,
  );
  assert.match(phpBackend, /\$days = \$weekday >= 5 \? 8 - \$weekday : 1/);
});

test("calls n8n after the new customer payment without waiting for the invoice", () => {
  const tsPaymentIndex = typescriptBackend.indexOf("const payment = await createFirstSessionPayment");
  const tsN8nIndex = typescriptBackend.lastIndexOf("await notifyN8nCustomerCreated");
  const phpPaymentIndex = phpBackend.indexOf("$payment = create_first_session_payment");
  const phpN8nIndex = phpBackend.lastIndexOf("notify_n8n_customer_created_safely");
  assert.ok(tsPaymentIndex > -1 && tsN8nIndex > tsPaymentIndex);
  assert.ok(phpPaymentIndex > -1 && phpN8nIndex > phpPaymentIndex);
  assert.doesNotMatch(typescriptBackend, /prepareFirstSessionInvoice/);
  assert.doesNotMatch(phpBackend, /prepare_first_session_invoice/);
});

test("protects the Asaas fiscal webhook and accepts only confirmed first-session payments", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /PAYMENT_CONFIRMED/);
    assert.match(webhook, /asaas-access-token|HTTP_ASAAS_ACCESS_TOKEN/);
    assert.match(webhook, /ASAAS_WEBHOOK_TOKEN|asaas_webhook_token/);
    assert.match(webhook, /cs-paciente-.*sessao-1/);
    assert.match(webhook, /CONFIRMED/);
    assert.match(webhook, /230/);
    assert.match(webhook, /processed.*false/);
  }
  assert.match(typescriptFiscalWebhook, /secureTokenMatches/);
  assert.match(phpFiscalWebhook, /hash_equals/);
});

test("makes the invoice linked, dated, fiscal and idempotent by payment", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /invoices\?payment|http_build_query\(\['payment'/);
    assert.match(webhook, /\/fiscalInfo\//);
    assert.match(webhook, /fiscalInfo\/services/);
    assert.match(webhook, /\/invoices/);
    assert.match(webhook, /payment/);
    assert.match(webhook, /effectiveDate/);
    assert.match(webhook, /04510/);
    assert.match(webhook, /Terapia ocupacional/);
    assert.match(webhook, /retainIss/);
    assert.match(webhook, /iss.*2/);
    assert.match(webhook, /updatePayment.*false/);
    assert.match(webhook, /invoice already exists/);
  }
  assert.match(typescriptFiscalWebhook, /confirmedDate.*paymentDate.*clientPaymentDate/);
  assert.match(phpFiscalWebhook, /confirmedDate.*paymentDate.*clientPaymentDate/s);
  assert.match(typescriptFiscalWebhook, /municipalServiceId/);
  assert.match(phpFiscalWebhook, /municipalServiceId/);
});

test("does not choose an ambiguous service ID and uses the configured code only for an empty list", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /isDefault|is_default|default/);
    assert.match(webhook, /not uniquely found|not uniquely/);
    assert.match(webhook, /configured service code/);
  }
});

test("separates permanent webhook errors from retryable Asaas failures", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /401/);
    assert.match(webhook, /400/);
    assert.match(webhook, /413/);
    assert.match(webhook, /503/);
    assert.match(webhook, /500/);
    assert.match(webhook, /isTransientAsaasFailure|is_transient_asaas_failure/);
  }
  assert.match(typescriptFiscalWebhook, /429/);
  assert.match(phpFiscalWebhook, /\[408, 425, 429\]/);
});
