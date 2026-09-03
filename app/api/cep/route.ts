import { NextResponse } from "next/server";

export const runtime = "edge";

type ViaCepResponse = {
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

export async function GET(request: Request) {
  const cep = new URL(request.url).searchParams.get("cep")?.replace(/\D/g, "") || "";
  if (!/^\d{8}$/.test(cep)) {
    return NextResponse.json({ message: "Informe um CEP com 8 dígitos." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("CEP service returned an error");
    }

    const data = (await response.json()) as ViaCepResponse;
    if (data.erro === true || data.erro === "true") {
      return NextResponse.json({ message: "CEP não encontrado." }, { status: 404 });
    }

    return NextResponse.json(
      {
        address: data.logradouro?.trim() || "",
        province: data.bairro?.trim() || "",
        city: data.localidade?.trim() || "",
        state: data.uf?.trim().toUpperCase() || "",
      },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch {
    return NextResponse.json(
      { message: "Não foi possível consultar o CEP agora. Tente novamente." },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
