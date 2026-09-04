export const SERVICE_TYPE_LABELS = {
  ADULT_NEURO_REHAB: "Terapia Ocupacional – Reabilitação Neurológica",
  ADULT_PSYCHOANALYSIS_INTEGRATED: "Terapia Ocupacional com Psicanálise Integrada",
  ADULT_SENSORY_STIMULATION: "Terapia Ocupacional com Estimulação Sensorial",
  CHILD_OT: "Terapia Ocupacional",
  CHILD_NEURO_REHAB: "Terapia Ocupacional – Reabilitação Neurológica",
  CHILD_SENSORY_INTEGRATION: "Terapia Ocupacional com Integração Sensorial",
} as const;

export const ADULT_SERVICE_TYPES = [
  "ADULT_NEURO_REHAB",
  "ADULT_PSYCHOANALYSIS_INTEGRATED",
  "ADULT_SENSORY_STIMULATION",
] as const;

export const CHILD_SERVICE_TYPES = [
  "CHILD_OT",
  "CHILD_NEURO_REHAB",
  "CHILD_SENSORY_INTEGRATION",
] as const;

export const ENTRY_TYPE_LABELS = {
  FULL_ASSESSMENT: "Processo Avaliativo Completo",
  DIRECT_START: "Início Direto – Sem Avaliação Completa",
} as const;

export const ENTRY_TYPES = ["FULL_ASSESSMENT", "DIRECT_START"] as const;

export const ATTENDANCE_MODE_LABELS = {
  IN_PERSON: "Presencial",
  ONLINE: "Online",
} as const;

export const ATTENDANCE_MODES = ["IN_PERSON", "ONLINE"] as const;

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

export function allowedAdultServiceTypesForAttendanceMode(value: string) {
  if (value === "ONLINE") return ["ADULT_PSYCHOANALYSIS_INTEGRATED"] as const;
  if (value === "IN_PERSON") return ADULT_SERVICE_TYPES;
  return [] as const;
}

export function serviceTypeAllowsOnline(value: string) {
  return value === "ADULT_PSYCHOANALYSIS_INTEGRATED";
}

export function isAttendanceModeValidForServiceType(serviceType: string, attendanceMode: string) {
  return isAdultServiceType(serviceType)
    && (attendanceMode === "IN_PERSON" || (attendanceMode === "ONLINE" && serviceTypeAllowsOnline(serviceType)));
}

export function allowedFirstSessionModesForServiceType(serviceType: string, isMinor: boolean) {
  if (isMinor || serviceType === "CHILD_OT" || serviceType === "CHILD_NEURO_REHAB" || serviceType === "CHILD_SENSORY_INTEGRATION") {
    return ["IN_PERSON"] as const;
  }
  if (serviceType === "ADULT_NEURO_REHAB" || serviceType === "ADULT_SENSORY_STIMULATION") {
    return ["IN_PERSON"] as const;
  }
  if (serviceType === "ADULT_PSYCHOANALYSIS_INTEGRATED") {
    return ["IN_PERSON", "ONLINE"] as const;
  }
  return ["IN_PERSON", "ONLINE"] as const;
}

export function isFirstSessionModeValidForServiceType(
  serviceType: string,
  firstSessionMode: string,
  isMinor: boolean,
) {
  return (allowedFirstSessionModesForServiceType(serviceType, isMinor) as readonly string[]).includes(firstSessionMode)
    && (isMinor ? isChildServiceType(serviceType) : isAdultServiceType(serviceType));
}

export function serviceTypeRequiresEntryType(serviceType: string) {
  return serviceType === "CHILD_SENSORY_INTEGRATION";
}

export function isEntryTypeValidForServiceType(serviceType: string, entryType: string, isMinor: boolean) {
  if (!isMinor || !isChildServiceType(serviceType)) return !isMinor && entryType === "";
  return serviceTypeRequiresEntryType(serviceType)
    ? (entryType === "FULL_ASSESSMENT" || entryType === "DIRECT_START")
    : entryType === "";
}
