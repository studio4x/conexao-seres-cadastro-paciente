"use client";

import { useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileWidget } from "@/components/turnstile-widget";
import {
  ADULT_SERVICE_TYPES,
  ATTENDANCE_MODE_LABELS,
  ATTENDANCE_MODES,
  CHILD_SERVICE_TYPES,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPES,
  SERVICE_TYPE_LABELS,
  isAdultServiceType,
  isAttendanceMode,
  isChildServiceType,
  isEntryType,
} from "@/lib/attendance";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

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
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

type BirthDateField = "patientBirthDate" | "responsibleBirthDate";

function birthDateError(field: BirthDateField, value: string) {
  const age = calculateAge(value);
  if (age === null) return "Informe uma data de nascimento válida.";
  if (field === "responsibleBirthDate" && age < 18) {
    return "O responsável deve ter 18 anos ou mais.";
  }
  return undefined;
}

const formSchema = z
  .object({
    patientName: z.string().trim().max(120).refine(isValidFullName, "Informe o nome completo do paciente."),
    patientSex: z.string().refine(
      (value): boolean => value === "female" || value === "male",
      "Selecione o sexo do paciente.",
    ),
    patientBirthDate: z.string(),
    patientCpf: z.string().refine(isValidCpf, "Informe um CPF válido."),
    patientPhone: z.string(),
    patientEmail: z.string(),
    patientPostalCode: z.string(),
    patientAddress: z.string(),
    patientAddressNumber: z.string(),
    patientComplement: z.string().max(80, "Complemento muito longo."),
    patientProvince: z.string(),
    patientCity: z.string(),
    patientState: z.string(),
    hasResponsible: z.boolean(),
    responsibleName: z.string(),
    responsibleCpf: z.string(),
    responsibleBirthDate: z.string(),
    responsiblePhone: z.string(),
    responsibleEmail: z.string(),
    responsiblePostalCode: z.string(),
    responsibleAddress: z.string(),
    responsibleAddressNumber: z.string(),
    responsibleComplement: z.string().max(80, "Complemento muito longo."),
    responsibleProvince: z.string(),
    responsibleCity: z.string(),
    responsibleState: z.string(),
    serviceType: z.string(),
    entryType: z.string(),
    attendanceMode: z.string(),
    consent: z.boolean().refine((value) => value, "Confirme a autorização para continuar."),
    website: z.string().max(0),
  })
  .superRefine((value, context) => {
    const add = (field: keyof typeof value, message: string) =>
      context.addIssue({ code: "custom", path: [field], message });
    const requireText = (field: keyof typeof value, message: string) => {
      if (String(value[field]).trim().length < 2) add(field, message);
    };
    const requireWhatsapp = (field: "patientPhone" | "responsiblePhone") => {
      if (!isValidWhatsapp(value[field])) {
        add(field, "Informe um WhatsApp válido com DDD.");
      }
    };
    const requireEmail = (field: "patientEmail" | "responsibleEmail") => {
      if (!isValidEmail(value[field])) {
        add(field, "Informe um e-mail válido.");
      }
    };
    const requireAddress = (prefix: "patient" | "responsible") => {
      const postalCode = `${prefix}PostalCode` as keyof typeof value;
      const address = `${prefix}Address` as keyof typeof value;
      const number = `${prefix}AddressNumber` as keyof typeof value;
      const province = `${prefix}Province` as keyof typeof value;
      const city = `${prefix}City` as keyof typeof value;
      const state = `${prefix}State` as keyof typeof value;
      if (onlyDigits(String(value[postalCode])).length !== 8) {
        add(postalCode, "Informe um CEP válido.");
      }
      requireText(address, "Informe o logradouro.");
      requireText(number, "Informe o número.");
      requireText(province, "Informe o bairro.");
      requireText(city, "Informe a cidade.");
      if (!/^[A-Za-z]{2}$/.test(String(value[state]).trim())) {
        add(state, "Informe a UF com 2 letras.");
      }
    };

    const patientAge = calculateAge(value.patientBirthDate);
    if (patientAge === null) {
      add("patientBirthDate", "Informe uma data de nascimento válida.");
      return;
    }

    if (patientAge >= 18) {
      if (!isAdultServiceType(value.serviceType)) {
        add("serviceType", "Selecione o tipo de atendimento.");
      }
      if (!isAttendanceMode(value.attendanceMode)) {
        add("attendanceMode", "Selecione a modalidade de atendimento.");
      }
      if (value.entryType !== "") {
        add("entryType", "Confira os dados do atendimento.");
      }
    } else {
      if (!isChildServiceType(value.serviceType)) {
        add("serviceType", "Selecione o tipo de atendimento.");
      }
      if (!isEntryType(value.entryType)) {
        add("entryType", "Selecione a forma de início do acompanhamento.");
      }
      if (value.attendanceMode !== "") {
        add("attendanceMode", "Confira os dados do atendimento.");
      }
    }

    if (patientAge >= 18) {
      requireWhatsapp("patientPhone");
      requireEmail("patientEmail");
      requireAddress("patient");
    }

    if (patientAge < 18 && !value.hasResponsible) {
      add("hasResponsible", "Informe o responsável pelo paciente menor de idade.");
    }

    if (value.hasResponsible) {
      if (!isValidFullName(value.responsibleName)) {
        add("responsibleName", "Informe o nome completo do responsável.");
      } else if (
        normalizedNameForComparison(value.patientName) === normalizedNameForComparison(value.responsibleName)
      ) {
        add("responsibleName", "O nome do responsável deve ser diferente do nome do paciente.");
      }
      if (!isValidCpf(value.responsibleCpf)) {
        add("responsibleCpf", "Informe um CPF válido.");
      }
      const responsibleAge = calculateAge(value.responsibleBirthDate);
      if (responsibleAge === null) {
        add("responsibleBirthDate", "Informe uma data de nascimento válida.");
      } else if (responsibleAge < 18) {
        add("responsibleBirthDate", "O responsável deve ter 18 anos ou mais.");
      }
      requireWhatsapp("responsiblePhone");
      requireEmail("responsibleEmail");
      requireAddress("responsible");
    }
  });

type FormValues = z.infer<typeof formSchema>;
type FieldName = keyof FormValues;
type Errors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  patientName: "",
  patientSex: "",
  patientBirthDate: "",
  patientCpf: "",
  patientPhone: "",
  patientEmail: "",
  patientPostalCode: "",
  patientAddress: "",
  patientAddressNumber: "",
  patientComplement: "",
  patientProvince: "",
  patientCity: "",
  patientState: "",
  hasResponsible: false,
  responsibleName: "",
  responsibleCpf: "",
  responsibleBirthDate: "",
  responsiblePhone: "",
  responsibleEmail: "",
  responsiblePostalCode: "",
  responsibleAddress: "",
  responsibleAddressNumber: "",
  responsibleComplement: "",
  responsibleProvince: "",
  responsibleCity: "",
  responsibleState: "",
  serviceType: "",
  entryType: "",
  attendanceMode: "",
  consent: false,
  website: "",
};

const inputClass =
  "h-12 rounded-md border-[#d4d4d4] bg-white px-4 text-base shadow-none placeholder:text-[#8a8a8a] focus-visible:border-primary focus-visible:ring-primary/20 md:text-base";

function formatCpf(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCep(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-sm font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

type InputFieldProps = {
  field: FieldName;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  helperText?: string;
  helperTone?: "neutral" | "success" | "error";
  onChange: (value: string) => void;
  onBlur?: () => void;
};

function InputField({
  field,
  label,
  value,
  error,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  helperText,
  helperTone = "neutral",
  onChange,
  onBlur,
}: InputFieldProps) {
  return (
    <div className="form-field">
      <Label htmlFor={field}>{label}</Label>
      <Input
        id={field}
        name={field}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className={inputClass}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
      />
      {helperText ? (
        <p
          className={`mt-2 text-sm leading-5 ${
            helperTone === "error"
              ? "font-medium text-destructive"
              : helperTone === "success"
                ? "text-[#315f31]"
                : "text-muted-foreground"
          }`}
          role={helperTone === "error" ? "alert" : undefined}
        >
          {helperText}
        </p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

type CepLookupState = {
  status: "idle" | "loading" | "success" | "error";
  message?: string;
};

type AddressFieldsProps = {
  prefix: "patient" | "responsible";
  values: FormValues;
  errors: Errors;
  lookupState: CepLookupState;
  update: (field: FieldName, value: string) => void;
  onPostalCodeChange: (prefix: "patient" | "responsible", value: string) => void;
  copyFromPatient?: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
};

function AddressFields({
  prefix,
  values,
  errors,
  lookupState,
  update,
  onPostalCodeChange,
  copyFromPatient,
}: AddressFieldsProps) {
  const fields = {
    postalCode: `${prefix}PostalCode` as FieldName,
    address: `${prefix}Address` as FieldName,
    number: `${prefix}AddressNumber` as FieldName,
    complement: `${prefix}Complement` as FieldName,
    province: `${prefix}Province` as FieldName,
    city: `${prefix}City` as FieldName,
    state: `${prefix}State` as FieldName,
  };

  const lookupMessage =
    lookupState.status === "loading"
      ? "Buscando endereço..."
      : lookupState.status === "success"
        ? "Endereço preenchido. Confira e ajuste os campos se necessário."
        : lookupState.status === "error"
          ? lookupState.message
          : "Digite os 8 números do CEP.";

  return (
    <fieldset className="space-y-5 rounded-lg border border-[#dedede] bg-[#fafafa] p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold text-secondary-foreground">Endereço completo</legend>
      {copyFromPatient ? (
        <div className="rounded-md border border-[#d7e2d1] bg-[#f3f8f0] p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="copyPatientAddress"
              className="mt-0.5 size-5 shrink-0 rounded-sm border-[#aebea7] data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              checked={copyFromPatient.checked}
              disabled={copyFromPatient.disabled}
              onCheckedChange={(checked) => copyFromPatient.onCheckedChange(checked === true)}
            />
            <Label
              htmlFor="copyPatientAddress"
              className="min-w-0 cursor-pointer text-sm font-normal leading-6 text-[#315f31] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-60"
              data-disabled={copyFromPatient.disabled}
            >
              O responsável mora no mesmo endereço
            </Label>
          </div>
          {copyFromPatient.disabled ? (
            <p className="mt-2 pl-8 text-xs leading-5 text-muted-foreground">
              Termine primeiro o endereço da pessoa atendida.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="max-w-xs">
        <InputField
          field={fields.postalCode}
          label="CEP"
          value={String(values[fields.postalCode])}
          error={errors[fields.postalCode]}
          placeholder="00000-000"
          inputMode="numeric"
          autoComplete="postal-code"
          helperText={lookupMessage}
          helperTone={
            lookupState.status === "error"
              ? "error"
              : lookupState.status === "success"
                ? "success"
                : "neutral"
          }
          onChange={(value) => onPostalCodeChange(prefix, value)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-[1.45fr_0.85fr]">
        <InputField
          field={fields.address}
          label="Logradouro"
          value={String(values[fields.address])}
          error={errors[fields.address]}
          placeholder="Preenchido pelo CEP"
          autoComplete="address-line1"
          onChange={(value) => update(fields.address, value)}
        />
        <InputField
          field={fields.province}
          label="Bairro"
          value={String(values[fields.province])}
          error={errors[fields.province]}
          placeholder="Preenchido pelo CEP"
          onChange={(value) => update(fields.province, value)}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-[1fr_0.32fr]">
        <InputField
          field={fields.city}
          label="Cidade"
          value={String(values[fields.city])}
          error={errors[fields.city]}
          placeholder="Preenchida pelo CEP"
          autoComplete="address-level2"
          onChange={(value) => update(fields.city, value)}
        />
        <InputField
          field={fields.state}
          label="UF"
          value={String(values[fields.state])}
          error={errors[fields.state]}
          placeholder="UF"
          maxLength={2}
          autoComplete="address-level1"
          onChange={(value) => update(fields.state, value.toUpperCase().replace(/[^A-Z]/g, ""))}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-[0.6fr_1.4fr]">
        <InputField
          field={fields.number}
          label="Número"
          value={String(values[fields.number])}
          error={errors[fields.number]}
          placeholder="Nº"
          onChange={(value) => update(fields.number, value)}
        />
        <InputField
          field={fields.complement}
          label="Complemento (opcional)"
          value={String(values[fields.complement])}
          error={errors[fields.complement]}
          placeholder="Apto., bloco..."
          autoComplete="address-line2"
          onChange={(value) => update(fields.complement, value)}
        />
      </div>
    </fieldset>
  );
}

export function CadastroForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "success">("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [sameAddress, setSameAddress] = useState(false);
  const [cepLookup, setCepLookup] = useState<Record<"patient" | "responsible", CepLookupState>>({
    patient: { status: "idle" },
    responsible: { status: "idle" },
  });
  const cepRequests = useRef<Record<"patient" | "responsible", AbortController | null>>({
    patient: null,
    responsible: null,
  });

  const patientAge = calculateAge(values.patientBirthDate);
  const isMinor = patientAge !== null && patientAge < 18;
  const isAdult = patientAge !== null && patientAge >= 18;
  const showResponsible = isMinor || values.hasResponsible;

  function update(field: FieldName, value: string | boolean) {
    const linkedAddressFields: Partial<Record<FieldName, FieldName>> = {
      patientAddressNumber: "responsibleAddressNumber",
      patientComplement: "responsibleComplement",
    };
    setValues((current) => {
      const next = { ...current, [field]: value };
      const linkedField = linkedAddressFields[field];
      if (sameAddress && linkedField && typeof value === "string") {
        next[linkedField] = value as never;
      }
      return next;
    });
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function setFieldValidation(field: FieldName, message?: string) {
    setErrors((current) => ({ ...current, [field]: message }));
  }

  function nameFieldError(field: "patientName" | "responsibleName", value: string) {
    if (!isValidFullName(value)) {
      return field === "patientName"
        ? "Informe o nome completo do paciente."
        : "Informe o nome completo do responsável.";
    }
    if (
      field === "responsibleName" &&
      normalizedNameForComparison(values.patientName) === normalizedNameForComparison(value)
    ) {
      return "O nome do responsável deve ser diferente do nome do paciente.";
    }
    return undefined;
  }

  function validateNameField(field: "patientName" | "responsibleName") {
    setFieldValidation(field, nameFieldError(field, values[field]));
  }

  function updateCpf(field: "patientCpf" | "responsibleCpf", value: string) {
    const formatted = formatCpf(value);
    update(field, formatted);
    if (onlyDigits(formatted).length === 11) {
      setFieldValidation(field, isValidCpf(formatted) ? undefined : "Este CPF não é válido. Confira os números.");
    }
  }

  function updateWhatsapp(field: "patientPhone" | "responsiblePhone", value: string) {
    const formatted = formatPhone(value);
    update(field, formatted);
    if (onlyDigits(formatted).length === 11) {
      setFieldValidation(
        field,
        isValidWhatsapp(formatted) ? undefined : "Informe um WhatsApp válido com DDD.",
      );
    }
  }

  function validateContactField(
    field:
      | "patientCpf"
      | "responsibleCpf"
      | "patientPhone"
      | "responsiblePhone"
      | "patientEmail"
      | "responsibleEmail",
  ) {
    const value = values[field];
    if (field.endsWith("Cpf")) {
      setFieldValidation(field, isValidCpf(value) ? undefined : "Este CPF não é válido. Confira os números.");
      return;
    }
    if (field.endsWith("Phone")) {
      setFieldValidation(field, isValidWhatsapp(value) ? undefined : "Informe um WhatsApp válido com DDD.");
      return;
    }
    setFieldValidation(field, isValidEmail(value) ? undefined : "Confira se o e-mail foi digitado corretamente.");
  }

  async function updatePostalCode(prefix: "patient" | "responsible", value: string) {
    const formattedCep = formatCep(value);
    const digits = onlyDigits(formattedCep);
    const fields = {
      postalCode: `${prefix}PostalCode` as FieldName,
      address: `${prefix}Address` as FieldName,
      number: `${prefix}AddressNumber` as FieldName,
      complement: `${prefix}Complement` as FieldName,
      province: `${prefix}Province` as FieldName,
      city: `${prefix}City` as FieldName,
      state: `${prefix}State` as FieldName,
    };

    cepRequests.current[prefix]?.abort();
    if (prefix === "responsible") setSameAddress(false);

    setValues((current) => {
      const next = {
        ...current,
        [fields.postalCode]: formattedCep,
        [fields.address]: "",
        [fields.number]: "",
        [fields.complement]: "",
        [fields.province]: "",
        [fields.city]: "",
        [fields.state]: "",
      };

      if (prefix === "patient" && sameAddress) {
        next.responsiblePostalCode = formattedCep;
        next.responsibleAddress = "";
        next.responsibleAddressNumber = "";
        next.responsibleComplement = "";
        next.responsibleProvince = "";
        next.responsibleCity = "";
        next.responsibleState = "";
      }
      return next;
    });

    setErrors((current) => ({
      ...current,
      [fields.postalCode]: undefined,
      [fields.address]: undefined,
      [fields.number]: undefined,
      [fields.province]: undefined,
      [fields.city]: undefined,
      [fields.state]: undefined,
    }));

    if (digits.length < 8) {
      setCepLookup((current) => ({
        ...current,
        [prefix]: { status: "idle" },
        ...(prefix === "patient" && sameAddress
          ? { responsible: { status: "idle" as const } }
          : {}),
      }));
      return;
    }

    const controller = new AbortController();
    cepRequests.current[prefix] = controller;
    setCepLookup((current) => ({ ...current, [prefix]: { status: "loading" } }));

    try {
      const response = await fetch(`/api/cep?cep=${digits}`, { signal: controller.signal });
      const result = (await response.json()) as {
        address?: string;
        province?: string;
        city?: string;
        state?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(result.message || "CEP não encontrado.");

      setValues((current) => {
        const next = {
          ...current,
          [fields.address]: result.address || "",
          [fields.province]: result.province || "",
          [fields.city]: result.city || "",
          [fields.state]: result.state || "",
        };
        if (prefix === "patient" && sameAddress) {
          next.responsiblePostalCode = formattedCep;
          next.responsibleAddress = result.address || "";
          next.responsibleProvince = result.province || "";
          next.responsibleCity = result.city || "";
          next.responsibleState = result.state || "";
        }
        return next;
      });
      setCepLookup((current) => ({
        ...current,
        [prefix]: { status: "success" },
        ...(prefix === "patient" && sameAddress
          ? { responsible: { status: "success" as const } }
          : {}),
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setCepLookup((current) => ({
        ...current,
        [prefix]: {
          status: "error",
          message: error instanceof Error ? error.message : "Não foi possível consultar o CEP.",
        },
      }));
    }
  }

  function copyPatientAddress(checked: boolean) {
    setSameAddress(checked);
    if (!checked) return;

    setValues((current) => ({
      ...current,
      responsiblePostalCode: current.patientPostalCode,
      responsibleAddress: current.patientAddress,
      responsibleAddressNumber: current.patientAddressNumber,
      responsibleComplement: current.patientComplement,
      responsibleProvince: current.patientProvince,
      responsibleCity: current.patientCity,
      responsibleState: current.patientState,
    }));
    setCepLookup((current) => ({ ...current, responsible: current.patient }));
    setErrors((current) => ({
      ...current,
      responsiblePostalCode: undefined,
      responsibleAddress: undefined,
      responsibleAddressNumber: undefined,
      responsibleComplement: undefined,
      responsibleProvince: undefined,
      responsibleCity: undefined,
      responsibleState: undefined,
    }));
  }

  function updateBirthDate(value: string) {
    const age = calculateAge(value);
    if (age !== null && age < 18) setSameAddress(false);
    setValues((current) => ({
      ...current,
      patientBirthDate: value,
      hasResponsible: age === null ? current.hasResponsible : age < 18,
      ...(age !== null && age >= 18
        ? {
            serviceType: isAdultServiceType(current.serviceType) ? current.serviceType : "",
            entryType: "",
            attendanceMode: isAdultServiceType(current.serviceType) ? current.attendanceMode : "",
          }
        : age !== null && age < 18
          ? {
              serviceType: isChildServiceType(current.serviceType) ? current.serviceType : "",
              entryType: isEntryType(current.entryType) ? current.entryType : "",
              attendanceMode: "",
            }
          : {}),
    }));
    if (age !== null) {
      setErrors((current) => ({
        ...current,
        serviceType: undefined,
        entryType: undefined,
        attendanceMode: undefined,
      }));
    }
    setFieldValidation("patientBirthDate", birthDateError("patientBirthDate", value));
  }

  function updateResponsibleBirthDate(value: string) {
    update("responsibleBirthDate", value);
    setFieldValidation("responsibleBirthDate", birthDateError("responsibleBirthDate", value));
  }

  function validateBirthDateField(field: BirthDateField) {
    setFieldValidation(field, birthDateError(field, values[field]));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        if (!nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      document.querySelector<HTMLElement>(`[name="${parsed.error.issues[0]?.path[0]}"]`)?.focus();
      return;
    }

    if (!turnstileToken) {
      setSubmitError("Confirme a verificação de segurança antes de enviar.");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, turnstileToken }),
      });
      const responseBody = await response.text();
      let result: { message?: string } = {};
      if (responseBody) {
        try {
          result = JSON.parse(responseBody) as { message?: string };
        } catch {
          throw new Error(
            "Não conseguimos confirmar a resposta do servidor. O cadastro pode já ter sido recebido; aguarde alguns instantes antes de tentar novamente.",
          );
        }
      }
      if (!response.ok) throw new Error(result.message || "Não foi possível concluir o cadastro.");
      setSubmitSuccessMessage(result.message || "");
      setStatus("success");
    } catch (error) {
      setStatus("idle");
      setTurnstileToken("");
      setTurnstileResetKey((current) => current + 1);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Não conseguimos enviar o cadastro agora. Tente novamente em instantes.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-[#c9ddc0] bg-[#f4f8f1] px-4 py-8 text-center sm:px-10 sm:py-12">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-secondary-foreground text-white shadow-[0_10px_30px_rgba(0,80,0,0.16)]">
          <Check className="size-7" strokeWidth={2.4} aria-hidden="true" />
        </div>
        <h3 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">Tudo certo!</h3>
        <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-muted-foreground">
          {submitSuccessMessage ||
            "Recebemos seu cadastro. A equipe da Conexão Seres dará continuidade ao seu atendimento."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-7 h-11 w-full rounded-md border-primary/30 bg-white px-5 text-[#b35f00] hover:bg-accent sm:w-auto"
          onClick={() => {
            setValues(initialValues);
            setErrors({});
            setSameAddress(false);
            setCepLookup({ patient: { status: "idle" }, responsible: { status: "idle" } });
            setTurnstileToken("");
            setTurnstileResetKey((current) => current + 1);
            setSubmitSuccessMessage("");
            setStatus("idle");
          }}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Preencher um novo cadastro
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit} noValidate>
      <section className="space-y-6" aria-labelledby="patient-heading">
        <div className="flex items-start gap-3 border-b border-[#e1e1e1] pb-4">
          <span className="grid size-9 place-items-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="patient-heading" className="text-base font-semibold tracking-[-0.02em] text-secondary-foreground sm:text-lg">
              Quem receberá o atendimento?
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">Comece pelos dados da pessoa que será atendida.</p>
          </div>
        </div>

        <InputField
          field="patientName"
          label="Nome completo"
          value={values.patientName}
          error={errors.patientName}
          placeholder="Digite o nome completo"
          autoComplete="name"
          onChange={(value) => update("patientName", value)}
          onBlur={() => validateNameField("patientName")}
        />

        <fieldset className="space-y-3" aria-labelledby="patient-sex-label">
          <legend id="patient-sex-label" className="text-sm font-medium text-foreground">
            Sexo do paciente
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: "female", label: "Feminino" },
              { value: "male", label: "Masculino" },
            ].map((option) => (
              <label
                key={option.value}
                className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-[#d4d4d4] bg-white px-4 text-base has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20"
              >
                <input
                  type="radio"
                  name="patientSex"
                  value={option.value}
                  checked={values.patientSex === option.value}
                  onChange={(event) => update("patientSex", event.target.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError message={errors.patientSex} />
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <InputField
            field="patientBirthDate"
            label="Data de nascimento"
            value={values.patientBirthDate}
            error={errors.patientBirthDate}
            type="date"
            autoComplete="bday"
            onChange={updateBirthDate}
            onBlur={() => validateBirthDateField("patientBirthDate")}
          />
          <InputField
            field="patientCpf"
            label="CPF"
            value={values.patientCpf}
            error={errors.patientCpf}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            onChange={(value) => updateCpf("patientCpf", value)}
            onBlur={() => validateContactField("patientCpf")}
          />
        </div>

        {isAdult ? (
          <>
            <div className="grid gap-6 sm:grid-cols-2">
              <InputField
                field="patientPhone"
                label="WhatsApp"
                value={values.patientPhone}
                error={errors.patientPhone}
                placeholder="(00) 00000-0000"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={15}
                helperText="Use um número de WhatsApp válido. As faturas e notificações serão enviadas para ele."
                onChange={(value) => updateWhatsapp("patientPhone", value)}
                onBlur={() => validateContactField("patientPhone")}
              />
              <InputField
                field="patientEmail"
                label="E-mail"
                value={values.patientEmail}
                error={errors.patientEmail}
                placeholder="seuemail@exemplo.com"
                type="email"
                autoComplete="email"
                maxLength={150}
                onChange={(value) => update("patientEmail", value)}
                onBlur={() => validateContactField("patientEmail")}
              />
            </div>
            <AddressFields
              prefix="patient"
              values={values}
              errors={errors}
              lookupState={cepLookup.patient}
              update={(field, value) => update(field, value)}
              onPostalCodeChange={updatePostalCode}
            />
          </>
        ) : null}

        {isMinor ? (
          <div className="rounded-md border border-[#c9ddc0] bg-[#f3f8f0] px-4 py-3 text-sm leading-6 text-[#315f31]">
            Como a pessoa atendida tem menos de 18 anos, precisaremos também dos dados de um responsável.
          </div>
        ) : null}
      </section>

      {isAdult ? (
        <div className="rounded-md border border-[#dedede] bg-white p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="hasResponsible"
              name="hasResponsible"
              className="mt-0.5 size-5 shrink-0 rounded-sm border-[#bdbdbd] data-[state=checked]:border-primary data-[state=checked]:bg-primary"
              checked={values.hasResponsible}
              onCheckedChange={(checked) => {
                const enabled = checked === true;
                update("hasResponsible", enabled);
                if (!enabled) setSameAddress(false);
              }}
            />
            <Label htmlFor="hasResponsible" className="min-w-0 cursor-pointer text-sm font-normal leading-6">
              Quero adicionar um responsável legal ou financeiro
            </Label>
          </div>
        </div>
      ) : null}

      {showResponsible ? (
        <section className="space-y-6 rounded-lg border border-[#dedede] bg-white p-4 shadow-[0_12px_30px_rgba(65,56,30,0.05)] sm:p-7" aria-labelledby="responsible-heading">
          <div className="border-b border-[#e1e1e1] pb-4">
            <h3 id="responsible-heading" className="text-base font-semibold tracking-[-0.02em] text-secondary-foreground sm:text-lg">
              Dados do responsável
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Conte-nos quem será o responsável legal ou financeiro.</p>
          </div>

          <InputField
            field="responsibleName"
            label="Nome completo"
            value={values.responsibleName}
            error={errors.responsibleName}
            placeholder="Digite o nome completo"
            autoComplete="name"
            onChange={(value) => update("responsibleName", value)}
            onBlur={() => validateNameField("responsibleName")}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <InputField
              field="responsibleCpf"
              label="CPF"
              value={values.responsibleCpf}
              error={errors.responsibleCpf}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
              onChange={(value) => updateCpf("responsibleCpf", value)}
              onBlur={() => validateContactField("responsibleCpf")}
            />
            <InputField
              field="responsibleBirthDate"
              label="Data de nascimento"
              value={values.responsibleBirthDate}
              error={errors.responsibleBirthDate}
              type="date"
              autoComplete="bday"
              onChange={updateResponsibleBirthDate}
              onBlur={() => validateBirthDateField("responsibleBirthDate")}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <InputField
              field="responsiblePhone"
              label="WhatsApp"
              value={values.responsiblePhone}
              error={errors.responsiblePhone}
              placeholder="(00) 00000-0000"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={15}
              helperText="Use um número de WhatsApp válido. As faturas e notificações serão enviadas para ele."
              onChange={(value) => updateWhatsapp("responsiblePhone", value)}
              onBlur={() => validateContactField("responsiblePhone")}
            />
            <InputField
              field="responsibleEmail"
              label="E-mail"
              value={values.responsibleEmail}
              error={errors.responsibleEmail}
              placeholder="seuemail@exemplo.com"
              type="email"
              autoComplete="email"
              maxLength={150}
              onChange={(value) => update("responsibleEmail", value)}
              onBlur={() => validateContactField("responsibleEmail")}
            />
          </div>

          <AddressFields
            prefix="responsible"
            values={values}
            errors={errors}
            lookupState={cepLookup.responsible}
            update={(field, value) => update(field, value)}
            onPostalCodeChange={updatePostalCode}
            copyFromPatient={
              isAdult
                ? {
                    checked: sameAddress,
                    disabled:
                      cepLookup.patient.status !== "success" ||
                      values.patientAddressNumber.trim().length === 0,
                    onCheckedChange: copyPatientAddress,
                  }
                : undefined
            }
          />
        </section>
      ) : null}

      {isAdult || isMinor ? (
        <section
          className="space-y-7 rounded-lg border border-[#dedede] bg-white p-4 shadow-[0_12px_30px_rgba(65,56,30,0.05)] sm:p-7"
          aria-labelledby="attendance-heading"
        >
          <div className="border-b border-[#e1e1e1] pb-4">
            <h3 id="attendance-heading" className="text-base font-semibold tracking-[-0.02em] text-secondary-foreground sm:text-lg">
              Sobre o atendimento
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Agora, conte qual tipo de atendimento foi combinado com a Conexão Seres.
            </p>
          </div>

          <fieldset className="space-y-3" aria-labelledby="service-type-label">
            <legend id="service-type-label" className="text-sm font-medium text-foreground">
              Qual tipo de atendimento foi combinado com a Conexão Seres?
            </legend>
            <div className="grid gap-3">
              {(isAdult ? ADULT_SERVICE_TYPES : CHILD_SERVICE_TYPES).map((option) => (
                <label
                  key={option}
                  className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-[#d4d4d4] bg-white px-4 py-3 text-base leading-6 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20"
                >
                  <input
                    type="radio"
                    name="serviceType"
                    value={option}
                    checked={values.serviceType === option}
                    onChange={(event) => update("serviceType", event.target.value)}
                  />
                  <span>{SERVICE_TYPE_LABELS[option]}</span>
                </label>
              ))}
            </div>
            <FieldError message={errors.serviceType} />
          </fieldset>

          {isMinor ? (
            <fieldset className="space-y-3" aria-labelledby="entry-type-label">
              <legend id="entry-type-label" className="text-sm font-medium text-foreground">
                Qual forma de início do acompanhamento foi combinada com a Conexão Seres?
              </legend>
              <div className="grid gap-3">
                {ENTRY_TYPES.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-[#d4d4d4] bg-white px-4 py-3 text-base leading-6 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20"
                  >
                    <input
                      type="radio"
                      name="entryType"
                      value={option}
                      checked={values.entryType === option}
                      onChange={(event) => update("entryType", event.target.value)}
                    />
                    <span>{ENTRY_TYPE_LABELS[option]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Se ainda não foi definido, não se preocupe. Essa informação poderá ser definida posteriormente junto à profissional.
              </p>
              <FieldError message={errors.entryType} />
            </fieldset>
          ) : null}

          {isAdult ? (
            <fieldset className="space-y-3" aria-labelledby="attendance-mode-label">
              <legend id="attendance-mode-label" className="text-sm font-medium text-foreground">
                Qual modalidade de atendimento foi combinada?
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {ATTENDANCE_MODES.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-[#d4d4d4] bg-white px-4 py-3 text-base leading-6 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/20"
                  >
                    <input
                      type="radio"
                      name="attendanceMode"
                      value={option}
                      checked={values.attendanceMode === option}
                      onChange={(event) => update("attendanceMode", event.target.value)}
                    />
                    <span>{ATTENDANCE_MODE_LABELS[option]}</span>
                  </label>
                ))}
              </div>
              {values.attendanceMode === "ONLINE" ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  A continuidade do atendimento online dependerá da avaliação profissional. A realização da primeira sessão online não garante que todo o acompanhamento subsequente permanecerá nessa modalidade.
                </p>
              ) : null}
              <FieldError message={errors.attendanceMode} />
            </fieldset>
          ) : null}
        </section>
      ) : null}

      <div className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <Label htmlFor="website">Não preencha este campo</Label>
        <Input
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(event) => update("website", event.target.value)}
        />
      </div>

      <div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="consent"
            name="consent"
            className="mt-0.5 size-5 shrink-0 rounded-sm border-[#bdbdbd] data-[state=checked]:border-primary data-[state=checked]:bg-primary"
            checked={values.consent}
            onCheckedChange={(checked) => update("consent", checked === true)}
            aria-invalid={Boolean(errors.consent)}
          />
          <Label htmlFor="consent" className="min-w-0 cursor-pointer text-sm font-normal leading-6 text-muted-foreground">
            Autorizo a Conexão Seres a usar estas informações para realizar o cadastro, organizar o atendimento e enviar as comunicações necessárias.
          </Label>
        </div>
        <FieldError message={errors.consent} />
      </div>

      <TurnstileWidget
        resetKey={turnstileResetKey}
        onTokenChange={(token) => {
          setTurnstileToken(token);
          if (token) setSubmitError("");
        }}
      />

      {submitError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700" role="alert">
          {submitError}
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-13 w-full rounded-md bg-primary text-base font-semibold shadow-[0_10px_24px_rgba(255,138,0,0.2)] hover:bg-[#e87d00] sm:w-auto sm:min-w-52"
        disabled={status === "sending" || !turnstileToken}
      >
        {status === "sending" ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Enviando...
          </>
        ) : (
          "Enviar cadastro"
        )}
      </Button>

      <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
        Suas informações são protegidas e usadas somente para o seu atendimento.
      </p>
    </form>
  );
}
