import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LIMIAR — Ecos do Obelisco",
  description: "Atravesse a névoa, sozinho ou em equipe.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
