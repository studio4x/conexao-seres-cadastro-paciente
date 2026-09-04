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
const homePage = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
const attendanceContract = await readFile(
  new URL("../lib/attendance.ts", import.meta.url),
  "utf8",
);
const consentContract = await readFile(
  new URL("../lib/consent.ts", import.meta.url),
  "utf8",
);
const firstSessionContract = await readFile(
  new URL("../lib/first-session.ts", import.meta.url),
  "utf8",
);

test("defines stable attendance codes and centralized labels", () => {
  const labels = [
    ["ADULT_NEURO_REHAB", "Terapia Ocupacional – Reabilitação Neurológica"],
    ["ADULT_PSYCHOANALYSIS_INTEGRATED", "Terapia Ocupacional com Psicanálise Integrada"],
    ["ADULT_SENSORY_STIMULATION", "Terapia Ocupacional com Estimulação Sensorial"],
    ["CHILD_OT", "Terapia Ocupacional"],
    ["CHILD_NEURO_REHAB", "Terapia Ocupacional – Reabilitação Neurológica"],
    ["CHILD_SENSORY_INTEGRATION", "Terapia Ocupacional com Integração Sensorial"],
    ["FULL_ASSESSMENT", "Processo Avaliativo Completo"],
    ["DIRECT_START", "Início Direto – Sem Avaliação Completa"],
    ["IN_PERSON", "Presencial"],
    ["ONLINE", "Online"],
    ["UNDEFINED", "Ainda não definido"],
  ];
  for (const [code, label] of labels) assert.ok(attendanceContract.includes(`${code}: "${label}"`));
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /serviceType/);
    assert.match(backend, /entryType/);
    assert.match(backend, /attendanceMode/);
    assert.match(backend, /Terapia Ocupacional/);
  }
  assert.match(frontend, /SERVICE_TYPE_LABELS/);
  assert.match(frontend, /ENTRY_TYPE_LABELS/);
  assert.match(frontend, /ATTENDANCE_MODE_LABELS/);
});

test("keeps adult and minor attendance whitelists conditional on patient age", () => {
  assert.match(attendanceContract, /ADULT_SERVICE_TYPES[\s\S]*ADULT_NEURO_REHAB[\s\S]*ADULT_PSYCHOANALYSIS_INTEGRATED[\s\S]*ADULT_SENSORY_STIMULATION[\s\S]*UNDEFINED/);
  assert.match(attendanceContract, /CHILD_SERVICE_TYPES[\s\S]*CHILD_OT[\s\S]*CHILD_NEURO_REHAB[\s\S]*CHILD_SENSORY_INTEGRATION[\s\S]*UNDEFINED/);
  assert.match(typescriptBackend, /if \(age >= 18\) \{[\s\S]*isAdultServiceType\(value\.serviceType\)[\s\S]*isAttendanceMode\(value\.attendanceMode\)[\s\S]*value\.entryType !== ""/);
  assert.match(typescriptBackend, /else \{[\s\S]*isChildServiceType\(value\.serviceType\)[\s\S]*isEntryType\(value\.entryType\)[\s\S]*value\.attendanceMode !== ""/);
  assert.match(phpBackend, /service_type_is_valid_for_age\(\$values\['serviceType'\], \$patientAge\)/);
  assert.match(phpBackend, /attendance_mode_is_valid\(\$values\['attendanceMode'\]\)/);
  assert.match(phpBackend, /entry_type_is_valid\(\$values\['entryType'\]\)/);
});

test("defines the structured media consent contract for both environments", () => {
  assert.match(consentContract, /AUTHORIZED/);
  assert.match(consentContract, /NOT_AUTHORIZED/);
  assert.match(consentContract, /AUTHORIZED: "Autorizado"/);
  assert.match(consentContract, /NOT_AUTHORIZED: "Não autorizado"/);
  assert.match(frontend, /mediaConsent/);
  assert.match(frontend, /name="mediaConsent"/);
  assert.match(frontend, /Autorizo/);
  assert.match(frontend, /Não autorizo/);
  assert.match(typescriptBackend, /mediaConsent/);
  assert.match(phpBackend, /mediaConsent/);
});

test("validates media consent and switches modal copy by patient age", () => {
  assert.match(frontend, /isMediaConsent\(value\.mediaConsent\)/);
  assert.match(frontend, /DialogTrigger/);
  assert.match(frontend, /Saiba mais/);
  assert.match(frontend, /variant="outline"/);
  assert.match(frontend, /aria-haspopup="dialog"/);
  assert.match(frontend, /Info className/);
  assert.match(frontend, /ChevronRight className/);
  assert.match(frontend, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(frontend, /ADULT_MEDIA_CONSENT_TEXT/);
  assert.match(frontend, /MINOR_MEDIA_CONSENT_TEXT/);
  assert.match(frontend, /isMinor \? MINOR_MEDIA_CONSENT_TEXT : ADULT_MEDIA_CONSENT_TEXT/);
  assert.match(typescriptBackend, /isMediaConsent\(value\.mediaConsent\)/);
  assert.match(phpBackend, /in_array\(\$values\['mediaConsent'\], \['AUTHORIZED', 'NOT_AUTHORIZED'\], true\)/);
});

test("adds one concise media-consent observation line and preserves existing observations", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /Autorização de imagens e vídeos/);
  }
  assert.match(consentContract, /Autorizado/);
  assert.match(consentContract, /Não autorizado/);
  assert.match(typescriptBackend, /mediaConsentLabel\(patient\.mediaConsent\)/);
  assert.match(phpBackend, /media_consent_label\(\$values\['mediaConsent'\]\)/);
  assert.match(typescriptBackend, /return attendanceLines\.join/);
  assert.match(phpBackend, /Pessoa atendida/);
});

test("keeps media consent independent from billing, n8n and age-reset state", () => {
  assert.match(frontend, /function updateBirthDate[\s\S]*?attendanceMode: ""/);
  assert.doesNotMatch(frontend, /function updateBirthDate[\s\S]*?mediaConsent:/);
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /230(?:\.00)?/);
    assert.match(backend, /sessao-1/);
  }
  const paymentFunction = typescriptBackend.match(
    /async function createFirstSessionPayment[\s\S]*?\n}\r?\n\r?\nfunction fullAddress/,
  )?.[0];
  assert.ok(paymentFunction);
  assert.doesNotMatch(paymentFunction, /mediaConsent/);
});

test("defines the structured first-session contract for all patient ages", () => {
  assert.match(firstSessionContract, /FIRST_SESSION_MODES = \["IN_PERSON", "ONLINE"\]/);
  assert.match(firstSessionContract, /IN_PERSON: "Presencial, na clínica Conexão Seres"/);
  assert.match(firstSessionContract, /ONLINE: "Online via Google Meet"/);
  for (const field of ["firstSessionDate", "firstSessionTime", "firstSessionMode"]) {
    assert.match(frontend, new RegExp(field));
    assert.match(typescriptBackend, new RegExp(field));
    assert.match(phpBackend, new RegExp(field));
  }
  assert.match(frontend, /Primeira sessão/);
  assert.match(frontend, /Informe a data, o horário e a modalidade da primeira sessão que já foram combinados com a Conexão Seres\./);
  assert.match(frontend, /Esses campos apenas registram o agendamento já combinado com nossa equipe\./);
  assert.match(frontend, /Como será realizada a primeira sessão\?/);
  assert.match(frontend, /Endereço:/);
  assert.match(frontend, /Rua Petrobrás, 683 – Vila Antonieta/);
  assert.match(frontend, /São Paulo\/SP – CEP 03474-060/);
  assert.match(frontend, /O link da sessão será enviado para o seu WhatsApp momentos antes do horário da sessão/);
  assert.match(frontend, /através do número da Conexão Seres que você está conversando/);
  assert.match(firstSessionContract, /Presencial, na clínica Conexão Seres/);
});

test("validates first-session date, time and mode in the frontend and both backends", () => {
  assert.match(firstSessionContract, /formatFirstSessionDateInput/);
  assert.match(firstSessionContract, /parseFirstSessionDate/);
  assert.match(firstSessionContract, /America\/Sao_Paulo/);
  assert.match(firstSessionContract, /isFirstSessionDateTodayOrFuture/);
  assert.match(firstSessionContract, /isValidFirstSessionTime/);
  assert.match(frontend, /placeholder="DD\/MM\/AAAA"/);
  assert.match(frontend, /FirstSessionDateField/);
  assert.match(frontend, /CalendarDays/);
  assert.match(frontend, /Abrir calendário para escolher a data da primeira sessão/);
  assert.match(frontend, /onFocus=\{\(\) => setOpen\(true\)\}/);
  assert.match(frontend, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(frontend, /type === "date"/);
  assert.match(frontend, /showPicker\?\.\(\)/);
  assert.match(frontend, /locale=\{ptBR\}/);
  assert.match(frontend, /disabled=\{\{ before: today \}\}/);
  assert.match(frontend, /formatCalendarDate\(date\)/);
  assert.match(frontend, /type="time"/);
  assert.match(frontend, /firstSessionDateError/);
  assert.match(frontend, /firstSessionTimeError/);
  assert.match(typescriptBackend, /isValidFirstSessionDate\(value\.firstSessionDate\)/);
  assert.match(typescriptBackend, /isFirstSessionDateTodayOrFuture\(value\.firstSessionDate\)/);
  assert.match(typescriptBackend, /isValidFirstSessionTime\(value\.firstSessionTime\)/);
  assert.match(typescriptBackend, /isFirstSessionMode\(value\.firstSessionMode\)/);
  assert.match(phpBackend, /first_session_date_is_valid\(\$values\['firstSessionDate'\]\)/);
  assert.match(phpBackend, /first_session_time_is_valid\(\$values\['firstSessionTime'\]\)/);
  assert.match(phpBackend, /first_session_mode_is_valid\(\$values\['firstSessionMode'\]\)/);
});

test("records first-session data in observations without changing existing payment contracts", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /Primeira sessão:/);
    assert.match(backend, /Modalidade da primeira sessão:/);
    assert.match(backend, /firstSessionDate/);
    assert.match(backend, /firstSessionTime/);
    assert.match(backend, /firstSessionMode/);
    assert.match(backend, /230(?:\.00)?/);
    assert.match(backend, /sessao-1/);
  }
  assert.match(typescriptBackend, /patient\.firstSessionDate\} às \$\{patient\.firstSessionTime\}/);
  assert.match(typescriptBackend, /firstSessionModeLabel\(patient\.firstSessionMode\)/);
  assert.match(phpBackend, /\$values\['firstSessionDate'\] \. ' às ' \. \$values\['firstSessionTime'\]/);
  assert.match(phpBackend, /first_session_mode_label\(\$values\['firstSessionMode'\]\)/);
});

test("does not clear first-session data when the patient age group changes", () => {
  const birthDateFunction = frontend.match(
    /function updateBirthDate\(value: string\)[\s\S]*?\n  function updateResponsibleBirthDate/,
  )?.[0];
  assert.ok(birthDateFunction);
  for (const field of ["firstSessionDate", "firstSessionTime", "firstSessionMode"]) {
    assert.doesNotMatch(birthDateFunction, new RegExp(`${field}:`));
  }
});

test("renders the requested success message and hides the form intro after submission", () => {
  assert.match(homePage, /isRegistrationComplete/);
  assert.match(homePage, /!isRegistrationComplete/);
  assert.match(homePage, /<CadastroForm onSuccessChange=\{setIsRegistrationComplete\} \/>/);
  assert.match(frontend, /Cadastro concluído!/);
  assert.match(frontend, /Recebemos seus dados com sucesso\./);
  assert.match(frontend, /WhatsApp e no e-mail informados no cadastro/);
  assert.match(frontend, /Asaas enviará pelo WhatsApp o link para pagamento da primeira sessão/);
  assert.match(frontend, /confirmação do agendamento/);
  assert.match(frontend, /contrato de prestação de serviços para leitura e assinatura/);
  assert.doesNotMatch(frontend, /Tudo certo!/);
});

test("renders the Sobre o atendimento section with accessible conditional radio groups", () => {
  assert.match(frontend, /Sobre o atendimento/);
  assert.match(frontend, /Agora, informe os detalhes combinados para o atendimento\./);
  assert.match(frontend, /name="serviceType"/);
  assert.match(frontend, /name="entryType"/);
  assert.match(frontend, /name="attendanceMode"/);
  assert.match(frontend, /isMinor \? \(/);
  assert.match(frontend, /isAdult \? \(/);
  assert.match(frontend, /type="radio"/);
  assert.match(frontend, /A continuidade do atendimento online dependerá da avaliação profissional\./);
  assert.match(frontend, /Se ainda não foi definido, não se preocupe\./);
});

test("clears incompatible attendance choices when the birth date changes age group", () => {
  assert.match(frontend, /function updateBirthDate\(value: string\)[\s\S]*?isAdultServiceType\(current\.serviceType\) \? current\.serviceType : ""/);
  assert.match(frontend, /function updateBirthDate\(value: string\)[\s\S]*?entryType: ""[\s\S]*?attendanceMode:/);
  assert.match(frontend, /function updateBirthDate\(value: string\)[\s\S]*?isChildServiceType\(current\.serviceType\) \? current\.serviceType : ""/);
  assert.match(frontend, /function updateBirthDate\(value: string\)[\s\S]*?attendanceMode: ""/);
});

test("adds attendance labels to observations without duplicating an adult patient's own data", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /Tipo de atendimento/);
    assert.match(backend, /Modalidade de atendimento/);
    assert.match(backend, /Forma de ingresso/);
  }
  assert.match(typescriptBackend, /if \(patientAge !== null && patientAge >= 18 && !patient\.hasResponsible\) \{[\s\S]*return attendanceLines\.join/);
  assert.match(phpBackend, /\$lines\[\] = 'Tipo de atendimento: '/);
  assert.match(phpBackend, /\$lines\[\] = \$patientAge >= 18[\s\S]*Modalidade de atendimento/);
});

test("keeps the first-session payment independent from attendance fields", () => {
  for (const backend of [typescriptBackend, phpBackend]) {
    assert.match(backend, /230(?:\.00)?/);
    assert.match(backend, /UNDEFINED/);
    assert.match(backend, /sessao-1/);
    assert.doesNotMatch(backend, /serviceType.*(?:value|patient).*230|attendanceMode.*(?:value|patient).*230/);
  }
});

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
    /patientName: z\.string\(\)\.trim\(\)(?:\.max\(120\))?\.refine\(isValidFullName, "Informe o nome completo do paciente\."\)/,
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
  assert.match(frontend, /patientSex: z\.string\(\)\.refine\([\s\S]*?value === "female" \|\| value === "male" \|\| value === "non_binary"/);
  assert.match(frontend, /name="patientSex"/);
  assert.match(frontend, /value: "female"/);
  assert.match(frontend, /value: "male"/);
  assert.match(frontend, /value: "non_binary"/);
  assert.match(frontend, /label: "Não binário"/);
  assert.match(frontend, /aria-labelledby="patient-sex-label"[\s\S]*?grid gap-3 sm:grid-cols-3/);
  assert.match(typescriptBackend, /patientSex: z\.enum\(\["female", "male", "non_binary"\]\)/);
  assert.match(phpBackend, /'patientSex' => 10/);
  assert.match(phpBackend, /in_array\(\$values\['patientSex'\], \['female', 'male', 'non_binary'\], true\)/);
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
  assert.match(typescriptBackend, /patient\.patientSex === "female"[\s\S]*patient\.patientSex === "male"[\s\S]*a pessoa atendida/);
  assert.match(phpBackend, /match \(\$values\['patientSex'\]\)[\s\S]*'female' => 'a paciente'[\s\S]*'male' => 'o paciente'[\s\S]*'a pessoa atendida'/);
  assert.match(typescriptBackend, /non_binary/);
  assert.match(phpBackend, /'non_binary'/);
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
});

test("forwards both valid first-session payment events to n8n with the Asaas customer name", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_URL/);
    assert.match(webhook, /N8N_CONEXAO_SERES_PAGAMENTO_WEBHOOK_TOKEN/);
    assert.match(webhook, /asaas_first_session_paid/);
    assert.match(webhook, /asaasEventId/);
    assert.match(webhook, /asaasEvent/);
    assert.match(webhook, /paymentId/);
    assert.match(webhook, /asaasCustomerId/);
    assert.match(webhook, /customerName/);
    assert.match(webhook, /billingType/);
    assert.match(webhook, /paymentDate/);
    assert.match(webhook, /externalReference/);
    assert.match(webhook, /Authorization.*Bearer|Bearer.*webhookToken|Bearer.*webhookToken/i);
    assert.match(webhook, /Content-Type.*application\/json/);
    assert.match(webhook, /3_000|TIMEOUT => 3/);
  }
  assert.match(typescriptFiscalWebhook, /\/customers\/.*encodeURIComponent/);
  assert.match(phpFiscalWebhook, /\/customers\/.*rawurlencode/);
  assert.match(typescriptFiscalWebhook, /customerResult\.data\.name/);
  assert.match(phpFiscalWebhook, /customer\['data'\]\['name'\]/);
  assert.match(typescriptFiscalWebhook, /N8N_FIRST_SESSION_PAID_TIMEOUT_MS/);
  assert.match(phpFiscalWebhook, /CURLOPT_CONNECTTIMEOUT => 2/);
  assert.match(phpFiscalWebhook, /CURLOPT_TIMEOUT => 3/);

  const tsValidationIndex = typescriptFiscalWebhook.indexOf("if (!isFirstSessionPayment");
  const tsNotifyIndex = typescriptFiscalWebhook.indexOf("await notifyN8nFirstSessionPaid");
  const tsFiscalIndex = typescriptFiscalWebhook.indexOf("processPaymentEvent(baseUrl");
  assert.ok(tsValidationIndex > -1 && tsValidationIndex < tsNotifyIndex && tsNotifyIndex < tsFiscalIndex);

  const phpValidationIndex = phpFiscalWebhook.indexOf("is_first_session_payment_event");
  const phpNotifyIndex = phpFiscalWebhook.indexOf("notify_n8n_first_session_paid_safely(", phpFiscalWebhook.indexOf("$asaasEventId"));
  const phpFiscalIndex = phpFiscalWebhook.lastIndexOf("process_with_payment_lock(");
  assert.ok(phpValidationIndex > -1 && phpNotifyIndex > phpValidationIndex && phpNotifyIndex < phpFiscalIndex);
});

test("forwards the patient and first-session data parsed from Asaas observations", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /patientName/);
    assert.match(webhook, /firstSessionDate/);
    assert.match(webhook, /firstSessionTime/);
    assert.match(webhook, /firstSessionMode/);
    assert.match(webhook, /asaas_first_session_paid/);
    assert.match(webhook, /customerName/);
  }
  assert.match(firstSessionContract, /Pessoa atendida:/);
  assert.match(firstSessionContract, /Primeira sessão:/);
  assert.match(firstSessionContract, /Modalidade da primeira sessão:/);
  assert.match(firstSessionContract, /Presencial/);
  assert.match(firstSessionContract, /Online/);
  assert.match(
    typescriptFiscalWebhook,
    /parseFirstSessionFromObservations\(customerResult\.data\.observations\)/,
  );
  assert.match(
    phpFiscalWebhook,
    /parse_first_session_from_observations\(\$customer\['data'\]\['observations'\] \?\? null\)/,
  );
  assert.match(typescriptFiscalWebhook, /!firstSession\.patientNameLinePresent \? customerName : ""/);
  assert.match(phpFiscalWebhook, /\$firstSession\['patientNameLinePresent'\] \? '' : \$customerName/);
});

test("keeps observation parsing strict, failure-safe and free of extra customer requests", () => {
  assert.match(firstSessionContract, /export function parseFirstSessionFromObservations\(observations: unknown\)/);
  assert.match(firstSessionContract, /typeof observations === "string" \? observations\.split\(\/\\r\?\\n\//);
  assert.match(firstSessionContract, /\/\^Pessoa atendida:\(\.\*\)\$\/\.exec\(line\)/);
  assert.ok(firstSessionContract.includes("const sessionMatch = /^Primeira sessão: (\\d{2}\\/\\d{2}\\/\\d{4}) às"));
  assert.match(firstSessionContract, /isValidFirstSessionDate\(sessionMatch\[1\]\)/);
  assert.ok(firstSessionContract.includes("((?:[01]\\d|2[0-3]):[0-5]\\d)$/.exec(line)"));
  assert.match(firstSessionContract, /Modalidade da primeira sessão: Presencial/);
  assert.match(firstSessionContract, /Modalidade da primeira sessão: Online/);
  assert.match(firstSessionContract, /Modalidade da primeira sessão: Online via Google Meet/);
  assert.match(firstSessionContract, /patientNameLinePresent/);
  assert.match(firstSessionContract, /let firstSessionDate = ""/);
  assert.match(firstSessionContract, /let firstSessionTime = ""/);
  assert.match(firstSessionContract, /let firstSessionMode = ""/);

  const tsNotifyStart = typescriptFiscalWebhook.indexOf("async function notifyN8nFirstSessionPaid");
  const tsNotifyEnd = typescriptFiscalWebhook.indexOf("\n}\n\nfunction", tsNotifyStart);
  const phpNotifyStart = phpFiscalWebhook.indexOf("function notify_n8n_first_session_paid_safely");
  const phpNotifyEnd = phpFiscalWebhook.indexOf("\n}\n\nfunction", phpNotifyStart);
  assert.ok(tsNotifyStart > -1 && tsNotifyEnd > tsNotifyStart);
  assert.ok(phpNotifyStart > -1 && phpNotifyEnd > phpNotifyStart);
  const tsNotify = typescriptFiscalWebhook.slice(tsNotifyStart, tsNotifyEnd);
  const phpNotify = phpFiscalWebhook.slice(phpNotifyStart, phpNotifyEnd);
  assert.equal((tsNotify.match(/\/customers\//g) ?? []).length, 1);
  assert.equal((phpNotify.match(/\/customers\//g) ?? []).length, 1);
  assert.doesNotMatch(tsNotify, /console\.(?:log|error|warn)[\s\S]{0,120}observations/);
  assert.doesNotMatch(phpNotify, /error_log\([\s\S]{0,120}observations/);
});

test("forwards invoice number and the official invoice URL to n8n", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /invoiceNumber/);
    assert.match(webhook, /invoiceUrl/);
    assert.match(webhook, /paymentId/);
    assert.match(webhook, /payments\//);
    assert.match(webhook, /GET/);
  }
  assert.match(typescriptFiscalWebhook, /optionalPaymentString\(payment, "invoiceNumber"\)/);
  assert.match(typescriptFiscalWebhook, /optionalPaymentString\(payment, "invoiceUrl"\)/);
  assert.match(typescriptFiscalWebhook, /if \(!invoiceNumber \|\| !invoiceUrl\)/);
  assert.match(typescriptFiscalWebhook, /optionalPaymentString\(paymentResult\.data, "invoiceUrl"\)/);
  assert.match(phpFiscalWebhook, /optional_payment_string\(\$payment, 'invoiceNumber'\)/);
  assert.match(phpFiscalWebhook, /optional_payment_string\(\$payment, 'invoiceUrl'\)/);
  assert.match(phpFiscalWebhook, /if \(\$invoiceNumber === '' \|\| \$invoiceUrl === ''\)/);
  assert.match(phpFiscalWebhook, /optional_payment_string\(\$paymentDetails\['data'\], 'invoiceUrl'\)/);
});

test("forwards the Asaas customer WhatsApp using mobilePhone and phone fallback", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /mobilePhone/);
    assert.match(webhook, /phone/);
    assert.match(webhook, /customerWhatsapp/);
    assert.match(webhook, /customerName/);
  }
  assert.match(
    typescriptFiscalWebhook,
    /const mobilePhone = typeof customerResult\.data\.mobilePhone === "string"[\s\S]*?const phone = typeof customerResult\.data\.phone === "string"[\s\S]*?const customerWhatsapp = mobilePhone \|\| phone/,
  );
  assert.match(
    phpFiscalWebhook,
    /\$mobilePhone = is_string\(\$customer\['data'\]\['mobilePhone'\] \?\? null\)[\s\S]*?\$phone = is_string\(\$customer\['data'\]\['phone'\] \?\? null\)[\s\S]*?\$customerWhatsapp = \$mobilePhone !== '' \? \$mobilePhone : \$phone/,
  );
});

test("keeps customer WhatsApp optional without blocking the payment flow", () => {
  assert.match(typescriptFiscalWebhook, /const customerWhatsapp = mobilePhone \|\| phone/);
  assert.match(phpFiscalWebhook, /\$customerWhatsapp = \$mobilePhone !== '' \? \$mobilePhone : \$phone/);
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /customerWhatsapp/);
    assert.match(webhook, /asaas_first_session_paid/);
    assert.match(webhook, /processPaymentEvent|process_with_payment_lock/);
  }
});

test("uses event invoice fields without an extra payment lookup when both are present", () => {
  assert.match(
    typescriptFiscalWebhook,
    /let invoiceNumber = optionalPaymentString\(payment, "invoiceNumber"\);[\s\S]*?let invoiceUrl = optionalPaymentString\(payment, "invoiceUrl"\);[\s\S]*?if \(!invoiceNumber \|\| !invoiceUrl\)/,
  );
  assert.match(
    phpFiscalWebhook,
    /\$invoiceNumber = optional_payment_string\(\$payment, 'invoiceNumber'\);[\s\S]*?\$invoiceUrl = optional_payment_string\(\$payment, 'invoiceUrl'\);[\s\S]*?if \(\$invoiceNumber === '' \|\| \$invoiceUrl === ''\)/,
  );
});

test("keeps invoice fields optional when the Asaas payment lookup is unavailable", () => {
  for (const webhook of [typescriptFiscalWebhook, phpFiscalWebhook]) {
    assert.match(webhook, /invoiceNumber/);
    assert.match(webhook, /invoiceUrl/);
    assert.match(webhook, /n8n first-session-paid payment invoice lookup failed/);
    assert.match(webhook, /asaas_first_session_paid/);
    assert.match(webhook, /processPaymentEvent|process_with_payment_lock/);
  }
  assert.match(typescriptFiscalWebhook, /invoiceNumber = optionalPaymentString\(paymentResult\.data, "invoiceNumber"\)/);
  assert.match(phpFiscalWebhook, /\$invoiceNumber = optional_payment_string\(\$paymentDetails\['data'\], 'invoiceNumber'\)/);
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
