export const FIRST_SESSION_MODES = ["IN_PERSON", "ONLINE"] as const;

export const FIRST_SESSION_MODE_LABELS = {
  IN_PERSON: "Presencial, na clínica Conexão Seres",
  ONLINE: "Online",
} as const;

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export function formatFirstSessionDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseFirstSessionDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

export function firstSessionDateToIso(value: string) {
  const parsed = parseFirstSessionDate(value);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export function saoPauloTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isFirstSessionDateTodayOrFuture(value: string) {
  const iso = firstSessionDateToIso(value);
  return iso !== null && iso >= saoPauloTodayIso();
}

export function isValidFirstSessionDate(value: string) {
  return firstSessionDateToIso(value) !== null;
}

export function isValidFirstSessionTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function isFirstSessionMode(value: string): value is (typeof FIRST_SESSION_MODES)[number] {
  return (FIRST_SESSION_MODES as readonly string[]).includes(value);
}

export function firstSessionModeLabel(value: string) {
  return FIRST_SESSION_MODE_LABELS[value as keyof typeof FIRST_SESSION_MODE_LABELS] ?? "";
}
