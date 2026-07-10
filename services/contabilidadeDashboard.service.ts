import { supabase } from "@/lib/supabase/client";
import { getNotas } from "./notas.service";
import { getDocumentosFiscais } from "./contabilidadeDocumentos.service";
import { getOrCreateFechamento } from "./contabilidadeChecklist.service";
import { getItensEstoqueGerais } from "./itensEstoqueGerais.service";
import { getAtivosImobilizados } from "./ativosImobilizados.service";
import { getCartoes } from "./cartoes.service";
import { getEmprestimos } from "./emprestimos.service";
import { getConsorcios } from "./consorcios.service";
import type { NotaFiscal } from "@/types";

// ─── NF Saída — 100% derivado de notas_fiscais, sem cadastro duplicado ────

export interface ResumoNotasSaida {
  totalNotas: number;
  totalClientes: number;
  totalFaturado: number;
  totalIcms: number;
  totalIpi: number;
  totalPis: number;
  totalCofins: number;
  porCfop: { cfop: string; qtd: number; valor: number }[];
  notas: NotaFiscal[];
}

export async function getResumoNotasSaida(ano: number, mes: number): Promise<ResumoNotasSaida> {
  const todas = await getNotas();
  const notas = todas.filter((n) => {
    if (n.status !== "autorizada") return false;
    const d = new Date(n.dt_emissao);
    return d.getFullYear() === ano && d.getMonth() + 1 === mes;
  });

  const clientesSet = new Set(notas.map((n) => n.cliente_id).filter((id): id is number => id !== null));
  const porCfopMap = new Map<string, { qtd: number; valor: number }>();
  for (const n of notas) {
    const cur = porCfopMap.get(n.cfop) ?? { qtd: 0, valor: 0 };
    cur.qtd += 1;
    cur.valor += Number(n.valor_total) || 0;
    porCfopMap.set(n.cfop, cur);
  }

  return {
    totalNotas: notas.length,
    totalClientes: clientesSet.size,
    totalFaturado: notas.reduce((s, n) => s + (Number(n.valor_total) || 0), 0),
    totalIcms: notas.reduce((s, n) => s + (Number(n.valor_icms) || 0), 0),
    totalIpi: notas.reduce((s, n) => s + (Number(n.valor_ipi) || 0), 0),
    totalPis: notas.reduce((s, n) => s + (Number(n.valor_pis) || 0), 0),
    totalCofins: notas.reduce((s, n) => s + (Number(n.valor_cofins) || 0), 0),
    porCfop: Array.from(porCfopMap.entries()).map(([cfop, v]) => ({ cfop, ...v })),
    notas,
  };
}

// ─── NF Canceladas — merge em JS de notas_fiscais (venda) + documentos_fiscais (compra) ──

export interface NotaCancelada {
  origem: "venda" | "compra";
  id: number;
  numero: string | null;
  data: string;
  motivo: string | null;
  responsavel: string | null;
}

export async function getNotasCanceladas(ano: number, mes: number): Promise<NotaCancelada[]> {
  const [todasNotas, docsCancelamento] = await Promise.all([
    getNotas(),
    getDocumentosFiscais({ tipo: "cancelamento", competenciaAno: ano, competenciaMes: mes }),
  ]);

  const vendas: NotaCancelada[] = todasNotas
    .filter((n) => {
      if (n.status !== "cancelada") return false;
      const d = new Date(n.dt_emissao);
      return d.getFullYear() === ano && d.getMonth() + 1 === mes;
    })
    .map((n) => ({
      origem: "venda" as const,
      id: n.id,
      numero: n.numero,
      data: n.dt_emissao,
      motivo: n.motivo_rejeicao,
      responsavel: null,
    }));

  const compras: NotaCancelada[] = docsCancelamento.map((d) => ({
    origem: "compra" as const,
    id: d.id,
    numero: d.numero_documento,
    data: d.created_at,
    motivo: d.motivo,
    responsavel: d.responsavel,
  }));

  return [...vendas, ...compras].sort((a, b) => b.data.localeCompare(a.data));
}

// ─── Alertas (calculados em runtime, sem tabela de configuração) ──────────

export interface Alerta {
  severidade: "critico" | "atencao";
  mensagem: string;
  quantidade: number;
}

export async function getAlertas(ano: number, mes: number): Promise<Alerta[]> {
  const [todasNotas, docsCompra] = await Promise.all([
    getNotas(),
    getDocumentosFiscais({ tipo: "compra", competenciaAno: ano, competenciaMes: mes }),
  ]);

  const notasMes = todasNotas.filter((n) => {
    if (n.status !== "autorizada") return false;
    const d = new Date(n.dt_emissao);
    return d.getFullYear() === ano && d.getMonth() + 1 === mes;
  });

  const alertas: Alerta[] = [];

  const notaSemXml = notasMes.filter((n) => !n.xml_url).length;
  if (notaSemXml > 0) alertas.push({ severidade: "critico", mensagem: "NF de venda sem XML", quantidade: notaSemXml });

  const notaSemPdf = notasMes.filter((n) => !n.danfe_url).length;
  if (notaSemPdf > 0) alertas.push({ severidade: "critico", mensagem: "NF de venda sem DANFE (PDF)", quantidade: notaSemPdf });

  const compraSemXml = docsCompra.filter((d) => !d.xml_url).length;
  if (compraSemXml > 0) alertas.push({ severidade: "critico", mensagem: "NF de compra/entrada sem XML", quantidade: compraSemXml });

  const compraSemPdf = docsCompra.filter((d) => !d.pdf_url).length;
  if (compraSemPdf > 0) alertas.push({ severidade: "critico", mensagem: "NF de compra/entrada sem PDF", quantidade: compraSemPdf });

  const semClassificacao = docsCompra.filter((d) => !d.ncm || !d.cfop || !d.cst).length;
  if (semClassificacao > 0) alertas.push({ severidade: "critico", mensagem: "Documento de compra sem classificação fiscal completa (NCM/CFOP/CST)", quantidade: semClassificacao });

  const cfopInvalido = docsCompra.filter((d) => d.cfop && d.cfop.length !== 4).length;
  if (cfopInvalido > 0) alertas.push({ severidade: "atencao", mensagem: "CFOP com formato inválido (deve ter 4 dígitos)", quantidade: cfopInvalido });

  const fornecedorSemCnpj = docsCompra.filter((d) => d.fornecedores && !d.fornecedores.cnpj).length;
  if (fornecedorSemCnpj > 0) alertas.push({ severidade: "atencao", mensagem: "Fornecedor sem CNPJ cadastrado", quantidade: fornecedorSemCnpj });

  const chaves = docsCompra.map((d) => d.chave_acesso).filter((c): c is string => !!c);
  const chavesDuplicadas = chaves.filter((c, i) => chaves.indexOf(c) !== i);
  if (chavesDuplicadas.length > 0) alertas.push({ severidade: "critico", mensagem: "Documento fiscal com chave de acesso duplicada", quantidade: new Set(chavesDuplicadas).size });

  const agora = new Date();
  const ehCompetenciaAtual = agora.getFullYear() === ano && agora.getMonth() + 1 === mes;
  if (ehCompetenciaAtual && agora.getDate() >= 3) {
    const { fechamento, itens } = await getOrCreateFechamento(ano, mes);
    if (fechamento.status !== "concluido") {
      const pendentes = itens.filter((i) => i.status === "pendente" || i.status === "em_andamento").length;
      if (pendentes > 0) {
        alertas.push({ severidade: "critico", mensagem: `Checklist de fechamento do mês ainda incompleto (dia ${agora.getDate()})`, quantidade: pendentes });
      }
    }
  }

  return alertas;
}

// ─── Status por área (semáforo do Dashboard) ──────────────────────────────

export type Semaforo = "verde" | "amarelo" | "vermelho" | "indisponivel";

export interface StatusArea {
  area: string;
  label: string;
  semaforo: Semaforo;
  detalhe: string;
}

export async function getStatusAreas(ano: number, mes: number): Promise<StatusArea[]> {
  const [alertas, { itens }] = await Promise.all([
    getAlertas(ano, mes),
    getOrCreateFechamento(ano, mes),
  ]);

  const alertasCriticos = alertas.filter((a) => a.severidade === "critico").length;
  const itensDocFiscal = itens.filter((i) => {
    const key = i.item_key;
    return ["nf_compra", "nf_entrada", "nf_saida", "nf_perda", "nf_cancelada", "carta_correcao", "inutilizacao"].includes(key);
  });
  const docFiscalPendente = itensDocFiscal.some((i) => i.status === "pendente" || i.status === "em_andamento");

  const documentosFiscais: StatusArea = alertasCriticos > 0
    ? { area: "documentos_fiscais", label: "Documentos Fiscais", semaforo: "vermelho", detalhe: `${alertasCriticos} alerta(s) crítico(s)` }
    : docFiscalPendente
    ? { area: "documentos_fiscais", label: "Documentos Fiscais", semaforo: "amarelo", detalhe: "Itens do checklist ainda pendentes" }
    : { area: "documentos_fiscais", label: "Documentos Fiscais", semaforo: "verde", detalhe: "Completo" };

  const itensGerais = await getItensEstoqueGerais({ ativo: true });
  const abaixoMinimo = itensGerais.filter((i) => i.estoque_minimo > 0 && i.saldo_qtd <= i.estoque_minimo).length;
  const itemChecklistEstoque = itens.find((i) => i.item_key === "estoque");
  const checklistEstoquePendente = itemChecklistEstoque?.status === "pendente" || itemChecklistEstoque?.status === "em_andamento";

  const estoque: StatusArea =
    itensGerais.length === 0
      ? { area: "estoque", label: "Estoque / CMV", semaforo: "amarelo", detalhe: "Nenhum item de estoque geral cadastrado ainda" }
      : abaixoMinimo > 0
      ? { area: "estoque", label: "Estoque / CMV", semaforo: "amarelo", detalhe: `${abaixoMinimo} item(ns) abaixo do estoque mínimo` }
      : checklistEstoquePendente
      ? { area: "estoque", label: "Estoque / CMV", semaforo: "amarelo", detalhe: "Checklist de estoque ainda pendente" }
      : { area: "estoque", label: "Estoque / CMV", semaforo: "verde", detalhe: "Completo" };

  const ativosImobilizados = await getAtivosImobilizados({ ativo: true });
  const hojeStr = new Date().toISOString().split("T")[0];
  const semContaContabil = ativosImobilizados.filter((a) => !a.plano_contas_id).length;
  const garantiaVencida = ativosImobilizados.filter((a) => a.garantia_ate !== null && a.garantia_ate < hojeStr).length;
  const itemChecklistAtivo = itens.find((i) => i.item_key === "ativo_imobilizado");
  const checklistAtivoPendente = itemChecklistAtivo?.status === "pendente" || itemChecklistAtivo?.status === "em_andamento";

  const ativoImobilizado: StatusArea =
    ativosImobilizados.length === 0
      ? { area: "ativo_imobilizado", label: "Ativo Imobilizado", semaforo: "amarelo", detalhe: "Nenhum ativo cadastrado ainda" }
      : semContaContabil > 0
      ? { area: "ativo_imobilizado", label: "Ativo Imobilizado", semaforo: "amarelo", detalhe: `${semContaContabil} ativo(s) sem conta contábil vinculada` }
      : garantiaVencida > 0
      ? { area: "ativo_imobilizado", label: "Ativo Imobilizado", semaforo: "amarelo", detalhe: `${garantiaVencida} ativo(s) com garantia vencida` }
      : checklistAtivoPendente
      ? { area: "ativo_imobilizado", label: "Ativo Imobilizado", semaforo: "amarelo", detalhe: "Checklist de ativo imobilizado ainda pendente" }
      : { area: "ativo_imobilizado", label: "Ativo Imobilizado", semaforo: "verde", detalhe: "Completo" };

  const [cartoes, emprestimos, consorcios] = await Promise.all([
    getCartoes({ ativo: true }),
    getEmprestimos({ ativo: true }),
    getConsorcios({ ativo: true }),
  ]);
  const [{ count: faturasAtrasadas }, { count: parcelasEmprestimoAtrasadas }, { count: parcelasConsorcioAtrasadas }] = await Promise.all([
    supabase.from("cartoes_faturas").select("id", { count: "exact", head: true }).neq("status", "paga").lt("data_vencimento", hojeStr),
    supabase.from("emprestimos_parcelas").select("id", { count: "exact", head: true }).eq("status", "pendente").lt("vencimento", hojeStr),
    supabase.from("consorcios_parcelas").select("id", { count: "exact", head: true }).eq("status", "pendente").lt("vencimento", hojeStr),
  ]);
  const totalAtrasadas = (faturasAtrasadas ?? 0) + (parcelasEmprestimoAtrasadas ?? 0) + (parcelasConsorcioAtrasadas ?? 0);
  const itemChecklistCartoes = itens.find((i) => i.item_key === "cartoes_emprestimos");
  const checklistCartoesPendente = itemChecklistCartoes?.status === "pendente" || itemChecklistCartoes?.status === "em_andamento";

  const cartoesArea: StatusArea =
    cartoes.length === 0 && emprestimos.length === 0 && consorcios.length === 0
      ? { area: "cartoes", label: "Cartões / Empréstimos / Consórcios", semaforo: "amarelo", detalhe: "Nenhum cartão, empréstimo ou consórcio cadastrado ainda" }
      : totalAtrasadas > 0
      ? { area: "cartoes", label: "Cartões / Empréstimos / Consórcios", semaforo: "vermelho", detalhe: `${totalAtrasadas} fatura(s)/parcela(s) vencida(s) sem pagamento` }
      : checklistCartoesPendente
      ? { area: "cartoes", label: "Cartões / Empréstimos / Consórcios", semaforo: "amarelo", detalhe: "Checklist de cartões/empréstimos/consórcios ainda pendente" }
      : { area: "cartoes", label: "Cartões / Empréstimos / Consórcios", semaforo: "verde", detalhe: "Completo" };

  return [
    documentosFiscais,
    estoque,
    ativoImobilizado,
    cartoesArea,
  ];
}

export async function getPercentualFechamento(ano: number, mes: number): Promise<number> {
  const { fechamento } = await getOrCreateFechamento(ano, mes);
  return fechamento.percentual;
}
