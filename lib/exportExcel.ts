// Exportação genérica de planilha .xlsx — mesma lib `xlsx` já usada em
// app/investimentos/page.tsx (handleExcel), reaproveitada aqui em vez de
// reimplementada por tela. Import dinâmico (mesmo princípio de
// lib/importPlanilhaMedidas.ts) pra não inflar o bundle de toda tela que
// só às vezes exporta.
export async function exportarExcel(nomeArquivo: string, cabecalho: string[], linhas: (string | number)[][]): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
  ws["!cols"] = cabecalho.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  const dataSlug = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${nomeArquivo}_${dataSlug}.xlsx`);
}
