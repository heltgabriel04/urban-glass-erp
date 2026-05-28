import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urban Glass · ERP Industrial v3",
  description: "Sistema ERP para gestão de vidros laminados",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full" lang="pt-BR">{children}</body>
    </html>
  );
}