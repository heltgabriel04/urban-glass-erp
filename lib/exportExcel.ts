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

export interface AbaExcelRelatorio {
  /** Nome da aba (máx. 31 caracteres, limite do Excel). */
  nome: string;
  titulo: string;
  subtitulo?: string;
  cabecalho: string[];
  linhas: (string | number)[][];
  /** Linha de total exibida ao final da aba (mesma largura do cabeçalho). */
  totalLinha?: (string | number)[];
}

// Variante "de entrega" do export acima — usada em relatórios que vão pro
// dono/diretoria: cabeçalho com nome da empresa + data de emissão, várias
// abas num único arquivo, e linha de total. O export simples (exportarExcel)
// continua existindo pras telas operacionais que só precisam de um dump cru.
export async function exportarExcelRelatorio(nomeArquivo: string, abas: AbaExcelRelatorio[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const emissao = new Date().toLocaleDateString("pt-BR");
  for (const aba of abas) {
    const aoa: (string | number)[][] = [
      ["Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05"],
      [aba.subtitulo ? `${aba.titulo} — ${aba.subtitulo}` : aba.titulo],
      [`Emitido em ${emissao}`],
      [],
      aba.cabecalho,
      ...aba.linhas,
      ...(aba.totalLinha ? [aba.totalLinha] : []),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aba.cabecalho.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  }
  const dataSlug = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${nomeArquivo}_${dataSlug}.xlsx`);
}
