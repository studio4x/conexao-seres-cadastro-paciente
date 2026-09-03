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
