import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

import {
  E2E_TURNSTILE_TEST_SITE_KEY,
  authorizeE2eTurnstile,
} from "../../../lib/turnstile-e2e";

export const runtime = "edge";

export async function GET(request: Request) {
  const e2e = await authorizeE2eTurnstile(
    request,
    "",
    env as unknown as Parameters<typeof authorizeE2eTurnstile>[2],
  );
  if (e2e.error) {
    return NextResponse.json({ code: e2e.error }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (e2e.authorized) {
    return NextResponse.json(
      { siteKey: E2E_TURNSTILE_TEST_SITE_KEY },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const siteKey = (env.TURNSTILE_SITE_KEY as string | undefined)?.trim();
  if (!siteKey) {
    return NextResponse.json(
      { message: "A verificação de segurança ainda não foi configurada." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { siteKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
