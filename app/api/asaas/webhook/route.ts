import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const runtime = "edge";

const FIRST_SESSION_VALUE = 230;
const FIRST_SESSION_REFERENCE = /^cs-paciente-[a-f0-9]{24}-sessao-1$/;
const MUNICIPAL_SERVICE_CODE = "04510";
const MUNICIPAL_SERVICE_NAME = "04510 | 4.08 - Terapia ocupacional.";

type JsonRecord = Record<string, unknown>;
type AsaasResult = { status: number; data: JsonRecord; response: string; error: string };
type FiscalService = {
  id?: string;
  code?: string;
  municipalServiceCode?: string;
  description?: string;
  name?: string;
  municipalServiceName?: string;
  isDefault?: boolean;
  default?: boolean;
};
type SelectedService = {
  id?: string;
  code?: string;
  name: string;
  source: "asaas-id" | "asaas-code" | "configured-code";
};
type ServiceSelection = {
  service: SelectedService | null;
  matches: FiscalService[];
};

function sanitizeLogText(value: string) {
  return value
    .replace(/(access[_-]?token|authorization|asaas[_-]?api[_-]?key|webhook[_-]?token)\s*[:=]\s*("[^"]*"|'[^']*'|[^,\s}]+)/giu, "$1=[REDACTED]")
    .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
    .slice(0, 800);
}

function secureTokenMatches(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return mismatch === 0;
}

function asaasHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "ConexaoSeresCadastro/1.0",
    access_token: apiKey,
  };
}

async function requestAsaas(
  baseUrl: string,
  path: string,
  method: "GET" | "POST",
  apiKey: string,
  payload?: JsonRecord,
): Promise<AsaasResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(baseUrl + path, {
      method,
      headers: asaasHeaders(apiKey),
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: JsonRecord = {};
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as JsonRecord;
    } catch {
      // Keep only the sanitized response for diagnostics.
    }
    return { status: response.status, data, response: sanitizeLogText(raw) || "Resposta vazia", error: "" };
  } catch (error) {
    return {
      status: 0,
      data: {},
      response: "Resposta indisponível",
      error: error instanceof Error && error.name === "AbortError" ? "timeout" : "request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function logAsaasFailure(label: string, result: AsaasResult, context: JsonRecord) {
  console.error(label + ". HTTP " + result.status + ". Response: " + result.response, {
    ...context,
    error: result.error || undefined,
  });
}

function isTransientAsaasFailure(result: AsaasResult) {
  return result.error !== "" || result.status === 0 || [408, 425, 429].includes(result.status) || result.status >= 500;
}

function isFirstSessionPayment(payment: JsonRecord, event: "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED") {
  const id = typeof payment.id === "string" ? payment.id.trim() : "";
  const customer = typeof payment.customer === "string" ? payment.customer.trim() : "";
  const externalReference = typeof payment.externalReference === "string" ? payment.externalReference.trim() : "";
  const status = typeof payment.status === "string" ? payment.status : "";
  const value = typeof payment.value === "number" ? payment.value : Number(payment.value);
  const allowedStatuses = event === "PAYMENT_CONFIRMED" ? ["CONFIRMED"] : ["RECEIVED", "RECEIVED_IN_CASH"];
  return Boolean(
    id &&
      customer &&
      allowedStatuses.includes(status) &&
      value === FIRST_SESSION_VALUE &&
      FIRST_SESSION_REFERENCE.test(externalReference),
  );
}

function normalizeCode(value: unknown) {
  const digits = typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
  return digits.replace(/^0+/, "") || "0";
}

function serviceName(service: FiscalService) {
  return service.municipalServiceName?.trim() || service.description?.trim() || service.name?.trim() || MUNICIPAL_SERVICE_NAME;
}

function normalizedServiceDescription(service: FiscalService) {
  return serviceName(service).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function selectMunicipalService(services: FiscalService[]): ServiceSelection {
  const configuredCode = normalizeCode(MUNICIPAL_SERVICE_CODE);
  const codeMatches = services.filter(
    (service) => normalizeCode(service.code ?? service.municipalServiceCode) === configuredCode,
  );
  const descriptionMatches = services.filter((service) => {
    const description = normalizedServiceDescription(service);
    return description.includes("04510") && description.includes("4.08") && description.includes("terapia ocupacional");
  });
  const matches = codeMatches.length > 0 ? codeMatches : descriptionMatches;
  if (matches.length !== 1) return { service: null, matches };
  const selected = matches[0];
  const id = typeof selected.id === "string" ? selected.id.trim() : "";
  const code = selected.code?.trim() || selected.municipalServiceCode?.trim() || "";
  return {
    service: id
      ? { id, name: serviceName(selected), source: "asaas-id" as const }
      : code
        ? { code, name: serviceName(selected), source: "asaas-code" as const }
        : null,
    matches,
  };
}

function serviceDiagnostics(services: FiscalService[]) {
  return services.slice(0, 5).map((service) => ({
    id: typeof service.id === "string" ? service.id.trim().slice(0, 80) : undefined,
    description: serviceName(service).slice(0, 160),
  }));
}

async function listMunicipalServices(baseUrl: string, apiKey: string) {
  const services: FiscalService[] = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const result = await requestAsaas(
      baseUrl,
      `/fiscalInfo/services?offset=${offset}&limit=${limit}`,
      "GET",
      apiKey,
    );
    if (result.status < 200 || result.status >= 300) {
      logAsaasFailure("Asaas municipal service lookup failed", result, { offset, limit });
      return { services: [], failed: true, retry: isTransientAsaasFailure(result) };
    }
    const page = dataArray(result.data) as FiscalService[];
    services.push(...page);
    const totalCount = typeof result.data.totalCount === "number" ? result.data.totalCount : null;
    const hasMore = result.data.hasMore === true || (totalCount !== null && offset + page.length < totalCount);
    if (!hasMore || page.length === 0) break;
    offset += page.length;
  }
  return { services, failed: false, retry: false };
}

function effectiveDateFromPayment(payment: JsonRecord, now = new Date()) {
  const supplied = [payment.confirmedDate, payment.paymentDate, payment.clientPaymentDate].find(
    (value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value),
  );
  if (supplied) return supplied.slice(0, 10);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  ) as Record<string, string>;
  return parts.year + "-" + parts.month + "-" + parts.day;
}

function buildInvoicePayload(payment: JsonRecord, service: SelectedService, effectiveDate: string) {
  return {
    payment: payment.id,
    externalReference: String(payment.externalReference) + "-nfse",
    serviceDescription: MUNICIPAL_SERVICE_NAME,
    observations: "",
    value: FIRST_SESSION_VALUE,
    deductions: 0,
    effectiveDate,
    ...(service.id ? { municipalServiceId: service.id } : { municipalServiceCode: service.code || MUNICIPAL_SERVICE_CODE }),
    municipalServiceName: MUNICIPAL_SERVICE_NAME,
    updatePayment: false,
    taxes: {
      retainIss: false,
      iss: 2,
      cofins: 0,
      csll: 0,
      inss: 0,
      ir: 0,
      pis: 0,
    },
  } satisfies JsonRecord;
}

function dataArray(data: JsonRecord) {
  return Array.isArray(data.data)
    ? data.data.filter((item): item is JsonRecord => Boolean(item && typeof item === "object"))
    : [];
}

async function findInvoiceForPayment(baseUrl: string, apiKey: string, paymentId: string) {
  const result = await requestAsaas(
    baseUrl,
    "/invoices?payment=" + encodeURIComponent(paymentId) + "&limit=10",
    "GET",
    apiKey,
  );
  if (result.status < 200 || result.status >= 300) {
    logAsaasFailure("Asaas invoice lookup failed", result, { paymentId });
    return { id: null, transient: isTransientAsaasFailure(result), failed: true };
  }
  const invoice = dataArray(result.data).find(
    (candidate) => candidate.payment === paymentId && typeof candidate.id === "string" && candidate.id.trim(),
  );
  return { id: invoice ? String(invoice.id).trim() : null, transient: false, failed: false };
}

async function processPaymentEvent(
  baseUrl: string,
  apiKey: string,
  payment: JsonRecord,
  event: "PAYMENT_CONFIRMED" | "PAYMENT_RECEIVED",
) {
  const paymentId = String(payment.id).trim();
  const customerId = String(payment.customer).trim();
  const externalReference = String(payment.externalReference).trim();
  const existing = await findInvoiceForPayment(baseUrl, apiKey, paymentId);
  if (existing.failed) return { retry: existing.transient };
  if (existing.id) {
    console.info("Asaas invoice already exists", { paymentId, invoiceId: existing.id });
    return { retry: false };
  }

  const fiscalInfo = await requestAsaas(baseUrl, "/fiscalInfo/", "GET", apiKey);
  if (fiscalInfo.status < 200 || fiscalInfo.status >= 300) {
    logAsaasFailure("Asaas fiscal information lookup failed", fiscalInfo, { event, paymentId, customerId, externalReference });
    return { retry: isTransientAsaasFailure(fiscalInfo) };
  }

  const servicesResult = await listMunicipalServices(baseUrl, apiKey);
  if (servicesResult.failed) return { retry: servicesResult.retry };
  const selection = selectMunicipalService(servicesResult.services);
  let service = selection.service;
  if (!service && selection.matches.length > 1) {
    console.error("Asaas municipal service 04510 matched multiple services; invoice was not created", {
      paymentId,
      customerId,
      matches: serviceDiagnostics(selection.matches),
    });
    return { retry: false };
  }
  if (!service) {
    service = { code: MUNICIPAL_SERVICE_CODE, name: MUNICIPAL_SERVICE_NAME, source: "configured-code" as const };
    console.warn("Asaas municipal service 04510 was not returned; using configured municipalServiceCode", { paymentId });
  } else if (service.id) {
    console.info("Asaas municipal service selected by id", { paymentId, municipalServiceId: service.id });
  } else {
    console.info("Asaas municipal service selected by code", { paymentId, municipalServiceCode: service.code });
  }

  console.info("Asaas invoice creation requested", { event, paymentId });
  const invoiceResult = await requestAsaas(
    baseUrl,
    "/invoices",
    "POST",
    apiKey,
    buildInvoicePayload(payment, service, effectiveDateFromPayment(payment)),
  );
  if (invoiceResult.status < 200 || invoiceResult.status >= 300) {
    if (isTransientAsaasFailure(invoiceResult)) {
      const reconciled = await findInvoiceForPayment(baseUrl, apiKey, paymentId);
      if (reconciled.id) {
        console.info("Asaas invoice reconciled after inconclusive creation response", { event, paymentId, invoiceId: reconciled.id });
        return { retry: false };
      }
    }
    logAsaasFailure("Asaas invoice creation failed", invoiceResult, { event, paymentId, customerId, externalReference });
    return { retry: isTransientAsaasFailure(invoiceResult) };
  }
  const invoiceId = typeof invoiceResult.data.id === "string" ? invoiceResult.data.id.trim() : "";
  if (!invoiceId) {
    const reconciled = await findInvoiceForPayment(baseUrl, apiKey, paymentId);
    if (reconciled.id) {
      console.info("Asaas invoice reconciled after inconclusive creation response", { paymentId, invoiceId: reconciled.id });
      return { retry: false };
    }
    console.error("Asaas invoice creation returned no invoice ID", { paymentId, customerId, externalReference });
    return { retry: true };
  }
  console.info("Asaas invoice created", { paymentId, invoiceId });
  return { retry: false };
}

export async function POST(request: Request) {
  const expectedToken = (env.ASAAS_WEBHOOK_TOKEN as string | undefined)?.trim() || "";
  const receivedToken = request.headers.get("asaas-access-token")?.trim() || "";
  if (!expectedToken || expectedToken === "COLE_AQUI_O_TOKEN_DO_WEBHOOK_ASAAS") {
    return NextResponse.json({ received: true, processed: false }, { status: 200 });
  }
  if (!secureTokenMatches(expectedToken, receivedToken)) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  if (Number(request.headers.get("content-length") || "0") > 100_000) {
    return NextResponse.json({ message: "Dados enviados são muito extensos." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  const event = typeof (body as JsonRecord).event === "string" ? (body as JsonRecord).event : "";
  if (event !== "PAYMENT_CONFIRMED" && event !== "PAYMENT_RECEIVED") {
    return NextResponse.json({ received: true, processed: false }, { status: 200 });
  }

  const payment = (body as JsonRecord).payment;
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return NextResponse.json({ received: true, processed: false }, { status: 200 });
  if (!isFirstSessionPayment(payment as JsonRecord, event)) {
    console.info("Asaas payment webhook ignored: not a valid first-session payment event", { event });
    return NextResponse.json({ received: true, processed: false }, { status: 200 });
  }

  const apiKey = (env.ASAAS_API_KEY as string | undefined)?.trim() || "";
  if (!apiKey) return NextResponse.json({ received: true, processed: false }, { status: 200 });
  const baseUrl = ((env.ASAAS_API_URL as string | undefined) || "https://api.asaas.com/v3").replace(/\/$/, "");
  const result = await processPaymentEvent(baseUrl, apiKey, payment as JsonRecord, event);
  if (result.retry) return NextResponse.json({ message: "Processamento fiscal temporariamente indisponível." }, { status: 500 });
  return NextResponse.json({ received: true, processed: true }, { status: 200 });
}
