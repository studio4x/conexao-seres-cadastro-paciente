import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestExecutionContext } from "vinext/shims/request-context";

export const runtime = "edge";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

const FIRST_SESSION_AMOUNT = 230;
const FIRST_SESSION_BILLING_TYPE = "UNDEFINED" as const;
const FIRST_SESSION_EXTERNAL_REFERENCE_SUFFIX = "-sessao-1";

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (factor: number) => {
    let total = 0;
    for (let index = 0; index < factor - 1; index += 1) {
      total += Number(cpf[index]) * (factor - index);
    }
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(10) === Number(cpf[9]) && digit(11) === Number(cpf[10]);
}

const validBrazilianAreaCodes = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

function isValidWhatsapp(value: string) {
  const phone = onlyDigits(value);
  return (
    /^\d{2}9\d{8}$/.test(phone) &&
    validBrazilianAreaCodes.has(phone.slice(0, 2)) &&
    !/^(\d)\1{8}$/.test(phone.slice(2))
  );
}

function isValidEmail(value: string) {
  const email = value.trim();
  return (
    email.length <= 150 &&
    !email.includes("..") &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  );
}

function isValidFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((part) => /\p{L}/u.test(part));
}

function normalizedNameForComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function calculateAge(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    birth.getFullYear() !== Number(match[1]) ||
    birth.getMonth() !== Number(match[2]) - 1 ||
    birth.getDate() !== Number(match[3]) ||
    birth > new Date()
  ) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }
  return age;
}

const shortText = z.string().trim().max(150);
const addressText = z.string().trim().max(120);

const patientSchema = z
  .object({
    patientName: z.string().trim().refine(isValidFullName).max(120),
    patientSex: z.enum(["female", "male"]),
    patientBirthDate: z.string().max(10),
    patientCpf: z.string().refine(isValidCpf),
    patientPhone: shortText,
    patientEmail: shortText,
    patientPostalCode: shortText,
    patientAddress: addressText,
    patientAddressNumber: z.string().trim().max(20),
    patientComplement: z.string().trim().max(80),
    patientProvince: addressText,
    patientCity: addressText,
    patientState: z.string().trim().max(2),
    hasResponsible: z.boolean(),
    responsibleName: shortText,
    responsibleCpf: shortText,
    responsibleBirthDate: z.string().max(10),
    responsiblePhone: shortText,
    responsibleEmail: shortText,
    responsiblePostalCode: shortText,
    responsibleAddress: addressText,
    responsibleAddressNumber: z.string().trim().max(20),
    responsibleComplement: z.string().trim().max(80),
    responsibleProvince: addressText,
    responsibleCity: addressText,
    responsibleState: z.string().trim().max(2),
    consent: z.literal(true),
    website: z.string().max(0),
    turnstileToken: z.string().min(1).max(2048),
  })
  .superRefine((value, context) => {
    const add = (field: keyof typeof value) =>
      context.addIssue({ code: "custom", path: [field], message: "Invalid field" });
    const required = (field: keyof typeof value) => {
      if (String(value[field]).trim().length < 2) add(field);
    };
    const validWhatsapp = (field: "patientPhone" | "responsiblePhone") => {
      if (!isValidWhatsapp(value[field])) add(field);
    };
    const validEmail = (field: "patientEmail" | "responsibleEmail") => {
      if (!isValidEmail(value[field])) add(field);
    };
    const validAddress = (prefix: "patient" | "responsible") => {
      const postalCode = `${prefix}PostalCode` as keyof typeof value;
      const address = `${prefix}Address` as keyof typeof value;
      const number = `${prefix}AddressNumber` as keyof typeof value;
      const province = `${prefix}Province` as keyof typeof value;
      const city = `${prefix}City` as keyof typeof value;
      const state = `${prefix}State` as keyof typeof value;
      if (onlyDigits(String(value[postalCode])).length !== 8) add(postalCode);
      required(address);
      required(number);
      required(province);
      required(city);
      if (!/^[A-Za-z]{2}$/.test(String(value[state]))) add(state);
    };

    const age = calculateAge(value.patientBirthDate);
    if (age === null) {
      add("patientBirthDate");
      return;
    }
    if (age >= 18) {
      validWhatsapp("patientPhone");
      validEmail("patientEmail");
      validAddress("patient");
    }
    if (age < 18 && !value.hasResponsible) add("hasResponsible");

    if (value.hasResponsible) {
      if (!isValidFullName(value.responsibleName)) add("responsibleName");
      if (
        normalizedNameForComparison(value.patientName) === normalizedNameForComparison(value.responsibleName)
      ) {
        add("responsibleName");
      }
      if (!isValidCpf(value.responsibleCpf)) add("responsibleCpf");
      const responsibleAge = calculateAge(value.responsibleBirthDate);
      if (responsibleAge === null || responsibleAge < 18) add("responsibleBirthDate");
      validWhatsapp("responsiblePhone");
      validEmail("responsibleEmail");
      validAddress("responsible");
    }
  });

type Patient = z.infer<typeof patientSchema>;
type AsaasCustomerList = { data?: Array<{ id: string }> };
type AsaasCustomer = { id?: string };
type AsaasPayment = { id?: string; customer?: string; externalReference?: string };
type AsaasPaymentList = { data?: AsaasPayment[] };
type AsaasNotification = {
  id?: string;
  customer?: string;
  enabled?: boolean;
  emailEnabledForProvider?: boolean;
  smsEnabledForProvider?: boolean;
  emailEnabledForCustomer?: boolean;
  smsEnabledForCustomer?: boolean;
  phoneCallEnabledForCustomer?: boolean;
  whatsappEnabledForCustomer?: boolean;
  event?: string;
  scheduleOffset?: number;
  deleted?: boolean;
};
type AsaasNotificationList = { data?: AsaasNotification[] };
type N8nCustomerCreatedPayload = {
  eventType: "asaas_customer_created";
  customerName: string;
  whatsapp: string;
  asaasCustomerId: string;
  externalReference: string;
};

type TurnstileVerification = {
  success?: boolean;
  hostname?: string;
  action?: string;
};

async function verifyTurnstile(request: Request, token: string) {
  const secret = (env.TURNSTILE_SECRET_KEY as string | undefined)?.trim();
  if (!secret) return { configured: false, valid: false };

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) return { configured: true, valid: false };
    const result = (await response.json()) as TurnstileVerification;
    const expectedHostname = (env.TURNSTILE_EXPECTED_HOSTNAME as string | undefined)?.trim();
    return {
      configured: true,
      valid:
        result.success === true &&
        result.action === "cadastro_paciente" &&
        (!expectedHostname || result.hostname === expectedHostname),
    };
  } catch {
    return { configured: true, valid: false };
  } finally {
    clearTimeout(timeout);
  }
}

function asaasHeaders(apiKey: string) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": "ConexaoSeresCadastro/1.0",
    access_token: apiKey,
  };
}

type AsaasErrorPayload = {
  errors?: Array<{ code?: string; description?: string }>;
};

const CONTROLLED_NOTIFICATION_EVENTS = new Set([
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_DUEDATE_WARNING",
  "PAYMENT_OVERDUE",
  "PAYMENT_RECEIVED",
  "SEND_LINHA_DIGITAVEL",
]);

const DESIRED_SCHEDULE_OFFSETS = {
  PAYMENT_DUEDATE_WARNING: 5,
  PAYMENT_OVERDUE: 1,
} as const;

function sanitizeAsaasLogText(value: string) {
  return value
    .replace(
      /(access[_-]?token|authorization|asaas[_-]?api[_-]?key|turnstile[_-]?(?:secret|token))\s*[:=]\s*("[^"]*"|'[^']*'|[^,\s}]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 800);
}

async function asaasErrorDetails(response: Response) {
  const rawResponse = await response.text();
  const sanitizedResponse = sanitizeAsaasLogText(rawResponse);
  try {
    const payload = JSON.parse(rawResponse) as AsaasErrorPayload;
    const errors = payload.errors?.slice(0, 3).map((error) => ({
      code: sanitizeAsaasLogText(error.code || "unknown").slice(0, 120),
      description: sanitizeAsaasLogText(error.description || "Sem descrição").slice(0, 240),
    }));
    return { errors, response: sanitizedResponse || "Resposta vazia" };
  } catch {
    return { response: sanitizedResponse || "Resposta não JSON ou indisponível" };
  }
}

function notificationScheduleOffset(notification: AsaasNotification) {
  return typeof notification.scheduleOffset === "number" && Number.isFinite(notification.scheduleOffset)
    ? notification.scheduleOffset
    : 0;
}

function selectScheduledNotificationIds(notifications: Array<AsaasNotification & { id: string }>) {
  const selectedIds = new Set<string>();
  for (const [event, desiredOffset] of Object.entries(DESIRED_SCHEDULE_OFFSETS)) {
    const candidates = notifications
      .filter((notification) => notification.event === event)
      .sort((left, right) => {
        const leftOffset = notificationScheduleOffset(left);
        const rightOffset = notificationScheduleOffset(right);
        const leftRank = leftOffset === desiredOffset ? 0 : leftOffset > 0 ? 1 : 2;
        const rightRank = rightOffset === desiredOffset ? 0 : rightOffset > 0 ? 1 : 2;
        return leftRank - rightRank
          || (leftOffset > 0 ? Math.abs(leftOffset - desiredOffset) : Number.MAX_SAFE_INTEGER)
            - (rightOffset > 0 ? Math.abs(rightOffset - desiredOffset) : Number.MAX_SAFE_INTEGER)
          || left.id.localeCompare(right.id);
      });
    if (candidates[0]) selectedIds.add(candidates[0].id);
  }
  return selectedIds;
}

function buildNotificationUpdate(
  notification: AsaasNotification & { id: string },
  scheduledNotificationIds: Set<string>,
) {
  const event = notification.event || "";
  const isDigitalLineNotification = event === "SEND_LINHA_DIGITAVEL";

  return {
    id: notification.id,
    enabled: true,
    emailEnabledForProvider: false,
    smsEnabledForProvider: false,
    emailEnabledForCustomer: false,
    smsEnabledForCustomer: false,
    phoneCallEnabledForCustomer: false,
    whatsappEnabledForCustomer: !isDigitalLineNotification,
    ...(scheduledNotificationIds.has(notification.id) && event in DESIRED_SCHEDULE_OFFSETS
      ? { scheduleOffset: DESIRED_SCHEDULE_OFFSETS[event as keyof typeof DESIRED_SCHEDULE_OFFSETS] }
      : {}),
  };
}

function notificationMatchesUpdate(
  notification: AsaasNotification,
  update: ReturnType<typeof buildNotificationUpdate>,
) {
  const channelFields = [
    "enabled",
    "emailEnabledForProvider",
    "smsEnabledForProvider",
    "emailEnabledForCustomer",
    "smsEnabledForCustomer",
    "phoneCallEnabledForCustomer",
    "whatsappEnabledForCustomer",
  ] as const;
  return notification.deleted !== true
    && channelFields.every((field) => notification[field] === update[field])
    && (!("scheduleOffset" in update) || notification.scheduleOffset === update.scheduleOffset);
}

async function configureCustomerNotifications(
  baseUrl: string,
  customerId: string,
  headers: ReturnType<typeof asaasHeaders>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const listResponse = await fetch(`${baseUrl}/customers/${encodeURIComponent(customerId)}/notifications`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!listResponse.ok) {
      console.error("Asaas notification lookup failed", {
        status: listResponse.status,
        errors: await asaasErrorDetails(listResponse),
      });
      return false;
    }

    const list = (await listResponse.json()) as AsaasNotificationList;
    const notificationsToUpdate = (list.data || []).filter(
      (notification): notification is AsaasNotification & { id: string } => {
        const notificationId = notification.id?.trim();
        const belongsToCustomer = notification.customer === customerId;
        return Boolean(notificationId)
          && notification.deleted !== true
          && belongsToCustomer
          && CONTROLLED_NOTIFICATION_EVENTS.has(notification.event || "");
      },
    );
    const scheduledNotificationIds = selectScheduledNotificationIds(notificationsToUpdate);
    const notifications = notificationsToUpdate.map((notification) =>
      buildNotificationUpdate(notification, scheduledNotificationIds),
    );

    if (!notifications.length) {
      console.error("Asaas notification lookup returned no notification IDs", { customerId });
      return false;
    }

    const updateResponse = await fetch(`${baseUrl}/notifications/batch`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ customer: customerId, notifications }),
      signal: controller.signal,
    });
    if (!updateResponse.ok) {
      const details = await asaasErrorDetails(updateResponse);
      console.error(
        `Asaas notification update failed. HTTP ${updateResponse.status}. Response: ${details.response}`,
        { errors: details.errors },
      );
      return false;
    }

    const verificationResponse = await fetch(
      `${baseUrl}/customers/${encodeURIComponent(customerId)}/notifications`,
      { method: "GET", headers, signal: controller.signal },
    );
    if (!verificationResponse.ok) {
      const details = await asaasErrorDetails(verificationResponse);
      console.error(
        `Asaas notification validation failed. HTTP ${verificationResponse.status}. Response: ${details.response}`,
        { errors: details.errors },
      );
      return false;
    }
    const verifiedList = (await verificationResponse.json()) as AsaasNotificationList;
    const verifiedById = new Map(
      (verifiedList.data || [])
        .filter((notification): notification is AsaasNotification & { id: string } => Boolean(notification.id))
        .map((notification) => [notification.id, notification]),
    );
    if (!notifications.every((update) => notificationMatchesUpdate(verifiedById.get(update.id) || {}, update))) {
      console.error("Asaas notification validation did not match the requested policy", { customerId });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Asaas notification configuration failed", {
      timedOut: error instanceof Error && error.name === "AbortError",
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function patientReference(patientName: string, patientCpf: string) {
  const normalizedName = patientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const bytes = new TextEncoder().encode(`${onlyDigits(patientCpf)}:${normalizedName}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `cs-paciente-${hash}`;
}

function clean(value: string) {
  return value.trim().replace(/[\r\n]+/g, " ");
}

const N8N_CUSTOMER_CREATED_TIMEOUT_MS = 3_000;

async function notifyN8nCustomerCreated(payload: N8nCustomerCreatedPayload) {
  const webhookUrl = (env.N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_URL as string | undefined)?.trim();
  const webhookToken = (env.N8N_CONEXAO_SERES_CADASTRO_WEBHOOK_TOKEN as string | undefined)?.trim();

  if (!webhookUrl || !webhookToken || webhookToken === "COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N") {
    console.warn("n8n customer-created webhook is not configured", {
      hasUrl: Boolean(webhookUrl),
      hasToken: Boolean(webhookToken && webhookToken !== "COLE_AQUI_O_TOKEN_DO_WEBHOOK_N8N"),
    });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error("Unsupported webhook protocol");
    }
  } catch {
    console.error("n8n customer-created webhook URL is invalid");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), N8N_CUSTOMER_CREATED_TIMEOUT_MS);
  const request = fetch(parsedUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${webhookToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        console.error("n8n customer-created webhook failed", { status: response.status });
      }
    })
    .catch((error) => {
      console.error("n8n customer-created webhook request failed", {
        timedOut: error instanceof Error && error.name === "AbortError",
      });
    })
    .finally(() => clearTimeout(timeout));

  const executionContext = getRequestExecutionContext();
  if (executionContext) {
    executionContext.waitUntil(request);
    return;
  }

  await request;
}

function formatBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatCpf(value: string) {
  const cpf = onlyDigits(value).slice(0, 11);
  return cpf.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function getNextBusinessDay(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
      .formatToParts(now)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  ) as Record<string, string>;
  const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const daysUntilNextBusinessDay = parts.weekday === "Fri" ? 3 : parts.weekday === "Sat" ? 2 : parts.weekday === "Sun" ? 1 : 1;
  date.setUTCDate(date.getUTCDate() + daysUntilNextBusinessDay);
  return date.toISOString().slice(0, 10);
}

function buildFirstSessionExternalReference(externalReference: string) {
  return `${externalReference}${FIRST_SESSION_EXTERNAL_REFERENCE_SUFFIX}`;
}

function buildFirstSessionDescription(patient: Patient) {
  const article = patient.patientSex === "female" ? "a paciente" : "o paciente";
  return `Referente a contratação de 1 sessão de Terapia Ocupacional para ${article} ${clean(patient.patientName)} (CPF: ${formatCpf(patient.patientCpf)}) realizada na Clínica Conexão Seres.`;
}

type FirstSessionPaymentResult = { paymentId: string | null; existing: boolean };

async function findFirstSessionPayment(
  baseUrl: string,
  customerId: string,
  externalReference: string,
  headers: ReturnType<typeof asaasHeaders>,
  signal?: AbortSignal,
) {
  const searchUrl = new URL(`${baseUrl}/payments`);
  searchUrl.searchParams.set("customer", customerId);
  searchUrl.searchParams.set("externalReference", externalReference);
  searchUrl.searchParams.set("limit", "10");
  const response = await fetch(searchUrl.toString(), { method: "GET", headers, signal });
  if (!response.ok) {
    const details = await asaasErrorDetails(response);
    console.error(`Asaas first-session payment lookup failed. HTTP ${response.status}. Response: ${details.response}`, {
      errors: details.errors,
      customerId,
      externalReference,
    });
    return { id: null, failed: true };
  }
  const result = (await response.json()) as AsaasPaymentList;
  const payment = result.data?.find(
    (candidate) => candidate.customer === customerId && candidate.externalReference === externalReference,
  );
  return { id: typeof payment?.id === "string" && payment.id.trim() ? payment.id.trim() : null, failed: false };
}

async function createFirstSessionPayment(
  baseUrl: string,
  customerId: string,
  patient: Patient,
  externalReference: string,
  headers: ReturnType<typeof asaasHeaders>,
  signal: AbortSignal,
): Promise<FirstSessionPaymentResult> {
  const paymentExternalReference = buildFirstSessionExternalReference(externalReference);
  try {
    const existing = await findFirstSessionPayment(baseUrl, customerId, paymentExternalReference, headers, signal);
    if (existing.failed) return { paymentId: null, existing: false };
    if (existing.id) return { paymentId: existing.id, existing: true };

    const response = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer: customerId,
        billingType: FIRST_SESSION_BILLING_TYPE,
        value: FIRST_SESSION_AMOUNT,
        dueDate: getNextBusinessDay(),
        description: buildFirstSessionDescription(patient),
        externalReference: paymentExternalReference,
      }),
      signal,
    });
    if (response.ok) {
      const created = (await response.json()) as AsaasPayment;
      if (typeof created.id === "string" && created.id.trim()) {
        return { paymentId: created.id.trim(), existing: false };
      }
    } else {
      const details = await asaasErrorDetails(response);
      console.error(`Asaas first-session payment creation failed. HTTP ${response.status}. Response: ${details.response}`, {
        errors: details.errors,
        customerId,
        externalReference: paymentExternalReference,
      });
    }

    const reconciled = await findFirstSessionPayment(
      baseUrl,
      customerId,
      paymentExternalReference,
      headers,
    );
    return { paymentId: reconciled.id, existing: Boolean(reconciled.id) };
  } catch (error) {
    console.error("Asaas first-session payment request failed", {
      timedOut: error instanceof Error && error.name === "AbortError",
      customerId,
      externalReference: paymentExternalReference,
    });
    return { paymentId: null, existing: false };
  }
}

function prepareFirstSessionInvoice() {
  const reason =
    "A API de nota fiscal do Asaas exige serviço municipal e tributos fiscais; não há configuração segura disponível no formulário para inferir esses dados.";
  console.warn("Asaas first-session invoice scheduling skipped", { reason });
  return { configured: false, reason };
}

function fullAddress(patient: Patient, prefix: "patient" | "responsible") {
  const address = clean(patient[`${prefix}Address`]);
  const number = clean(patient[`${prefix}AddressNumber`]);
  const complement = clean(patient[`${prefix}Complement`]);
  const province = clean(patient[`${prefix}Province`]);
  const city = clean(patient[`${prefix}City`]);
  const state = clean(patient[`${prefix}State`]).toUpperCase();
  const postalCode = onlyDigits(patient[`${prefix}PostalCode`]);
  return `${address}, ${number}${complement ? `, ${complement}` : ""} — ${province}, ${city}/${state} — CEP ${postalCode}`;
}

function buildObservations(patient: Patient) {
  const patientAge = calculateAge(patient.patientBirthDate);

  if (patientAge !== null && patientAge >= 18 && !patient.hasResponsible) {
    return undefined;
  }

  const lines = [
    `Pessoa atendida: ${clean(patient.patientName)}`,
    `CPF da pessoa atendida: ${onlyDigits(patient.patientCpf)}`,
    `Nascimento da pessoa atendida: ${formatBirthDate(patient.patientBirthDate)}`,
  ];
  if (patientAge !== null && patientAge >= 18) {
    lines.push(`Contato da pessoa atendida: ${onlyDigits(patient.patientPhone)} | ${clean(patient.patientEmail)}`);
    lines.push(`Endereço da pessoa atendida: ${fullAddress(patient, "patient")}`);
  }
  if (patient.hasResponsible) {
    lines.push(`Nascimento do responsável: ${formatBirthDate(patient.responsibleBirthDate)}`);
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 18_000) {
    return NextResponse.json({ message: "Dados enviados são muito extensos." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Não foi possível ler os dados enviados." }, { status: 400 });
  }

  const parsed = patientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Confira os dados informados e tente novamente." },
      { status: 400 },
    );
  }

  const turnstile = await verifyTurnstile(request, parsed.data.turnstileToken);
  if (!turnstile.configured) {
    return NextResponse.json(
      { message: "A verificação de segurança ainda não foi configurada. Fale com a clínica para que possamos ajudar." },
      { status: 503 },
    );
  }
  if (!turnstile.valid) {
    return NextResponse.json(
      { message: "Não foi possível confirmar a verificação de segurança. Atualize a página e tente novamente." },
      { status: 400 },
    );
  }

  const apiKey = env.ASAAS_API_KEY as string | undefined;
  const baseUrl = ((env.ASAAS_API_URL as string | undefined) || "https://api.asaas.com/v3").replace(/\/$/, "");
  if (!apiKey) {
    return NextResponse.json(
      { message: "Não conseguimos receber o cadastro agora. Fale com a clínica para que possamos ajudar." },
      { status: 503 },
    );
  }

  const patient = parsed.data;
  const patientAge = calculateAge(patient.patientBirthDate)!;
  const customerGroup = patientAge >= 18 ? "Adultos" : "Crianças";
  const holder = patient.hasResponsible ? "responsible" : "patient";
  const holderComplement = clean(patient[`${holder}Complement`]);
  const externalReference = await patientReference(patient.patientName, patient.patientCpf);
  const headers = asaasHeaders(apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const searchUrl = new URL(`${baseUrl}/customers`);
    searchUrl.searchParams.set("externalReference", externalReference);
    searchUrl.searchParams.set("limit", "1");
    const existingResponse = await fetch(searchUrl.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    if (!existingResponse.ok) {
      console.error("Asaas customer lookup failed", {
        status: existingResponse.status,
        errors: await asaasErrorDetails(existingResponse),
      });
      return NextResponse.json(
        {
          message:
            existingResponse.status === 401 || existingResponse.status === 403
              ? "Não conseguimos conectar ao sistema de cadastro. Fale com a clínica para que possamos ajudar."
              : "Não conseguimos confirmar os dados agora. Tente novamente em instantes.",
        },
        { status: 502 },
      );
    }
    const existing = (await existingResponse.json()) as AsaasCustomerList;
    if (existing.data?.length) {
      return NextResponse.json(
        {
          message: "Já existe um cadastro com este CPF e/ou e-mail. Se precisar atualizar os dados, fale com a clínica.",
        },
        { status: 409 },
      );
    }

    const observations = buildObservations(patient);
    const customer = {
      name: clean(patient[`${holder}Name`]),
      cpfCnpj: onlyDigits(patient[`${holder}Cpf`]),
      email: clean(patient[`${holder}Email`]).toLowerCase(),
      mobilePhone: onlyDigits(patient[`${holder}Phone`]),
      postalCode: onlyDigits(patient[`${holder}PostalCode`]),
      address: clean(patient[`${holder}Address`]),
      addressNumber: clean(patient[`${holder}AddressNumber`]),
      ...(holderComplement ? { complement: holderComplement } : {}),
      province: clean(patient[`${holder}Province`]),
      externalReference,
      groupName: customerGroup,
      notificationDisabled: false,
      ...(patient.hasResponsible ? { company: clean(patient.patientName) } : {}),
      ...(observations ? { observations } : {}),
    };

    const createResponse = await fetch(`${baseUrl}/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify(customer),
      signal: controller.signal,
    });
    if (!createResponse.ok) {
      console.error("Asaas customer creation failed", {
        status: createResponse.status,
        errors: await asaasErrorDetails(createResponse),
      });
      const status = createResponse.status >= 500 ? 502 : 400;
      return NextResponse.json(
        {
          message:
            status === 400
              ? "Algumas informações precisam ser conferidas. Revise os dados e tente novamente."
              : "Não conseguimos enviar o cadastro agora. Tente novamente em instantes.",
        },
        { status },
      );
    }

    const created = (await createResponse.json()) as AsaasCustomer;
    if (typeof created.id !== "string" || !created.id.trim()) {
      return NextResponse.json(
        { message: "Não conseguimos confirmar o cadastro no Asaas. Tente novamente em instantes." },
        { status: 502 },
      );
    }
    const createdCustomerId = created.id.trim();
    const notificationsConfigured = await configureCustomerNotifications(baseUrl, createdCustomerId, headers);
    if (!notificationsConfigured) {
      console.error("Asaas customer was created, but notification configuration was not completed", {
        customerId: createdCustomerId,
      });
    }

    const payment = await createFirstSessionPayment(
      baseUrl,
      createdCustomerId,
      patient,
      externalReference,
      headers,
      controller.signal,
    );
    if (!payment.paymentId) {
      return NextResponse.json(
        {
          success: true,
          existing: false,
          partial: true,
          paymentCreated: false,
          message:
            "Seu cadastro foi realizado, mas não conseguimos gerar a cobrança da primeira sessão automaticamente. A equipe da Conexão Seres dará continuidade ao atendimento.",
        },
        { status: 201 },
      );
    }

    const invoice = prepareFirstSessionInvoice();
    if (!invoice.configured) {
      return NextResponse.json(
        {
          success: true,
          existing: false,
          partial: true,
          paymentCreated: true,
          paymentId: payment.paymentId,
          invoiceConfigured: false,
          message:
            "Seu cadastro e a cobrança da primeira sessão foram registrados. A emissão fiscal será concluída pela equipe da Conexão Seres antes do envio das instruções.",
        },
        { status: 201 },
      );
    }

    await notifyN8nCustomerCreated({
      eventType: "asaas_customer_created",
      customerName: customer.name,
      whatsapp: customer.mobilePhone,
      asaasCustomerId: createdCustomerId,
      externalReference,
    });
    return NextResponse.json(
      { success: true, existing: false, paymentCreated: true, invoiceConfigured: true },
      { status: 201 },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        message: timedOut
          ? "O envio demorou um pouco mais que o esperado. Tente novamente."
          : "Não conseguimos enviar o cadastro agora. Tente novamente em instantes.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
