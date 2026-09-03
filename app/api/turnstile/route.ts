import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
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
