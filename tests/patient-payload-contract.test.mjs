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
