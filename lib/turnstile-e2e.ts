export const E2E_TURNSTILE_MODE = "turnstile-test-v1";
export const E2E_TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const E2E_TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const E2E_TURNSTILE_WINDOW_SECONDS = 180;

export type E2eTurnstileEnv = {
  E2E_TURNSTILE_ENABLED?: unknown;
  E2E_TURNSTILE_HMAC_SECRET?: unknown;
};

export type E2eAuthorization = {
  authorized: boolean;
  error?: "E2E_DISABLED" | "E2E_AUTH_MISSING" | "E2E_AUTH_EXPIRED" | "E2E_AUTH_INVALID";
};

const textEncoder = new TextEncoder();

function envString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authorizeE2eTurnstile(
  request: Request,
  rawBody: string,
  e2eEnv: E2eTurnstileEnv,
): Promise<E2eAuthorization> {
  const mode = request.headers.get("X-CS-E2E-Mode");
  if (mode === null) return { authorized: false };

  if (mode !== E2E_TURNSTILE_MODE) {
    return { authorized: false, error: "E2E_AUTH_INVALID" };
  }

  if (envString(e2eEnv.E2E_TURNSTILE_ENABLED).toLowerCase() !== "true") {
    return { authorized: false, error: "E2E_DISABLED" };
  }

  const runId = request.headers.get("X-CS-E2E-Run");
  const timestamp = request.headers.get("X-CS-E2E-Timestamp");
  const signatureHeader = request.headers.get("X-CS-E2E-Signature");
  if (!runId || !timestamp || !signatureHeader) {
    return { authorized: false, error: "E2E_AUTH_MISSING" };
  }

  if (!/^\d+$/.test(timestamp)) {
    return { authorized: false, error: "E2E_AUTH_INVALID" };
  }
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { authorized: false, error: "E2E_AUTH_INVALID" };
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > E2E_TURNSTILE_WINDOW_SECONDS) {
    return { authorized: false, error: "E2E_AUTH_EXPIRED" };
  }

  const signature = signatureHeader.startsWith("v1=")
    ? hexToBytes(signatureHeader.slice(3))
    : null;
  const secret = envString(e2eEnv.E2E_TURNSTILE_HMAC_SECRET);
  if (!signature || !secret) {
    return { authorized: false, error: "E2E_AUTH_INVALID" };
  }

  try {
    const url = new URL(request.url);
    const canonical = [
      "v1",
      request.method.toUpperCase(),
      url.hostname.toLowerCase(),
      url.pathname || "/",
      timestamp,
      runId,
      await sha256Hex(rawBody),
    ].join("\n");
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      textEncoder.encode(canonical),
    );
    return valid ? { authorized: true } : { authorized: false, error: "E2E_AUTH_INVALID" };
  } catch {
    return { authorized: false, error: "E2E_AUTH_INVALID" };
  }
}
