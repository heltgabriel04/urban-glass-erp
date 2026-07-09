import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/api-guard";
import { RelatorioExecutivoDocument, type RelatorioExecutivoDados } from "@/lib/pdf/relatorioExecutivo";
import { PERIODO_LABEL, periodoParaAnoMes, type PeriodoFiltro } from "@/lib/filtroFinanceiro";

function fmtData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function periodoParaIntervalo(ano: number, mes: number | null): { ini: string; fim: string } {
  if (mes) {
    const mm = String(mes).padStart(2, "0");
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return { ini: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }
  return { ini: `${ano}-01-01`, fim: `${ano}-12-31` };
}

// Renderiza o Relatório Executivo em PDF a partir dos mesmos números do
// Dashboard Financeiro (Etapa 5.5). Auto-contido — não reaproveita os
// services do cliente porque eles usam o client de browser (sem sessão
// aqui no servidor); a mesma decisão já tomada em gerar-comprovante.
export async function GET(req: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  const url = new URL(req.url);
  const periodo = (url.searchParams.get("periodo") as PeriodoFiltro) || "mes";
  const contaId = url.searchParams.get("conta") ? Number(url.searchParams.get("conta")) : null;
  const { ano, mes } = periodoParaAnoMes(periodo);
  const { ini, fim } = periodoParaIntervalo(ano, mes);

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Saldo em caixa — saldo inicial das contas + todas as baixas ativas (sem filtro de data, é um retrato de agora).
  let contasQuery = sb.from("contas_bancarias").select("id, saldo_inicial").eq("ativo", true);
  if (contaId) contasQuery = contasQuery.eq("id", contaId);
  let baixasTotaisQuery = sb.from("baixas_lancamento").select("valor, conta_id, lancamentos(tipo)").is("estornado_em", null);
  if (contaId) baixasTotaisQuery = baixasTotaisQuery.eq("conta_id", contaId);

  const [{ data: contas }, { data: baixasTotais }] = await Promise.all([contasQuery, baixasTotaisQuery]);
  const saldoInicial = (contas ?? []).reduce((a, c) => a + Number((c as { saldo_inicial: number }).saldo_inicial), 0);
  const movimentoTotal = (baixasTotais ?? []).reduce((a, b) => {
    const row = b as unknown as { valor: number; lancamentos: { tipo: string } | null };
    if (!row.lancamentos) return a;
    return a + (row.lancamentos.tipo === "Entrada" ? Number(row.valor) : -Number(row.valor));
  }, 0);
  const saldoCaixa = saldoInicial + movimentoTotal;

  // Em aberto (saldo-aware) — Entrada e Saída.
  async function getAberto(tipo: "Entrada" | "Saída"): Promise<number> {
    let q = sb.from("lancamentos").select("id, valor").eq("tipo", tipo).neq("status", "Pago").is("deletado_em", null);
    if (contaId) q = q.eq("conta_id", contaId);
    const { data: lancs } = await q;
    const lista = (lancs ?? []) as { id: number; valor: number }[];
    if (lista.length === 0) return 0;
    const { data: baixas } = await sb.from("baixas_lancamento").select("lancamento_id, valor").in("lancamento_id", lista.map(l => l.id)).is("estornado_em", null);
    const pagoPorLanc = new Map<number, number>();
    for (const b of (baixas ?? []) as { lancamento_id: number; valor: number }[]) {
      pagoPorLanc.set(b.lancamento_id, (pagoPorLanc.get(b.lancamento_id) ?? 0) + Number(b.valor));
    }
    return lista.reduce((a, l) => a + Math.max(0, Number(l.valor) - (pagoPorLanc.get(l.id) ?? 0)), 0);
  }

  // Resultado do período (regime de caixa) + despesas por categoria.
  let entradasPeriodoQuery = sb.from("baixas_lancamento").select("valor, lancamentos!inner(tipo, natureza)")
    .is("estornado_em", null).eq("lancamentos.tipo", "Entrada").eq("lancamentos.natureza", "normal").gte("data", ini).lte("data", fim);
  let saidasPeriodoQuery = sb.from("baixas_lancamento").select("valor, conta_id, lancamentos!inner(tipo, natureza, plano_contas(descricao))")
    .is("estornado_em", null).eq("lancamentos.tipo", "Saída").eq("lancamentos.natureza", "normal").gte("data", ini).lte("data", fim);
  if (contaId) { entradasPeriodoQuery = entradasPeriodoQuery.eq("conta_id", contaId); saidasPeriodoQuery = saidasPeriodoQuery.eq("conta_id", contaId); }

  const [{ data: entradasPeriodo }, { data: saidasPeriodo }, aReceber, aPagar] = await Promise.all([
    entradasPeriodoQuery, saidasPeriodoQuery, getAberto("Entrada"), getAberto("Saída"),
  ]);

  const receita = (entradasPeriodo ?? []).reduce((a, b) => a + Number((b as unknown as { valor: number }).valor), 0);
  const despesasRows = (saidasPeriodo ?? []) as unknown as { valor: number; lancamentos: { plano_contas: { descricao: string } | null } }[];
  const porCategoria = new Map<string, number>();
  for (const d of despesasRows) {
    const cat = d.lancamentos.plano_contas?.descricao?.trim() || "Sem categoria";
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + Number(d.valor));
  }
  const despesasPorCategoria = [...porCategoria.entries()]
    .map(([categoria, valor]) => ({ categoria, valor: parseFloat(valor.toFixed(2)) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);
  const despesasTotal = despesasPorCategoria.reduce((a, d) => a + d.valor, 0);
  const resultado = parseFloat((receita - despesasTotal).toFixed(2));

  // Projeção 30/60/90 — saldo atual + títulos abertos com vencimento dentro do horizonte.
  let entradasAbertasQuery = sb.from("lancamentos").select("id, valor, vencimento").eq("tipo", "Entrada").neq("status", "Pago").not("vencimento", "is", null).is("deletado_em", null);
  let saidasAbertasQuery = sb.from("lancamentos").select("id, valor, vencimento").eq("tipo", "Saída").neq("status", "Pago").not("vencimento", "is", null).is("deletado_em", null);
  if (contaId) { entradasAbertasQuery = entradasAbertasQuery.eq("conta_id", contaId); saidasAbertasQuery = saidasAbertasQuery.eq("conta_id", contaId); }
  const [{ data: entradasAbertas }, { data: saidasAbertas }] = await Promise.all([entradasAbertasQuery, saidasAbertasQuery]);
  const hoje = new Date();
  const projecao = [30, 60, 90].map(dias => {
    const limite = fmtData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));
    const ent = (entradasAbertas ?? []).filter((l: { vencimento: string }) => l.vencimento <= limite).reduce((a: number, l: { valor: number }) => a + Number(l.valor), 0);
    const sai = (saidasAbertas ?? []).filter((l: { vencimento: string }) => l.vencimento <= limite).reduce((a: number, l: { valor: number }) => a + Number(l.valor), 0);
    return { dias, saldo: parseFloat((saldoCaixa + ent - sai).toFixed(2)) };
  });

  const dados: RelatorioExecutivoDados = {
    periodoLabel: PERIODO_LABEL[periodo],
    saldoCaixa, aReceber, aPagar, receita, despesasTotal, resultado,
    despesasPorCategoria, projecao,
  };

  const buffer = await renderToBuffer(<RelatorioExecutivoDocument dados={dados} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-executivo_${ini}_a_${fim}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
