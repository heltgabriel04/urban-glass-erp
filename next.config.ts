import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "pdf-parse", "@napi-rs/canvas"],
  // serverExternalPackages tira o pacote do bundle do webpack, mas não
  // garante que TODO arquivo do pacote seja copiado pro deploy da Vercel —
  // o worker do pdfjs (carregado via caminho resolvido em runtime, não um
  // import estático) ficava de fora do rastreamento automático de arquivos,
  // causando "Cannot find module '.../pdf.worker.mjs'" em produção mesmo
  // com o caminho apontado corretamente em lib/importPdfRelacaoVidros.ts.
  outputFileTracingIncludes: {
    "/api/pedidos/importar-medidas-pdf": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/orcamentos/import-pdf": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
