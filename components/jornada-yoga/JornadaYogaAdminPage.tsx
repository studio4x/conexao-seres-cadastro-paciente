"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Users,
  WalletCards,
} from "lucide-react";

import { AppVersion } from "@/components/layout/AppVersion";
import {
  formatCpf,
  formatCurrency,
  formatWhatsapp,
  jornadaBillingTypeLabel,
  jornadaPaymentStatusLabel,
} from "@/lib/jornada-yoga";

const LOGO =
  "https://conexaoseres.com.br/wp-content/uploads/2024/04/LOGOTIPO-CONEXAO-SERES-HORIZONTAL-TRANSPARENTE.png";

type Row = {
  paymentId: string;
  customerId: string;
  name: string;
  email: string;
  cpf: string;
  whatsapp: string;
  status: string;
  paid: boolean;
  billingType: string;
  value: number;
  dateCreated: string;
  paymentDate: string;
  invoiceUrl: string;
};

type Data = {
  adminEmail?: string;
  registrations?: Row[];
  summary?: {
    total: number;
    paid: number;
    unpaid: number;
    pending: number;
    overdue: number;
    amountPaid: number;
  };
  message?: string;
};

const date = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return !value ? "—" : match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function whatsappWebUrl(value: string) {
  const digits = value.replace(/\D/g, "");
  const number =
    digits.length === 13 && digits.startsWith("55")
      ? digits
      : digits.length === 11
        ? `55${digits}`
        : "";

  return number ? `https://web.whatsapp.com/send?phone=${number}` : "";
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

export function JornadaYogaAdminPage() {
  const [email, setEmail] = useState("contato@conexaoseres.com.br");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    document.title = "Inscritos da Jornada | Conexão Seres";
    void load("initial");
  }, []);

  async function load(mode: "initial" | "refresh" = "refresh") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    setMessage("");

    try {
      const response = await fetch(
        `/api/jornada-yoga/admin/registrations?_=${Date.now()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "cache-control": "no-cache",
          },
        },
      );

      const payload = (await response.json()) as Data;

      if (response.status === 401) {
        setAuth(false);
        setData(null);
        return;
      }

      if (!response.ok) {
        setMessage(payload.message || "Não foi possível carregar os inscritos.");
        return;
      }

      setAuth(true);
      setData(payload);
      setLastUpdated(currentTimeLabel());
    } catch {
      setMessage("Não foi possível carregar os inscritos.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/jornada-yoga/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.success) {
        setMessage(payload.message || "Não foi possível entrar.");
        setAuth(false);
        return;
      }

      setPassword("");
      setAuth(null);
      await load("initial");
    } catch {
      setMessage("Não foi possível entrar.");
      setAuth(false);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/jornada-yoga/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setAuth(false);
    setData(null);
    setLastUpdated("");
  }

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (data?.registrations || []).filter(
      (row) =>
        (filter === "ALL" ||
          (filter === "PAID" && row.paid) ||
          (filter === "UNPAID" && !row.paid) ||
          (filter === "PENDING" && row.status === "PENDING") ||
          (filter === "OVERDUE" && row.status === "OVERDUE")) &&
        (!normalizedQuery ||
          [row.name, row.email, row.cpf, row.whatsapp, row.paymentId]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)),
    );
  }, [data, query, filter]);

  function exportCsv() {
    const header = [
      "Nome",
      "CPF",
      "E-mail",
      "WhatsApp",
      "Data de inscrição",
      "Status",
      "Forma de pagamento",
      "Data do pagamento",
      "Valor",
      "ID cobrança",
    ];

    const body = rows.map((row) => [
      row.name,
      formatCpf(row.cpf),
      row.email,
      formatWhatsapp(row.whatsapp),
      date(row.dateCreated),
      jornadaPaymentStatusLabel(row.status),
      jornadaBillingTypeLabel(row.billingType),
      date(row.paymentDate),
      row.value.toFixed(2).replace(".", ","),
      row.paymentId,
    ]);

    const blob = new Blob(
      ["\ufeff" + [header, ...body].map((row) => row.map(csv).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inscritos-jornada-yoga.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (auth === null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f5ec] px-5">
        <div className="w-full max-w-md rounded-2xl border border-[#d5ded1] bg-white p-7 text-center shadow-sm">
          <img src={LOGO} alt="Conexão Seres" className="mx-auto w-[220px]" />
          {loading ? (
            <>
              <Loader2 className="mx-auto mt-8 size-7 animate-spin text-[#005000]" />
              <p className="mt-4 font-semibold text-[#315f31]">Validando sua sessão...</p>
              <p className="mt-2 text-sm text-[#687264]">
                Aguarde enquanto confirmamos o acesso administrativo.
              </p>
            </>
          ) : (
            <>
              <p className="mt-7 font-semibold text-[#315f31]">
                Não foi possível validar sua sessão.
              </p>
              {message ? (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void load("initial")}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold"
              >
                <RefreshCw className="size-4" />
                Tentar novamente
              </button>
            </>
          )}
          <p className="mt-6 text-xs text-[#8a9186]">
            <AppVersion />
          </p>
        </div>
      </main>
    );
  }

  if (auth === false) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f5ec] px-5">
        <div className="w-full max-w-md rounded-2xl border border-[#d5ded1] bg-white p-7 shadow-sm">
          <img src={LOGO} alt="Conexão Seres" className="mx-auto w-[220px]" />
          <h1 className="mt-7 text-center text-2xl font-semibold text-[#005000]">
            Inscritos da Jornada
          </h1>
          <p className="mt-2 text-center text-sm text-[#687264]">
            Acesso restrito à equipe da Conexão Seres.
          </p>

          <form onSubmit={login} className="mt-7 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">E-mail</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 w-full rounded-lg border border-[#cfd6ca] px-3"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-lg border border-[#cfd6ca] px-3"
              />
            </label>

            {message ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>
            ) : null}

            <button
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#005000] font-semibold text-white disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <KeyRound className="size-5" />
              )}
              Entrar
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-[#8a9186]">
            <AppVersion />
          </p>
        </div>
      </main>
    );
  }

  const summary = data?.summary || {
    total: 0,
    paid: 0,
    unpaid: 0,
    pending: 0,
    overdue: 0,
    amountPaid: 0,
  };

  return (
    <main className="min-h-screen bg-[#f6f7f5]">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
          <img src={LOGO} className="w-[185px]" alt="Conexão Seres" />
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#8a5a18]">
              Administração
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#005000]">
              Inscrições da Jornada
            </h1>
            <p className="mt-2 text-sm text-[#687264]">
              Lista de inscrições realizadas, pagas e não pagas, sincronizada com as cobranças
              da Jornada.
            </p>
            {lastUpdated ? (
              <p className="mt-1 text-xs text-[#8a9186]">Atualizado às {lastUpdated}</p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load("refresh")}
              disabled={refreshing}
              aria-busy={refreshing}
              className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Atualizando..." : "Atualizar"}
            </button>

            <button
              type="button"
              onClick={exportCsv}
              disabled={!rows.length}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Download className="size-4" />
              CSV
            </button>
          </div>
        </div>

        {message ? (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Inscrições", value: String(summary.total), Icon: Users },
            { label: "Pagas", value: String(summary.paid), Icon: CheckCircle2 },
            { label: "Não pagas", value: String(summary.unpaid), Icon: WalletCards },
            { label: "Vencidas", value: String(summary.overdue), Icon: RefreshCw },
            {
              label: "Recebido",
              value: formatCurrency(summary.amountPaid),
              Icon: CheckCircle2,
            },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-xl border bg-white p-4">
              <div className="flex justify-between text-xs font-semibold uppercase text-[#737c70]">
                <span>{label}</span>
                <Icon className="size-4" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-[#315f31]">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3.5 size-4 text-[#8c9389]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar nome, CPF, e-mail ou WhatsApp"
                className="h-11 w-full rounded-lg border pl-10 pr-3"
              />
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-11 rounded-lg border px-3"
            >
              <option value="ALL">Todas as inscrições</option>
              <option value="PAID">Pagas</option>
              <option value="UNPAID">Não pagas</option>
              <option value="PENDING">Pendentes</option>
              <option value="OVERDUE">Vencidas</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#f8faf7] text-xs uppercase text-[#737c70]">
                <tr>
                  {[
                    "Inscrito",
                    "Contato",
                    "Inscrição",
                    "Pagamento",
                    "Status",
                    "Valor",
                    "Cobrança",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y">
                {rows.map((row) => {
                  const whatsappUrl = whatsappWebUrl(row.whatsapp);

                  return (
                    <tr key={row.paymentId}>
                      <td className="px-4 py-4">
                        <b className="text-[#315f31]">{row.name || "—"}</b>
                        <p className="mt-1 text-xs text-[#7c8479]">
                          {row.cpf ? formatCpf(row.cpf) : "—"}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        {row.email || "—"}
                        <p className="mt-1 text-xs">
                          {whatsappUrl ? (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir conversa no WhatsApp Web"
                              className="inline-flex items-center gap-1 font-semibold text-[#315f31] hover:underline"
                            >
                              {formatWhatsapp(row.whatsapp)}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : row.whatsapp ? (
                            formatWhatsapp(row.whatsapp)
                          ) : (
                            "—"
                          )}
                        </p>
                      </td>

                      <td className="px-4 py-4">{date(row.dateCreated)}</td>

                      <td className="px-4 py-4">
                        {jornadaBillingTypeLabel(row.billingType)}
                        <p className="mt-1 text-xs">
                          {row.paymentDate ? date(row.paymentDate) : "Ainda não pago"}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.paid
                              ? "bg-green-50 text-green-800"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {row.paid ? "Paga" : "Não paga"}
                        </span>
                        <p className="mt-1 text-xs text-[#7c8479]">
                          {jornadaPaymentStatusLabel(row.status)}
                        </p>
                      </td>

                      <td className="px-4 py-4 font-semibold">
                        {formatCurrency(row.value)}
                      </td>

                      <td className="px-4 py-4">
                        {row.invoiceUrl ? (
                          <a
                            href={row.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#8a5a18]"
                          >
                            Abrir
                            <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-[#7c8479]">
                      Nenhum inscrito encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="border-t px-4 py-3 text-xs text-[#7c8479]">
            Exibindo {rows.length} de {data?.registrations?.length || 0} · <AppVersion />
          </div>
        </section>
      </div>
    </main>
  );
}
