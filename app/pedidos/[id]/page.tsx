"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { getPedidoById, avancarStatusPedido, recalcularRecebido, updatePedido, getCreditoCliente, atualizarCreditoCliente, utilizarCreditoEmPedido, uploadRomaneioAssinado, deleteRomaneioAssinado, uploadCorteCertoPdf, deleteCorteCertoPdf, vincularRetalhoAoPedido, desvincularRetalhoAoPedido, getRetalhosUsadosPorPedido } from "@/services/pedidos.service";
import { getLancamentosPorPedido, deletarLancamento, createLancamento, updateLancamento } from "@/services/financeiro.service";
import { getOtimizacoesPorPedido } from "@/services/otimizador.service";
import { createNaoConformidade, getNaoConformidadesPorPedido, uploadFotosNC, updateNaoConformidade } from "@/services/qualidade.service";
import { getRetiradasPorPedido, calcularSaldoItens } from "@/services/retiradas.service";
import { formatBRL, formatDate, formatDuracao } from "@/lib/formatters";
import { useToast } from "@/components/ui/toast";
import DateInput from "@/components/ui/DateInput";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { Pedido, Lancamento, Vendedor, NaoConformidade, NaoConformidadeInsert, TipoNC, GravidadeNC, StatusNaoConformidade, RetiradaPedido } from "@/types";
import type { HistoricoOtimizador } from "@/services/otimizador.service";
import { supabase } from "@/lib/supabase/client";

const TIPOS_NC: TipoNC[] = [
  "Quebra de vidro","Medida incorreta","Corte errado","Lapidação incorreta",
  "Furo em posição errada","Mancha ou risco","Peça trincada","Material com defeito",
  "Erro de separação","Erro de conferência","Retrabalho necessário",
  "Perda de matéria-prima","Perda operacional","Outro",
];

const GRAVIDADE_COR_NC: Record<GravidadeNC, string> = {
  Baixa:"var(--ok)", Média:"var(--warn)", Alta:"#f97316", Crítica:"var(--err)",
};

const STATUS_COR_NC: Record<StatusNaoConformidade, string> = {
  "Aberta":"var(--warn)","Em Análise":"var(--acc2)","Aguardando Correção":"#f97316","Resolvida":"var(--ok)","Cancelada":"var(--t3)",
};

const CHIP: Record<string, string> = {
  "Planejamento":            "chip cy",
  "Em Produção – Corte":     "chip cp",
  "Qualidade (Corte)":       "chip cg",
  "Em Produção – Lapidação": "chip co",
  "Qualidade (Lapidação)":   "chip cg",
  "Separação":               "chip cb",
  "Finalizado":              "chip cg",
  "Entregue":                "chip cg",
  "Cancelado":               "chip cr",
};

const FLUXO = [
  "Planejamento",
  "Em Produção – Corte",
  "Qualidade (Corte)",
  "Em Produção – Lapidação",
  "Qualidade (Lapidação)",
  "Separação",
  "Finalizado",
  "Entregue",
];

const CHAPAS_DIMS = [
  { w: 3300, h: 2250 }, { w: 2250, h: 3300 },
  { w: 3660, h: 2140 }, { w: 2140, h: 3660 },
  { w: 2150, h: 3660 }, { w: 3660, h: 2150 },
];

const CONTAS = ["ZRS","Banco Inter Urban Glass","Banco Inter Maxi Build","Caixa Econômica"];

function isChapaInteira(largura: number, altura: number): boolean {
  return CHAPAS_DIMS.some(c =>
    Math.abs(largura - c.w) < 50 && Math.abs(altura - c.h) < 50
  );
}

function arredondarParaMultiplo50(v: number): number {
  if (v % 50 === 0) return v;
  return Math.ceil(v / 50) * 50;
}

function hoje() { return new Date().toISOString().split("T")[0]; }

function duracaoEtapa(history: { status: string; desde: string }[], step: string): string | null {
  const idx = history.findIndex(h => h.status === step);
  if (idx === -1) return null;
  const from = new Date(history[idx].desde).getTime();
  const to   = idx < history.length - 1 ? new Date(history[idx + 1].desde).getTime() : Date.now();
  return formatDuracao(to - from);
}

function addMeses(dateStr: string, meses: number): string {
  if (!dateStr || dateStr.length < 10) return "";
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + meses);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

interface ParcelaEdit {
  data: string;
  valor: number;
  lancamento_id?: number;
}

interface ItemEdit {
  id: number;
  produto_nome: string;
  largura: number;
  altura: number;
  quantidade: number;
  valor_m2: number;
  lapidacao: number;
  vidro_cliente: boolean;
}

interface PagamentoParcela {
  lancId: number;
  valorOriginal: number;
  valorDigitado: number;
  dataPagamento: string;
  conta: string;
  formaPgto: string;
  marcando: boolean;
}

// Estado de edição inline para lançamentos pagos
interface EdicaoPago {
  valor: number;
  data: string;
  conta: string;
  formaPgto: string;
  salvando: boolean;
}

type RetalhoDispInfo = { id: string; produto_nome: string; largura: number; altura: number; m2: number; espessura: number | null; box: string | null; observacao: string | null };

interface SugestaoRetalho {
  retalhoId: string;
  retalho: RetalhoDispInfo;
  itemId: number;
  itemProduto: string;
  itemLargura: number;
  itemAltura: number;
  rotacionado: boolean;
  pecaNum: number;
}

function nomesCompativeis(a: string, b: string): boolean {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

function fitMode(ret: { largura: number; altura: number }, l: number, a: number): "normal" | "rot" | false {
  if (ret.largura >= l && ret.altura >= a) return "normal";
  if (ret.largura >= a && ret.altura >= l) return "rot";
  return false;
}

function calcSugestoes(
  itens: any[],
  retDisp: RetalhoDispInfo[],
  retUsados: Array<{ retalho_id: string; retalhos: RetalhoDispInfo | null }>,
  ignoradas: Set<string>
): SugestaoRetalho[] {
  const usadosIds = new Set(retUsados.map(u => u.retalho_id));
  const pool: RetalhoDispInfo[] = retDisp
    .filter(r => !usadosIds.has(r.id) && !ignoradas.has(r.id))
    .map(r => ({ ...r }));
  const result: SugestaoRetalho[] = [];
  for (const item of itens) {
    if (item.vidro_cliente) continue;
    const cobertos = retUsados.filter(u =>
      u.retalhos &&
      nomesCompativeis(item.produto_nome, u.retalhos.produto_nome) &&
      fitMode(u.retalhos, item.largura, item.altura) !== false
    ).length;
    const restantes = item.quantidade - cobertos;
    for (let p = 0; p < restantes; p++) {
      // best-fit: menor retalho que cobre a peça (evita desperdiçar retalhos grandes)
      let bestIdx = -1;
      let bestArea = Infinity;
      pool.forEach((r, i) => {
        if (nomesCompativeis(item.produto_nome, r.produto_nome) && fitMode(r, item.largura, item.altura) !== false) {
          const area = r.largura * r.altura;
          if (area < bestArea) { bestArea = area; bestIdx = i; }
        }
      });
      if (bestIdx === -1) break;
      const [ret] = pool.splice(bestIdx, 1);
      result.push({
        retalhoId: ret.id, retalho: ret,
        itemId: item.id, itemProduto: item.produto_nome,
        itemLargura: item.largura, itemAltura: item.altura,
        rotacionado: fitMode(ret, item.largura, item.altura) === "rot",
        pecaNum: cobertos + p + 1,
      });
    }
  }
  return result;
}

function computeAssignmentMap(
  itens: any[],
  retUsados: any[]
): Map<number, any[]> {
  const map = new Map<number, any[]>();
  const assignedIds = new Set<number>();
  // Pass 1: vinculações explícitas por item_pedido_id
  for (const u of retUsados) {
    if (u.item_pedido_id) {
      if (!map.has(u.item_pedido_id)) map.set(u.item_pedido_id, []);
      map.get(u.item_pedido_id)!.push(u);
      assignedIds.add(u.id);
    }
  }
  // Pass 2: fallback por algoritmo (retalhos sem item_pedido_id)
  for (const item of itens) {
    if (item.vidro_cliente) continue;
    const lista = map.get(item.id) ?? [];
    const needed = item.quantidade - lista.length;
    if (needed <= 0) continue;
    let added = 0;
    for (const u of retUsados) {
      if (added >= needed) break;
      if (assignedIds.has(u.id) || !u.retalhos || u.item_pedido_id) continue;
      if (!nomesCompativeis(item.produto_nome, u.retalhos.produto_nome)) continue;
      if (fitMode(u.retalhos, item.largura, item.altura) === false) continue;
      lista.push(u);
      assignedIds.add(u.id);
      added++;
    }
    if (lista.length > 0) map.set(item.id, lista);
  }
  return map;
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";
  const { toast } = useToast();

  const [pedido, setPedido]             = useState<Pedido | null>(null);
  const [lancamentos, setLancamentos]   = useState<Lancamento[]>([]);
  const [otimizacoes, setOtimizacoes]   = useState<HistoricoOtimizador[]>([]);
  const [retiradas, setRetiradas]       = useState<RetiradaPedido[]>([]);
  const [retalhosUsados, setRetalhosUsados] = useState<Awaited<ReturnType<typeof getRetalhosUsadosPorPedido>>>([]);
  const [uploadandoCorteCerto, setUploadandoCorteCerto] = useState(false);
  const [showVincularRetalho, setShowVincularRetalho] = useState(false);
  const [retalhosDisponiveis, setRetalhosDisponiveis] = useState<Array<{ id: string; produto_nome: string; largura: number; altura: number; m2: number; espessura: number | null; box: string | null; observacao: string | null }>>([]);
  const [filtroBuscaRetalho, setFiltroBuscaRetalho] = useState("");
  const [sugestoesIgnoradas, setSugestoesIgnoradas] = useState<Set<string>>(new Set());
  const [selecionandoTodos, setSelecionandoTodos]   = useState(false);
  const [itemParaRetalho, setItemParaRetalho] = useState<number | null>(null);
  const [clientes, setClientes]         = useState<{ id: number; nome: string }[]>([]);
  const [vendedores, setVendedores]     = useState<Pick<Vendedor, "id" | "nome" | "comissao_pct">[]>([]);
  const [creditoCliente, setCreditoCliente] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [salvando, setSalvando]         = useState(false);
  const [uploadandoRomaneio, setUploadandoRomaneio] = useState(false);

  // Qualidade
  const [ncs, setNcs]               = useState<NaoConformidade[]>([]);
  const [modalNC, setModalNC]       = useState(false);
  const [ncForm, setNcForm]         = useState<Partial<NaoConformidadeInsert>>({
    tipo: "Quebra de vidro", gravidade: "Média", status: "Aberta", descricao: "", obs: null,
  });
  const [fotosNC, setFotosNC]       = useState<File[]>([]);

  const [editando, setEditando]         = useState(false);
  const [editForm, setEditForm]         = useState({
    cliente_id: 0, vendedor_id: null as number | null,
    dt_pedido: "", dt_retirada: "",
    forma_pgto: "", conta: "", parcelas: 1, obs: "",
  });
  const [editParcelas, setEditParcelas] = useState<ParcelaEdit[]>([]);
  const [editItens, setEditItens]       = useState<ItemEdit[]>([]);

  // Estado de pagamento por parcela (A Receber)
  const [pagamentos, setPagamentos]     = useState<Record<number, PagamentoParcela>>({});

  // Estado de edição inline dos lançamentos já pagos
  const [editandoPago, setEditandoPago] = useState<Record<number, EdicaoPago>>({});


  useEffect(() => { load(); }, [id]);

  function handlePrintRomaneio() {
    if (!pedido) return;
    const cliente = pedido.clientes?.nome ?? "Cliente";
    const data = pedido.dt_pedido
      ? new Date(pedido.dt_pedido + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, "-")
      : "";
    const tituloOriginal = document.title;
    document.title = `${cliente} - ${data}`;
    window.print();
    setTimeout(() => { document.title = tituloOriginal; }, 2000);
  }

  useEffect(() => {
    if (autoPrint && !loading && pedido) {
      const timer = setTimeout(() => { handlePrintRomaneio(); }, 800);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, loading, pedido]);

  async function load() {
    setLoading(true);
    const [data, lancs, otims, clis, vends, ncsData, rets] = await Promise.all([
      getPedidoById(id),
      getLancamentosPorPedido(id),
      getOtimizacoesPorPedido(id),
      supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").then(r => r.data ?? []),
      supabase.from("vendedores").select("id, nome, comissao_pct").eq("ativo", true).order("nome").then(r => r.data ?? []),
      getNaoConformidadesPorPedido(id),
      getRetiradasPorPedido(id),
    ]);
    setPedido(data);
    setLancamentos(lancs);
    setOtimizacoes(otims);
    setClientes(clis as { id: number; nome: string }[]);
    setVendedores(vends as Pick<Vendedor, "id" | "nome" | "comissao_pct">[]);
    setNcs(ncsData);
    setRetiradas(rets);
    const usos = await getRetalhosUsadosPorPedido(id);
    setRetalhosUsados(usos);
    if (data?.cliente_id) {
      const cred = await getCreditoCliente(data.cliente_id);
      setCreditoCliente(cred);
    }
    const initPag: Record<number, PagamentoParcela> = {};
    for (const l of lancs) {
      if (l.status === "A Receber") {
        initPag[l.id] = {
          lancId: l.id,
          valorOriginal: Number(l.valor),
          valorDigitado: 0,
          dataPagamento: hoje(),
          conta: l.conta || data?.conta || "",
          formaPgto: l.forma_pgto || data?.forma_pgto || "",
          marcando: false,
        };
      }
    }
    setPagamentos(initPag);
    setEditandoPago({});
    setSugestoesIgnoradas(new Set());
    const { data: retDisp } = await supabase
      .from("retalhos")
      .select("id, produto_nome, largura, altura, m2, espessura, box, observacao")
      .eq("status", "Disponível")
      .order("produto_nome");
    setRetalhosDisponiveis((retDisp ?? []) as typeof retalhosDisponiveis);
    setLoading(false);
  }

  function abrirEdicao() {
    if (!pedido) return;
    setEditForm({
      cliente_id:  pedido.cliente_id,
      vendedor_id: pedido.vendedor_id ?? null,
      dt_pedido:   pedido.dt_pedido,
      dt_retirada: pedido.dt_retirada ?? "",
      forma_pgto:  pedido.forma_pgto ?? "",
      conta:       pedido.conta ?? "",
      parcelas:    pedido.parcelas ?? 1,
      obs:         pedido.obs ?? "",
    });
    const aReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) =>
      (a.vencimento ?? "").localeCompare(b.vencimento ?? "")
    );
    if (aReceber.length > 0) {
      setEditParcelas(aReceber.map(l => ({ data: l.vencimento ?? "", valor: l.valor, lancamento_id: l.id })));
    } else {
      const n = pedido.parcelas ?? 1;
      const valorParcela = parseFloat((pedido.valor_total / n).toFixed(2));
      const datas = pedido.datas_pgto ?? [];
      setEditParcelas(Array.from({ length: n }, (_, i) => ({ data: datas[i] ?? "", valor: valorParcela })));
    }
    setEditItens((pedido.itens_pedido ?? []).map((item: any) => ({
      id: item.id,
      produto_nome: item.produto_nome,
      largura: item.largura,
      altura: item.altura,
      quantidade: item.quantidade,
      valor_m2: Number(item.valor_m2),
      lapidacao: Number(item.lapidacao ?? 0),
      vidro_cliente: Boolean(item.vidro_cliente),
    })));
    setEditando(true);
  }

  function handleEditParcelas(n: number) {
    setEditForm(f => ({ ...f, parcelas: n }));
    const primeiraData = editParcelas[0]?.data ?? "";
    setEditParcelas(Array.from({ length: n }, (_, i) => ({
      data: primeiraData ? (i === 0 ? primeiraData : addMeses(primeiraData, i)) : "",
      valor: pedido ? parseFloat((pedido.valor_total / n).toFixed(2)) : 0,
    })));
  }

  function handlePrimeiraDtEdit(data: string) {
    setEditParcelas(prev => prev.map((p, i) => ({
      ...p, data: !data ? "" : (i === 0 ? data : addMeses(data, i)),
    })));
  }

  function calcM2Item(item: ItemEdit): number {
    const l = arredondarParaMultiplo50(item.largura);
    const a = arredondarParaMultiplo50(item.altura);
    return (l / 1000) * (a / 1000) * item.quantidade;
  }

  function calcSubtotalItem(item: ItemEdit): number {
    const m2 = calcM2Item(item);
    return m2 * item.valor_m2 + item.lapidacao * m2;
  }

  function updEditItem(idx: number, field: keyof ItemEdit, value: number | boolean) {
    setEditItens(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const valorTotalEditado = editItens.reduce((a, i) => a + calcSubtotalItem(i), 0);
  const m2TotalEditado    = editItens.reduce((a, i) => a + calcM2Item(i), 0);

  async function salvarEdicao() {
    if (!pedido) return;
    setSalvando(true);

    const result = await updatePedido(pedido.id, {
      cliente_id:   editForm.cliente_id,
      vendedor_id:  editForm.vendedor_id,
      dt_pedido:    editForm.dt_pedido,
      dt_retirada:  editForm.dt_retirada || null,
      forma_pgto:   editForm.forma_pgto,
      conta:        editForm.conta,
      parcelas:     editForm.parcelas,
      obs:          editForm.obs,
      datas_pgto:   editParcelas.map(p => p.data).filter(d => d),
      valores_pgto: editParcelas.map(p => p.valor),
      valor_total:  parseFloat(valorTotalEditado.toFixed(2)),
      m2_total:     parseFloat(m2TotalEditado.toFixed(4)),
    });

    if (!result) { toast("Erro ao salvar pedido", "err"); setSalvando(false); return; }

    for (const item of editItens) {
      const m2 = calcM2Item(item);
      const subtotal = calcSubtotalItem(item);
      await supabase.from("itens_pedido").update({
        largura: item.largura, altura: item.altura,
        quantidade: item.quantidade, valor_m2: item.valor_m2,
        lapidacao: item.lapidacao,
        vidro_cliente: item.vidro_cliente,
        m2: parseFloat(m2.toFixed(4)),
        subtotal: parseFloat(subtotal.toFixed(2)),
      }).eq("id", item.id);
    }

    const aReceber = lancamentos.filter(l => l.status === "A Receber");
    for (const l of aReceber) {
      const ok = await deletarLancamento(l.id);
      if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    }
    for (let i = 0; i < editParcelas.length; i++) {
      const p = editParcelas[i];
      if (!p.data || p.valor <= 0) continue;
      await createLancamento({
        tipo: "Entrada",
        descricao: editForm.parcelas === 1 ? `Recebimento · ${pedido.id}` : `Parcela ${i + 1}/${editForm.parcelas} · ${pedido.id}`,
        valor: p.valor, status: "A Receber", vencimento: p.data,
        pedido_id: pedido.id, cliente_id: editForm.cliente_id,
        conta: editForm.conta || CONTAS[0],
      });
    }
    await recalcularRecebido(pedido.id);

    const lancComissao = lancamentos.find(
      l => l.tipo === "Saída" && (l as any).vendedor_id != null
    );
    const novoVendedorId = editForm.vendedor_id;
    const vendedor = novoVendedorId ? vendedores.find(v => v.id === novoVendedorId) : null;
    const valorComissao = vendedor
      ? parseFloat((valorTotalEditado * vendedor.comissao_pct / 100).toFixed(2))
      : 0;

    if (lancComissao) {
      if (!novoVendedorId) {
        await supabase.from("lancamentos").delete().eq("id", lancComissao.id);
      } else {
        await supabase.from("lancamentos").update({
          descricao:   `Comissão — ${vendedor!.nome} — Pedido ${pedido.id}`,
          valor:        valorComissao,
          vendedor_id:  novoVendedorId,
        } as never).eq("id", lancComissao.id);
      }
    } else if (novoVendedorId && vendedor && valorComissao > 0) {
      await supabase.from("lancamentos").insert([{
        tipo:        "Saída",
        descricao:   `Comissão — ${vendedor.nome} — Pedido ${pedido.id}`,
        valor:        valorComissao,
        status:       "Pendente",
        vencimento:   null,
        pedido_id:    pedido.id,
        cliente_id:   null,
        vendedor_id:  novoVendedorId,
      } as never]);
    }

    toast("Pedido atualizado");
    setSalvando(false);
    setEditando(false);
    await load();
  }

  async function handleMarcarPago(lancId: number) {
    if (!pedido) return;
    const pag = pagamentos[lancId];
    if (!pag) return;

    setPagamentos(prev => ({ ...prev, [lancId]: { ...prev[lancId], marcando: true } }));

    const valorPagar = pag.valorDigitado > 0 ? pag.valorDigitado : pag.valorOriginal;
    const dataPgto   = pag.dataPagamento || hoje();

    await updateLancamento(lancId, {
      status: "Pago",
      valor: valorPagar,
      vencimento: dataPgto,
      conta: pag.conta || undefined,
      forma_pgto: pag.formaPgto || undefined,
    });

    await recalcularRecebido(pedido.id);

    const restante = parseFloat((pag.valorOriginal - valorPagar).toFixed(2));
    if (restante > 0.005) {
      const lancOriginal = lancamentos.find(l => l.id === lancId);
      await createLancamento({
        tipo: "Entrada",
        descricao: lancOriginal?.descricao ?? `Recebimento · ${pedido.id}`,
        valor: restante,
        status: "A Receber",
        vencimento: dataPgto,
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
      });
      toast(`✓ ${formatBRL(valorPagar)} recebido · Saldo ${formatBRL(restante)} gerado`);
    } else {
      const excedente = Math.max(0, valorPagar - pag.valorOriginal);
      if (excedente > 0.005 && pedido.cliente_id) {
        const creditoAtual = await getCreditoCliente(pedido.cliente_id);
        await atualizarCreditoCliente(pedido.cliente_id, creditoAtual + excedente);
      }
      toast(`✓ ${formatBRL(valorPagar)} registrado`);
    }

    await load();
  }

  async function handleDeletarLancamento(lancId: number) {
    if (!pedido) return;
    const lanc = lancamentos.find(l => l.id === lancId);
    if (!lanc) return;

    // Lançamento já pago: desfaz o recebimento consolidando com eventuais
    // saldos parciais gerados automaticamente (mesma descrição, mesmo pedido)
    if (lanc.status === "Pago") {
      if (!confirm("Desfazer este recebimento? O lançamento voltará ao valor original.")) return;
      setSalvando(true);

      // Restos "A Receber" gerados pelo pagamento parcial (mesma descrição)
      const restos = lancamentos.filter(l =>
        l.id !== lancId &&
        l.status === "A Receber" &&
        l.pedido_id === pedido.id &&
        l.descricao === lanc.descricao
      );
      const valorConsolidado = parseFloat((lanc.valor + restos.reduce((a, l) => a + l.valor, 0)).toFixed(2));

      // Remove os restos parciais
      for (const r of restos) await deletarLancamento(r.id);

      // Restaura o lançamento original com o valor total consolidado
      const ok = await updateLancamento(lancId, { status: "A Receber", conta: null, valor: valorConsolidado });
      if (!ok) { toast("Erro ao desfazer recebimento", "err"); setSalvando(false); return; }
      await recalcularRecebido(pedido.id);
      toast("Recebimento desfeito");
      await load();
      setSalvando(false);
      return;
    }

    if (!confirm("Remover esta parcela?")) return;
    setSalvando(true);
    const ok = await deletarLancamento(lancId);
    if (!ok) { toast("Erro ao remover lançamento", "err"); setSalvando(false); return; }
    await recalcularRecebido(pedido.id);
    toast("Parcela removida");
    await load();
    setSalvando(false);
  }

  // Abre edição inline de um lançamento pago
  function abrirEdicaoPago(l: Lancamento) {
    setEditandoPago(prev => ({
      ...prev,
      [l.id]: {
        valor: l.valor,
        data: l.vencimento ?? "",
        conta: l.conta ?? "",
        formaPgto: l.forma_pgto ?? "",
        salvando: false,
      },
    }));
  }

  // Cancela edição inline de um lançamento pago
  function cancelarEdicaoPago(lancId: number) {
    setEditandoPago(prev => {
      const next = { ...prev };
      delete next[lancId];
      return next;
    });
  }

  // Salva edição inline de um lançamento pago
   async function handleSalvarEdicaoPago(lancId: number) {
    const ed = editandoPago[lancId];
    if (!ed || !pedido) return;
    setEditandoPago(prev => ({ ...prev, [lancId]: { ...prev[lancId], salvando: true } }));

    const atualizado = await updateLancamento(lancId, {
      valor: ed.valor,
      vencimento: ed.data,
      conta: ed.conta || null,
      forma_pgto: ed.formaPgto || null,
    });

    if (!atualizado) {
      toast("Erro ao salvar", "err");
      setEditandoPago(prev => ({ ...prev, [lancId]: { ...prev[lancId], salvando: false } }));
      return;
    }

    await recalcularRecebido(pedido.id);
    toast("✓ Pagamento atualizado");
    cancelarEdicaoPago(lancId);
    await load();
  }

  async function handleAdicionarParcela() {
    if (!pedido) return;
    const totalAReceber = parcelasAReceber.reduce((a, l) => a + l.valor, 0);
    const restante = parseFloat((Math.max(0, pedido.valor_total - pedido.valor_recebido - totalAReceber)).toFixed(2));
    await createLancamento({
      tipo: "Entrada",
      descricao: `Recebimento · ${pedido.id}`,
      valor: restante > 0 ? restante : 0,
      status: "A Receber",
      vencimento: hoje(),
      pedido_id: pedido.id,
      cliente_id: pedido.cliente_id,
    });
    await load();
    toast("Parcela adicionada");
  }

  async function handleSalvarNC() {
    if (!pedido) return;
    if (!ncForm.descricao?.trim()) { toast("Descrição obrigatória", "warn"); return; }
    setSalvando(true);
    const payload: NaoConformidadeInsert = {
      codigo: "",
      pedido_id: pedido.id,
      cliente_id: pedido.cliente_id,
      produto_nome: ncForm.produto_nome ?? null,
      item_pedido_id: null,
      etapa: pedido.status,
      tipo: ncForm.tipo as TipoNC ?? "Outro",
      gravidade: ncForm.gravidade as GravidadeNC ?? "Média",
      status: "Aberta",
      descricao: ncForm.descricao!,
      obs: ncForm.obs ?? null,
      fotos_urls: null,
      registrado_por: null,
      responsavel_analise: ncForm.responsavel_analise ?? null,
      dt_ocorrencia: new Date().toISOString(),
      dt_resolucao: null,
    };
    const result = await createNaoConformidade(payload);
    if (result) {
      if (fotosNC.length > 0) {
        const urls = await uploadFotosNC(result.id, fotosNC);
        if (urls.length > 0) await updateNaoConformidade(result.id, { fotos_urls: urls });
      }
      toast(`${result.codigo} registrada`);
      setModalNC(false);
      setNcForm({ tipo: "Quebra de vidro", gravidade: "Média", status: "Aberta", descricao: "", obs: null });
      setFotosNC([]);
      await load();
    } else {
      toast("Erro ao registrar NC", "err");
    }
    setSalvando(false);
  }

  async function handleUploadCorteCerto(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoCorteCerto(true);
    for (const file of files) {
      const url = await uploadCorteCertoPdf(id, file);
      if (!url) { toast("Erro ao enviar arquivo", "err"); }
    }
    toast(files.length > 1 ? `${files.length} PDFs do Corte Certo salvos` : "PDF do Corte Certo salvo");
    await load();
    setUploadandoCorteCerto(false);
  }

  async function handleRemoverCorteCerto(url: string) {
    if (!pedido || !confirm("Remover este arquivo?")) return;
    await deleteCorteCertoPdf(id, url);
    await load();
  }

  function abrirVincularRetalho() {
    setFiltroBuscaRetalho("");
    setItemParaRetalho(null);
    setShowVincularRetalho(true);
  }

  async function handleVincularRetalho(retalhoId: string, itemPedidoId?: number | null) {
    const r = await vincularRetalhoAoPedido(id, retalhoId, itemPedidoId ?? null);
    if (r.ok) {
      toast(`Retalho ${retalhoId} vinculado`);
      setShowVincularRetalho(false);
      await load();
    } else {
      toast("Erro ao vincular retalho", "err");
    }
  }

  async function handleSelecionarTodos(sugestoesPendentes: typeof sugestoes) {
    if (!sugestoesPendentes.length) return;
    setSelecionandoTodos(true);
    let ok = 0, err = 0;
    for (const s of sugestoesPendentes) {
      const r = await vincularRetalhoAoPedido(id, s.retalhoId, s.itemId);
      if (r.ok) ok++; else err++;
    }
    await load();
    setSelecionandoTodos(false);
    if (err === 0) toast(`${ok} retalho${ok > 1 ? "s" : ""} vinculado${ok > 1 ? "s" : ""}`);
    else toast(`${ok} vinculado${ok > 1 ? "s" : ""}, ${err} com erro`, "err");
  }

  async function handleDesvincularRetalho(usoId: number, retalhoId: string) {
    if (!confirm(`Desvincular retalho ${retalhoId} deste pedido e devolver ao estoque?`)) return;
    const ok = await desvincularRetalhoAoPedido(usoId, retalhoId);
    if (ok) { toast("Retalho devolvido ao estoque"); await load(); }
    else toast("Erro ao desvincular", "err");
  }

  async function handleAvancar() {
    if (!pedido) return;
    setSalvando(true);
    const result = await avancarStatusPedido(pedido.id, pedido.status);
    if (result) toast(`${pedido.id} → ${result.status}`);
    else toast("Erro ao avançar status", "err");
    await load();
    setSalvando(false);
  }

  async function handleUsarCredito() {
    if (!pedido) return;
    setSalvando(true);
    const result = await utilizarCreditoEmPedido(pedido.id, creditoCliente, hoje());
    setSalvando(false);
    if (!result) { toast("Erro ao aplicar crédito", "err"); return; }
    toast(`✓ ${formatBRL(creditoCliente - result.creditoRestante)} de crédito aplicado`);
    await load();
  }

  async function handleUploadRomaneioAssinado(files: File[]) {
    if (!pedido || files.length === 0) return;
    setUploadandoRomaneio(true);
    const urls = await uploadRomaneioAssinado(id, files);
    if (urls.length > 0) {
      const existentes = pedido.romaneio_assinado_urls ?? [];
      await updatePedido(id, { romaneio_assinado_urls: [...existentes, ...urls] } as any);
      toast(urls.length > 1 ? `${urls.length} romaneios assinados salvos` : "Romaneio assinado salvo");
      await load();
    } else {
      toast("Erro ao enviar arquivo", "err");
    }
    setUploadandoRomaneio(false);
  }

  async function handleRemoverRomaneioAssinado(url: string) {
    if (!pedido) return;
    if (!confirm("Remover este romaneio assinado?")) return;
    await deleteRomaneioAssinado(url);
    const restantes = (pedido.romaneio_assinado_urls ?? []).filter(u => u !== url);
    await updatePedido(id, { romaneio_assinado_urls: restantes.length > 0 ? restantes : null } as any);
    toast("Arquivo removido");
    await load();
  }

  if (loading) return <AppLayout><div className="con"><div className="loading">Carregando pedido...</div></div></AppLayout>;
  if (!pedido) return <AppLayout><div className="con"><div style={{ color:"var(--err)", padding:"32px" }}>Pedido não encontrado.</div></div></AppLayout>;

  const aberto       = Number(pedido.valor_total) - Number(pedido.valor_recebido);
  const quitado      = aberto <= 0;
  const pctRec       = pedido.valor_total > 0 ? Math.min(100, (Number(pedido.valor_recebido) / Number(pedido.valor_total)) * 100) : 0;
  const statusIdx    = FLUXO.indexOf(pedido.status);
  const podeAvancar  = !["Entregue","Cancelado"].includes(pedido.status);
  const temItens     = (pedido.itens_pedido?.length ?? 0) > 0;
  const podeRomaneio   = true;
  const podeChecklist  = statusIdx >= FLUXO.indexOf("Separação");
  const temOtimizacao = otimizacoes.length > 0;
  const ultimaOtim   = otimizacoes[0] ?? null;
  const todosVidroCliente = temItens && (pedido.itens_pedido ?? []).every(i => (i as any).vidro_cliente === true);
  const todosChapa        = temItens && (pedido.itens_pedido ?? []).every(i => isChapaInteira(i.largura, i.altura));

  const saldoRetiradas     = calcularSaldoItens(pedido.itens_pedido ?? [], retiradas);
  const totalPecasPedido   = saldoRetiradas.reduce((a, s) => a + s.quantidade_total, 0);
  const totalPecasRetirado = saldoRetiradas.reduce((a, s) => a + s.quantidade_retirada, 0);
  const corRetiradas =
    totalPecasRetirado === 0          ? { bg: "rgba(255,255,255,.04)", border: "var(--b2)",          text: "var(--t2)"  }
    : totalPecasRetirado >= totalPecasPedido ? { bg: "rgba(16,185,129,.06)", border: "rgba(16,185,129,.3)", text: "var(--ok)"   }
    :                                    { bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.3)", text: "var(--warn)" };
  const m2RetalhosUsados = retalhosUsados.reduce((a, u) => a + Number(u.retalhos?.m2 ?? 0), 0);

  const parcelasAReceber = lancamentos.filter(l => l.status === "A Receber").sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));
  const lancamentosPagos = lancamentos.filter(l => l.status === "Pago");

  const sugestoes = calcSugestoes(pedido.itens_pedido ?? [], retalhosDisponiveis, retalhosUsados as any, sugestoesIgnoradas);
  const assignmentMap = computeAssignmentMap(pedido.itens_pedido ?? [], retalhosUsados as any);

  const fc: React.CSSProperties = {
    background: "var(--surf2)", border: "1px solid var(--b2)", borderRadius: "6px",
    padding: "9px 12px", color: "var(--t1)", fontSize: "13px",
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  const fcSm: React.CSSProperties = { ...fc, padding: "7px 10px", fontSize: "12px" };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sb { display: none !important; }
          body { background: white !important; color: black !important; overflow: auto !important; }
          .erp-layout { display: block !important; }
          .erp-content, .erp-main { overflow: visible !important; }
          .print-area { display: block !important; }
          .con { padding: 0 !important; }
          @page { margin: 0; size: A4; }
          .print-area * { font-weight: 700 !important; color: #000 !important; }
        }
        .print-area { display: none; }
        @media print { .print-area { display: block; } }
      `}</style>

      <AppLayout>
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex:1 }}>
            Pedido <span style={{ color:"var(--acc)" }}>{pedido.id}</span>
          </div>
          <span className={CHIP[pedido.status] ?? "chip cgr"}>{pedido.status}</span>
          <button className="btn bg sm" onClick={() => router.push(`/pedidos/${id}/editar`)}>✏ Editar</button>
          <button className="btn bg sm" onClick={() => router.push(`/pedidos/novo?duplicarDe=${id}`)}>⧉ Duplicar</button>
          {temItens && (
            <a href={"/pedidos/" + pedido.id + "/etiquetas"} className="btn bg sm" style={{ textDecoration:"none" }}>🏷 Etiquetas</a>
          )}
          {temItens && (
            <a href={`/pedidos/${id}/retiradas`} className="btn bg sm" style={{ textDecoration:"none" }}>🚚 Retiradas</a>
          )}
          {podeChecklist && (
            <a
              href={`/pedidos/${id}/checklist`}
              className="btn sm"
              style={{
                background: "rgba(0,200,255,.12)",
                border: "1px solid var(--acc2)",
                color: "var(--acc2)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ☑ Checklist
            </a>
          )}
          <button
            className="btn sm"
            onClick={() => podeRomaneio && handlePrintRomaneio()}
            style={{ background: podeRomaneio ? "rgba(16,185,129,.15)" : "transparent", border: "1px solid " + (podeRomaneio ? "var(--ok)" : "var(--b2)"), color: podeRomaneio ? "var(--ok)" : "var(--t3)", fontWeight:700, cursor: podeRomaneio ? "pointer" : "default", opacity: podeRomaneio ? 1 : 0.35, transition:"all 0.2s" }}
          >R</button>
          <button
            className="btn sm"
            onClick={() => setModalNC(true)}
            title="Registrar Não Conformidade"
            style={{ background: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.12)" : "transparent", border: `1px solid ${ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.5)" : "var(--b2)"}`, color: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "var(--err)" : "var(--t3)", fontWeight:700 }}
          >
            ⚑ NC{ncs.length > 0 ? ` (${ncs.length})` : ""}
          </button>
          {podeAvancar && (
            <button className="btn bp sm" onClick={handleAvancar} disabled={salvando}>
              {salvando ? "Salvando..." : "Avançar Status →"}
            </button>
          )}
        </div>

        <div className="con no-print" style={{ display:"flex", flexDirection:"column", gap:"20px" }}>

          {/* Corte Certo PDF */}
          <div className="card" style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>
                CORTE CERTO{(pedido.corte_certo_urls?.length ?? 0) > 0 ? ` (${pedido.corte_certo_urls!.length})` : ""}
              </div>
              {pedido.status === "Planejamento" && (
                <span style={{ fontSize:"11px", color:"var(--warn)", fontFamily:"'DM Mono', monospace" }}>
                  → Avançar para Em Produção descontará estoque automaticamente
                </span>
              )}
            </div>

            {(pedido.corte_certo_urls?.length ?? 0) > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginBottom:"10px" }}>
                {pedido.corte_certo_urls!.map((url, i) => (
                  <div key={url} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 12px", background:"rgba(99,102,241,.08)", borderRadius:"7px", border:"1px solid rgba(99,102,241,.2)" }}>
                    <span style={{ fontSize:"15px" }}>📄</span>
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex:1, color:"var(--acc)", fontWeight:600, fontSize:"13px", textDecoration:"underline" }}>
                      Plano de corte {i + 1}
                    </a>
                    <button className="btn bw sm" onClick={() => handleRemoverCorteCerto(url)} disabled={uploadandoCorteCerto}>Remover</button>
                  </div>
                ))}
              </div>
            )}

            <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", padding:"16px", border:"2px dashed var(--b2)", borderRadius:"8px", cursor: uploadandoCorteCerto ? "default" : "pointer", background:"var(--surf2)" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoCorteCerto) handleUploadCorteCerto(fs); }}>
              <span style={{ fontSize:"18px" }}>📎</span>
              <span style={{ fontSize:"12px", color:"var(--t3)" }}>
                {uploadandoCorteCerto ? "Enviando..." : "Arraste ou clique para anexar o PDF do Corte Certo"}
              </span>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple style={{ display:"none" }} disabled={uploadandoCorteCerto}
                onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadCorteCerto(fs); e.target.value = ""; }} />
            </label>
          </div>

          {/* Retalhos utilizados */}
          <div className="card" style={{ padding:"16px 20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>
                RETALHOS &amp; CORTE CERTO
              </div>
              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                {retalhosUsados.length > 0 && (
                  <a href={`/pedidos/${id}/plano-retalhos`} className="btn bg sm" style={{ textDecoration:"none", whiteSpace:"nowrap" }}>✂ Plano de Retalhos</a>
                )}
                {sugestoes.length > 0 && (
                  <button
                    className="btn bp sm"
                    disabled={selecionandoTodos}
                    style={{ whiteSpace:"nowrap" }}
                    onClick={() => handleSelecionarTodos(sugestoes)}
                  >
                    {selecionandoTodos ? "Vinculando…" : `✓ Usar Todos (${sugestoes.length})`}
                  </button>
                )}
                <button className="btn bg sm" onClick={abrirVincularRetalho}>+ Vincular Retalho</button>
              </div>
            </div>

            {/* View unificada: por item → por peça */}
            {(() => {
              const itensCorte = (pedido.itens_pedido ?? []).filter((i: any) => !i.vidro_cliente);
              if (itensCorte.length === 0) return (
                <div style={{ color:"var(--t3)", fontSize:"12px", padding:"8px 0" }}>Nenhum item para corte neste pedido.</div>
              );
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
                  {itensCorte.map((item: any) => {
                    const retalhosDoItem = assignmentMap.get(item.id) ?? [];
                    const sugestoesDoItem = sugestoes.filter(s => s.itemId === item.id);
                    const nCoberto = retalhosDoItem.length;
                    const nSugerido = sugestoesDoItem.length;
                    const nCorte = Math.max(0, item.quantidade - nCoberto - nSugerido);
                    const tudoCoberto = nCorte === 0 && nSugerido === 0;

                    return (
                      <div key={item.id}>
                        {/* Cabeçalho do item */}
                        <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px" }}>
                          <span style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)" }}>{item.produto_nome}</span>
                          <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{item.largura}×{item.altura}mm</span>
                          <span style={{ fontSize:"11px", color:"var(--t3)" }}>· {item.quantidade} pç</span>
                          {tudoCoberto && <span style={{ fontSize:"10px", color:"var(--ok)", fontWeight:700, marginLeft:"4px" }}>✓ tudo coberto</span>}
                        </div>

                        {/* Linha por peça */}
                        <div style={{ display:"flex", flexDirection:"column", gap:"4px", paddingLeft:"4px" }}>

                          {/* Retalhos já vinculados */}
                          {retalhosDoItem.map((u: any, pi: number) => (
                            <div key={u.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"7px 12px", background:"rgba(16,185,129,.07)", border:"1px solid rgba(16,185,129,.2)", borderRadius:"7px" }}>
                              <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", minWidth:"36px" }}>pç {pi + 1}</span>
                              <span style={{ fontSize:"13px", color:"var(--ok)" }}>✓</span>
                              <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--acc2)", fontWeight:700, fontSize:"12px" }}>{u.retalho_id}</span>
                              {u.retalhos && (
                                <>
                                  <span style={{ fontSize:"11px", color:"var(--t2)", fontFamily:"'DM Mono',monospace" }}>{u.retalhos.largura}×{u.retalhos.altura}mm</span>
                                  {u.retalhos.box && <span style={{ fontSize:"10px", color:"var(--t3)" }}>box {u.retalhos.box}</span>}
                                  {u.retalhos.observacao && <span style={{ fontSize:"10px", color:"var(--warn)", fontWeight:600 }}>👤 {u.retalhos.observacao}</span>}
                                </>
                              )}
                              <button
                                className="btn bw sm"
                                style={{ marginLeft:"auto", flexShrink:0 }}
                                onClick={() => handleDesvincularRetalho(u.id, u.retalho_id)}
                              >Desvincular</button>
                            </div>
                          ))}

                          {/* Sugestões pendentes */}
                          {sugestoesDoItem.map((s, pi) => (
                            <div key={s.retalhoId} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"7px 12px", background:"rgba(99,102,241,.08)", border:"1px solid rgba(99,102,241,.25)", borderRadius:"7px" }}>
                              <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", minWidth:"36px" }}>pç {nCoberto + pi + 1}</span>
                              <span style={{ fontSize:"13px", color:"var(--acc)" }}>◎</span>
                              <span style={{ fontFamily:"'DM Mono',monospace", color:"var(--acc2)", fontWeight:700, fontSize:"12px" }}>{s.retalhoId}</span>
                              <span style={{ fontSize:"11px", color:"var(--t2)", fontFamily:"'DM Mono',monospace" }}>{s.retalho.largura}×{s.retalho.altura}mm</span>
                              {s.retalho.box && <span style={{ fontSize:"10px", color:"var(--t3)" }}>box {s.retalho.box}</span>}
                              <span style={{ fontSize:"10px", color:"var(--acc)", background:"rgba(99,102,241,.12)", border:"1px solid rgba(99,102,241,.2)", borderRadius:"3px", padding:"1px 6px" }}>sugestão{s.rotacionado ? " ↻" : ""}</span>
                              <div style={{ marginLeft:"auto", display:"flex", gap:"5px", flexShrink:0 }}>
                                <button
                                  className="btn bp sm"
                                  onClick={() => { handleVincularRetalho(s.retalhoId, s.itemId); }}
                                >Usar</button>
                                <button
                                  className="btn bg sm"
                                  onClick={() => { setSugestoesIgnoradas(prev => { const n = new Set(prev); n.add(s.retalhoId); return n; }); }}
                                >Pular</button>
                              </div>
                            </div>
                          ))}

                          {/* Peças que vão para o Corte Certo */}
                          {nCorte > 0 && Array.from({ length: nCorte }, (_, pi) => (
                            <div key={pi} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"7px 12px", background:"rgba(245,158,11,.06)", border:"1px solid rgba(245,158,11,.2)", borderRadius:"7px" }}>
                              <span style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", minWidth:"36px" }}>pç {nCoberto + nSugerido + pi + 1}</span>
                              <span style={{ fontSize:"13px", color:"var(--warn)" }}>✂</span>
                              <span style={{ fontSize:"12px", color:"var(--warn)", fontWeight:600 }}>Corte Certo</span>
                              <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{item.largura}×{item.altura}mm</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* bloco legado de otimização interna — oculto, mantido para histórico */}
          {temOtimizacao && ultimaOtim && false && (
            <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.3)", borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
              <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"2px" }}>PLANO DE CORTE</div>
                  <div style={{ fontSize:"13px", color:"var(--ok)", fontWeight:700 }}>✓ Otimização gerada</div>
                </div>
                <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                  <span>Aproveitamento: <strong style={{ color:"var(--ok)" }}>{ultimaOtim.aproveitamento}%</strong></span>
                  <span>Chapas: <strong style={{ color:"var(--t1)" }}>{ultimaOtim.chapas_usadas}</strong></span>
                  <span>Data: <strong style={{ color:"var(--t1)" }}>{formatDate(ultimaOtim.dt_otim)}</strong></span>
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <a href={"/pedidos/" + pedido?.id + "/plano"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>◈ Ver Plano</a>
                <a href={"/pedidos/" + pedido?.id + "/etiquetas"} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🏷 Etiquetas</a>
              </div>
            </div>
          )}

          {/* Progresso */}
          <div className="card" style={{ padding:"20px 24px" }}>
            {(() => {
              const history = (pedido.status_history ?? []) as { status: string; desde: string }[];
              return (
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"center", width:"100%" }}>
                  {FLUXO.map((step, i) => {
                    const done    = i < statusIdx;
                    const current = i === statusIdx;
                    const last    = i === FLUXO.length - 1;
                    const dur     = duracaoEtapa(history, step);
                    return (
                      <div key={step} style={{ display:"flex", alignItems:"flex-start", flex: last ? "0 0 auto" : "1 1 0", minWidth:0 }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"5px", width:"84px", flexShrink:0 }}>
                          <div style={{ width:"26px", height:"26px", borderRadius:"50%", background: done ? "var(--ok)" : current ? "var(--acc)" : "var(--surf3)", border: current ? "2px solid var(--acc)" : "2px solid transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", fontWeight:700, color: done || current ? "#000" : "var(--t3)", flexShrink:0 }}>
                            {done ? "✓" : i + 1}
                          </div>
                          <div style={{ fontSize:"9px", textAlign:"center", lineHeight:1.3, color: current ? "var(--acc)" : done ? "var(--ok)" : "var(--t3)", fontWeight: current ? 700 : 500, fontFamily:"'DM Mono', monospace", wordBreak:"break-word" }}>
                            {step}
                          </div>
                          {dur && (
                            <div style={{ fontSize:"8px", color: current ? "var(--acc)" : "var(--t3)", fontFamily:"'DM Mono', monospace", background: current ? "rgba(99,102,241,.1)" : "var(--surf3)", borderRadius:"4px", padding:"1px 5px", whiteSpace:"nowrap" }}>
                              {current ? "⏱ " : ""}{dur}
                            </div>
                          )}
                        </div>
                        {!last && <div style={{ flex:"1 1 auto", height:"2px", marginTop:"12px", background: done ? "var(--ok)" : "var(--surf3)", minWidth:"8px" }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Retiradas */}
          {temItens && (
            <div style={{ background: corRetiradas.bg, border: `1px solid ${corRetiradas.border}`, borderRadius:"10px", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
              <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"2px" }}>RETIRADAS</div>
                  <div style={{ fontSize:"13px", color: corRetiradas.text, fontWeight:700 }}>
                    {totalPecasRetirado} de {totalPecasPedido} peça(s) retirada(s)
                  </div>
                </div>
                <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                  <span>Viagens: <strong style={{ color:"var(--t1)" }}>{retiradas.length}</strong></span>
                  <span>Pendente: <strong style={{ color:"var(--t1)" }}>{totalPecasPedido - totalPecasRetirado}</strong></span>
                </div>
              </div>
              <a href={`/pedidos/${id}/retiradas`} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🚚 Ver Retiradas</a>
            </div>
          )}

          {/* Grid info + financeiro */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
            <div className="card" style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <Row label="Cliente"            value={pedido.clientes?.nome ?? "—"} />
                <Row label="Cidade"             value={pedido.clientes?.cidade ?? "—"} />
                <Row label="Telefone"           value={pedido.clientes?.tel ?? "—"} />
                <Row label="Data do pedido"     value={formatDate(pedido.dt_pedido)} />
                <Row label="Retirada prevista"  value={formatDate(pedido.dt_retirada)} />
                <Row label={(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"} value={Number(pedido.m2_total).toFixed(2) + " " + ((pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²")} />
                {pedido.parcelas > 1 && <Row label="Parcelas" value={pedido.parcelas + "×"} />}
                {(() => {
                  const lancComissao = lancamentos.find(l => l.tipo === "Saída" && (l as any).vendedor_id != null);
                  const vend = vendedores.find(v => v.id === pedido.vendedor_id);
                  if (!pedido.vendedor_id && !lancComissao) return null;
                  const nome = vend?.nome ?? (lancamentos.find(l => (l as any).vendedor_id != null) as any)?.descricao?.split("—")[1]?.trim() ?? "—";
                  const pct  = vend ? vend.comissao_pct : null;
                  const valCom = lancComissao ? lancComissao.valor : null;
                  return (
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderTop:"1px solid var(--b1)" }}>
                      <span style={{ fontSize:"12px", color:"var(--t3)" }}>Vendedor</span>
                      <span style={{ fontSize:"12px", fontWeight:700, color:"var(--warn)", fontFamily:"'DM Mono',monospace" }}>
                        {nome}{pct != null ? ` · ${pct}%` : ""}{valCom != null ? ` = ${valCom.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}` : ""}
                      </span>
                    </div>
                  );
                })()}
                {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            </div>

            <div className="card" style={{ padding:"20px 24px" }}>
              {/* Cabeçalho */}
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>FINANCEIRO</div>

              {/* Resumo em 3 colunas */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", marginBottom:"14px" }}>
                <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Total</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(pedido.valor_total)}</div>
                </div>
                <div style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>Recebido</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color: pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t3)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(pedido.valor_recebido)}</div>
                </div>
                <div style={{ background: quitado ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.06)", borderRadius:"8px", padding:"10px 12px", border:`1px solid ${quitado ? "rgba(16,185,129,.3)" : "rgba(244,63,94,.2)"}` }}>
                  <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", marginBottom:"4px" }}>{quitado ? "Quitado ✓" : "Em aberto"}</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color: quitado ? "var(--ok)" : "var(--err)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(Math.max(0, aberto))}</div>
                </div>
              </div>

              {/* Barra de progresso */}
              <div style={{ marginBottom:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"10px", color:"var(--t3)", marginBottom:"5px" }}>
                  <span>Recebimento</span><span style={{ fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{pctRec.toFixed(0)}%</span>
                </div>
                <div style={{ height:"5px", borderRadius:"3px", background:"var(--surf3)", overflow:"hidden" }}>
                  <div style={{ height:"100%", borderRadius:"3px", width:`${pctRec}%`, background: quitado ? "var(--ok)" : "var(--acc)", transition:"width .3s" }} />
                </div>
              </div>

              {/* Parcelas a receber — sempre visível */}
              {!quitado && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em" }}>A RECEBER</div>
                    <button
                      onClick={handleAdicionarParcela}
                      style={{ fontSize:"11px", background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", cursor:"pointer", padding:"3px 9px", transition:"all 0.15s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--acc)"; b.style.color="var(--acc)"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                    >+ Parcela</button>
                  </div>

                  {parcelasAReceber.length === 0 ? (
                    <div style={{ padding:"14px 16px", background:"var(--surf2)", borderRadius:"8px", border:"1px dashed var(--b2)", textAlign:"center", fontSize:"12px", color:"var(--t3)" }}>
                      Nenhuma parcela em aberto — clique em <strong>+ Parcela</strong> para registrar.
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                      {parcelasAReceber.map((l) => {
                        const pag = pagamentos[l.id];
                        const marcando = pag?.marcando ?? false;
                        const valorDigitado = pag?.valorDigitado ?? 0;
                        const vencido = l.vencimento && l.vencimento < hoje();
                        const isParcial = valorDigitado > 0 && valorDigitado < l.valor;
                        const restante  = isParcial ? parseFloat((l.valor - valorDigitado).toFixed(2)) : 0;
                        return (
                          <div key={l.id} style={{ background:"var(--surf2)", borderRadius:"8px", padding:"10px 12px", border:`1px solid ${vencido ? "rgba(244,63,94,.3)" : "var(--b2)"}` }}>
                            {/* linha topo: checkbox + descrição + valor + lixeira */}
                            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                              <input
                                type="checkbox"
                                disabled={marcando}
                                onChange={() => handleMarcarPago(l.id)}
                                style={{ width:"16px", height:"16px", accentColor:"var(--ok)", cursor:"pointer", flexShrink:0 }}
                                title="Marcar como pago"
                              />
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {l.descricao}
                                </div>
                                <div style={{ fontSize:"10px", color: vencido ? "var(--err)" : "var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"2px" }}>
                                  {vencido ? "⚠ Vencido · " : "Vence: "}{formatDate(l.vencimento)}
                                </div>
                              </div>
                              <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                                {formatBRL(l.valor)}
                              </div>
                              <button
                                title="Remover parcela"
                                onClick={() => handleDeletarLancamento(l.id)}
                                style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1, flexShrink:0 }}
                                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                              >🗑</button>
                            </div>

                            {/* campos inline 2×2: data/conta · forma/valor */}
                            <div style={{ marginTop:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                              <div>
                                <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Data pgto</div>
                                <DateInput
                                  value={pag?.dataPagamento ?? hoje()}
                                  onChange={v => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], dataPagamento: v } }))}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Conta</div>
                                <select
                                  value={pag?.conta ?? ""}
                                  onChange={e => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], conta: e.target.value } }))}
                                  style={{ ...fc, fontSize:"12px", padding:"7px 8px" }}
                                >
                                  <option value="">— Conta —</option>
                                  {CONTAS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div>
                                <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Forma pgto</div>
                                <select
                                  value={pag?.formaPgto ?? ""}
                                  onChange={e => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], formaPgto: e.target.value } }))}
                                  style={{ ...fc, fontSize:"12px", padding:"7px 8px" }}
                                >
                                  <option value="">— Forma —</option>
                                  {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                                </select>
                              </div>
                              <div>
                                <div style={{ fontSize:"9px", color:"var(--t3)", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", marginBottom:"4px" }}>Valor pago</div>
                                <CurrencyInput
                                  value={valorDigitado}
                                  onChange={v => setPagamentos(prev => ({ ...prev, [l.id]: { ...prev[l.id], valorDigitado: v } }))}
                                  placeholder={formatBRL(l.valor)}
                                  style={{ margin:0, fontSize:"12px", padding:"7px 8px" }}
                                />
                              </div>
                            </div>

                            {isParcial && (
                              <div style={{ marginTop:"8px", fontSize:"11px", color:"var(--warn)", fontFamily:"'DM Mono',monospace", background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)", borderRadius:"6px", padding:"6px 10px" }}>
                                ⚡ Parcial — saldo de {formatBRL(restante)} será gerado automaticamente
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── HISTÓRICO DE PAGAMENTOS JÁ FEITOS ── */}
              {lancamentosPagos.length > 0 && (
                <div style={{ marginBottom:"16px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em" }}>HISTÓRICO PAGO</div>
                    <div style={{ fontSize:"10px", color:"var(--t3)" }}>clique para editar</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                    {lancamentosPagos.map(l => {
                      const ed = editandoPago[l.id];
                      const isEditing = !!ed;
                      return (
                        <div
                          key={l.id}
                          style={{
                            background: isEditing ? "var(--surf3)" : "var(--surf2)",
                            borderRadius:"8px",
                            border: `1px solid ${isEditing ? "var(--acc)" : "var(--b2)"}`,
                            overflow:"hidden",
                            transition:"border-color 0.15s, background 0.15s",
                          }}
                        >
                          {/* Linha principal — clicável para editar */}
                          <div
                            onClick={() => { if (!isEditing) abrirEdicaoPago(l); }}
                            style={{
                              display:"flex", alignItems:"center", gap:"8px",
                              padding:"9px 12px",
                              cursor: isEditing ? "default" : "pointer",
                            }}
                            onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLDivElement).style.background = "var(--surf3)"; }}
                            onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLDivElement).style.background = ""; }}
                          >
                            <span style={{ fontSize:"11px", color:"var(--ok)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>✓ Pago</span>
                            <span style={{ fontSize:"13px", color:"var(--ok)", fontFamily:"'DM Mono',monospace", fontWeight:600, flex:1 }}>
                              {formatBRL(l.valor)}
                            </span>
                            {/* Badges conta + forma */}
                            {l.forma_pgto && (
                              <span style={{
                                fontSize:"10px", color:"var(--warn)", fontFamily:"'DM Mono',monospace",
                                background:"rgba(245,158,11,.08)", border:"1px solid rgba(245,158,11,.25)",
                                borderRadius:"4px", padding:"2px 7px", flexShrink:0, fontWeight:600,
                              }}>
                                {l.forma_pgto}
                              </span>
                            )}
                            {l.conta && (
                              <span style={{
                                fontSize:"10px", color:"var(--acc2)", fontFamily:"'DM Mono',monospace",
                                background:"rgba(0,200,255,.08)", border:"1px solid rgba(0,200,255,.2)",
                                borderRadius:"4px", padding:"2px 7px", flexShrink:0, fontWeight:600,
                              }}>
                                {l.conta}
                              </span>
                            )}
                            <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                              {formatDate(l.vencimento)}
                            </span>
                            {!isEditing && (
                              <span style={{ fontSize:"10px", color:"var(--t3)", opacity:0.6 }} title="Clique para editar">✏</span>
                            )}
                            <button
                              title="Remover"
                              onClick={e => { e.stopPropagation(); handleDeletarLancamento(l.id); }}
                              style={{ background:"transparent", border:"1px solid var(--b2)", borderRadius:"5px", color:"var(--t3)", fontSize:"11px", cursor:"pointer", padding:"3px 7px", transition:"all 0.15s", lineHeight:1, flexShrink:0 }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="rgba(244,63,94,.15)"; b.style.borderColor="var(--err)"; b.style.color="var(--err)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background="transparent"; b.style.borderColor="var(--b2)"; b.style.color="var(--t3)"; }}
                            >🗑</button>
                          </div>

                          {/* Painel de edição inline — expande ao clicar */}
                          {isEditing && (
                            <div style={{
                              borderTop:"1px solid var(--b2)",
                              padding:"12px 12px 10px",
                              background:"var(--surf2)",
                              display:"flex", flexDirection:"column", gap:"10px",
                            }}>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                                <div>
                                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Valor</div>
                                  <CurrencyInput
                                    value={ed.valor}
                                    onChange={v => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], valor: v } }))}
                                    placeholder="R$ 0,00"
                                    style={{ margin:0, fontSize:"12px", padding:"6px 8px" }}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Data</div>
                                  <DateInput
                                    value={ed.data}
                                    onChange={v => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], data: v } }))}
                                  />
                                </div>
                                <div>
                                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Conta</div>
                                  <select
                                    value={ed.conta}
                                    onChange={e => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], conta: e.target.value } }))}
                                    style={{ ...fc, fontSize:"12px", padding:"6px 8px" }}
                                  >
                                    <option value="">— Selecione —</option>
                                    {CONTAS.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, marginBottom:"4px", textTransform:"uppercase", letterSpacing:".04em" }}>Forma</div>
                                  <select
                                    value={ed.formaPgto}
                                    onChange={e => setEditandoPago(prev => ({ ...prev, [l.id]: { ...prev[l.id], formaPgto: e.target.value } }))}
                                    style={{ ...fc, fontSize:"12px", padding:"6px 8px" }}
                                  >
                                    <option value="">— Forma —</option>
                                    {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(f => <option key={f}>{f}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div style={{ display:"flex", gap:"6px", justifyContent:"flex-end" }}>
                                <button
                                  className="btn bg sm"
                                  onClick={() => cancelarEdicaoPago(l.id)}
                                >
                                  Cancelar
                                </button>
                                <button
                                  className="btn bp sm"
                                  onClick={() => handleSalvarEdicaoPago(l.id)}
                                  disabled={ed.salvando}
                                >
                                  {ed.salvando ? "Salvando..." : "✓ Salvar"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Crédito */}
              {creditoCliente > 0.005 && !quitado && (
                <div style={{ marginBottom:"10px", padding:"10px 12px", background:"rgba(0,200,255,.07)", border:"1px solid rgba(0,200,255,.25)", borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"10px" }}>
                  <div>
                    <div style={{ fontSize:"11px", fontWeight:700, color:"var(--acc2)" }}>Crédito disponível do cliente</div>
                    <div style={{ fontSize:"13px", fontWeight:700, color:"var(--t1)", fontFamily:"'DM Mono', monospace" }}>{formatBRL(creditoCliente)}</div>
                  </div>
                  <button className="btn bg sm" onClick={handleUsarCredito} disabled={salvando}>Aplicar crédito</button>
                </div>
              )}

              {quitado && (
                <div style={{ padding:"10px", background:"rgba(0,200,100,.08)", borderRadius:"8px", color:"var(--ok)", fontSize:"13px", textAlign:"center" }}>
                  ✓ Pagamento quitado
                </div>
              )}
            </div>
          </div>

          {/* Itens */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
            </div>
            {!temItens ? (
              <div style={{ color:"var(--t3)", padding:"24px 0", textAlign:"center" }}>Nenhum item registrado neste pedido.</div>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr><th>#</th><th>Produto</th><th>Dimensão</th><th>Medida</th><th>Qtd</th><th>Preço/un.</th><th>V.Cliente</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {pedido.itens_pedido!.map((item, i) => {
                      const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                      const medida = Number(item.m2).toFixed(3);
                      const unidade = isML ? "ml" : "m²";
                      return (
                      <tr key={item.id}>
                        <td className="mono" style={{ color:"var(--t3)" }}>{i + 1}</td>
                        <td><strong>{item.produto_nome}</strong></td>
                        <td className="mono">{item.largura} × {item.altura} mm</td>
                        <td className="mono">{medida} {unidade}</td>
                        <td className="mono">{item.quantidade}</td>
                        <td className="mono">{formatBRL(item.valor_m2)}</td>
                        <td style={{ textAlign:"center" }}>{(item as any).vidro_cliente ? <span style={{ color:"var(--warn)" }}>📦</span> : <span style={{ color:"var(--t3)" }}>—</span>}</td>
                        <td className="mono" style={{ color:"var(--acc)", fontWeight:600 }}>{formatBRL(item.subtotal)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Romaneio(s) Assinado(s) */}
          <div className="card" style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 700, marginBottom: "16px", letterSpacing: ".06em" }}>
              ROMANEIO(S) ASSINADO(S){(pedido.romaneio_assinado_urls?.length ?? 0) > 0 ? ` (${pedido.romaneio_assinado_urls!.length})` : ""}
            </div>

            {(pedido.romaneio_assinado_urls?.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {pedido.romaneio_assinado_urls!.map((url, i) => (
                  <div key={url} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: "rgba(16,185,129,.08)", borderRadius: "8px", border: "1px solid rgba(16,185,129,.2)" }}>
                    <span style={{ fontSize: "16px" }}>📄</span>
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: "var(--ok)", fontWeight: 600, fontSize: "13px", textDecoration: "underline" }}>
                      Romaneio assinado {i + 1}
                    </a>
                    <button className="btn bw sm" onClick={() => handleRemoverRomaneioAssinado(url)} disabled={uploadandoRomaneio}>Remover</button>
                  </div>
                ))}
              </div>
            )}

            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", padding: "20px", border: "2px dashed var(--b2)", borderRadius: "8px", cursor: uploadandoRomaneio ? "default" : "pointer", background: "var(--surf2)" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length > 0 && !uploadandoRomaneio) handleUploadRomaneioAssinado(fs); }}>
              <span style={{ fontSize: "20px" }}>📎</span>
              <span style={{ fontSize: "12px", color: "var(--t3)" }}>
                {uploadandoRomaneio ? "Enviando..." : "Arraste ou clique para anexar romaneio(s) assinado(s) na entrega (PDF ou imagem) — dá pra anexar mais de um, ex: uma viagem por retirada"}
              </span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: "none" }} disabled={uploadandoRomaneio}
                onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length > 0) handleUploadRomaneioAssinado(fs); e.target.value = ""; }} />
            </label>
          </div>
        </div>

        {/* ── MODAL EDIÇÃO ── */}
        {editando && (
          <div className="mov open" >
            <div className="mod" style={{ width:"780px", maxHeight:"90vh", overflowY:"auto" }}>
              <div className="mhd">
                <div className="mtit">Editar Pedido · {pedido.id}</div>
                <button className="mcl" onClick={() => setEditando(false)}>✕</button>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
                <div className="fg">
                  <label className="fl">Cliente</label>
                  <select style={fc} value={editForm.cliente_id} onChange={e => setEditForm(f => ({ ...f, cliente_id: Number(e.target.value) }))}>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Vendedor / Comissão</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select style={{ ...fc, flex: 1 }} value={editForm.vendedor_id ?? ""} onChange={e => setEditForm(f => ({ ...f, vendedor_id: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">— Sem vendedor —</option>
                      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.comissao_pct}%)</option>)}
                    </select>
                    {editForm.vendedor_id && (() => {
                      const vend = vendedores.find(v => v.id === editForm.vendedor_id);
                      const val  = vend ? valorTotalEditado * vend.comissao_pct / 100 : 0;
                      return val > 0 ? (
                        <span style={{ fontSize: "12px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap" }}>
                          {vend!.comissao_pct}% = {val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                <div className="fr">
                  <div className="fg"><label className="fl">Data do Pedido</label><DateInput value={editForm.dt_pedido} onChange={v => setEditForm(f => ({ ...f, dt_pedido: v }))} /></div>
                  <div className="fg"><label className="fl">Previsão Retirada</label><DateInput value={editForm.dt_retirada} onChange={v => setEditForm(f => ({ ...f, dt_retirada: v }))} /></div>
                </div>
                <div className="fr">
                  <div className="fg">
                    <label className="fl">Forma de Pagamento</label>
                    <select style={fc} value={editForm.forma_pgto} onChange={e => setEditForm(f => ({ ...f, forma_pgto: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {["Dinheiro","PIX","Boleto","Cartão","Cheque","A Prazo"].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label className="fl">Conta</label>
                    <select style={fc} value={editForm.conta} onChange={e => setEditForm(f => ({ ...f, conta: e.target.value }))}>
                      <option value="">Selecione...</option>
                      {CONTAS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Parcelas</label>
                  <select style={fc} value={editForm.parcelas} onChange={e => handleEditParcelas(Number(e.target.value))}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </div>
                <div style={{ padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"10px", textTransform:"uppercase" }}>
                    {editForm.parcelas === 1 ? "Pagamento" : `Parcelas (${editForm.parcelas}x)`}
                  </div>
                  {editParcelas.map((p, idx) => (
                    <div key={idx} style={{ display:"grid", gridTemplateColumns: editForm.parcelas > 1 ? "50px 1fr 130px" : "1fr 130px", gap:"8px", alignItems:"center", marginBottom:"6px" }}>
                      {editForm.parcelas > 1 && <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>{idx + 1}ª</span>}
                      <DateInput value={p.data} onChange={v => { if (idx === 0) handlePrimeiraDtEdit(v); else setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, data: v } : x)); }} />
                      <CurrencyInput value={p.valor} onChange={v => setEditParcelas(prev => prev.map((x, i) => i === idx ? { ...x, valor: v } : x))} placeholder="R$ 0,00" style={{ margin: 0 }} />
                    </div>
                  ))}
                  <div style={{ fontSize:"10px", color:"var(--t3)", marginTop:"4px", fontFamily:"'DM Mono',monospace" }}>
                    Total parcelas: <strong style={{ color:"var(--acc)" }}>{formatBRL(editParcelas.reduce((a, p) => a + p.valor, 0))}</strong>
                  </div>
                </div>

                {/* Itens */}
                <div style={{ padding:"12px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                  <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"12px", textTransform:"uppercase" }}>Itens do Pedido</div>
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 62px 62px 44px 90px 62px 42px 78px", gap:"6px", marginBottom:"6px", paddingBottom:"6px", borderBottom:"1px solid var(--b1)" }}>
                    {["Produto","Larg.","Alt.","Qtd","R$/m²","Lapid.","V.Cli","Subtotal"].map(h => (
                      <div key={h} style={{ fontSize:"9px", color:"var(--t3)", textTransform:"uppercase", letterSpacing:"1px", fontFamily:"'DM Mono',monospace" }}>{h}</div>
                    ))}
                  </div>
                  {editItens.map((item, idx) => {
                    const m2  = calcM2Item(item);
                    const sub = calcSubtotalItem(item);
                    return (
                      <div key={item.id} style={{ marginBottom:"10px" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 62px 62px 44px 90px 62px 42px 78px", gap:"6px", alignItems:"center" }}>
                          <div style={{ fontSize:"12px", color:"var(--t1)", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", padding:"7px 10px", background:"var(--surf1)", borderRadius:"6px", border:"1px solid var(--b1)" }}>
                            {item.produto_nome}
                          </div>
                          <input style={fcSm} type="number" value={item.largura || ""} onChange={e => updEditItem(idx, "largura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input style={fcSm} type="number" value={item.altura || ""} onChange={e => updEditItem(idx, "altura", parseInt(e.target.value) || 0)} placeholder="0" />
                          <input style={fcSm} type="number" value={item.quantidade} onChange={e => updEditItem(idx, "quantidade", parseInt(e.target.value) || 1)} min={1} />
                          <CurrencyInput value={item.valor_m2} onChange={v => updEditItem(idx, "valor_m2", v)} placeholder="R$/m²" style={{ margin:0, padding:"7px 10px", fontSize:"12px" }} />
                          <CurrencyInput value={item.lapidacao} onChange={v => updEditItem(idx, "lapidacao", v)} placeholder="0" style={{ margin:0, padding:"7px 10px", fontSize:"12px" }} />
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <button
                              title="Vidro do cliente"
                              onClick={() => updEditItem(idx, "vidro_cliente", !item.vidro_cliente)}
                              style={{ width:"32px", height:"32px", borderRadius:"6px", border:"1px solid", cursor:"pointer", fontSize:"15px", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s",
                                background: item.vidro_cliente ? "rgba(245,158,11,.15)" : "var(--surf1)",
                                borderColor: item.vidro_cliente ? "var(--warn)" : "var(--b1)",
                              }}
                            >
                              📦
                            </button>
                          </div>
                          <div style={{ fontSize:"12px", color:"var(--acc)", fontWeight:700, fontFamily:"'DM Mono',monospace", padding:"7px 0" }}>{formatBRL(sub)}</div>
                        </div>
                        {m2 > 0 && (
                          <div style={{ fontSize:"10px", color:"var(--t3)", fontFamily:"'DM Mono',monospace", marginTop:"2px", paddingLeft:"2px" }}>
                            {m2.toFixed(4)} m²
                            {item.vidro_cliente && <span style={{ color:"var(--warn)", marginLeft:"8px" }}>📦 Vidro do cliente</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", borderTop:"1px solid var(--b1)", paddingTop:"10px", marginTop:"4px" }}>
                    <span style={{ fontSize:"11px", color:"var(--t3)", fontFamily:"'DM Mono',monospace" }}>Total calculado · {m2TotalEditado.toFixed(4)} m²</span>
                    <span style={{ fontSize:"15px", fontWeight:800, color:"var(--acc)", fontFamily:"'DM Mono',monospace" }}>{formatBRL(valorTotalEditado)}</span>
                  </div>
                </div>

                <div className="fg">
                  <label className="fl">Observações</label>
                  <textarea style={{ ...fc, minHeight:"80px", resize:"vertical", fontFamily:"'Inter',sans-serif" }}
                    value={editForm.obs} onChange={e => setEditForm(f => ({ ...f, obs: e.target.value }))}
                    placeholder="Observações do pedido..." />
                </div>
                <div style={{ display:"flex", gap:"8px", justifyContent:"flex-end", paddingTop:"4px" }}>
                  <button className="btn bg" onClick={() => setEditando(false)}>Cancelar</button>
                  <button className="btn bp" onClick={salvarEdicao} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL NC ─── */}
        {modalNC && (
          <div className="modal-backdrop" onClick={() => setModalNC(false)}>
            <div className="modal" style={{ maxWidth:"540px", width:"100%" }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ margin:0, fontSize:"15px" }}>Registrar Não Conformidade</h3>
                <button className="btn-ghost" onClick={() => setModalNC(false)} style={{ fontSize:"18px", lineHeight:1 }}>×</button>
              </div>
              <div className="modal-body" style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Tipo *</label>
                    <select className="form-input" value={ncForm.tipo ?? "Quebra de vidro"} onChange={e => setNcForm(f => ({ ...f, tipo: e.target.value as TipoNC }))}>
                      {TIPOS_NC.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gravidade *</label>
                    <select className="form-input" value={ncForm.gravidade ?? "Média"} onChange={e => setNcForm(f => ({ ...f, gravidade: e.target.value as GravidadeNC }))}>
                      {(["Baixa","Média","Alta","Crítica"] as GravidadeNC[]).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Etapa (setor)</label>
                    <input className="form-input" value={ncForm.etapa ?? pedido?.status ?? ""} onChange={e => setNcForm(f => ({ ...f, etapa: e.target.value }))} placeholder={pedido?.status ?? "Ex: Corte"} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Produto/peça</label>
                    <input className="form-input" value={ncForm.produto_nome ?? ""} onChange={e => setNcForm(f => ({ ...f, produto_nome: e.target.value || null }))} placeholder="Nome do produto ou peça afetada" />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Descrição *</label>
                    <textarea className="form-input" rows={3} value={ncForm.descricao ?? ""} onChange={e => setNcForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva o problema encontrado..." style={{ resize:"vertical" }} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Observações</label>
                    <textarea className="form-input" rows={2} value={ncForm.obs ?? ""} onChange={e => setNcForm(f => ({ ...f, obs: e.target.value || null }))} placeholder="Observações adicionais..." style={{ resize:"vertical" }} />
                  </div>
                  <div className="form-group" style={{ gridColumn:"1 / -1" }}>
                    <label className="form-label">Responsável pela análise</label>
                    <input className="form-input" value={ncForm.responsavel_analise ?? ""} onChange={e => setNcForm(f => ({ ...f, responsavel_analise: e.target.value || null }))} placeholder="Nome do responsável pela investigação" />
                  </div>
                </div>
                {ncs.length > 0 && (
                  <div style={{ borderTop:"1px solid var(--border)", paddingTop:"12px" }}>
                    <div style={{ fontSize:"12px", color:"var(--t3)", fontWeight:600, marginBottom:"8px" }}>NCs deste pedido ({ncs.length})</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"6px", maxHeight:"120px", overflowY:"auto" }}>
                      {ncs.map(nc => (
                        <div key={nc.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 8px", background:"var(--bg2)", borderRadius:"6px" }}>
                          <span style={{ fontSize:"11px", fontWeight:700, color:"var(--acc)", minWidth:"72px" }}>{nc.codigo}</span>
                          <span style={{ flex:1, fontSize:"11px", color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nc.tipo}</span>
                          <span style={{ fontSize:"11px", fontWeight:600, color: STATUS_COR_NC[nc.status] }}>{nc.status}</span>
                          <span style={{ fontSize:"11px", fontWeight:600, color: GRAVIDADE_COR_NC[nc.gravidade] }}>{nc.gravidade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Fotos */}
              <div className="form-group" style={{ padding:"0 0 4px" }}>
                <label className="form-label">Fotos (opcional)</label>
                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"6px", padding:"12px", border:"2px dashed var(--border)", borderRadius:"8px", cursor:"pointer", background:"var(--bg2)" }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--accent)"; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "var(--border)"; const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); setFotosNC(p => [...p, ...f]); }}>
                  <span style={{ fontSize:"16px" }}>📷</span>
                  <span style={{ fontSize:"11px", color:"var(--t3)" }}>Arraste ou clique para selecionar imagens</span>
                  <input type="file" accept="image/*" multiple style={{ display:"none" }}
                    onChange={e => { setFotosNC(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
                </label>
                {fotosNC.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px", marginTop:"8px" }}>
                    {fotosNC.map((f, i) => (
                      <div key={i} style={{ position:"relative", width:"64px", height:"64px" }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"6px", border:"1px solid var(--border)" }} />
                        <button onClick={() => setFotosNC(p => p.filter((_, j) => j !== i))}
                          style={{ position:"absolute", top:"-5px", right:"-5px", background:"#ef4444", border:"none", borderRadius:"50%", width:"16px", height:"16px", color:"#fff", fontSize:"9px", cursor:"pointer", lineHeight:"16px", padding:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn secondary" onClick={() => { setModalNC(false); setFotosNC([]); }}>Cancelar</button>
                <button className="btn primary" onClick={handleSalvarNC} disabled={salvando}>{salvando ? "Salvando..." : "Registrar NC"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── ROMANEIO PDF ─── */}
        <div className="print-area" style={{ padding:"20px 28px", fontFamily:"Arial, sans-serif", color:"#1a1a2e", background:"white", width:"210mm", minHeight:"auto", boxSizing:"border-box" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", paddingBottom:"16px", borderBottom:"3px solid #2d5fa6" }}>
            <div>
              <div style={{ fontSize:"26px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>urbanglass</div>
              <div style={{ fontSize:"9px", color:"#333", textTransform:"uppercase", letterSpacing:"1.5px", marginTop:"2px" }}>Urban Glass Comércio Ltda</div>
              <div style={{ fontSize:"9px", color:"#333", marginTop:"2px" }}>CNPJ: 65.668.970/0001-05</div>
              <div style={{ fontSize:"9px", color:"#333" }}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
              <div style={{ fontSize:"9px", color:"#333" }}>(32) 99986-0317</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:"11px", color:"#333", textTransform:"uppercase", letterSpacing:"2px", marginBottom:"4px" }}>Romaneio de Saída</div>
              <div style={{ fontSize:"28px", fontWeight:900, color:"#2d5fa6", letterSpacing:"-1px" }}>{pedido.id}</div>
              <div style={{ fontSize:"11px", color:"#333", marginTop:"6px" }}>Emissão: <strong>{new Date().toLocaleDateString("pt-BR")}</strong></div>
              <div style={{ fontSize:"11px", color:"#333" }}>Pedido: <strong>{formatDate(pedido.dt_pedido)}</strong></div>
              <div style={{ display:"inline-block", marginTop:"8px", padding:"3px 14px", borderRadius:"99px", fontSize:"10px", fontWeight:700, letterSpacing:"1px", background:"#d4edda", color:"#155724", border:"1px solid #c3e6cb" }}>
                {pedido.status.toUpperCase()}
              </div>
              <div style={{ fontSize:"9px", color:"#c00", marginTop:"6px", fontStyle:"italic" }}>⚠ Não tem validade fiscal</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"18px" }}>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #2d5fa6" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Comprador</div>
              <div style={{ fontSize:"13px", fontWeight:700, color:"#1a1a2e" }}>{pedido.clientes?.nome ?? "—"}</div>
              {(pedido.clientes as any)?.cnpj && <div style={{ fontSize:"10px", color:"#333", marginTop:"3px" }}>CNPJ: {(pedido.clientes as any).cnpj}</div>}
              {pedido.clientes?.cidade && <div style={{ fontSize:"10px", color:"#333" }}>{pedido.clientes.cidade}</div>}
              {pedido.clientes?.tel && <div style={{ fontSize:"10px", color:"#333" }}>Tel: {pedido.clientes.tel}</div>}
            </div>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #3d8c5c" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#3d8c5c", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições Comerciais</div>
              <div style={{ fontSize:"11px", color:"#1a1a2e", display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Pagamento</span><strong>{pedido.forma_pgto || "—"}</strong></div>
                {pedido.parcelas > 1 && <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Parcelas</span><strong>{pedido.parcelas}×</strong></div>}
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Retirada prevista</span><strong>{formatDate(pedido.dt_retirada)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#333" }}>{(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml total" : "m² total"}</span>
                  <strong>{Number(pedido.m2_total).toFixed(2)} {(pedido.itens_pedido ?? []).every((i: any) => i.produtos?.unidade === "ml" || i.vidro_cliente === true) ? "ml" : "m²"}</strong>
                </div>
              </div>
            </div>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"16px", fontSize:"11px" }}>
            <thead>
              <tr style={{ background:"#2d5fa6" }}>
                {["#","Produto","Dimensão (mm)","Medida","Qtd","Preço/un.","Subtotal"].map((h, i) => (
                  <th key={i} style={{ padding:"8px", color:"white", fontWeight:700, fontSize:"9px", textAlign: i === 0 || i === 4 ? "center" : i >= 5 ? "right" : "left", letterSpacing:"0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(pedido.itens_pedido ?? []).map((item, i) => {
                const isML = (item as any).produtos?.unidade === "ml" || (item as any).vidro_cliente === true;
                return (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#f7f9ff" }}>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center", color:"#000", fontSize:"10px", fontWeight:700 }}>{i + 1}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontWeight:700, color:"#000" }}>{item.produto_nome}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{item.largura} × {item.altura}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{Number(item.m2).toFixed(3)} {isML ? "ml" : "m²"}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"center", fontWeight:700, color:"#000" }}>{item.quantidade}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontSize:"10px", fontWeight:700, color:"#000" }}>{formatBRL(item.valor_m2)}</td>
                  <td style={{ padding:"7px 8px", borderBottom:"1px solid #e8ecf5", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:"#2d5fa6" }}>{formatBRL(item.subtotal)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"18px" }}>
            <div style={{ padding:"12px", background:"#f0f4ff", borderRadius:"8px", borderLeft:"4px solid #2d5fa6" }}>
              <div style={{ fontSize:"9px", fontWeight:700, color:"#2d5fa6", textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"8px" }}>Condições de Pagamento</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"6px", fontSize:"11px" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Valor total</span><strong style={{ fontFamily:"monospace" }}>{formatBRL(pedido.valor_total)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span style={{ color:"#333" }}>Recebido</span><strong style={{ fontFamily:"monospace", color:"#155724" }}>{formatBRL(pedido.valor_recebido)}</strong></div>
                <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid #d0daf0", paddingTop:"6px" }}>
                  <span style={{ color: aberto > 0 ? "#c00" : "#155724", fontWeight:700 }}>{aberto > 0 ? "Em aberto" : "✓ Quitado"}</span>
                  <strong style={{ fontFamily:"monospace", color: aberto > 0 ? "#c00" : "#155724" }}>{aberto > 0 ? formatBRL(aberto) : formatBRL(0)}</strong>
                </div>
              </div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", alignItems:"flex-end" }}>
              <div style={{ minWidth:"220px", background:"#f0f4ff", borderRadius:"8px", padding:"12px", border:"1px solid #d0daf0" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:"10px", borderTop:"2px solid #2d5fa6" }}>
                  <span style={{ fontWeight:700, fontSize:"13px", color:"#2d5fa6" }}>VALOR TOTAL</span>
                  <span style={{ fontFamily:"monospace", fontWeight:900, fontSize:"18px", color:"#2d5fa6" }}>{formatBRL(pedido.valor_total)}</span>
                </div>
              </div>
            </div>
          </div>
          {pedido.obs && (
            <div style={{ padding:"10px 14px", background:"#fffbea", borderRadius:"8px", marginBottom:"16px", fontSize:"10px", borderLeft:"3px solid #f59e0b" }}>
              <strong style={{ color:"#92400e" }}>Observações:</strong> <span style={{ color:"#333", fontWeight:700 }}>{pedido.obs}</span>
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"32px", marginBottom:"16px", marginTop:"32px" }}>
            {["Vendedor / Urban Glass","Recebido por / Comprador","Motorista / Entregador"].map(label => (
              <div key={label} style={{ textAlign:"center" }}>
                <div style={{ borderTop:"1px solid #999", paddingTop:"8px", fontSize:"10px", color:"#333", fontWeight:700 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:"2px solid #2d5fa6", paddingTop:"8px", display:"flex", justifyContent:"space-between", fontSize:"8px", color:"#333", fontWeight:700 }}>
            <div>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</div>
            <div style={{ color:"#c00", fontStyle:"italic", fontWeight:700 }}>Este documento não substitui a Nota Fiscal Eletrônica</div>
          </div>
        </div>
      {/* Modal: vincular retalho */}
      {showVincularRetalho && (
        <div className="mov open">
          <div className="mod" style={{ width:"760px", maxHeight:"88vh", display:"flex", flexDirection:"column" }}>
            <div className="mhd">
              <div className="mtit">Vincular Retalho — Pedido {pedido?.id}</div>
              <button className="mcl" onClick={() => setShowVincularRetalho(false)}>✕</button>
            </div>
            <div style={{ padding:"12px 20px 10px", display:"flex", flexDirection:"column", gap:"8px" }}>
              <input
                placeholder="Buscar por produto, box, cliente..."
                value={filtroBuscaRetalho}
                onChange={e => setFiltroBuscaRetalho(e.target.value)}
                style={{ width:"100%", boxSizing:"border-box", background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px", padding:"9px 13px", color:"var(--t1)", fontSize:"13px", outline:"none" }}
                autoFocus
              />
              {(() => {
                const itensCorte = (pedido?.itens_pedido ?? []).filter((i: any) => !i.vidro_cliente);
                if (itensCorte.length < 2) return null;
                return (
                  <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <span style={{ fontSize:"11px", color:"var(--t3)", fontWeight:600, whiteSpace:"nowrap" }}>Para qual item?</span>
                    <select
                      value={itemParaRetalho ?? ""}
                      onChange={e => setItemParaRetalho(e.target.value ? Number(e.target.value) : null)}
                      style={{ flex:1, background:"var(--surf2)", border:"1px solid var(--b2)", borderRadius:"6px", padding:"7px 10px", color:"var(--t1)", fontSize:"12px", outline:"none" }}
                    >
                      <option value="">— Auto (primeiro compatível) —</option>
                      {itensCorte.map((item: any) => (
                        <option key={item.id} value={item.id}>
                          {item.produto_nome} · {item.largura}×{item.altura}mm · qtd {item.quantidade}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"0 20px 16px" }}>
              {retalhosDisponiveis.length === 0 ? (
                <div style={{ color:"var(--t3)", textAlign:"center", padding:"32px 0" }}>Nenhum retalho disponível no estoque.</div>
              ) : (() => {
                const q = filtroBuscaRetalho.toLowerCase();
                const filtrados = retalhosDisponiveis.filter(r =>
                  !q || r.produto_nome.toLowerCase().includes(q) || (r.box ?? "").toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.observacao ?? "").toLowerCase().includes(q)
                );
                return filtrados.length === 0 ? (
                  <div style={{ color:"var(--t3)", textAlign:"center", padding:"24px 0" }}>Nenhum retalho encontrado para "{filtroBuscaRetalho}"</div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                    {filtrados.map(r => (
                      <div key={r.id} style={{ display:"grid", gridTemplateColumns:"90px 1fr 130px 70px 60px 1fr 90px", alignItems:"center", gap:"10px", padding:"10px 14px", background:"var(--surf2)", borderRadius:"8px", border:"1px solid var(--b2)" }}>
                        <span className="mono" style={{ color:"var(--acc2)", fontWeight:700, fontSize:"12px" }}>{r.id}</span>
                        <span style={{ fontSize:"13px", fontWeight:600, color:"var(--t1)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.produto_nome}</span>
                        <span className="mono" style={{ fontSize:"12px", color:"var(--t2)" }}>{r.largura} × {r.altura} mm</span>
                        <span className="mono" style={{ fontSize:"12px", color:"var(--t2)" }}>{Number(r.m2).toFixed(3)} m²</span>
                        <span className="mono" style={{ fontSize:"12px", color:"var(--t3)" }}>{r.box ?? "—"}</span>
                        <span style={{ fontSize:"11px", color: r.observacao ? "var(--warn)" : "var(--t3)", fontWeight: r.observacao ? 600 : 400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {r.observacao ? `👤 ${r.observacao}` : "—"}
                        </span>
                        <button className="btn bp sm" style={{ whiteSpace:"nowrap" }} onClick={() => {
                          const itensCorte = (pedido?.itens_pedido ?? []).filter((i: any) => !i.vidro_cliente);
                          const itemId = itemParaRetalho ?? (itensCorte.length === 1 ? (itensCorte[0] as any).id : null);
                          handleVincularRetalho(r.id, itemId);
                        }}>Vincular</button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      </AppLayout>
    </>
  );
}

function Row({ label, value, accent, color }: { label: string; value: string | number; accent?: boolean; color?: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"12px" }}>
      <span style={{ fontSize:"13px", color:"var(--t3)", flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight: accent ? 700 : 500, color: color ?? (accent ? "var(--acc)" : "var(--t1)"), textAlign:"right" }}>{value}</span>
    </div>
  );
}