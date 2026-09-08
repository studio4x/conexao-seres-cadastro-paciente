export type TurnstileVerification = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

export type TurnstileVerificationOptions = {
  secret: string;
  expectedHostname: string;
  useE2eSecret: boolean;
  fetchImpl?: typeof fetch;
};

export function isTurnstileVerificationValid(
  result: TurnstileVerification,
  expectedHostname: string,
  useE2eSecret: boolean,
) {
  if (useE2eSecret) {
    return result.success === true;
  }

  return result.success === true
    && result.action === "cadastro_paciente"
    && (!expectedHostname || result.hostname === expectedHostname);
}

export async function verifyTurnstileToken(
  request: Request,
  token: string,
  options: TurnstileVerificationOptions,
) {
  const secret = options.secret.trim();
  if (!secret) return { configured: false, valid: false };

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const fetchImpl = options.fetchImpl || fetch;

  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) return { configured: true, valid: false };
    const result = (await response.json()) as TurnstileVerification;
    return {
      configured: true,
      valid: isTurnstileVerificationValid(result, options.expectedHostname, options.useE2eSecret),
    };
  } catch {
    return { configured: true, valid: false };
  } finally {
    clearTimeout(timeout);
  }
}
