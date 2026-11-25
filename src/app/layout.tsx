import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SGPE — Gestão para pequenas empresas", template: "%s · SGPE" },
  description: "Sistema de Gerenciamento Web para Pequenas Empresas: controle de estoque, vendas, precificação e relatórios.",
  applicationName: "SGPE",
};

export const viewport: Viewport = {
  themeColor: "#0B2545",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
