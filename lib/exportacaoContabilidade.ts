import type JSZip from "jszip";
import { supabase } from "@/lib/supabase/client";
import { getOrCreateFechamento } from "@/services/contabilidadeChecklist.service";
import { getChecklistItemDef } from "@/lib/contabilidadeChecklist";
import { getDocumentosFiscais } from "@/services/contabilidadeDocumentos.service";
import { getResumoNotasSaida } from "@/services/contabilidadeDashboard.service";
import { getInventarioAtual, getCMVPeriodo } from "@/services/contabilidadeEstoqueCmv.service";
import { getAtivosImobilizados } from "@/services/ativosImobilizados.service";
import { calcularDepreciacao } from "@/lib/depreciacao";
import { labelCategoriaAtivo } from "@/lib/ativosImobilizadosConstants";
import { getFaturas, getLancamentosFatura } from "@/services/cartoes.service";
import type { EmprestimoParcela, ConsorcioParcela, ConsorcioLance } from "@/types";

interface ParcelaEmprestimoComNome extends EmprestimoParcela {
  emprestimos: { descricao: string } | null;
}
interface ParcelaConsorcioComNome extends ConsorcioParcela {
  consorcios: { descricao: string } | null;
}
interface LanceConsorcioComNome extends ConsorcioLance {
  consorcios: { descricao: string } | null;
}

async function construirPlanilha(cabecalho: string[], linhas: (string | number)[][]): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas]);
  ws["!cols"] = cabecalho.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

async function anexarArquivo(zip: JSZip, path: string, url: string | null | undefined, falhas: string[]): Promise<void> {
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    zip.file(path, await res.blob());
  } catch {
    falhas.push(path);
  }
}

function baixarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportarPacoteMensal(ano: number, mes: number): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const { default: JSZipCtor } = await import("jszip");
    const zip = new JSZipCtor();
    const falhas: string[] = [];

    const mesStr = String(mes).padStart(2, "0");
    const primeiroDia = `${ano}-${mesStr}-01`;
    const ultimoDia = new Date(ano, mes, 0).toISOString().split("T")[0];

    // ── 00-Fechamento ──────────────────────────────────────────
    const { fechamento, itens } = await getOrCreateFechamento(ano, mes);

    // ── 01-Documentos Fiscais ──────────────────────────────────
    const docs = await getDocumentosFiscais({ competenciaAno: ano, competenciaMes: mes });
    const bufDocs = await construirPlanilha(
      ["Tipo", "Entrada/Saída", "Nº Documento", "Série", "Fornecedor", "Valor Total", "NCM", "CFOP", "CST", "Status"],
      docs.map((d) => [d.tipo, d.entrada ? "entrada" : "saída", d.numero_documento ?? "", d.serie ?? "", d.fornecedores?.nome ?? "", Number(d.valor_total ?? 0), d.ncm ?? "", d.cfop ?? "", d.cst ?? "", d.status])
    );
    zip.file("01-Documentos-Fiscais/resumo.xlsx", bufDocs);

    const resumoNotasSaida = await getResumoNotasSaida(ano, mes);
    const bufNfSaida = await construirPlanilha(
      ["Número", "Emissão", "CFOP", "Valor Total"],
      resumoNotasSaida.notas.map((n) => [n.numero ?? "", n.dt_emissao, n.cfop, Number(n.valor_total)])
    );
    zip.file("01-Documentos-Fiscais/resumo-nf-saida.xlsx", bufNfSaida);

    for (const d of docs) {
      const pasta = `01-Documentos-Fiscais/anexos/${d.tipo}`;
      const base = d.numero_documento ?? String(d.id);
      await anexarArquivo(zip, `${pasta}/${base}.xml`, d.xml_url, falhas);
      await anexarArquivo(zip, `${pasta}/${base}.pdf`, d.pdf_url, falhas);
    }

    // ── 02-Estoque / CMV ────────────────────────────────────────
    const inventario = await getInventarioAtual();
    const bufInventario = await construirPlanilha(
      ["Código", "Descrição", "Grupo", "Unidade", "Saldo", "Custo Médio", "Valor Total"],
      inventario.map((i) => [i.codigo, i.descricao, i.grupo, i.unidade, i.saldo_qtd, i.custo_medio, i.valor_total])
    );
    zip.file("02-Estoque-CMV/inventario.xlsx", bufInventario);

    const cmv = await getCMVPeriodo(primeiroDia, ultimoDia);
    const bufCmv = await construirPlanilha(
      ["Início", "Fim", "CMV Vidro", "Estoque Inicial (Gerais)", "Compras (Gerais)", "Estoque Final (Gerais)", "CMV Gerais", "CMV Total", "Receita", "Lucro Bruto", "Margem Bruta %"],
      [[cmv.inicio, cmv.fim, cmv.vidro.cmv, cmv.itensGerais.estoqueInicial, cmv.itensGerais.compras, cmv.itensGerais.estoqueFinal, cmv.itensGerais.cmv, cmv.cmvTotal, cmv.receita, cmv.lucroBruto, cmv.margemBrutaPct]]
    );
    zip.file("02-Estoque-CMV/cmv-periodo.xlsx", bufCmv);

    // ── 03-Ativo Imobilizado ────────────────────────────────────
    const ativos = await getAtivosImobilizados({ ativo: true });
    const dataReferencia = new Date(ultimoDia);
    const bufAtivos = await construirPlanilha(
      ["Patrimônio", "Descrição", "Categoria", "Valor Aquisição", "Data Aquisição", "Depreciação Acumulada", "Valor Contábil Atual"],
      ativos.map((a) => {
        const dep = calcularDepreciacao(a, dataReferencia);
        return [a.numero_patrimonio, a.descricao, labelCategoriaAtivo(a.categoria), a.valor_aquisicao, a.data_aquisicao, dep.depreciacaoAcumulada, dep.valorContabilAtual];
      })
    );
    zip.file("03-Ativo-Imobilizado/resumo.xlsx", bufAtivos);

    const ativosDoMes = ativos.filter((a) => a.data_aquisicao >= primeiroDia && a.data_aquisicao <= ultimoDia);
    for (const a of ativosDoMes) {
      const pasta = `03-Ativo-Imobilizado/anexos/${a.numero_patrimonio}`;
      await anexarArquivo(zip, `${pasta}/xml.xml`, a.xml_url, falhas);
      await anexarArquivo(zip, `${pasta}/nota.pdf`, a.pdf_url, falhas);
      await anexarArquivo(zip, `${pasta}/manual.pdf`, a.manual_url, falhas);
      for (const [idx, foto] of (a.fotos_urls ?? []).entries()) {
        await anexarArquivo(zip, `${pasta}/foto_${idx + 1}.jpg`, foto, falhas);
      }
    }

    // ── 04-Cartões / Empréstimos / Consórcios ───────────────────
    const faturas = await getFaturas({ competenciaAno: ano, competenciaMes: mes });
    const linhasCartoes: (string | number)[][] = [];
    for (const f of faturas) {
      const lancamentos = await getLancamentosFatura(f.id);
      for (const l of lancamentos) linhasCartoes.push([f.cartoes?.nome ?? "", `${mesStr}/${ano}`, l.data, l.descricao, l.fornecedores?.nome ?? "", Number(l.valor)]);
      await anexarArquivo(zip, `04-Cartoes-Emprestimos-Consorcios/cartoes/anexos/fatura_${f.id}.pdf`, f.pdf_url, falhas);
      await anexarArquivo(zip, `04-Cartoes-Emprestimos-Consorcios/cartoes/anexos/fatura_${f.id}_comprovante.pdf`, f.comprovante_pagamento_url, falhas);
      for (const l of lancamentos) await anexarArquivo(zip, `04-Cartoes-Emprestimos-Consorcios/cartoes/anexos/lancamento_${l.id}.pdf`, l.comprovante_url, falhas);
    }
    const bufCartoes = await construirPlanilha(["Cartão", "Competência", "Data", "Descrição", "Fornecedor", "Valor"], linhasCartoes);
    zip.file("04-Cartoes-Emprestimos-Consorcios/cartoes/resumo.xlsx", bufCartoes);

    const { data: parcelasEmpData } = await supabase
      .from("emprestimos_parcelas").select("*, emprestimos ( descricao )")
      .gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).order("vencimento");
    const parcelasEmp = (parcelasEmpData ?? []) as ParcelaEmprestimoComNome[];
    const bufEmp = await construirPlanilha(
      ["Empréstimo", "Parcela", "Vencimento", "Valor Parcela", "Juros", "Amortização", "Status"],
      parcelasEmp.map((p) => [p.emprestimos?.descricao ?? "", p.numero_parcela, p.vencimento, p.valor_parcela, p.valor_juros, p.valor_amortizacao, p.status])
    );
    zip.file("04-Cartoes-Emprestimos-Consorcios/emprestimos/resumo.xlsx", bufEmp);
    for (const p of parcelasEmp) await anexarArquivo(zip, `04-Cartoes-Emprestimos-Consorcios/emprestimos/anexos/parcela_${p.id}.pdf`, p.comprovante_url, falhas);

    const { data: parcelasConsData } = await supabase
      .from("consorcios_parcelas").select("*, consorcios ( descricao )")
      .gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).order("vencimento");
    const parcelasCons = (parcelasConsData ?? []) as ParcelaConsorcioComNome[];
    const bufConsParcelas = await construirPlanilha(
      ["Consórcio", "Parcela", "Vencimento", "Valor", "Status"],
      parcelasCons.map((p) => [p.consorcios?.descricao ?? "", p.numero_parcela, p.vencimento, p.valor, p.status])
    );
    zip.file("04-Cartoes-Emprestimos-Consorcios/consorcios/resumo-parcelas.xlsx", bufConsParcelas);
    for (const p of parcelasCons) await anexarArquivo(zip, `04-Cartoes-Emprestimos-Consorcios/consorcios/anexos/parcela_${p.id}.pdf`, p.comprovante_url, falhas);

    const { data: lancesConsData } = await supabase
      .from("consorcios_lances").select("*, consorcios ( descricao )")
      .gte("data", primeiroDia).lte("data", ultimoDia).order("data");
    const lancesCons = (lancesConsData ?? []) as LanceConsorcioComNome[];
    const bufConsLances = await construirPlanilha(
      ["Consórcio", "Data", "Valor", "Tipo", "Resultado"],
      lancesCons.map((l) => [l.consorcios?.descricao ?? "", l.data, l.valor, l.tipo, l.resultado])
    );
    zip.file("04-Cartoes-Emprestimos-Consorcios/consorcios/resumo-lances.xlsx", bufConsLances);

    // ── 05-Financeiro ───────────────────────────────────────────
    const { data: contasPagarData } = await supabase
      .from("lancamentos").select("descricao, valor, vencimento, status, fornecedor")
      .eq("tipo", "Saída").gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).is("deletado_em", null)
      .order("vencimento");
    const bufContasPagar = await construirPlanilha(
      ["Descrição", "Fornecedor", "Vencimento", "Valor", "Status"],
      (contasPagarData ?? []).map((l: any) => [l.descricao, l.fornecedor ?? "", l.vencimento, Number(l.valor), l.status])
    );
    zip.file("05-Financeiro/contas-a-pagar.xlsx", bufContasPagar);

    const { data: contasReceberData } = await supabase
      .from("lancamentos").select("descricao, valor, vencimento, status, cliente_id, clientes(nome)")
      .eq("tipo", "Entrada").gte("vencimento", primeiroDia).lte("vencimento", ultimoDia).is("deletado_em", null)
      .order("vencimento");
    const bufContasReceber = await construirPlanilha(
      ["Descrição", "Cliente", "Vencimento", "Valor", "Status"],
      (contasReceberData ?? []).map((l: any) => [l.descricao, l.clientes?.nome ?? "", l.vencimento, Number(l.valor), l.status])
    );
    zip.file("05-Financeiro/contas-a-receber.xlsx", bufContasReceber);

    const { data: baixasData } = await supabase
      .from("baixas_lancamento").select("data, valor, lancamentos(descricao, tipo)")
      .gte("data", primeiroDia).lte("data", ultimoDia).is("estornado_em", null)
      .order("data");
    const bufBaixas = await construirPlanilha(
      ["Data", "Descrição", "Tipo", "Valor"],
      (baixasData ?? []).map((b: any) => [b.data, b.lancamentos?.descricao ?? "", b.lancamentos?.tipo ?? "", Number(b.valor)])
    );
    zip.file("05-Financeiro/extrato-baixas.xlsx", bufBaixas);

    const { data: contasBancData } = await supabase
      .from("contas_bancarias").select("id, nome, tipo, saldo_inicial").eq("ativo", true).order("nome");
    const { data: baixasAteFimData } = await supabase
      .from("baixas_lancamento").select("conta_id, valor, lancamentos(tipo)")
      .is("estornado_em", null).not("conta_id", "is", null).lte("data", ultimoDia);
    const saldoPorConta = new Map<number, number>();
    for (const b of (baixasAteFimData ?? []) as unknown as { conta_id: number; valor: number; lancamentos: { tipo: string } | null }[]) {
      if (!b.lancamentos) continue;
      const delta = b.lancamentos.tipo === "Entrada" ? Number(b.valor) : -Number(b.valor);
      saldoPorConta.set(b.conta_id, (saldoPorConta.get(b.conta_id) ?? 0) + delta);
    }
    const bufSaldos = await construirPlanilha(
      ["Conta", "Tipo", `Saldo em ${ultimoDia}`],
      ((contasBancData ?? []) as { id: number; nome: string; tipo: string; saldo_inicial: number }[]).map((c) => [
        c.nome, c.tipo, Number(c.saldo_inicial) + (saldoPorConta.get(c.id) ?? 0),
      ])
    );
    zip.file("05-Financeiro/saldo-contas-bancarias.xlsx", bufSaldos);

    // ── Manifest (por último — já sabe quais anexos falharam) ───
    const linhasChecklist = itens.map((i) => {
      const label = getChecklistItemDef(i.item_key)?.label ?? i.item_key;
      if (i.status === "nao_aplicavel") return `- ${label}: não aplicável`;
      const resp = i.responsavel ? ` — responsável: ${i.responsavel}` : "";
      const conc = i.data_conclusao ? ` — concluído em ${i.data_conclusao}` : "";
      return `- ${label}: ${i.status}${resp}${conc}`;
    });
    const manifest = [
      `Pacote de Fechamento Contábil — ${mesStr}/${ano}`,
      `Status do fechamento: ${fechamento.status}`,
      `Percentual concluído: ${fechamento.percentual}%`,
      `Gerado em: ${new Date().toISOString()}`,
      "",
      "Checklist:",
      ...linhasChecklist,
      ...(falhas.length > 0 ? ["", "Anexos que falharam ao baixar (arquivo pode ter sido removido do storage):", ...falhas.map((f) => `- ${f}`)] : []),
    ].join("\n");
    zip.file("00-Fechamento/manifest.txt", manifest);

    const blob = await zip.generateAsync({ type: "blob" });
    baixarBlob(blob, `Contabilidade_${mesStr}-${ano}.zip`);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "Erro desconhecido ao exportar" };
  }
}
