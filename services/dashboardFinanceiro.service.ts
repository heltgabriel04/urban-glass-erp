import { supabase } from '@/lib/supabase/client';
import { getBaixasPorLancamentos, calcularSaldo } from './lancamentos.service';

function fmtData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Saldo em caixa = saldo inicial das contas bancárias ativas + todas as
// baixas ativas (Entrada soma, Saída subtrai) já registradas.
export async function getSaldoCaixaTotal(): Promise<number> {
  const [{ data: contas }, { data: baixas }] = await Promise.all([
    supabase.from('contas_bancarias').select('saldo_inicial').eq('ativo', true),
    supabase.from('baixas_lancamento').select('valor, lancamentos(tipo)').is('estornado_em', null),
  ]);

  const saldoInicial = (contas ?? []).reduce((a, c) => a + Number((c as { saldo_inicial: number }).saldo_inicial), 0);

  const movimento = (baixas ?? []).reduce((a, b) => {
    const row = b as unknown as { valor: number; lancamentos: { tipo: string } | null };
    if (!row.lancamentos) return a;
    return a + (row.lancamentos.tipo === 'Entrada' ? Number(row.valor) : -Number(row.valor));
  }, 0);

  return saldoInicial + movimento;
}

// Total em aberto (saldo real, considerando baixa parcial) de um tipo.
export async function getAbertoPorTipo(tipo: 'Entrada' | 'Saída'): Promise<number> {
  const { data: lancs } = await supabase
    .from('lancamentos')
    .select('id, valor, status')
    .eq('tipo', tipo)
    .neq('status', 'Pago')
    .is('deletado_em', null);

  const lista = (lancs ?? []) as { id: number; valor: number; status: string }[];
  if (lista.length === 0) return 0;

  const baixasMap = await getBaixasPorLancamentos(lista.map(l => l.id));
  return lista.reduce((a, l) => a + calcularSaldo(l, baixasMap.get(l.id)).saldo, 0);
}

export interface MesValor { ano: number; mes: number; valor: number; }

// Despesas (baixas de Saída) somadas por mês, últimos N meses.
export async function getDespesasPorMes(meses = 6): Promise<MesValor[]> {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);

  const { data } = await supabase
    .from('baixas_lancamento')
    .select('valor, data, lancamentos!inner(tipo)')
    .is('estornado_em', null)
    .eq('lancamentos.tipo', 'Saída')
    .gte('data', fmtData(inicio));

  const porMes = new Map<string, number>();
  for (const b of (data ?? []) as unknown as { valor: number; data: string }[]) {
    const key = b.data.slice(0, 7); // YYYY-MM
    porMes.set(key, (porMes.get(key) ?? 0) + Number(b.valor));
  }

  const resultado: MesValor[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    resultado.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, valor: porMes.get(key) ?? 0 });
  }
  return resultado;
}

export interface ProjecaoHorizonte { dias: number; saldo: number; }

interface OcorrenciaFutura { tipo: 'Entrada' | 'Saída'; valor: number; data: string; }

// Ocorrências futuras de recorrências ativas que ainda não viraram
// lançamento físico (além de gerado_ate) — sem isso, a projeção só
// enxerga o que já foi gerado, e depende do usuário lembrar de clicar
// "gerar mais meses" em /recorrencias.
async function getOcorrenciasRecorrentesFuturas(limiteMax: Date): Promise<OcorrenciaFutura[]> {
  const { data } = await supabase.from('lancamentos_recorrentes').select('tipo, valor, dia_vencimento, gerado_ate').eq('ativo', true);
  const hoje = new Date();
  const ocorrencias: OcorrenciaFutura[] = [];

  for (const r of (data ?? []) as { tipo: 'Entrada' | 'Saída'; valor: number; dia_vencimento: number; gerado_ate: string | null }[]) {
    let cursor: Date;
    if (r.gerado_ate) {
      const [y, m] = r.gerado_ate.split('-').map(Number);
      cursor = new Date(y, m - 1 + 1, 1);
    } else {
      cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    }
    for (let i = 0; i < 6; i++) {
      const data2 = new Date(cursor.getFullYear(), cursor.getMonth(), r.dia_vencimento);
      if (data2 > limiteMax) break;
      ocorrencias.push({ tipo: r.tipo, valor: Number(r.valor), data: fmtData(data2) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return ocorrencias;
}

// Projeção de caixa baseada em compromissos já lançados (não estimativa
// estatística): saldo atual + títulos em aberto com vencimento dentro do
// horizonte + ocorrências futuras de recorrências ativas ainda não geradas.
export async function getProjecaoCaixa(): Promise<ProjecaoHorizonte[]> {
  const saldoAtual = await getSaldoCaixaTotal();
  const hoje = new Date();
  const limiteMax = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 90);

  const [{ data: entradas }, { data: saidas }, ocorrenciasRecorrentes] = await Promise.all([
    supabase.from('lancamentos').select('id, valor, status, vencimento').eq('tipo', 'Entrada').neq('status', 'Pago').not('vencimento', 'is', null).is('deletado_em', null),
    supabase.from('lancamentos').select('id, valor, status, vencimento').eq('tipo', 'Saída').neq('status', 'Pago').not('vencimento', 'is', null).is('deletado_em', null),
    getOcorrenciasRecorrentesFuturas(limiteMax),
  ]);
  const entradasList = (entradas ?? []) as { id: number; valor: number; status: string; vencimento: string }[];
  const saidasList = (saidas ?? []) as { id: number; valor: number; status: string; vencimento: string }[];

  const baixasMap = await getBaixasPorLancamentos([...entradasList, ...saidasList].map(l => l.id));

  return [30, 60, 90].map(dias => {
    const limite = fmtData(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias));
    const entradasSaldo = entradasList
      .filter(l => l.vencimento <= limite)
      .reduce((a, l) => a + calcularSaldo(l, baixasMap.get(l.id)).saldo, 0);
    const saidasSaldo = saidasList
      .filter(l => l.vencimento <= limite)
      .reduce((a, l) => a + calcularSaldo(l, baixasMap.get(l.id)).saldo, 0);
    const entradasRecorrentes = ocorrenciasRecorrentes.filter(o => o.tipo === 'Entrada' && o.data <= limite).reduce((a, o) => a + o.valor, 0);
    const saidasRecorrentes = ocorrenciasRecorrentes.filter(o => o.tipo === 'Saída' && o.data <= limite).reduce((a, o) => a + o.valor, 0);
    return { dias, saldo: saldoAtual + entradasSaldo - saidasSaldo + entradasRecorrentes - saidasRecorrentes };
  });
}
