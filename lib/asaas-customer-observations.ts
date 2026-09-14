export const ASAAS_CUSTOMER_OBSERVATIONS_SAFETY_BUDGET_BYTES = 500;

export type AsaasCustomerObservationsDetails = {
  patientAge: number;
  hasResponsible: boolean;
  patientName: string;
  patientCpf: string;
  patientSex: string;
  patientBirthDate: string;
  patientPhone: string;
  patientEmail: string;
  patientAddress: string;
  patientCity: string;
  patientState: string;
  responsibleBirthDate: string;
  responsibleCity: string;
  responsibleState: string;
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

function patientSexLabel(value: string) {
  return value === "female" ? "Feminino" : value === "male" ? "Masculino" : "Não binário";
}

function cityStateLabel(city: string, state: string) {
  const normalizedCity = city.trim();
  const normalizedState = state.trim().toUpperCase();
  return normalizedCity && normalizedState ? `${normalizedCity}/${normalizedState}` : normalizedCity || normalizedState;
}

export function buildAsaasCustomerObservations(details: AsaasCustomerObservationsDetails) {
  const compact = details.hasResponsible;
  const attendanceLines = [
    `${compact ? "Atend." : "Tipo de atendimento"}: ${details.serviceType}`,
    ...(details.patientAge >= 18
      ? [`${compact ? "Modo" : "Modalidade de atendimento"}: ${details.attendanceMode}`]
      : details.serviceTypeRequiresEntryType
        ? [`${compact ? "Ingresso" : "Forma de ingresso"}: ${details.entryType}`]
        : []),
    `${compact ? "1ª sessão" : "Primeira sessão"}: ${details.firstSessionDate} às ${details.firstSessionTime}`,
    `${compact ? "Modo 1ª sessão" : "Modalidade da primeira sessão"}: ${details.firstSessionMode}`,
    `${compact ? "Img." : "Autorização de imagens e vídeos"}: ${details.mediaConsent}`,
  ];

  if (details.patientAge >= 18 && !details.hasResponsible) {
    return [
      `Sexo: ${patientSexLabel(details.patientSex)}`,
      `Nasc.: ${details.patientBirthDate}`,
      ...(cityStateLabel(details.patientCity, details.patientState)
        ? [`Local: ${cityStateLabel(details.patientCity, details.patientState)}`]
        : []),
      ...attendanceLines,
    ].join("\n");
  }

  const lines = [
    `${compact ? "Paciente" : "Pessoa atendida"}: ${details.patientName}`,
    `CPF: ${details.patientCpf}`,
    `Sexo: ${patientSexLabel(details.patientSex)}`,
    `Nasc.: ${details.patientBirthDate}`,
  ];
  if (details.patientAge >= 18) {
    lines.push(`Contato: ${details.patientPhone} | ${details.patientEmail}`);
    lines.push(`End: ${details.patientAddress}`);
  }
  if (details.hasResponsible) {
    lines.push(`Nasc. R.: ${details.responsibleBirthDate}`);
    const responsibleCityState = cityStateLabel(details.responsibleCity, details.responsibleState);
    if (responsibleCityState) lines.push(`Local R.: ${responsibleCityState}`);
  }

  return [...lines, ...attendanceLines].join("\n");
}
