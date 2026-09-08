import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tsHelper = await readFile(new URL("../lib/turnstile-e2e.ts", import.meta.url), "utf8");
const tsPatients = await readFile(new URL("../app/api/patients/route.ts", import.meta.url), "utf8");
const tsTurnstile = await readFile(new URL("../app/api/turnstile/route.ts", import.meta.url), "utf8");
const phpPatients = await readFile(new URL("../cpanel-server/api/patients.php", import.meta.url), "utf8");
const phpTurnstile = await readFile(new URL("../cpanel-server/api/turnstile.php", import.meta.url), "utf8");
const cpanelBuild = await readFile(new URL("../scripts/build-cpanel.sh", import.meta.url), "utf8");
const configExample = await readFile(new URL("../cpanel-server/api/config.example.php", import.meta.url), "utf8");

test("define the versioned E2E HMAC contract", () => {
  assert.match(tsHelper, /turnstile-test-v1/);
  assert.match(tsHelper, /1x00000000000000000000AA/);
  assert.match(tsHelper, /1x0000000000000000000000000000000AA/);
  assert.match(tsHelper, /E2E_TURNSTILE_WINDOW_SECONDS = 180/);
  assert.match(tsHelper, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(tsHelper, /crypto\.subtle\.verify\(/);
  assert.match(tsHelper, /url\.hostname\.toLowerCase\(\)/);
  assert.match(tsHelper, /url\.pathname/);
  assert.match(tsHelper, /request\.method\.toUpperCase\(\)/);
  for (const header of ["Mode", "Run", "Timestamp", "Signature"]) {
    assert.match(tsHelper, new RegExp(`X-CS-E2E-${header}`));
  }
});

test("authenticate E2E requests before Turnstile and Asaas", () => {
  assert.match(tsTurnstile, /authorizeE2eTurnstile\([\s\S]*?if \(e2e\.error\)/);
  assert.match(tsTurnstile, /e2e\.authorized[\s\S]*?E2E_TURNSTILE_TEST_SITE_KEY/);
  assert.match(tsPatients, /const rawBody = await request\.text\(\);[\s\S]*?authorizeE2eTurnstile/);
  assert.match(tsPatients, /JSON\.parse\(rawBody\)/);
  assert.match(tsPatients, /verifyTurnstile\(request, parsed\.data\.turnstileToken, e2e\.authorized\)/);
  assert.match(phpPatients, /\$rawBody = file_get_contents\('php:\/\/input'\);[\s\S]*?e2e_turnstile_authorize/);
  assert.match(phpPatients, /\$turnstileSecret = \$e2e\['authorized'\][\s\S]*?E2E_TURNSTILE_TEST_SECRET/);
  assert.match(phpTurnstile, /e2e_turnstile_authorize[\s\S]*?E2E_TURNSTILE_TEST_SITE_KEY/);
});

test("keep E2E configuration private and publish both PHP endpoints", () => {
  assert.match(configExample, /e2e_turnstile_enabled.*false/);
  assert.match(configExample, /COLE_AQUI_O_SEGREDO_HMAC_E2E_FORA_DO_GIT/);
  assert.match(cpanelBuild, /cp cpanel-server\/api\/turnstile\.php cpanel-dist\/api\/turnstile\.php/);
  assert.match(cpanelBuild, /cp cpanel-server\/api\/patients\.php cpanel-dist\/api\/patients\.php/);
  for (const source of [phpPatients, phpTurnstile]) {
    assert.match(source, /hash_hmac\('sha256'/);
    assert.match(source, /hash_equals\(/);
    assert.match(source, /E2E_AUTH_(?:MISSING|EXPIRED|INVALID)/);
  }
});
