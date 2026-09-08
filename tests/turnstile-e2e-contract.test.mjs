import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const tsHelper = await readFile(new URL("../lib/turnstile-e2e.ts", import.meta.url), "utf8");
const tsVerification = await readFile(new URL("../lib/turnstile-verification.ts", import.meta.url), "utf8");
const tsPatients = await readFile(new URL("../app/api/patients/route.ts", import.meta.url), "utf8");
const tsTurnstile = await readFile(new URL("../app/api/turnstile/route.ts", import.meta.url), "utf8");
const phpPatients = await readFile(new URL("../cpanel-server/api/patients.php", import.meta.url), "utf8");
const phpTurnstile = await readFile(new URL("../cpanel-server/api/turnstile.php", import.meta.url), "utf8");
const cpanelBuild = await readFile(new URL("../scripts/build-cpanel.sh", import.meta.url), "utf8");
const configExample = await readFile(new URL("../cpanel-server/api/config.example.php", import.meta.url), "utf8");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

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

function runRuntimeCase(scenario) {
  const script = `
import { authorizeE2eTurnstile, E2E_TURNSTILE_TEST_SECRET } from "./lib/turnstile-e2e.ts";
import { verifyTurnstileToken } from "./lib/turnstile-verification.ts";

const scenario = ${JSON.stringify(scenario)};
const testSecret = E2E_TURNSTILE_TEST_SECRET;
const e2eScenario = scenario.startsWith("e2e-") || scenario === "hmac-invalid" || scenario === "e2e-disabled" || scenario === "timestamp-expired";
const timestamp = scenario === "timestamp-expired"
  ? String(Math.floor(Date.now() / 1000) - 181)
  : String(Math.floor(Date.now() / 1000));
const body = "{}";
const bodyHash = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");
const url = "https://cadastro.conexaoseres.com.br/api/patients";
const canonical = ["v1", "POST", "cadastro.conexaoseres.com.br", "/api/patients", timestamp, "run-test", bodyHash].join("\\n");
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("hmac-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const signedValue = Array.from(
  new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical))),
  (byte) => byte.toString(16).padStart(2, "0"),
).join("");
const signature = scenario === "hmac-invalid" ? "v1=" + "0".repeat(64) : "v1=" + signedValue;
const headers = e2eScenario
  ? {
      "X-CS-E2E-Mode": "turnstile-test-v1",
      "X-CS-E2E-Run": "run-test",
      "X-CS-E2E-Timestamp": timestamp,
      "X-CS-E2E-Signature": signature,
    }
  : {};
const request = new Request(url, { method: "POST", headers });
let siteverifyCalls = 0;
let siteverifySecret = "";
const siteverifyResult = scenario === "e2e-success-false"
  ? { success: false, action: "test-action", hostname: "test.example" }
  : scenario === "normal-action-invalid"
    ? { success: true, action: "other-action", hostname: "prod.example" }
    : scenario === "normal-host-invalid"
      ? { success: true, action: "cadastro_paciente", hostname: "other.example" }
      : scenario.startsWith("e2e-")
        ? { success: true, action: "test-action", hostname: "test.example" }
        : { success: true, action: "cadastro_paciente", hostname: "prod.example" };
const fetchImpl = async (_url, init) => {
  siteverifyCalls += 1;
  siteverifySecret = JSON.parse(init.body).secret;
  return new Response(JSON.stringify(siteverifyResult), { status: 200, headers: { "content-type": "application/json" } });
};

let auth = { authorized: false };
let verification = null;
if (e2eScenario) {
  auth = await authorizeE2eTurnstile(request, body, {
    E2E_TURNSTILE_ENABLED: scenario === "e2e-disabled" ? "false" : "true",
    E2E_TURNSTILE_HMAC_SECRET: "hmac-secret",
  });
  if (auth.authorized) {
    verification = await verifyTurnstileToken(request, "turnstile-token", {
      secret: testSecret,
      expectedHostname: "prod.example",
      useE2eSecret: true,
      fetchImpl,
    });
  }
} else {
  verification = await verifyTurnstileToken(request, "turnstile-token", {
    secret: "real-secret",
    expectedHostname: "prod.example",
    useE2eSecret: false,
    fetchImpl,
  });
}
console.log(JSON.stringify({ auth, verification, siteverifyCalls, siteverifySecret }));
`;

  return JSON.parse(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: repoRoot, encoding: "utf8" },
  ));
}

test("validates a normal Siteverify response with the production action and hostname", () => {
  const result = runRuntimeCase("normal-valid");
  assert.equal(result.verification.valid, true);
  assert.equal(result.siteverifyCalls, 1);
  assert.equal(result.siteverifySecret, "real-secret");
});

test("rejects a normal Siteverify response with the wrong action", () => {
  const result = runRuntimeCase("normal-action-invalid");
  assert.equal(result.verification.valid, false);
  assert.equal(result.siteverifyCalls, 1);
});

test("rejects a normal Siteverify response with the wrong hostname", () => {
  const result = runRuntimeCase("normal-host-invalid");
  assert.equal(result.verification.valid, false);
  assert.equal(result.siteverifyCalls, 1);
});

test("accepts an authenticated E2E response with a test action", () => {
  const result = runRuntimeCase("e2e-action-valid");
  assert.equal(result.auth.authorized, true);
  assert.equal(result.verification.valid, true);
  assert.equal(result.siteverifyCalls, 1);
  assert.equal(result.siteverifySecret, "1x0000000000000000000000000000000AA");
});

test("accepts an authenticated E2E response with a non-production hostname", () => {
  const result = runRuntimeCase("e2e-host-valid");
  assert.equal(result.auth.authorized, true);
  assert.equal(result.verification.valid, true);
  assert.equal(result.siteverifyCalls, 1);
  assert.equal(result.siteverifySecret, "1x0000000000000000000000000000000AA");
});

test("rejects an authenticated E2E response when Siteverify reports failure", () => {
  const result = runRuntimeCase("e2e-success-false");
  assert.equal(result.auth.authorized, true);
  assert.equal(result.verification.valid, false);
  assert.equal(result.siteverifyCalls, 1);
  assert.equal(result.siteverifySecret, "1x0000000000000000000000000000000AA");
});

test("rejects an invalid HMAC before calling Siteverify", () => {
  const result = runRuntimeCase("hmac-invalid");
  assert.equal(result.auth.error, "E2E_AUTH_INVALID");
  assert.equal(result.siteverifyCalls, 0);
});

test("rejects the E2E mode when it is disabled before calling Siteverify", () => {
  const result = runRuntimeCase("e2e-disabled");
  assert.equal(result.auth.error, "E2E_DISABLED");
  assert.equal(result.siteverifyCalls, 0);
});

test("rejects an expired E2E timestamp before calling Siteverify", () => {
  const result = runRuntimeCase("timestamp-expired");
  assert.equal(result.auth.error, "E2E_AUTH_EXPIRED");
  assert.equal(result.siteverifyCalls, 0);
});

test("authenticate E2E requests before Turnstile and Asaas", () => {
  assert.match(tsTurnstile, /authorizeE2eTurnstile\([\s\S]*?if \(e2e\.error\)/);
  assert.match(tsTurnstile, /e2e\.authorized[\s\S]*?E2E_TURNSTILE_TEST_SITE_KEY/);
  assert.match(tsPatients, /const rawBody = await request\.text\(\);[\s\S]*?authorizeE2eTurnstile/);
  assert.match(tsPatients, /JSON\.parse\(rawBody\)/);
  assert.match(tsPatients, /verifyTurnstile\(request, parsed\.data\.turnstileToken, e2e\.authorized\)/);
  assert.match(tsVerification, /if \(useE2eSecret\)[\s\S]*?result\.success === true/);
  assert.match(tsVerification, /result\.action === "cadastro_paciente"/);
  assert.match(phpPatients, /\$rawBody = file_get_contents\('php:\/\/input'\);[\s\S]*?e2e_turnstile_authorize/);
  assert.match(phpPatients, /\$turnstileSecret = \$e2e\['authorized'\][\s\S]*?E2E_TURNSTILE_TEST_SECRET/);
  assert.match(phpTurnstile, /e2e_turnstile_authorize[\s\S]*?E2E_TURNSTILE_TEST_SITE_KEY/);
});

test("keep PHP normal and authenticated E2E validation equivalent", () => {
  assert.match(phpPatients, /function turnstile_is_valid\([\s\S]*?bool \$isE2eAuthorized = false/);
  assert.match(phpPatients, /if \(\$isE2eAuthorized\) \{[\s\S]*?\$result\['success'\]/);
  assert.match(phpPatients, /turnstile_is_valid\([\s\S]*?\$e2e\['authorized'\]\)/);
  assert.match(tsVerification, /useE2eSecret/);
  assert.match(tsVerification, /expectedHostname/);
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
