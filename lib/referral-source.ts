export const REFERRAL_SOURCE_VALUES = [
  "INSTAGRAM",
  "FACEBOOK",
  "GOOGLE",
  "FRIEND_OR_FAMILY",
  "HEALTH_PROFESSIONAL",
  "WHATSAPP",
  "WEBSITE",
  "OTHER",
] as const;

export const REFERRAL_SOURCE_LABELS = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  GOOGLE: "Google (pesquisa)",
  FRIEND_OR_FAMILY: "Indicação de amigo ou familiar",
  HEALTH_PROFESSIONAL: "Indicação de profissional da saúde",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Site da Conexão Seres",
  OTHER: "Outro",
} as const;

export function isReferralSource(value: string): value is (typeof REFERRAL_SOURCE_VALUES)[number] {
  return (REFERRAL_SOURCE_VALUES as readonly string[]).includes(value);
}

export function referralSourceLabel(value: string) {
  return REFERRAL_SOURCE_LABELS[value as keyof typeof REFERRAL_SOURCE_LABELS] ?? "";
}
