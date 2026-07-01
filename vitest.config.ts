import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Alguns services importam o client do Supabase no topo do módulo, que lança
// se as env vars não estiverem setadas — carrega .env.local (se existir) pra
// esses módulos poderem ser importados em teste. Ausência do arquivo (ex.: CI)
// não deve quebrar a suíte inteira.
try { process.loadEnvFile(resolve(__dirname, ".env.local")); } catch {}

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
});
