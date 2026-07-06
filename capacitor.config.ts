import type { CapacitorConfig } from "@capacitor/cli";

// O app não empacota o Next.js localmente — carrega o site já publicado
// (SSR, middleware de auth e API routes continuam rodando no Vercel).
// webDir é só um requisito do CLI, nunca é servido em runtime.
const config: CapacitorConfig = {
  appId: "com.urbanglass.erp",
  appName: "Urban Glass ERP",
  webDir: "www",
  server: {
    url: "https://urbanglasserp.vercel.app",
    androidScheme: "https",
  },
};

export default config;
