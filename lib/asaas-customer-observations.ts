export const ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES = 500;

export type AsaasCustomerObservationsDetails = {
  patientAge: number;
  hasResponsible: boolean;
  patientName: string;
  patientCpf: string;
  patientBirthDate: string;
  patientPhone: string;
  patientEmail: string;
  patientAddress: string;
  responsibleBirthDate: string;
  serviceType: string;
  serviceTypeRequiresEntryType: boolean;
  entryType: string;
  attendanceMode: string;
  firstSessionDate: string;
  firstSessionTime: string;
  firstSessionMode: string;
  mediaConsent: string;
};

export function asaasCustomerObservationsUtf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function isAsaasCustomerObservationsWithinSafetyBudget(value: string) {
  return asaasCustomerObservationsUtf8Bytes(value) <= ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES;
}

export function buildAsaasCustomerObservations(details: AsaasCustomerObservationsDetails) {
  const compact = details.hasResponsible;
  const attendanceLines = [
    `${compact ? "Atendimento" : "Tipo de atendimento"}: ${details.serviceType}`,
    ...(details.patientAge >= 18
      ? [`${compact ? "Modo" : "Modalidade de atendimento"}: ${details.attendanceMode}`]
      : details.serviceTypeRequiresEntryType
        ? [`${compact ? "Ingresso" : "Forma de ingresso"}: ${details.entryType}`]
        : []),
    `${compact ? "1ª sessão" : "Primeira sessão"}: ${details.firstSessionDate} às ${details.firstSessionTime}`,
    `${compact ? "Modo 1ª sessão" : "Modalidade da primeira sessão"}: ${details.firstSessionMode}`,
    `${compact ? "Mídia" : "Autorização de imagens e vídeos"}: ${details.mediaConsent}`,
  ];

  if (details.patientAge >= 18 && !details.hasResponsible) {
    return attendanceLines.join("\n");
  }

  const lines = [
    `${compact ? "Paciente" : "Pessoa atendida"}: ${details.patientName}`,
    `CPF: ${details.patientCpf}`,
    `Nasc.: ${details.patientBirthDate}`,
  ];
  if (details.patientAge >= 18) {
    lines.push(`Contato: ${details.patientPhone} | ${details.patientEmail}`);
    lines.push(`Endereço: ${details.patientAddress}`);
  }
  if (details.hasResponsible) {
    lines.push(`Nasc. resp.: ${details.responsibleBirthDate}`);
  }

  return [...lines, ...attendanceLines].join("\n");
}
