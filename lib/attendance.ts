export const SERVICE_TYPE_LABELS = {
  ADULT_NEURO_REHAB: "Terapia Ocupacional – Reabilitação Neurológica",
  ADULT_PSYCHOANALYSIS_INTEGRATED: "Terapia Ocupacional com Psicanálise Integrada",
  ADULT_SENSORY_STIMULATION: "Terapia Ocupacional com Estimulação Sensorial",
  CHILD_OT: "Terapia Ocupacional",
  CHILD_NEURO_REHAB: "Terapia Ocupacional – Reabilitação Neurológica",
  CHILD_SENSORY_INTEGRATION: "Terapia Ocupacional com Integração Sensorial",
  UNDEFINED: "Ainda não definido",
} as const;

export const ADULT_SERVICE_TYPES = [
  "ADULT_NEURO_REHAB",
  "ADULT_PSYCHOANALYSIS_INTEGRATED",
  "ADULT_SENSORY_STIMULATION",
  "UNDEFINED",
] as const;

export const CHILD_SERVICE_TYPES = [
  "CHILD_OT",
  "CHILD_NEURO_REHAB",
  "CHILD_SENSORY_INTEGRATION",
  "UNDEFINED",
] as const;

export const ENTRY_TYPE_LABELS = {
  FULL_ASSESSMENT: "Processo Avaliativo Completo",
  DIRECT_START: "Início Direto – Sem Avaliação Completa",
  UNDEFINED: "Ainda não foi definido",
} as const;

export const ENTRY_TYPES = ["FULL_ASSESSMENT", "DIRECT_START", "UNDEFINED"] as const;

export const ATTENDANCE_MODE_LABELS = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
  UNDEFINED: "Ainda não definida",
} as const;

export const ATTENDANCE_MODES = ["IN_PERSON", "ONLINE", "UNDEFINED"] as const;

export type ServiceType = keyof typeof SERVICE_TYPE_LABELS;
export type EntryType = keyof typeof ENTRY_TYPE_LABELS;
export type AttendanceMode = keyof typeof ATTENDANCE_MODE_LABELS;

export function isAdultServiceType(value: string): value is (typeof ADULT_SERVICE_TYPES)[number] {
  return (ADULT_SERVICE_TYPES as readonly string[]).includes(value);
}

export function isChildServiceType(value: string): value is (typeof CHILD_SERVICE_TYPES)[number] {
  return (CHILD_SERVICE_TYPES as readonly string[]).includes(value);
}

export function isEntryType(value: string): value is (typeof ENTRY_TYPES)[number] {
  return (ENTRY_TYPES as readonly string[]).includes(value);
}

export function isAttendanceMode(value: string): value is (typeof ATTENDANCE_MODES)[number] {
  return (ATTENDANCE_MODES as readonly string[]).includes(value);
}

export function serviceTypeLabel(value: string) {
  return SERVICE_TYPE_LABELS[value as ServiceType] ?? "";
}

export function entryTypeLabel(value: string) {
  return ENTRY_TYPE_LABELS[value as EntryType] ?? "";
}

export function attendanceModeLabel(value: string) {
  return ATTENDANCE_MODE_LABELS[value as AttendanceMode] ?? "";
}
