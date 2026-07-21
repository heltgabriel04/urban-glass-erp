// CRM 6b — Relatórios Analíticos (docs: memória "project-auditoria-erp-completa",
// item 6b, deliberadamente adiado até existir dado real de interação, ver
// docs/superpowers/specs/2026-07-21-crm-relatorios-analiticos-design.md).
//
// interacoes_cliente não tem autoria de usuário (sem vendedor_id) — "desempenho
// por vendedor" está fora de escopo até essa coluna existir. Tudo aqui é
// agregado por cliente/tipo/período.

import type { TipoInteracao } from "@/types";

export interface InteracaoComCliente {
  id: number;
  cliente_id: number;
  clienteNome: string;
  tipo: TipoInteracao;
  data: string; // YYYY-MM-DD
  proximo_contato: string | null;
}

function diffDias(deISO: string, ateISO: string): number {
  const a = new Date(deISO + "T00:00:00");
  const b = new Date(ateISO + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDiasISO(dataISO: string, dias: number): string {
  const d = new Date(dataISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ─── 1. Follow-ups em atraso (visão geral) ──────────────────
// Mesma regra já usada no badge da página individual do cliente
// (app/clientes/[id]/page.tsx): qualquer interação com proximo_contato no
// passado conta, não só a mais recente por cliente.

export interface FollowUpAtrasado {
  interacaoId: number;
  clienteId: number;
  clienteNome: string;
  tipo: TipoInteracao;
  proximoContato: string;
  diasAtraso: number;
}

export function calcularFollowUpsAtrasados(
  interacoes: InteracaoComCliente[],
  hojeISO: string,
): FollowUpAtrasado[] {
  return interacoes
    .filter(i => i.proximo_contato != null && i.proximo_contato < hojeISO)
    .map(i => ({
      interacaoId: i.id,
      clienteId: i.cliente_id,
      clienteNome: i.clienteNome,
      tipo: i.tipo,
      proximoContato: i.proximo_contato as string,
      diasAtraso: diffDias(i.proximo_contato as string, hojeISO),
    }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

// ─── 2. Volume de interações por tipo/mês (tendência) ───────

export interface VolumeInteracoesMes {
  mes: string; // "2026-07"
  ligacao: number;
  email: number;
  reuniao: number;
  nota: number;
  total: number;
}

export function calcularVolumePorMes(interacoes: InteracaoComCliente[]): VolumeInteracoesMes[] {
  const map = new Map<string, VolumeInteracoesMes>();
  interacoes.forEach(i => {
    const mes = i.data.slice(0, 7);
    const entry = map.get(mes) ?? { mes, ligacao: 0, email: 0, reuniao: 0, nota: 0, total: 0 };
    entry[i.tipo]++;
    entry.total++;
    map.set(mes, entry);
  });
  return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
}

// ─── 3. Conversão interação → pedido/orçamento ──────────────
// Ancorado na PRIMEIRA interação de cada cliente: se um orçamento daquele
// cliente foi criado entre essa interação e `janelaDias` depois, conta como
// convertido. Cliente sem nenhuma interação não entra no denominador (mede
// eficácia do follow-up, não conversão geral da carteira).

export interface ConversaoDetalhe {
  clienteId: number;
  clienteNome: string;
  dataInteracao: string;
  dataConversao: string;
  diasParaConverter: number;
}

export interface ConversaoResultado {
  totalClientesComInteracao: number;
  clientesConvertidos: number;
  taxaConversao: number; // 0-100
  detalhes: ConversaoDetalhe[];
}

export function calcularConversaoInteracaoOrcamento(
  interacoes: InteracaoComCliente[],
  orcamentos: { cliente_id: number; dt_criacao: string }[],
  janelaDias = 90,
): ConversaoResultado {
  const primeiraPorCliente = new Map<number, { data: string; nome: string }>();
  interacoes.forEach(i => {
    const atual = primeiraPorCliente.get(i.cliente_id);
    if (!atual || i.data < atual.data) primeiraPorCliente.set(i.cliente_id, { data: i.data, nome: i.clienteNome });
  });

  const detalhes: ConversaoDetalhe[] = [];
  primeiraPorCliente.forEach((info, clienteId) => {
    const janelaFim = addDiasISO(info.data, janelaDias);
    const doCliente = orcamentos
      .filter(o => o.cliente_id === clienteId && o.dt_criacao >= info.data && o.dt_criacao <= janelaFim)
      .sort((a, b) => a.dt_criacao.localeCompare(b.dt_criacao));
    if (doCliente.length > 0) {
      detalhes.push({
        clienteId,
        clienteNome: info.nome,
        dataInteracao: info.data,
        dataConversao: doCliente[0].dt_criacao,
        diasParaConverter: diffDias(info.data, doCliente[0].dt_criacao),
      });
    }
  });

  const total = primeiraPorCliente.size;
  return {
    totalClientesComInteracao: total,
    clientesConvertidos: detalhes.length,
    taxaConversao: total > 0 ? (detalhes.length / total) * 100 : 0,
    detalhes: detalhes.sort((a, b) => a.diasParaConverter - b.diasParaConverter),
  };
}

// ─── 4. Clientes sem contato recente / nunca contatados ─────

export interface ClienteSemContato {
  clienteId: number;
  clienteNome: string;
  ultimaInteracao: string | null; // null = nunca teve interação
  diasSemContato: number | null;
}

export function calcularClientesSemContato(
  clientes: { id: number; nome: string }[],
  interacoes: InteracaoComCliente[],
  hojeISO: string,
  limiarDias = 60,
): ClienteSemContato[] {
  const ultimaPorCliente = new Map<number, string>();
  interacoes.forEach(i => {
    const atual = ultimaPorCliente.get(i.cliente_id);
    if (!atual || i.data > atual) ultimaPorCliente.set(i.cliente_id, i.data);
  });

  return clientes
    .map(c => {
      const ultima = ultimaPorCliente.get(c.id) ?? null;
      const dias = ultima ? diffDias(ultima, hojeISO) : null;
      return { clienteId: c.id, clienteNome: c.nome, ultimaInteracao: ultima, diasSemContato: dias };
    })
    .filter(c => c.ultimaInteracao === null || (c.diasSemContato ?? 0) >= limiarDias)
    .sort((a, b) => (b.diasSemContato ?? Number.MAX_SAFE_INTEGER) - (a.diasSemContato ?? Number.MAX_SAFE_INTEGER));
}
