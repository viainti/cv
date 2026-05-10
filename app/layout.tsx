import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV Apply",
  description: "Carga tu CV, extrae el texto y prepara tu perfil para analizar jobs y autoaplicar.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">{children}</body>
    </html>
  );
}
