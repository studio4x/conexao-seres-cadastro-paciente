"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, LockKeyhole, ShieldCheck } from "lucide-react";

import { CadastroForm } from "@/components/cadastro-form";
import { AppVersion } from "@/components/layout/AppVersion";

const LOGO_URL =
  "https://conexaoseres.com.br/wp-content/uploads/2024/04/LOGOTIPO-CONEXAO-SERES-HORIZONTAL-TRANSPARENTE.png";

const FLOW_STEPS = [
  {
    title: "Faça seu cadastro",
    description:
      "Preencha os dados da pessoa que será atendida e, quando necessário, do responsável.",
  },
  {
    title: "Receba a confirmação",
    description:
      "Ao concluir, você receberá uma confirmação do cadastro pelo WhatsApp e por e-mail.",
  },
  {
    title: "Realize o pagamento da primeira sessão",
    description:
      "Em seguida, o Asaas enviará pelo WhatsApp o link para pagamento da primeira sessão.",
  },
  {
    title: "Aguarde a confirmação do agendamento",
    description:
      "Assim que o pagamento for identificado, nossa equipe dará continuidade ao agendamento e você receberá as informações completas, como data, horário, modalidade, endereço e orientações importantes.",
  },
  {
    title: "Receba sua nota fiscal",
    description:
      "Após a identificação do pagamento, a nota fiscal será enviada automaticamente para o e-mail informado no cadastro.",
  },
];

function FlowSteps({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`${compact ? "" : "mt-4 border-t border-[#cfddc7]"} divide-y divide-[#cfddc7]`}>
      {FLOW_STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-4 py-4 first:pt-4 last:pb-0">
          <span
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold tracking-[0.08em] text-accent-foreground"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-6 text-secondary-foreground">{step.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#4f5e4b]">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function Home() {
  const [isRegistrationComplete, setIsRegistrationComplete] = useState(false);

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <div className="h-1.5 bg-primary" aria-hidden="true" />

      <div className="mx-auto grid min-h-[calc(100vh-0.375rem)] max-w-[1480px] lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <aside className="brand-panel border-b border-[#cfddc7] lg:flex lg:flex-col lg:border-r lg:border-b-0">
          <div className="px-5 py-8 sm:px-9 sm:py-10 lg:sticky lg:top-0 lg:z-10 lg:flex lg:min-h-[calc(100vh-0.375rem)] lg:self-start lg:flex-col lg:justify-between lg:px-12 lg:py-12 xl:px-16">
            <div>
            <div className="flex items-center justify-between gap-3">
              <a
                href="https://conexaoseres.com.br/"
                aria-label="Voltar ao site da Conexão Seres"
                className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
              >
                <img
                  src={LOGO_URL}
                  alt="Conexão Seres — Terapia Ocupacional"
                  width={800}
                  height={300}
                  className="h-auto w-[190px] sm:w-[225px]"
                />
              </a>

              <span
                className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#315f31] lg:hidden"
                aria-label="Ambiente seguro"
              >
                <LockKeyhole className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Ambiente seguro</span>
              </span>
            </div>

            <details className="group mt-12 max-w-xl overflow-hidden rounded-xl border border-[#c9d9c2] bg-white/60 shadow-[0_8px_24px_rgba(65,56,30,0.06)] lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3" role="heading" aria-level={2}>
                  <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
                  COMO FUNCIONA
                </span>
                <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-[#cfddc7] px-4 pb-4">
                <FlowSteps compact />
              </div>
            </details>

            <section className="mt-12 hidden max-w-xl lg:mt-20 lg:block" aria-labelledby="how-it-works-heading">
              <h2
                id="how-it-works-heading"
                className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground"
              >
                <span className="h-5 w-1 rounded-full bg-primary" aria-hidden="true" />
                COMO FUNCIONA
              </h2>
              <FlowSteps />
            </section>
            </div>

            <div className="mt-10 hidden items-center gap-3 border-t border-[#c9d9c2] pt-6 text-sm leading-6 text-[#4f5e4b] lg:flex">
              <ShieldCheck className="size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
              Suas informações ficam protegidas e são usadas somente para o seu atendimento.
            </div>
          </div>
        </aside>

        <section className="px-3 py-6 sm:px-8 sm:py-10 lg:px-10 lg:py-12 xl:px-14">
          <div className="mx-auto mb-7 max-w-4xl px-1 sm:mb-8 sm:px-2 xl:px-3">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-secondary-foreground">
              Conexão Seres
            </p>
            <h1 className="mt-3 text-[2.35rem] font-medium leading-[1.08] tracking-[-0.045em] text-primary sm:text-[3rem] lg:text-[3.45rem]">
              Vamos começar seu cadastro?
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#4f5e4b] sm:text-lg sm:leading-8">
              Conte um pouco sobre a pessoa que será atendida. Leva só alguns minutos, e cuidaremos de cada detalhe com carinho.
            </p>

            <ul className="mt-8 grid gap-3 text-sm leading-6 text-[#315f31]">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                Cadastro, pagamento e confirmação — tudo de forma simples e segura.
              </li>
            </ul>
          </div>

          <div className="mx-auto max-w-4xl border border-border bg-white px-4 py-6 shadow-[0_12px_38px_rgba(65,56,30,0.07)] sm:px-9 sm:py-10 xl:px-12">
            {!isRegistrationComplete ? (
              <div className="mb-9 border-l-4 border-primary bg-[#fff8ee] px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-medium text-secondary-foreground sm:text-2xl">
                      Conte-nos sobre você
                    </h2>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground sm:text-base">
                      Preencha com calma. Mostraremos apenas o que for necessário em cada etapa.
                    </p>
                  </div>
                  <LockKeyhole className="mt-1 hidden size-5 shrink-0 text-secondary-foreground sm:block" aria-hidden="true" />
                </div>
              </div>
            ) : null}

            <CadastroForm onSuccessChange={setIsRegistrationComplete} />
          </div>

          <p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-5 text-muted-foreground">
            Conexão Seres · Terapia Ocupacional · <AppVersion />
          </p>
        </section>
      </div>
    </main>
  );
}
