"use client";

import { useEffect } from "react";
import { CheckCircle2, CreditCard, LockKeyhole } from "lucide-react";

import { AppVersion } from "@/components/layout/AppVersion";
import { JORNADA_YOGA_AMOUNT, formatCurrency } from "@/lib/jornada-yoga";

const LOGO =
  "https://conexaoseres.com.br/wp-content/uploads/2024/04/LOGOTIPO-CONEXAO-SERES-HORIZONTAL-TRANSPARENTE.png";

type ConfirmationData = {
  invoiceUrl?: string;
};

const STORAGE_KEY = "conexao-seres:jornada-yoga:confirmation";

export function JornadaYogaConfirmationPage() {
  useEffect(() => {
    document.title = "Cadastro concluído | Jornada de Expansão Mental e Corporal | Conexão Seres";
  }, []);

  function openPayment() {
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as ConfirmationData;
      const invoiceUrl = typeof parsed.invoiceUrl === "string" ? parsed.invoiceUrl.trim() : "";
      if (!/^https:\/\//i.test(invoiceUrl)) return;

      window.open(invoiceUrl, "_blank", "noopener,noreferrer");
    } catch {
      // A confirmação permanece válida mesmo se a sessão do navegador não estiver disponível.
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f8f5ec] text-foreground">
      <div className="h-1.5 bg-primary" />

      <header className="border-b border-[#dce3d8] bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <img src={LOGO} alt="Conexão Seres" className="w-[210px]" />
          <span className="flex items-center gap-2 text-xs font-medium text-[#315f31]">
            <LockKeyhole className="size-4" />
            Ambiente seguro
          </span>
        </div>
      </header>

      <section className="flex flex-1 items-center px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-[#d5ded1] bg-white p-7 shadow-sm sm:p-12">
            <CheckCircle2 className="size-14 text-[#3a8036]" />

            <p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">
              Cadastro concluído
            </p>

            <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#005000] sm:text-4xl">
              Agora falta apenas concluir o pagamento.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[#566451] sm:text-lg">
              Sua cobrança de {formatCurrency(JORNADA_YOGA_AMOUNT)} foi gerada. Após a identificação do
              pagamento, sua inscrição será considerada confirmada.
            </p>

            <button
              type="button"
              onClick={openPayment}
              className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white"
            >
              <CreditCard className="size-5" />
              Ir para o pagamento
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#dce3d8] bg-white py-6 text-center text-xs text-[#7a8176]">
        Conexão Seres · Jornada de Expansão Mental e Corporal · <AppVersion />
      </footer>
    </main>
  );
}
