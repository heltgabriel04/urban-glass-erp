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
    .neq('status', 'Pago');

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

// Projeção de caixa baseada em compromissos já lançados (não estimativa
// estatística): saldo atual + títulos em aberto com vencimento dentro do
// horizonte.
export async function getProjecaoCaixa(): Promise<ProjecaoHorizonte[]> {
  const saldoAtual = await getSaldoCaixaTotal();
  const hoje = new Date();

  const [{ data: entradas }, { data: saidas }] = await Promise.all([
    supabase.from('lancamentos').select('id, valor, status, vencimento').eq('tipo', 'Entrada').neq('status', 'Pago').not('vencimento', 'is', null),
    supabase.from('lancamentos').select('id, valor, status, vencimento').eq('tipo', 'Saída').neq('status', 'Pago').not('vencimento', 'is', null),
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
    return { dias, saldo: saldoAtual + entradasSaldo - saidasSaldo };
  });
}
