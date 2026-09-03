import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cadastro de Paciente | Conexão Seres",
  description: "Formulário seguro para cadastro de pacientes da Conexão Seres.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
