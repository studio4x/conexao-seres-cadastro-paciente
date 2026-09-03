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
