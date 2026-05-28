import type { Metadata } from "next";
// @ts-ignore: CSS import handled by Next.js
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
      <body className="h-full">{children}</body>
    </html>
  );
}