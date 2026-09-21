export const JORNADA_YOGA_EVENT_ID = "jornada-yoga-2026";
export const JORNADA_YOGA_AMOUNT = 297;
export const JORNADA_YOGA_REFERENCE_PREFIX = "cs-jornada-yoga-2026-";
export const JORNADA_YOGA_REFERENCE_PATTERN = /^cs-jornada-yoga-2026-[a-f0-9]{24}$/;
export const JORNADA_YOGA_DESCRIPTION =
  "Jornada de Expansão Mental e Corporal — 8 encontros online, de 07/10/2026 a 25/11/2026.";

export const JORNADA_YOGA_DATES = [
  "07/10/2026", "14/10/2026", "21/10/2026", "28/10/2026",
  "04/11/2026", "11/11/2026", "18/11/2026", "25/11/2026",
] as const;

const AREA_CODES = new Set([
  "11","12","13","14","15","16","17","18","19","21","22","24","27","28",
  "31","32","33","34","35","37","38","41","42","43","44","45","46","47","48","49",
  "51","53","54","55","61","62","63","64","65","66","67","68","69","71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99",
]);

export const onlyDigits = (value: string) => value.replace(/\D/g, "");
export const cleanText = (value: string) => value.trim().replace(/\s+/g, " ");

export function isValidFullName(value: string) {
  const clean = cleanText(value);
  const parts = clean.split(" ").filter(Boolean);
  return clean.length >= 5 && clean.length <= 120 && parts.length >= 2 && parts.every((part) => part.length >= 2);
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (factor: number) => {
    let total = 0;
    for (let index = 0; index < factor - 1; index += 1) total += Number(cpf[index]) * (factor - index);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(10) === Number(cpf[9]) && digit(11) === Number(cpf[10]);
}

export function normalizeBrazilianWhatsapp(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  return digits.length === 11 ? `55${digits}` : digits;
}

export function isValidBrazilianWhatsapp(value: string) {
  const digits = normalizeBrazilianWhatsapp(value);
  if (!/^55\d{11}$/.test(digits)) return false;
  const national = digits.slice(2);
  return AREA_CODES.has(national.slice(0, 2)) && national[2] === "9";
}

export function isValidEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function isValidCep(value: string) {
  return /^\d{8}$/.test(onlyDigits(value));
}

export function formatCep(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

export function formatCpf(value: string) {
  return onlyDigits(value).slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
}

export function formatWhatsapp(value: string) {
  const n = onlyDigits(value).replace(/^55(?=\d{11}$)/, "").slice(0,11);
  if (n.length <= 2) return n;
  if (n.length <= 7) return `(${n.slice(0,2)}) ${n.slice(2)}`;
  return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function jornadaPaymentStatusLabel(status: string) {
  const labels: Record<string,string> = {
    PENDING:"Pendente", CONFIRMED:"Confirmado", RECEIVED:"Recebido", RECEIVED_IN_CASH:"Recebido em dinheiro",
    OVERDUE:"Vencido", REFUNDED:"Estornado", PARTIALLY_REFUNDED:"Estorno parcial", DELETED:"Removido", CANCELED:"Cancelado",
  };
  return labels[status.toUpperCase()] || status || "Não informado";
}

export function jornadaBillingTypeLabel(value: string) {
  const labels: Record<string,string> = {
    UNDEFINED:"A definir", PIX:"Pix", BOLETO:"Boleto", CREDIT_CARD:"Cartão de crédito",
    DEBIT_CARD:"Cartão de débito", RECEIVED_IN_CASH:"Dinheiro",
  };
  return labels[value.toUpperCase()] || value || "Não informado";
}

export const isPaidJourneyStatus = (status: string) =>
  ["CONFIRMED","RECEIVED","RECEIVED_IN_CASH"].includes(status.toUpperCase());
