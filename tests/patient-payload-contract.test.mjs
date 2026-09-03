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
const cpanelBuildScript = await readFile(
  new URL("../scripts/build-cpanel.sh", import.meta.url),
  "utf8",
);
const cpanelHtaccess = await readFile(
  new URL("../cpanel-server/.htaccess", import.meta.url),
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
    /if \(existing\.data\?\.length\) \{[\s\S]*?status: 409[\s\S]*?\}[\s\S]*?const createdCustomerId = created\.id\.trim\(\);[\s\S]*?await notifyN8nCustomerCreated\(\{[\s\S]*?eventType: "asaas_customer_created"[\s\S]*?customerName: customer\.name[\s\S]*?customerEmail: customer\.email[\s\S]*?whatsapp: customer\.mobilePhone[\s\S]*?asaasCustomerId: createdCustomerId[\s\S]*?externalReference[\s\S]*?\}\);/,
  );
  assert.match(
    phpBackend,
    /if \(!empty\(\$lookup\['data'\]\['data'\]\)\) \{[\s\S]*?\], 409\);[\s\S]*?\$createdCustomerId = trim\(\(string\) \(\$created\['data'\]\['id'\] \?\? ''\)\);[\s\S]*?notify_n8n_customer_created_safely\(\$n8nWebhookUrl, \$n8nWebhookToken, \[[\s\S]*?'eventType' => 'asaas_customer_created'[\s\S]*?'customerName' => \$customer\['name'\][\s\S]*?'customerEmail' => \$customer\['email'\][\s\S]*?'whatsapp' => \$customer\['mobilePhone'\][\s\S]*?'asaasCustomerId' => \$createdCustomerId[\s\S]*?'externalReference' => \$externalReference/,
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

test("uses the next business day rule for the first-session payment", () => {
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
  assert.match(typescriptBackend, /paymentCreated/);
  assert.match(phpBackend, /paymentCreated/);
  assert.doesNotMatch(typescriptFiscalWebhook, /n8n|notifyN8n|notify_n8n/i);
  assert.doesNotMatch(phpFiscalWebhook, /n8n|notify_n8n/i);
});

test("accepts only authenticated confirmed or received first-session payment events", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /PAYMENT_CONFIRMED/);
    assert.match(webhook, /PAYMENT_RECEIVED/);
    assert.match(webhook, /asaas-access-token|HTTP_ASAAS_ACCESS_TOKEN/);
    assert.match(webhook, /ASAAS_WEBHOOK_TOKEN/);
    assert.match(webhook, /processed[\s\S]{0,20}false/);
    assert.match(webhook, /allowedStatuses/);
  }
  assert.match(typescriptFiscalWebhook, /secureTokenMatches/);
  assert.match(phpFiscalWebhook, /hash_equals/);
});

test("validates the exact first-session payment identity and value", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /(?:isFirstSessionPayment|is_first_session_payment)/);
    assert.match(webhook, /cs-paciente-\[a-f0-9\]\{24\}-sessao-1/);
    assert.match(webhook, /payment\[['"]?id|payment\.id/);
    assert.match(webhook, /payment\[['"]?customer|payment\.customer/);
    assert.match(webhook, /230(?:\.00)?/);
  }
});

test("allows PAYMENT_RECEIVED with RECEIVED", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /PAYMENT_RECEIVED/);
    assert.match(webhook, /allowedStatuses[\s\S]{0,100}RECEIVED/);
  }
});

test("allows PAYMENT_RECEIVED with RECEIVED_IN_CASH", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /RECEIVED_IN_CASH/);
    assert.match(webhook, /PAYMENT_RECEIVED/);
  }
});

test("keeps PAYMENT_CONFIRMED restricted to CONFIRMED", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /PAYMENT_CONFIRMED[\s\S]{0,100}CONFIRMED/);
    assert.match(webhook, /allowedStatuses/);
  }
});

test("does not accept an arbitrary paid status for PAYMENT_RECEIVED", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.doesNotMatch(webhook, /status\s*===\s*["']PAID["']/);
    assert.doesNotMatch(webhook, /status\s*===\s*expectedStatus/);
    assert.match(webhook, /\[.?["']RECEIVED["'][\s\S]*["']RECEIVED_IN_CASH["']/);
  }
});

test("keeps RECEIVED_IN_CASH restricted to the exact sessao-1 payment", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /cs-paciente-\[a-f0-9\]\{24\}-sessao-1/);
    assert.match(webhook, /payment(?:\.id|\[['"]?id)/);
    assert.match(webhook, /payment(?:\.customer|\[['"]?customer)/);
    assert.match(webhook, /RECEIVED_IN_CASH/);
  }
});

test("does not duplicate an invoice for a repeated cash-received webhook", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /findInvoiceForPayment|find_invoice_for_payment/);
    assert.match(webhook, /invoice already exists/);
    assert.match(webhook, /payment/);
  }
  assert.match(phpFiscalWebhook, /flock/);
});

test("reconciles invoices by payment and serializes PHP races", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /invoices\?payment|http_build_query\(\['payment'/);
    assert.match(webhook, /findInvoiceForPayment|find_invoice_for_payment/);
    assert.match(webhook, /invoice already exists/);
    assert.match(webhook, /\/invoices/);
    assert.match(webhook, /reconciled after inconclusive creation response/);
  }
  assert.match(phpFiscalWebhook, /process_with_payment_lock/);
  assert.match(phpFiscalWebhook, /flock/);
  assert.match(phpFiscalWebhook, /hash\('sha256'/);
});

test("resolves the configured municipal service and builds the fiscal payload", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /fiscalInfo\//);
    assert.match(webhook, /fiscalInfo\/services/);
    assert.match(webhook, /04510/);
    assert.match(webhook, /Terapia ocupacional/);
    assert.match(webhook, /municipalServiceId/);
    assert.match(webhook, /municipalServiceCode/);
    assert.match(webhook, /serviceDescription/);
    assert.match(webhook, /municipalServiceName/);
    assert.match(webhook, /retainIss/);
    assert.match(webhook, /iss[\s\S]{0,8}2/);
    assert.match(webhook, /updatePayment[\s\S]{0,12}false/);
    assert.match(webhook, /effectiveDate/);
  }
  assert.match(typescriptFiscalWebhook, /servicesResult\.services/);
  assert.match(phpFiscalWebhook, /list_municipal_services/);
});

test("paginates all municipal-service pages with the Asaas offset contract", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /offset/);
    assert.match(webhook, /limit/);
    assert.match(webhook, /100/);
    assert.match(webhook, /hasMore/);
    assert.match(webhook, /totalCount/);
  }
  assert.match(typescriptFiscalWebhook, /offset \+= page\.length/);
  assert.match(phpFiscalWebhook, /\$offset \+= count\(\$page\)/);
});

test("uses municipalServiceId for one exact service and never invents it in fallback", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /municipalServiceId/);
    assert.match(webhook, /municipalServiceCode/);
    assert.match(webhook, /configured-code/);
    assert.match(webhook, /04510/);
  }
  assert.match(typescriptFiscalWebhook, /service\.id \? \{ municipalServiceId: service\.id \}/);
  assert.match(phpFiscalWebhook, /if \(!empty\(\$service\['id'\]\)\)/);
});

test("falls back to the confirmed municipal code when all pages have no exact service", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /was not returned; using configured municipalServiceCode/);
    assert.match(webhook, /municipalServiceCode/);
    assert.match(webhook, /04510/);
    assert.match(webhook, /municipalServiceName/);
  }
});

test("keeps an empty municipal-service list on the same safe code fallback", () => {
  assert.match(typescriptFiscalWebhook, /if \(!service\)/);
  assert.match(phpFiscalWebhook, /if \(!\$service\)/);
  assert.match(typescriptFiscalWebhook, /configured-code/);
  assert.match(phpFiscalWebhook, /configured-code/);
});

test("aborts rather than choosing arbitrarily when exact services are ambiguous", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /matched multiple services; invoice was not created/);
    assert.match(webhook, /matches/);
    assert.match(webhook, /slice\(0, 5\)|array_slice\(\$services, 0, 5\)/);
  }
});

test("allows cash-received fallback to reach the invoice POST path", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /RECEIVED_IN_CASH/);
    assert.match(webhook, /configured municipalServiceCode/);
    assert.match(webhook, /\/invoices/);
  }
});

test("distinguishes retryable failures from permanent failures and reconciles uncertain posts", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /isTransientAsaasFailure|is_transient_asaas_failure/);
    assert.match(webhook, /408/);
    assert.match(webhook, /429/);
    assert.match(webhook, /status >= 500/);
    assert.match(webhook, /HTTP 401|status: 401|401/);
    assert.match(webhook, /HTTP 413|status: 413|413/);
    assert.match(webhook, /temporariamente indisponível/);
  }
});

test("publishes the fiscal webhook through the cPanel public route and generated build", () => {
  assert.match(cpanelHtaccess, /api\/asaas\/webhook\/\?\$.*asaas-webhook\.php/);
  assert.match(cpanelBuildScript, /cpanel-server\/api\/asaas-webhook\.php/);
  assert.match(cpanelBuildScript, /cpanel-dist\/api\/asaas-webhook\.php/);
});
