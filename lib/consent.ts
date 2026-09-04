export const MEDIA_CONSENT_VALUES = ["AUTHORIZED", "NOT_AUTHORIZED"] as const;

export const MEDIA_CONSENT_LABELS = {
  AUTHORIZED: "Autorizado",
  NOT_AUTHORIZED: "Não autorizado",
} as const;

export const ADULT_MEDIA_CONSENT_TEXT =
  "Autorizo a realização de fotos e/ou vídeos durante os atendimentos, para compartilhamento comigo e, quando aplicável, com meu representante legal e para fins institucionais, educativos e de divulgação da Conexão Seres.\n\nEstou ciente de que, caso não autorize o uso externo das imagens, também não serão realizados registros para envio particular.\n\nEsta autorização poderá ser revogada mediante solicitação expressa à Clínica, produzindo efeitos para utilizações futuras.\n\nEsta autorização constitui o consentimento específico para registro e uso de imagem nos termos descritos acima. A divulgação não incluirá nome completo, diagnóstico ou outros dados pessoais do paciente juntamente com as imagens, salvo mediante autorização específica.";

export const MINOR_MEDIA_CONSENT_TEXT =
  "Na qualidade de responsável legal pelo paciente, autorizo a realização de fotos e/ou vídeos durante os atendimentos, para compartilhamento comigo e para fins institucionais, educativos e de divulgação da Conexão Seres.\n\nEstou ciente de que, caso não autorize o uso externo das imagens, também não serão realizados registros para envio particular.\n\nEsta autorização poderá ser revogada mediante solicitação expressa à Clínica, produzindo efeitos para utilizações futuras.\n\nQuando compatível com sua idade e capacidade de compreensão, a manifestação do paciente quanto à realização e utilização dos registros também será considerada.\n\nA divulgação não incluirá nome completo, diagnóstico ou outros dados pessoais do paciente juntamente com as imagens, salvo mediante autorização específica.";

export function isMediaConsent(value: string): value is (typeof MEDIA_CONSENT_VALUES)[number] {
  return (MEDIA_CONSENT_VALUES as readonly string[]).includes(value);
}

export function mediaConsentLabel(value: string) {
  return MEDIA_CONSENT_LABELS[value as keyof typeof MEDIA_CONSENT_LABELS] ?? "";
}
