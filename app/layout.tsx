import type { Metadata } from "next";
// @ts-ignore: CSS module side-effect import type declaration is not available in this project setup
import "./globals.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { PromptProvider } from "@/components/ui/prompt";

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
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('ug-theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();` }} />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js');});}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Syne:wght@700;800;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="theme-color" content="#0d0d14" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="UrbanGlass" />
      </head>
      <body className="h-full" lang="pt-BR">
        {/* Providers moram aqui, não em AppLayout — cada página renderiza
            AppLayout dentro do próprio return, então um useConfirm()/useToast()
            chamado no topo da página nunca enxergaria um Provider que a
            página mesma cria como filho dela (Context só resolve ancestrais
            reais). Aqui em cima, toda página é de fato descendente. */}
        <ThemeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <PromptProvider>
                {children}
              </PromptProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}