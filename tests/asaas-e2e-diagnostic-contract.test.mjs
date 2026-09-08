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
const cpanelBackend = await readFile(
  new URL("../cpanel-dist/api/patients.php", import.meta.url),
  "utf8",
);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Could not isolate ${startMarker}`);
  return source.slice(start, end);
}

const typescriptCustomerFailure = section(
  typescriptBackend,
  "if (!createResponse.ok)",
  "const created =",
);
const phpCustomerFailure = section(
  phpBackend,
  "if ($created['error'] !== ''",
  "$createdCustomerId =",
);

test("keeps public Asaas customer rejections generic", () => {
  const typescriptPayload = typescriptCustomerFailure.match(/const responsePayload:[\s\S]*?= \{([\s\S]*?)\n      \};/)?.[1];
  const phpPayload = phpCustomerFailure.match(/\$responsePayload = \[([\s\S]*?)\n        \];/)?.[1];

  for (const source of [typescriptPayload, phpPayload]) {
    assert.ok(source);
    assert.match(source, /Algumas informações precisam ser conferidas/);
    assert.doesNotMatch(source, /e2eDiagnostic|ASAAS_CUSTOMER_CREATE_REJECTED/);
  }
  assert.match(typescriptCustomerFailure, /return NextResponse\.json\(\s*responsePayload,\s*\{\s*status\s*\}\s*,?\s*\)/);
  assert.match(phpCustomerFailure, /respond\(\$responsePayload, 400\)/);
});

test("returns the bounded CREATE_CUSTOMER diagnostic only for authorized E2E", () => {
  for (const source of [typescriptBackend, phpBackend, cpanelBackend]) {
    assert.match(source, /ASAAS_CUSTOMER_CREATE_REJECTED/);
    assert.match(source, /CREATE_CUSTOMER/);
    assert.match(source, /asaasStatus/);
    assert.match(source, /errors/);
    assert.match(source, /0, 3/);
    assert.match(source, /120/);
    assert.match(source, /240/);
  }
  assert.match(typescriptCustomerFailure, /if \(e2e\.authorized && createResponse\.status >= 400 && createResponse\.status < 500\)/);
  assert.match(phpCustomerFailure, /if \(\(\$e2e\['authorized'\] \?\? false\) === true\)/);
});

test("sanitizes personal data before copying Asaas errors to E2E diagnostics", () => {
  for (const source of [typescriptBackend, phpBackend]) {
    assert.match(source, /CPF_REDACTED/);
    assert.match(source, /EMAIL_REDACTED/);
    assert.match(source, /PHONE_REDACTED/);
    assert.match(source, /description[\s\S]*sanitize(?:AsaasLogText|_asaas_log_text)/);
  }
  assert.match(typescriptBackend, /errors = .*slice\(0, 3\)[\s\S]*description: sanitizeAsaasLogText/);
  assert.match(phpBackend, /foreach \(array_slice\([\s\S]*\$errors\[\][\s\S]*description.*sanitize_asaas_log_text/);
});

test("does not expose Asaas response bodies or credentials in the diagnostic", () => {
  const typescriptDiagnostic = section(
    typescriptBackend,
    "function e2eAsaasCustomerCreateDiagnostic",
    "function asaasErrorSummary",
  );
  const phpDiagnostic = section(
    phpBackend,
    "function e2e_asaas_customer_create_diagnostic",
    "function asaas_request",
  );

  for (const diagnostic of [typescriptDiagnostic, phpDiagnostic]) {
    assert.doesNotMatch(diagnostic, /\['response'\]|rawResponse|apiKey|Authorization|E2E_TURNSTILE_TEST_SECRET/i);
    assert.match(diagnostic, /code/);
    assert.match(diagnostic, /errors/);
  }
  for (const source of [typescriptBackend, phpBackend]) {
    assert.match(source, /access\[_-\]\?token/);
    assert.match(source, /authorization/);
    assert.match(source, /asaas\[_-\]\?api\[_-\]\?key/);
    assert.match(source, /hmac\[_-\]\?secret/);
    assert.match(source, /E2E_TURNSTILE_TEST_SECRET/);
  }
});

test("does not grant diagnostics to an E2E request with invalid authentication", () => {
  assert.match(
    typescriptBackend,
    /if \(e2e\.error\) \{[\s\S]*?return NextResponse\.json\(\{ code: e2e\.error \}, \{ status: 403 \}\);/
  );
  assert.match(
    phpBackend,
    /if \(\$e2e\['error'\] !== null\) \{[\s\S]*?respond\(\['code' => \$e2e\['error'\]\], 403\);/
  );
  assert.match(typescriptCustomerFailure, /e2e\.authorized &&/);
  assert.match(phpCustomerFailure, /\$e2e\['authorized'\] \?\? false/);
});

test("keeps TypeScript, PHP source and generated cPanel diagnostic contracts equivalent", () => {
  const expected = [
    "ASAAS_CUSTOMER_CREATE_REJECTED",
    "CREATE_CUSTOMER",
    "asaasStatus",
    "errors",
  ];
  for (const value of expected) {
    assert.ok(typescriptBackend.includes(value));
    assert.ok(phpBackend.includes(value));
    assert.ok(cpanelBackend.includes(value));
  }
  assert.match(typescriptBackend, /e2e\.authorized && createResponse\.status >= 400 && createResponse\.status < 500/);
  assert.match(phpBackend, /\(\$e2e\['authorized'\] \?\? false\) === true/);
  assert.match(cpanelBackend, /\(\$e2e\['authorized'\] \?\? false\) === true/);
});
