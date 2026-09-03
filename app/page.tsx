import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

import { CadastroForm } from "@/components/cadastro-form";

const LOGO_URL =
  "https://conexaoseres.com.br/wp-content/uploads/2024/04/LOGOTIPO-CONEXAO-SERES-HORIZONTAL-TRANSPARENTE.png";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="h-1.5 bg-primary" aria-hidden="true" />

      <div className="mx-auto grid min-h-[calc(100vh-0.375rem)] max-w-[1480px] lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <aside className="brand-panel border-b border-[#cfddc7] px-5 py-8 sm:px-9 sm:py-10 lg:sticky lg:top-0 lg:flex lg:h-[calc(100vh-0.375rem)] lg:flex-col lg:justify-between lg:border-r lg:border-b-0 lg:px-12 lg:py-12 xl:px-16">
          <div>
            <div className="flex items-center justify-between gap-5">
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

              <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#315f31] lg:hidden">
                <LockKeyhole className="size-4" aria-hidden="true" />
                Ambiente seguro
              </span>
            </div>

            <div className="mt-10 max-w-xl lg:mt-20">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-secondary-foreground">
                Conexão Seres
              </p>
              <h1 className="mt-3 text-[2.35rem] font-medium leading-[1.08] tracking-[-0.045em] text-primary sm:text-[3rem] lg:text-[3.45rem]">
                Vamos começar seu cadastro?
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#4f5e4b] sm:text-lg sm:leading-8">
                Conte um pouco sobre a pessoa que será atendida. Leva só alguns minutos, e cuidaremos de cada detalhe com carinho.
              </p>

              <ul className="mt-8 grid gap-3 text-sm leading-6 text-[#315f31]">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  Um formulário simples, passo a passo
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 hidden items-center gap-3 border-t border-[#c9d9c2] pt-6 text-sm leading-6 text-[#4f5e4b] lg:flex">
            <ShieldCheck className="size-5 shrink-0 text-secondary-foreground" aria-hidden="true" />
            Suas informações ficam protegidas e são usadas somente para o seu atendimento.
          </div>
        </aside>

        <section className="px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12 xl:px-14">
          <div className="mx-auto max-w-4xl border border-border bg-white px-5 py-7 shadow-[0_12px_38px_rgba(65,56,30,0.07)] sm:px-9 sm:py-10 xl:px-12">
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

            <CadastroForm />
          </div>

          <p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-5 text-muted-foreground">
            Conexão Seres · Terapia Ocupacional
          </p>
        </section>
      </div>
    </main>
  );
}
