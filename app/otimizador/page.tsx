"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { Campo } from "@/components/ui/Campo";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import { supabase } from "@/lib/supabase/client";
import { salvarOtimizacao } from "@/services/otimizador.service";
import { gerarPecasDoPedido } from "@/services/pecas.service";
import { updatePedido } from "@/services/pedidos.service";
import { salvarRetalhos } from "@/services/estoque.service";
import { registrarMovimentacao, reverterMovimentacao } from "@/services/estoqueMovimentacoes.service";
import { getLotesUtilizaveis, getResumoDimensaoPendente, getLotesParaCustoPorProduto, type ResumoDimensaoPendente } from "@/services/lotes.service";
import type { Produto, Retalho, OtimizacaoPerdaDetalheInsert, LoteEstoque } from "@/types";
import { isChapaInteira } from "@/lib/chapas";
import { custoPeps } from "@/lib/custoLote";
import { resolverDimensaoPorProduto } from "@/lib/loteResolucao";
import {
  empacotar, empacotarTodas, calcAproveitamento, derivarCortes,
  type Peca, type ResultadoChapa, type RetalhoGerado,
} from "@/lib/otimizador";

interface PedidoSugerido {
  id: string;
  clienteNome: string;
  totalPecas: number;
  produtos: string[];
  itens: Peca[];
  dtRetirada: string | null;
  aprovSeCombinado: number | null; // delta vs base
  diasParaEntrega: number | null;
}


function diasAte(dtStr: string | null): number | null {
  if (!dtStr) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dt = new Date(dtStr + "T00:00:00");
  return Math.round((dt.getTime() - hoje.getTime()) / 86400000);
}


const PEDIDO_COLORS: Record<string, { fill: string; stroke: string }> = {};
const FILL_POOL   = ["#1e2d45","#2d1e3f","#1e2d28","#2d2a1e","#1e2535","#2a1e2d","#1e3035","#2d1e25"];
const STROKE_POOL = ["#4a7fa5","#7a5fa5","#4aa580","#a5954a","#4a70a5","#a54a7a","#4aa5b0","#a54a55"];
let colorIdx = 0;
function getColorForPedido(pid: string) {
  if (!PEDIDO_COLORS[pid]) {
    PEDIDO_COLORS[pid] = { fill: FILL_POOL[colorIdx % FILL_POOL.length], stroke: STROKE_POOL[colorIdx % STROKE_POOL.length] };
    colorIdx++;
  }
  return PEDIDO_COLORS[pid];
}


function OtimizadorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const pedidoParam = searchParams.get("pedido");
  const pecasParam  = searchParams.get("pecas");
  const prodParam   = searchParams.get("prod");
  const cwParam     = searchParams.get("cw");
  const chParam     = searchParams.get("ch");

  const [produtos, setProdutos]           = useState<Produto[]>([]);
  const podeRotacionarPorNome = useMemo(() => {
    const map = new Map<string, boolean>();
    produtos.forEach(p => map.set(p.nome, p.pode_rotacionar));
    return (nome: string) => map.get(nome) ?? true;
  }, [produtos]);
  const [pecas, setPecas]                 = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);
  const [chapaW, setChapaW]               = useState(cwParam ? Number(cwParam) : 3300);
  const [chapaH, setChapaH]               = useState(chParam ? Number(chParam) : 2250);
  const [kerf, setKerf]                   = useState(4); // folga do diamante — 4mm é o padrão da mesa
  const [bord, setBord]                   = useState(0);
  const [resultado, setResultado]         = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx]           = useState(0);
  const [pedidoRef, setPedidoRef]         = useState<string | null>(null);
  const [carregando, setCarregando]       = useState(false);
  const [aprovNum, setAprovNum]           = useState(0);
  const [perdaNum, setPerdaNum]           = useState(0);
  const [statChapas, setStatChapas]       = useState(0);
  const [msg, setMsg]                     = useState("");
  const [retalhosGerados, setRetalhosGerados] = useState<RetalhoGerado[]>([]);
  const [salvando, setSalvando]           = useState(false);
  const [zerando, setZerando]             = useState(false);
  const [modoTeste, setModoTeste]         = useState(false);
  const [simulando, setSimulando]         = useState(false);
  const TEMPO_CALCULO_MS = 10000; // sempre o modo mais preciso — tempo não é problema, resultado sim
  const [usarRetalhosEstoque, setUsarRetalhosEstoque] = useState(false);
  const [retalhosDisponiveis, setRetalhosDisponiveis] = useState<Retalho[]>([]);
  const [retalhosUsados, setRetalhosUsados] = useState<string[]>([]);
  const [comparacaoStats, setComparacaoStats] = useState<{ comRetalhos: { aprov: number; chapas: number }; semRetalhos: { aprov: number; chapas: number } } | null>(null);

  const [pedidosSugeridos, setPedidosSugeridos]       = useState<PedidoSugerido[]>([]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<Set<string>>(new Set());
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  const [aprovBase, setAprovBase]                     = useState<number | null>(null);

  const [chapaAberta, setChapaAberta] = useState(false);
  const [agrupAberta, setAgrupAberta] = useState(false);

  // Lotes por produto (múltiplas dimensões, 2026-07-21): só lotes ativos +
  // dimensao_confirmada + saldo>0 entram aqui — nunca um default.
  const [lotesUtilizaveis, setLotesUtilizaveis] = useState<LoteEstoque[]>([]);
  const [loteEscolhido, setLoteEscolhido]       = useState<Map<number, number>>(new Map()); // produto_id -> lote_id
  const [resumoPendente, setResumoPendente]     = useState<ResumoDimensaoPendente | null>(null);
  const [pecasExcluidasInfo, setPecasExcluidasInfo] = useState<Map<string, number>>(new Map()); // produto (nome) -> qtd peças fora do plano
  const [loteUsadoPorProdutoNome, setLoteUsadoPorProdutoNome] = useState<Map<string, number>>(new Map()); // produto (nome) -> lote_id usado neste plano (pra baixa real em handleSalvar)

  const lotesPorProdutoMap = useMemo(() => {
    const m = new Map<number, LoteEstoque[]>();
    lotesUtilizaveis.forEach(l => { const arr = m.get(l.produto_id) ?? []; arr.push(l); m.set(l.produto_id, arr); });
    return m;
  }, [lotesUtilizaveis]);

  // Produtos distintos na lista atual de peças (pra montar o seletor de lote)
  const produtosDistintosNaLista = useMemo(() => {
    const vistos = new Map<number, string>();
    pecas.forEach(p => { if (p.produtoId && !vistos.has(p.produtoId)) vistos.set(p.produtoId, p.prod); });
    return Array.from(vistos.entries()).map(([produtoId, nome]) => ({ produtoId, nome }));
  }, [pecas]);

  // Auto-escolhe o lote quando um produto tem exatamente 1 utilizável, e
  // limpa a escolha de produtos que saíram da lista — sem isso um lote
  // escolhido antes podia "vazar" pra outro produto se o id colidisse por
  // acaso (não colide de verdade, mas mantém o estado sempre coerente com
  // o que está na tela).
  useEffect(() => {
    setLoteEscolhido(prev => {
      const next = new Map<number, number>();
      produtosDistintosNaLista.forEach(({ produtoId }) => {
        const lotes = lotesPorProdutoMap.get(produtoId) ?? [];
        if (lotes.length === 1) next.set(produtoId, lotes[0].id);
        else if (lotes.some(l => l.id === prev.get(produtoId))) next.set(produtoId, prev.get(produtoId)!);
      });
      return next;
    });
  }, [produtosDistintosNaLista, lotesPorProdutoMap]);

  // Abre "Lote por Produto" sozinho quando algum produto tem 2+ lotes
  // utilizáveis e nenhum foi escolhido ainda — sem isso a peça some do plano
  // sem nenhum aviso visível, porque o painel vem fechado por padrão (2026-07-22,
  // achado no P-066: produto com 2 lotes confirmados ficou de fora até alguém
  // abrir esse painel manualmente). Só abre, nunca fecha sozinho.
  useEffect(() => {
    const temPendente = produtosDistintosNaLista.some(({ produtoId }) => {
      const lotes = lotesPorProdutoMap.get(produtoId) ?? [];
      return lotes.length > 1 && !loteEscolhido.has(produtoId);
    });
    if (temPendente) setChapaAberta(true);
  }, [produtosDistintosNaLista, lotesPorProdutoMap, loteEscolhido]);

  async function recarregarLotes() {
    const [lotes, resumo] = await Promise.all([getLotesUtilizaveis(), getResumoDimensaoPendente()]);
    setLotesUtilizaveis(lotes);
    setResumoPendente(resumo);
  }

  // Ref para pecas atual (usado na simulação sem re-render)
  const pecasRef = useRef<Peca[]>([]);
  pecasRef.current = pecas;
  const bordRef = useRef(bord);
  bordRef.current = bord;
  const kerfRef = useRef(kerf);
  kerfRef.current = kerf;
  const chapaWRef = useRef(chapaW);
  chapaWRef.current = chapaW;
  const chapaHRef = useRef(chapaH);
  chapaHRef.current = chapaH;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    supabase.from("produtos").select("*").eq("ativo", true).then(({ data }) => {
      setProdutos((data as Produto[]) || []);
    });
    recarregarLotes();
  }, []);

  // Carrega peças a partir do parâmetro ?pecas= na URL (modo AVULSO)
  // Formatos suportados:
  //   CSV: "l,a,qtd|l,a,qtd|..." (com ?prod=nome opcional)
  //   Legacy base64-JSON: btoa(JSON.stringify([{l,a,qtd,prod},...]))
  useEffect(() => {
    if (!pecasParam || pedidoParam) return;
    try {
      let items: Array<{ l: number; a: number; qtd: number; prod: string }> = [];
      const defaultProd = prodParam ?? "";
      if (pecasParam.includes(",")) {
        // formato CSV
        items = pecasParam.split("|").map(seg => {
          const [l, a, qtd] = seg.split(",").map(Number);
          return { l, a, qtd: qtd || 1, prod: defaultProd };
        }).filter(p => p.l > 0 && p.a > 0);
      } else {
        // formato legacy base64-JSON
        items = JSON.parse(atob(pecasParam)) as Array<{ l: number; a: number; qtd: number; prod: string }>;
      }
      if (items.length > 0) {
        // Modo avulso/teste: sem produto_id real, então sem lote pra resolver —
        // usa o tamanho de chapa manual (chapaW/chapaH) em vez de lote, único
        // caso em que isso ainda faz sentido (nunca consome estoque de verdade).
        setPecas(items.map(p => ({ l: p.l, a: p.a, qtd: p.qtd ?? 1, prod: p.prod ?? defaultProd })));
        setModoTeste(true);
      }
    } catch { /* URL inválida — ignora */ }
  }, [pecasParam, prodParam]);

  useEffect(() => {
    if (!pedidoParam) return;
    setCarregando(true);
    supabase.from("itens_pedido").select("*").eq("pedido_id", pedidoParam).then(async ({ data, error }) => {
      setCarregando(false);
      if (error || !data || data.length === 0) return;
      const map = new Map<string, Peca>();
      let vcCount = 0;
      data.forEach((item: any) => {
        if (item.vidro_cliente) { vcCount++; return; } // vidro do cliente: não entra no layout
        const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
        if (map.has(key)) map.get(key)!.qtd += item.quantidade;
        else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, produtoId: item.produto_id ?? null, pedidoId: pedidoParam });
      });
      if (vcCount > 0) setMsg(`ℹ ${vcCount} item(ns) ignorado(s): vidro fornecido pelo cliente (não é estoque nosso).`);
      const carregadas = Array.from(map.values());
      setPecas(carregadas);
      setPedidoRef(pedidoParam);
      const produtosNoPedido = [...new Set(carregadas.map(p => p.prod))];
      buscarSugestoes(pedidoParam, produtosNoPedido, carregadas);
    });
  }, [pedidoParam]);

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) {
      const bordParaDesenho = resultado[chapaIdx].retalhoId ? 0 : bord;
      drawOpt(resultado[chapaIdx], chapaIdx, bordParaDesenho);
    }
  }, [resultado, chapaIdx]);

  useEffect(() => {
    const produtosNomes = [...new Set(pecas.map(p => p.prod).filter(Boolean))];
    if (produtosNomes.length === 0) { setRetalhosDisponiveis([]); return; }
    supabase
      .from("retalhos")
      .select("*")
      .eq("status", "Disponível")
      .in("produto_nome", produtosNomes)
      .order("m2", { ascending: false })
      .then(({ data }) => setRetalhosDisponiveis((data as Retalho[]) || []));
  }, [pecas]);

  // Monta flat de peças sem estado
  function montarFlat(pecasList: Peca[], pedidoId: string | null) {
    const flat: Array<{ l: number; a: number; prod: string; produtoId?: number | null; pedidoId?: string; podeRotacionar?: boolean }> = [];
    pecasList.forEach(p => {
      if (p.l > 0 && p.a > 0)
        for (let q = 0; q < (p.qtd || 1); q++)
          flat.push({ l: p.l, a: p.a, prod: p.prod, produtoId: p.produtoId, pedidoId: p.pedidoId ?? pedidoId ?? undefined, podeRotacionar: podeRotacionarPorNome(p.prod) });
    });
    return flat;
  }

  // Dimensões confirmadas (lotes ativos + dimensao_confirmada) de um produto —
  // usado só pra detecção "isso é uma chapa inteira", não pro empacotamento.
  function chapasConfirmadasDoProduto(produtoId: number | null | undefined): { w: number; h: number }[] {
    if (!produtoId) return [];
    return (lotesPorProdutoMap.get(produtoId) ?? [])
      .filter(l => l.chapa_largura_mm && l.chapa_altura_mm)
      .map(l => ({ w: l.chapa_largura_mm as number, h: l.chapa_altura_mm as number }));
  }

  async function buscarSugestoes(pedidoPrincipal: string, produtosNoPedido: string[], pecasBase: Peca[]) {
    setCarregandoSugestoes(true);
    setSimulando(true);

    const { data: pedidosAguardando } = await supabase
      .from("pedidos")
      .select("id, clientes(nome), dt_retirada")
      .eq("status", "Aguardando otimização")
      .neq("id", pedidoPrincipal);

    if (!pedidosAguardando || pedidosAguardando.length === 0) {
      setCarregandoSugestoes(false);
      setSimulando(false);
      return;
    }

    // Calcula aproveitamento base (só o pedido principal)
    const flatBase = montarFlat(pecasBase, pedidoPrincipal);
    const dimensaoBase = resolverDimensaoPorProduto(flatBase, lotesPorProdutoMap, loteEscolhido).dimensaoPorProduto;
    const base = calcAproveitamento(flatBase, bordRef.current, kerfRef.current, dimensaoBase);
    setAprovBase(base);

    const resultados = await Promise.all(
      pedidosAguardando.map(async (ped) => {
        const { data: itens } = await supabase.from("itens_pedido").select("*").eq("pedido_id", ped.id);
        if (!itens || itens.length === 0) return null;

        const todosChapa = itens.every((item: any) =>
          isChapaInteira(item.largura, item.altura, chapasConfirmadasDoProduto(item.produto_id))
        );
        if (todosChapa) return null;

        const produtosDoPedido = [...new Set(itens.map((i: any) => i.produto_nome as string))];
        if (!produtosDoPedido.some(p => produtosNoPedido.includes(p))) return null;

        const map = new Map<string, Peca>();
        itens.forEach((item: any) => {
          if (item.vidro_cliente) return; // vidro do cliente: não entra no layout
          const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
          if (map.has(key)) map.get(key)!.qtd += item.quantidade;
          else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, produtoId: item.produto_id ?? null, pedidoId: ped.id });
        });

        const itensDoPedido = Array.from(map.values());

        const flatCombinado = [...flatBase, ...montarFlat(itensDoPedido, ped.id)];
        const dimensaoCombinada = resolverDimensaoPorProduto(flatCombinado, lotesPorProdutoMap, loteEscolhido).dimensaoPorProduto;
        const aprovCombinado = calcAproveitamento(flatCombinado, bordRef.current, kerfRef.current, dimensaoCombinada);
        const delta = aprovCombinado - base;
        const dias = diasAte((ped as any).dt_retirada);

        return {
          id: ped.id,
          clienteNome: (ped as any).clientes?.nome ?? "—",
          totalPecas: itens.length,
          produtos: produtosDoPedido,
          itens: itensDoPedido,
          dtRetirada: (ped as any).dt_retirada ?? null,
          aprovSeCombinado: parseFloat(delta.toFixed(1)),
          diasParaEntrega: dias,
        } as PedidoSugerido;
      })
    );

    const sugestoes = resultados.filter((s): s is PedidoSugerido => s !== null);

    // Ordena: urgentes (≤3 dias) primeiro, depois por maior ganho de aproveitamento
    sugestoes.sort((a, b) => {
      const aUrgente = a.diasParaEntrega !== null && a.diasParaEntrega <= 3;
      const bUrgente = b.diasParaEntrega !== null && b.diasParaEntrega <= 3;
      if (aUrgente && !bUrgente) return -1;
      if (!aUrgente && bUrgente) return 1;
      // Ambos urgentes: menor prazo primeiro
      if (aUrgente && bUrgente) return (a.diasParaEntrega ?? 99) - (b.diasParaEntrega ?? 99);
      // Nenhum urgente: maior ganho primeiro
      return (b.aprovSeCombinado ?? 0) - (a.aprovSeCombinado ?? 0);
    });

    setPedidosSugeridos(sugestoes);
    setCarregandoSugestoes(false);
    setSimulando(false);
    if (sugestoes.length > 0) setAgrupAberta(true);
  }

  function toggleSugerido(id: string) {
    setPedidosSelecionados(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setResultado(null);
  }

  function drawOpt(r: ResultadoChapa, idx: number, bordMm: number) {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const displayW = cv.offsetWidth, displayH = cv.offsetHeight;
    cv.width = displayW * dpr; cv.height = displayH * dpr;
    ctx.scale(dpr, dpr);
    const CW = displayW - 16, CH = displayH - 16;
    const scale = Math.min(CW / r.W, CH / r.H);
    const dW = r.W * scale, dH = r.H * scale;
    const ox = (CW - dW) / 2 + 8, oy = (CH - dH) / 2 + 8;
    ctx.fillStyle = "#0d1117"; ctx.fillRect(0, 0, displayW, displayH);
    ctx.fillStyle = "#1a1f2e"; ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeStyle = "#2d3550"; ctx.lineWidth = 1.5; ctx.strokeRect(ox, oy, dW, dH);
    if (bordMm > 0) {
      const bs = bordMm * scale;
      ctx.fillStyle = "rgba(255,107,53,0.18)";
      ctx.fillRect(ox, oy, dW, bs); ctx.fillRect(ox, oy + dH - bs, dW, bs);
      ctx.fillRect(ox, oy, bs, dH); ctx.fillRect(ox + dW - bs, oy, bs, dH);
      ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(255,107,53,0.55)"; ctx.lineWidth = 0.8;
      ctx.strokeRect(ox + bs, oy + bs, dW - bs * 2, dH - bs * 2); ctx.setLineDash([]);
    }
    ctx.fillStyle = "#4a5568"; ctx.font = "bold 9px 'DM Mono', monospace";
    ctx.fillText("CHAPA " + (idx + 1) + "  ·  " + r.W + " × " + r.H + " mm  ·  " + r.prod, ox + 4, oy - 4);
    const bordOffset = bordMm * scale;
    r.placed.forEach((p) => {
      const pid = p.pedidoId ?? pedidoRef ?? "?";
      const { fill, stroke } = getColorForPedido(pid);
      const px = ox + bordOffset + p.x * scale, py = oy + bordOffset + p.y * scale;
      const pw = p.l * scale, ph = p.a * scale;
      ctx.fillStyle = fill; ctx.fillRect(px, py, pw, ph);
      const grad = ctx.createLinearGradient(px, py, px, py + ph * 0.4);
      grad.addColorStop(0, "rgba(255,255,255,0.10)"); grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad; ctx.fillRect(px, py, pw, ph * 0.4);
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.strokeRect(px, py, pw, ph);
      if (pw > 30 && ph > 18) {
        ctx.fillStyle = "rgba(255,255,255,0.90)";
        const fs = Math.max(7, Math.min(11, pw / 7));
        ctx.font = `bold ${fs}px 'DM Mono', monospace`;
        ctx.fillText(p.l + "×" + p.a, px + 4, py + fs + 3);
        if (ph > 28 && pw > 50) { ctx.fillStyle = "rgba(255,255,255,0.50)"; ctx.font = "7px 'DM Mono', monospace"; ctx.fillText(pid, px + 4, py + fs + 14); }
      }
    });
    r.free.forEach((fr) => {
      if (fr.l < 200 || fr.a < 200) return;
      const fx = ox + bordOffset + fr.x * scale, fy = oy + bordOffset + fr.y * scale;
      const fw = fr.l * scale, fh = fr.a * scale;
      ctx.fillStyle = "rgba(0,200,255,0.07)"; ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeStyle = "rgba(0,200,255,0.35)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 0.7;
      ctx.strokeRect(fx, fy, fw, fh); ctx.setLineDash([]);
      if (fw > 20 && fh > 14) { ctx.fillStyle = "rgba(0,200,255,0.7)"; ctx.font = "bold 9px 'DM Mono', monospace"; ctx.fillText("↺ ret", fx + 3, fy + 11); }
    });
    ctx.strokeStyle = "#3d4a6a"; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, dW, dH);
  }

  // Executa o algoritmo de otimização para um cenário (com ou sem retalhos).
  // `dimensaoPorProduto` vem de resolverDimensaoPorProduto — grupo de produto
  // sem entrada nesse mapa (sem lote utilizável) é pulado por inteiro, sem
  // dimensão default nenhuma (regra de 2026-07-21).
  function computeScenario(
    flat: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
    useRetalhos: boolean,
    dimensaoPorProduto: Map<string, { w: number; h: number }>,
    tmLimitMs = TEMPO_CALCULO_MS
  ): { results: ResultadoChapa[]; aprov: number; chapas: number; retUsados: string[] } {
    const grupos = new Map<string, typeof flat>();
    flat.forEach(p => { const g = grupos.get(p.prod) ?? []; g.push(p); grupos.set(p.prod, g); });
    const results: ResultadoChapa[] = [];
    const retUsados: string[] = [];

    grupos.forEach((grupo, prodNome) => {
      const chapa = dimensaoPorProduto.get(prodNome);
      if (!chapa) return; // sem lote com dimensão confirmada — grupo inteiro fica de fora
      const CW = chapa.w;
      const CH = chapa.h;
      const W = CW - bord * 2;
      const H = CH - bord * 2;
      // Reordena as peças da chapa pela sequência real de extração no corte —
      // assim o nº da peça na tela, no plano impresso e nas etiquetas segue a
      // ordem em que ela fica solta na mesa. Também anexa os riscos numerados.
      function comCortes(placed: ResultadoChapa["placed"], pw: number, ph: number) {
        const seq = derivarCortes(placed, pw, ph);
        if (!seq) return { placed, cortes: undefined }; // não deve acontecer (motor é guilhotina por construção)
        return { placed: seq.ordemExtracao.map(i => placed[i]), cortes: seq.cortes };
      }

      // Retalhos de estoque: aloca peças nos retalhos primeiro (empacotamento single-sheet)
      let rem = [...grupo];
      if (useRetalhos) {
        const retDoProd = retalhosDisponiveis.filter(r => r.produto_nome === prodNome);
        for (const ret of retDoProd) {
          if (rem.length === 0) break;
          const { placed, usados, free } = empacotar(ret.largura, ret.altura, rem, kerf);
          if (placed.length === 0) continue;
          const ord = comCortes(placed, ret.largura, ret.altura);
          results.push({ W: ret.largura, H: ret.altura, prod: prodNome, placed: ord.placed, free, retalhoId: ret.id, cortes: ord.cortes });
          rem = rem.filter((_, i) => !usados.has(i));
          retUsados.push(ret.id);
        }
      }

      // FFD global: distribui TODAS as peças restantes pelas chapas de uma vez
      // (Best-Fit Decreasing multi-chapa, random restarts até tmLimitMs, fica com a melhor)
      if (rem.length > 0) {
        empacotarTodas(W, H, rem, kerf, tmLimitMs).forEach(c => {
          const ord = comCortes(c.placed, W, H);
          results.push({ W: CW, H: CH, prod: prodNome, placed: ord.placed, free: c.free, cortes: ord.cortes });
        });
      }
    });

    let totA = 0, usedA = 0;
    results.forEach(r => {
      const bordEfetivo = r.retalhoId ? 0 : bord;
      const W = r.W - bordEfetivo * 2, H = r.H - bordEfetivo * 2;
      totA += W * H;
      r.placed.forEach(p => (usedA += p.l * p.a));
    });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    return { results, aprov, chapas: results.length, retUsados };
  }

  function rodar() {
    const flat: Array<{ l: number; a: number; prod: string; produtoId?: number | null; pedidoId?: string; podeRotacionar?: boolean }> = [];
    pecas.forEach(p => {
      if (p.l > 0 && p.a > 0)
        for (let q = 0; q < (p.qtd || 1); q++)
          flat.push({ l: p.l, a: p.a, prod: p.prod, produtoId: p.produtoId, pedidoId: p.pedidoId ?? pedidoRef ?? undefined, podeRotacionar: podeRotacionarPorNome(p.prod) });
    });
    pedidosSugeridos.filter(ps => pedidosSelecionados.has(ps.id)).forEach(ps =>
      ps.itens.forEach(p => {
        if (p.l > 0 && p.a > 0)
          for (let q = 0; q < (p.qtd || 1); q++)
            flat.push({ l: p.l, a: p.a, prod: p.prod, produtoId: p.produtoId, pedidoId: ps.id, podeRotacionar: podeRotacionarPorNome(p.prod) });
      })
    );
    if (flat.length === 0) return;

    const invalidas = flat.filter(p => p.l <= 0 || p.a <= 0);
    if (invalidas.length > 0) {
      setMsg(`Erro: ${invalidas.length} peça(s) com dimensão inválida (0mm). Corrija antes de otimizar.`);
      return;
    }

    // Modo avulso/teste: sem produto_id, usa o tamanho manual (chapaW/chapaH)
    // como se fosse um "lote" só pra essa simulação. Fluxo real: dimensão
    // sempre vem de um lote confirmado (resolverDimensaoPorProduto), produto
    // sem lote utilizável fica de fora do plano — sem default, sem erro.
    const resolucao = resolverDimensaoPorProduto(flat, lotesPorProdutoMap, loteEscolhido);
    let dimensaoPorProduto = resolucao.dimensaoPorProduto;
    if (modoTeste) {
      dimensaoPorProduto = new Map(resolucao.dimensaoPorProduto);
      [...new Set(flat.map(p => p.prod))].forEach(nome => {
        if (!dimensaoPorProduto.has(nome)) dimensaoPorProduto.set(nome, { w: chapaW, h: chapaH });
      });
      setPecasExcluidasInfo(new Map());
      setLoteUsadoPorProdutoNome(new Map()); // modo teste nunca chega no handleSalvar — nada a baixar de verdade
    } else {
      setPecasExcluidasInfo(resolucao.pecasExcluidas);
      setLoteUsadoPorProdutoNome(resolucao.loteUsadoPorProduto);
    }

    // Cenário principal
    const main = computeScenario(flat, usarRetalhosEstoque, dimensaoPorProduto);
    setResultado(main.results);
    setChapaIdx(0);
    setAprovNum(main.aprov);
    setPerdaNum(100 - main.aprov);
    setStatChapas(main.chapas);
    setRetalhosUsados(main.retUsados);

    const retPend: RetalhoGerado[] = [];
    main.results.forEach((r, ri) =>
      r.free.filter(fr => fr.l >= 200 && fr.a >= 200).forEach(fr =>
        retPend.push({ ...fr, chapaIdx: ri, prod: r.prod, m2: parseFloat(((fr.l * fr.a) / 1e6).toFixed(4)) })
      )
    );
    setRetalhosGerados(retPend);

    // Comparação automática com/sem retalhos (quando há retalhos disponíveis)
    if (retalhosDisponiveis.length > 0) {
      const alt = computeScenario(flat, !usarRetalhosEstoque, dimensaoPorProduto);
      setComparacaoStats({
        comRetalhos: usarRetalhosEstoque
          ? { aprov: main.aprov, chapas: main.chapas }
          : { aprov: alt.aprov,  chapas: alt.chapas  },
        semRetalhos: usarRetalhosEstoque
          ? { aprov: alt.aprov,  chapas: alt.chapas  }
          : { aprov: main.aprov, chapas: main.chapas },
      });
    } else {
      setComparacaoStats(null);
    }

    const totalExcluidas = Array.from(resolucao.pecasExcluidas.values()).reduce((a, b) => a + b, 0);
    const totalPecas = flat.length - (modoTeste ? 0 : totalExcluidas);
    const totalPlaced = main.results.reduce((a, r) => a + r.placed.length, 0);
    const naoCouberam = totalPecas - totalPlaced;

    // 2 causas bem diferentes de exclusão, cada uma com ação distinta —
    // usar o mesmo texto pras duas (como era antes) manda o operador medir
    // chapa quando na verdade só falta escolher entre lotes já confirmados
    // (achado no P-066, 2026-07-22).
    let semLoteConfirmado = 0;
    let semEscolhaDeLote = 0;
    if (!modoTeste) {
      const produtoIdPorNome = new Map<string, number | null | undefined>();
      flat.forEach(p => { if (!produtoIdPorNome.has(p.prod)) produtoIdPorNome.set(p.prod, p.produtoId); });
      resolucao.pecasExcluidas.forEach((qtd, nome) => {
        const produtoId = produtoIdPorNome.get(nome);
        const lotes = produtoId ? (lotesPorProdutoMap.get(produtoId) ?? []) : [];
        if (lotes.length === 0) semLoteConfirmado += qtd;
        else semEscolhaDeLote += qtd;
      });
    }

    setMsg(
      `${totalPecas} peças · ${main.chapas} chapa(s)` +
      (pedidosSelecionados.size > 0 ? ` · ${pedidosSelecionados.size + 1} pedidos agrupados` : "") +
      ` · ${naoCouberam > 0 ? naoCouberam + " não couberam" : "✓ Todas alocadas"}` +
      (semLoteConfirmado > 0 ? ` · ⚠ ${semLoteConfirmado} peça(s) fora do plano — sem lote com dimensão confirmada` : "") +
      (semEscolhaDeLote > 0 ? ` · ⚠ ${semEscolhaDeLote} peça(s) fora do plano — escolha o lote em "Lote por Produto"` : "")
    );
  }

  function handleImprimirTeste() {
    if (!resultado) return;
    const win = window.open("", "_blank");
    if (!win) return;

    const CORES_PEDIDO = ["#1e5fa6","#16a34a","#dc2626","#7c3aed","#ea580c","#0891b2","#b45309","#be185d","#15803d","#1e40af"];
    const pedidoList = Array.from(new Set(resultado.flatMap(r => r.placed.map(p => p.pedidoId ?? pedidoRef ?? "?"))));
    const corPedido  = (pid: string) => CORES_PEDIDO[pedidoList.indexOf(pid) % CORES_PEDIDO.length];
    const emissao    = new Date().toLocaleDateString("pt-BR");
    const todasPecas = resultado.flatMap((r, ri) => r.placed.map(p => ({ ...p, prod: r.prod, chapaIdx: ri })));
    const m2Total    = todasPecas.reduce((a, p) => a + (p.l * p.a) / 1e6, 0);
    const retalhosCount = resultado.filter(r => r.retalhoId).length;

    function svgChapa(r: ResultadoChapa, maxW: number, maxH: number): string {
      const sc = Math.min(maxW / r.W, maxH / r.H);
      const sw = Math.round(r.W * sc), sh = Math.round(r.H * sc);
      const bp = bord * sc;
      const PAD = 22; // space for dimension labels

      let s = `<rect width="${sw}" height="${sh}" fill="#e8f0fb" stroke="#2d5fa6" stroke-width="1.5" rx="3"/>`;

      if (bord > 0) {
        s += `<rect width="${sw}" height="${bp}" fill="rgba(220,80,30,0.09)"/>`;
        s += `<rect y="${sh - bp}" width="${sw}" height="${bp}" fill="rgba(220,80,30,0.09)"/>`;
        s += `<rect width="${bp}" height="${sh}" fill="rgba(220,80,30,0.09)"/>`;
        s += `<rect x="${sw - bp}" width="${bp}" height="${sh}" fill="rgba(220,80,30,0.09)"/>`;
        s += `<rect x="${bp}" y="${bp}" width="${sw - bp * 2}" height="${sh - bp * 2}" fill="none" stroke="rgba(220,80,30,0.35)" stroke-width="0.7" stroke-dasharray="5,4"/>`;
      }

      r.placed.forEach((p, j) => {
        const pid = p.pedidoId ?? pedidoRef ?? "?";
        const cor = corPedido(pid);
        const px = Math.round(bp + p.x * sc), py = Math.round(bp + p.y * sc);
        const pw = Math.round(p.l * sc), ph = Math.round(p.a * sc);
        const fs = Math.max(6, Math.min(10, Math.min(pw, ph) / 5.5));

        s += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${cor}" fill-opacity="0.78" stroke="white" stroke-width="0.7"/>`;
        s += `<rect x="${px}" y="${py}" width="${pw}" height="${Math.max(2, Math.round(ph * 0.22))}" fill="white" fill-opacity="0.18"/>`;

        if (pw > 20 && ph > 13) {
          const cr = Math.min(9, Math.max(5, fs + 0.5));
          s += `<circle cx="${px + cr + 2}" cy="${py + cr + 2}" r="${cr}" fill="white" fill-opacity="0.88"/>`;
          s += `<text x="${px + cr + 2}" y="${py + cr + 2 + fs * 0.38}" font-size="${fs}" font-family="Arial,sans-serif" font-weight="700" fill="${cor}" text-anchor="middle">${j + 1}</text>`;
          if (pw > 50 && ph > 22)
            s += `<text x="${px + cr * 2 + 5}" y="${py + fs + 3}" font-size="${Math.max(5, fs - 1)}" font-family="monospace" font-weight="600" fill="white">${p.l}×${p.a}${p.rot ? " ↺" : ""}</text>`;
          if (ph > 34 && pw > 60 && pedidoList.length > 1)
            s += `<text x="${px + 3}" y="${py + ph - 4}" font-size="7" font-family="monospace" fill="rgba(255,255,255,0.75)">${pid}</text>`;
        }
      });

      r.free.filter(f => f.l >= 200 && f.a >= 200).forEach(f => {
        const fx = Math.round(bp + f.x * sc), fy = Math.round(bp + f.y * sc);
        const fw = Math.round(f.l * sc), fh = Math.round(f.a * sc);
        s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="rgba(8,145,178,0.07)" stroke="#0891b2" stroke-width="0.8" stroke-dasharray="5,4"/>`;
        if (fw > 28 && fh > 14)
          s += `<text x="${fx + fw / 2}" y="${fy + fh / 2 + 4}" font-size="8" font-family="monospace" fill="#0070a0" text-anchor="middle">↺ ${f.l}×${f.a}</text>`;
      });

      // Riscos de corte numerados (sequência de execução na mesa)
      (r.cortes ?? []).forEach(ct => {
        const isV = ct.dir === "V";
        const x1 = bp + (isV ? ct.pos : ct.ini) * sc, x2 = bp + (isV ? ct.pos : ct.fim) * sc;
        const y1 = bp + (isV ? ct.ini : ct.pos) * sc, y2 = bp + (isV ? ct.fim : ct.pos) * sc;
        const lx = isV ? x1 : x1 + 2, ly = isV ? y1 + 7 : y1;
        s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#dc2626" stroke-width="1" stroke-dasharray="6,3" opacity="0.85"/>`;
        s += `<circle cx="${lx}" cy="${ly}" r="6" fill="#dc2626" opacity="0.92"/>`;
        s += `<text x="${lx}" y="${ly + 2.5}" font-size="7" font-family="Arial,sans-serif" font-weight="900" fill="white" text-anchor="middle">${ct.seq}</text>`;
      });

      // Dimension arrows
      s += `<line x1="0" y1="${sh + 10}" x2="${sw}" y2="${sh + 10}" stroke="#666" stroke-width="0.8"/>`;
      s += `<line x1="0" y1="${sh + 7}" x2="0" y2="${sh + 13}" stroke="#666" stroke-width="0.8"/>`;
      s += `<line x1="${sw}" y1="${sh + 7}" x2="${sw}" y2="${sh + 13}" stroke="#666" stroke-width="0.8"/>`;
      s += `<text x="${sw / 2}" y="${sh + 19}" font-size="9" font-family="monospace" fill="#444" text-anchor="middle">${r.W} mm</text>`;

      s += `<line x1="${sw + 10}" y1="0" x2="${sw + 10}" y2="${sh}" stroke="#666" stroke-width="0.8"/>`;
      s += `<line x1="${sw + 7}" y1="0" x2="${sw + 13}" y2="0" stroke="#666" stroke-width="0.8"/>`;
      s += `<line x1="${sw + 7}" y1="${sh}" x2="${sw + 13}" y2="${sh}" stroke="#666" stroke-width="0.8"/>`;
      s += `<text x="${sw + PAD - 2}" y="${sh / 2}" font-size="9" font-family="monospace" fill="#444" text-anchor="middle" transform="rotate(90,${sw + PAD - 2},${sh / 2})">${r.H} mm</text>`;

      return `<svg width="${sw + PAD}" height="${sh + PAD}" viewBox="0 0 ${sw + PAD} ${sh + PAD}" style="display:block;max-width:100%;height:auto">${s}</svg>`;
    }

    const footer = `
      <div style="border-top:1.5px solid #2d5fa6;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#888;margin-top:18px">
        <span>Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</span>
        <span style="color:#c0392b;font-style:italic">Documento confidencial · ${emissao}</span>
      </div>`;

    const runningHdr = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #d0daf0;margin-bottom:14px">
        <div style="font-size:17px;font-weight:900;color:#2d5fa6;letter-spacing:-0.5px">urbanglass</div>
        <div style="font-size:9px;color:#888;text-align:right">
          <strong style="color:#2d5fa6">${pedidoRef ?? "AVULSO"}</strong> · Plano de Corte · ${emissao}
          <span style="margin-left:8px;padding:1px 7px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:99px;font-size:8px;font-weight:700">⚠ SIMULAÇÃO</span>
        </div>
      </div>`;

    const legendaHtml = pedidoList.length > 1 ? `
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 12px;background:#f0f4ff;border-radius:7px;border:1px solid #d0daf0;margin-bottom:16px">
        <span style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px">Pedidos:</span>
        ${pedidoList.map(pid => `
          <div style="display:flex;align-items:center;gap:5px">
            <div style="width:12px;height:12px;border-radius:3px;background:${corPedido(pid)};opacity:0.82"></div>
            <span style="font-size:10px;font-weight:600">${pid}</span>
          </div>`).join("")}
      </div>` : "";

    const apColor = (v: number) => v >= 80 ? "#155724" : v >= 60 ? "#856404" : "#721c24";
    const apBg    = (v: number) => v >= 80 ? "#d4edda" : v >= 60 ? "#fff3cd" : "#f8d7da";

    // ── PAGE 1: summary ──────────────────────────────────────────────────────
    const page1 = `
      <div class="page">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #2d5fa6;margin-bottom:20px">
          <div>
            <div style="font-size:28px;font-weight:900;color:#2d5fa6;letter-spacing:-1px">urbanglass</div>
            <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px">Urban Glass Comércio Ltda</div>
            <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px;margin-top:1px">CNPJ: 65.668.970/0001-05</div>
            <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:1.5px;margin-top:1px">Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – JF/MG</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10px;color:#888;text-transform:uppercase;letter-spacing:2px">Plano de Corte</div>
            <div style="font-size:24px;font-weight:900;color:#2d5fa6;margin-top:2px">${pedidoRef ?? "AVULSO"}</div>
            <div style="margin-top:5px">
              <span style="display:inline-block;padding:2px 10px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:99px;font-size:9px;font-weight:700">⚠ SIMULAÇÃO — não salvo</span>
            </div>
            <div style="font-size:9px;color:#888;margin-top:5px">Emissão: <strong>${emissao}</strong></div>
          </div>
        </div>

        <div style="font-size:9px;font-weight:800;color:#2d5fa6;text-transform:uppercase;letter-spacing:1.5px;padding-bottom:5px;border-bottom:2px solid #d0daf0;margin-bottom:14px">Resumo Executivo</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
          <div style="background:#f0f4ff;border-radius:8px;padding:11px 12px;border:1px solid #d0daf0">
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Aproveitamento</div>
            <div style="font-size:21px;font-weight:900;color:${apColor(aprovNum)};font-family:monospace">${aprovNum.toFixed(1)}%</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px">${aprovNum >= 80 ? "Excelente" : aprovNum >= 60 ? "Regular" : "Baixo"}</div>
          </div>
          <div style="background:#fff5f5;border-radius:8px;padding:11px 12px;border:1px solid #fcd4d4">
            <div style="font-size:8px;font-weight:700;color:#9b5563;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Perda</div>
            <div style="font-size:21px;font-weight:900;color:#c0392b;font-family:monospace">${perdaNum.toFixed(1)}%</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px">de material</div>
          </div>
          <div style="background:#f0fdff;border-radius:8px;padding:11px 12px;border:1px solid #bde8f5">
            <div style="font-size:8px;font-weight:700;color:#0e7490;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Chapas Usadas</div>
            <div style="font-size:21px;font-weight:900;color:#0891b2;font-family:monospace">${statChapas}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px">${retalhosCount > 0 ? retalhosCount + " retalho(s)" : "chapas novas"}</div>
          </div>
          <div style="background:#fffbeb;border-radius:8px;padding:11px 12px;border:1px solid #fde68a">
            <div style="font-size:8px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Retalhos</div>
            <div style="font-size:21px;font-weight:900;color:#d97706;font-family:monospace">${retalhosGerados.length}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px">aproveitáveis ≥200mm</div>
          </div>
          <div style="background:#f0f4ff;border-radius:8px;padding:11px 12px;border:1px solid #d0daf0">
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Total Peças</div>
            <div style="font-size:21px;font-weight:900;color:#2d5fa6;font-family:monospace">${todasPecas.length}</div>
            <div style="font-size:8px;color:#6b7280;margin-top:2px">${m2Total.toFixed(3)} m²</div>
          </div>
          <div style="background:#f0f4ff;border-radius:8px;padding:11px 12px;border:1px solid #d0daf0">
            <div style="font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Parâmetros</div>
            <div style="font-size:11px;font-weight:700;color:#2d5fa6;font-family:monospace;margin-top:4px">Kerf: ${kerf} mm</div>
            <div style="font-size:11px;font-weight:700;color:#2d5fa6;font-family:monospace">Borda: ${bord} mm</div>
          </div>
        </div>

        ${legendaHtml}

        <div style="font-size:9px;font-weight:800;color:#2d5fa6;text-transform:uppercase;letter-spacing:1.5px;padding-bottom:5px;border-bottom:2px solid #d0daf0;margin-bottom:10px">
          Lista de Peças · ${todasPecas.length} peças · ${m2Total.toFixed(4)} m² total
        </div>
        <table>
          <thead><tr>
            <th style="width:28px;text-align:center">#</th>
            <th>Material</th>
            <th>Dimensão (mm)</th>
            <th style="text-align:right">m²</th>
            ${pedidoList.length > 1 ? "<th>Pedido</th>" : ""}
            <th style="text-align:center">Chapa</th>
            <th style="text-align:center">Girada</th>
          </tr></thead>
          <tbody>${todasPecas.map((p, i) => `
            <tr>
              <td style="font-weight:800;color:#2d5fa6;text-align:center">${i + 1}</td>
              <td style="font-weight:600">${p.prod}</td>
              <td style="font-family:monospace;font-weight:600">${p.l} × ${p.a}</td>
              <td style="text-align:right;font-family:monospace">${((p.l * p.a) / 1e6).toFixed(4)}</td>
              ${pedidoList.length > 1 ? `<td style="font-family:monospace;font-weight:600;color:${corPedido(p.pedidoId ?? pedidoRef ?? "?")}">${p.pedidoId ?? pedidoRef ?? "—"}</td>` : ""}
              <td style="text-align:center;font-weight:700;color:#2d5fa6">${p.chapaIdx + 1}</td>
              <td style="text-align:center;color:${p.rot ? "#7c3aed" : "#aaa"};font-weight:600">${p.rot ? "↺ Sim" : "—"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        ${footer}
      </div>`;

    // ── PAGES 2+: one page per chapa ─────────────────────────────────────────
    const chapasHtml = resultado.map((r, i) => {
      const retalhos = r.free.filter(f => f.l >= 200 && f.a >= 200);
      const areaUtil  = r.retalhoId ? r.W * r.H : (r.W - bord * 2) * (r.H - bord * 2);
      const areaUsada = r.placed.reduce((a, p) => a + p.l * p.a, 0);
      const apChapa   = areaUtil > 0 ? (areaUsada / areaUtil) * 100 : 0;
      const apStr     = apChapa.toFixed(1);
      return `
        <div class="page">
          ${runningHdr}

          <div style="background:#2d5fa6;border-radius:8px 8px 0 0;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="color:rgba(255,255,255,0.65);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Chapa ${i + 1} de ${resultado.length}${r.retalhoId ? " · retalho de estoque" : ""}</div>
              <div style="font-size:16px;font-weight:900;color:white;margin-top:2px">${r.prod}</div>
            </div>
            <div style="display:flex;gap:22px;align-items:center">
              <div style="text-align:center">
                <div style="font-size:8px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px">Dimensão</div>
                <div style="font-size:12px;font-weight:700;color:white;font-family:monospace;margin-top:2px">${r.W} × ${r.H} mm</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:8px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px">Peças</div>
                <div style="font-size:20px;font-weight:900;color:white;font-family:monospace">${r.placed.length}</div>
              </div>
              <div style="text-align:center">
                <div style="font-size:8px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px">Aproveit.</div>
                <div style="font-size:18px;font-weight:900;font-family:monospace;padding:2px 10px;border-radius:6px;background:${apBg(apChapa)};color:${apColor(apChapa)};margin-top:2px">${apStr}%</div>
              </div>
              ${retalhos.length > 0 ? `
              <div style="text-align:center">
                <div style="font-size:8px;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:1px">Retalhos</div>
                <div style="font-size:20px;font-weight:900;color:#fde68a;font-family:monospace">${retalhos.length}</div>
              </div>` : ""}
            </div>
          </div>

          <div style="border:1px solid #d0daf0;border-top:none;border-radius:0 0 8px 8px;background:white;padding:14px 16px">
            <div style="text-align:center;background:#f8faff;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin-bottom:14px">
              ${svgChapa(r, 640, 290)}
            </div>

            <div style="font-size:9px;font-weight:700;color:#2d5fa6;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px">Peças nesta chapa</div>
            <table>
              <thead><tr>
                <th style="width:28px;text-align:center">#</th>
                <th>Dimensão (mm)</th>
                ${pedidoList.length > 1 ? "<th>Pedido</th>" : ""}
                <th style="text-align:right">m²</th>
                <th style="text-align:center">Posição (X · Y)</th>
                <th style="text-align:center">Girada</th>
              </tr></thead>
              <tbody>${r.placed.map((p, j) => `
                <tr>
                  <td style="font-weight:800;color:#2d5fa6;text-align:center">${j + 1}</td>
                  <td style="font-family:monospace;font-weight:600">${p.l} × ${p.a}</td>
                  ${pedidoList.length > 1 ? `<td style="font-family:monospace;font-weight:600;color:${corPedido(p.pedidoId ?? pedidoRef ?? "?")}">${p.pedidoId ?? pedidoRef ?? "—"}</td>` : ""}
                  <td style="text-align:right;font-family:monospace">${((p.l * p.a) / 1e6).toFixed(4)}</td>
                  <td style="text-align:center;font-family:monospace;color:#555">${p.x} · ${p.y}</td>
                  <td style="text-align:center;font-weight:600;color:${p.rot ? "#7c3aed" : "#aaa"}">${p.rot ? "↺ Sim" : "—"}</td>
                </tr>`).join("")}
              </tbody>
            </table>

            ${retalhos.length > 0 ? `
              <div style="margin-top:10px;padding:8px 12px;background:#e0f4ff;border-radius:6px;border-left:3px solid #0891b2;font-size:10px">
                <strong style="color:#0070a0">↺ Retalhos aproveitáveis (≥200×200 mm):</strong>
                <span style="margin-left:6px;font-family:monospace;color:#0070a0">${retalhos.map(f => `${f.l}×${f.a} mm (${((f.l * f.a) / 1e6).toFixed(4)} m²)`).join(" &nbsp;·&nbsp; ")}</span>
              </div>` : ""}
          </div>
          ${footer}
        </div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <title>Plano de Corte · ${pedidoRef ?? "AVULSO"}</title>
      <meta charset="utf-8">
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; background: #b0b4bb; font-size: 12px; padding: 24px 0 36px; }
        .page { width: 794px; background: white; margin: 0 auto 20px; padding: 42px 50px; box-shadow: 0 4px 28px rgba(0,0,0,0.22); }
        @page { size: A4 portrait; margin: 12mm 14mm; }
        @media print {
          body { background: white; padding: 0; }
          .page { width: 100%; box-shadow: none; margin: 0; padding: 0; }
          .page + .page { page-break-before: always; }
          .noprint { display: none !important; }
        }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #2d5fa6; color: white; }
        th { padding: 6px 8px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        td { padding: 5px 8px; border-bottom: 1px solid #eef0f5; font-size: 10px; }
        tbody tr:nth-child(even) td { background: #f7f9ff; }
      </style>
    </head><body>
      <div class="noprint" style="position:sticky;top:0;z-index:99;background:#2d5fa6;padding:8px 0;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.25)">
        <button onclick="window.print()" style="padding:7px 28px;background:white;color:#2d5fa6;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px">🖨 Imprimir / Salvar PDF</button>
      </div>
      ${page1}
      ${chapasHtml}
    </body></html>`);
    win.document.close();
  }

  async function handleZerar() {
    if (!pedidoRef) return;
    if (!(await confirm("Apagar completamente a otimização deste pedido?", { perigo: true }))) return;
    setZerando(true);
    // O plano é salvo em historico_otimizador (o delete apontava pra tabela
    // "otimizacoes", que não existe/não é usada — o plano nunca era apagado).
    await supabase.from("historico_otimizador").delete().eq("pedido_id", pedidoRef);
    await supabase.from("otimizacao_perda_detalhe").delete().eq("pedido_id", pedidoRef);
    await reverterMovimentacao("otimizacao", pedidoRef);
    await updatePedido(pedidoRef, { status: "Aguardando otimização" });
    for (const pid of pedidosSelecionados) {
      await supabase.from("historico_otimizador").delete().eq("pedido_id", pid);
      await supabase.from("otimizacao_perda_detalhe").delete().eq("pedido_id", pid);
      await reverterMovimentacao("otimizacao", pid);
      await updatePedido(pid, { status: "Aguardando otimização" });
    }
    setResultado(null); setMsg(""); setRetalhosGerados([]); setPedidosSelecionados(new Set()); setRetalhosUsados([]);
    setZerando(false);
    recarregarLotes(); // reverterMovimentacao mexeu no saldo — lista de lotes utilizáveis pode ter mudado
    toast("Plano zerado.");
  }

  async function handleSalvar() {
    if (!resultado || !pedidoRef) return;
    setSalvando(true);
    const hoje = new Date().toISOString().split("T")[0];
    const todosPedidos = [pedidoRef, ...Array.from(pedidosSelecionados)];
    const chapasJson = resultado.map(r => ({ W: r.W, H: r.H, prod: r.prod, placed: r.placed, free: r.free, retalhoId: r.retalhoId ?? null, cortes: r.cortes ?? null }));
    for (const pid of todosPedidos) {
      const pecasDoPedido = pid === pedidoRef
        ? pecas.filter(p => !p.pedidoId || p.pedidoId === pedidoRef)
        : (pedidosSugeridos.find(s => s.id === pid)?.itens ?? []);
      const chapasComPecasDoPedido = chapasJson.map(chapa => ({
        ...chapa, placed: chapa.placed.filter((p: any) => (p.pedidoId ?? pedidoRef) === pid),
      }));
      await salvarOtimizacao({
        pedido_id: pid, dt_otim: hoje,
        aproveitamento: parseFloat(aprovNum.toFixed(2)), perda: parseFloat(perdaNum.toFixed(2)),
        chapas_usadas: resultado.length, retalhos_gerados: retalhosGerados.length,
        total_pecas: pecasDoPedido.reduce((a, p) => a + (p.qtd || 1), 0),
        // Metadado informativo (o real, por grupo de produto, já está em cada
        // chapas_json[].W/H) — usa a 1ª chapa do resultado como representante,
        // em vez do antigo chapaW/chapaH (que não refletia mais o lote real
        // usado em cada grupo desde a resolução por lote).
        chapa_w: resultado[0]?.W ?? 0, chapa_h: resultado[0]?.H ?? 0, kerf, borda: bord,
        pecas_json: pecasDoPedido, chapas_json: chapasComPecasDoPedido, usuario: null,
      });
    }
    for (const pid of todosPedidos) await updatePedido(pid, { status: "Em Produção – Corte" });
    // Rastreamento por peça (QR individual): melhor esforço, não bloqueia o
    // salvamento — pedidos de chapa inteira retornam erro esperado (não usam
    // esse fluxo) e são ignorados silenciosamente; falhas genuínas só logam.
    for (const pid of todosPedidos) {
      const r = await gerarPecasDoPedido(pid);
      if (!r.ok && r.erro && !r.erro.includes("chapa inteira")) {
        console.warn(`gerarPecasDoPedido(${pid}):`, r.erro);
      }
    }
    if (retalhosGerados.length > 0) {
      const ok = await salvarRetalhos(retalhosGerados.map(fr => ({
        produto_nome: fr.prod, largura: fr.l, altura: fr.a, m2: fr.m2,
        chapa_origem: `CHAPA ${fr.chapaIdx + 1}`, pedido_origem: pedidoRef,
        status: "Disponível", dt_gerado: hoje,
      })));
      if (!ok) { setSalvando(false); toast("Erro ao salvar retalhos. Tente novamente.", "err"); return; }
    }
    if (retalhosUsados.length > 0) {
      for (const rid of retalhosUsados) {
        await supabase.from("retalhos").update({ status: "Em uso" } as never).eq("id", rid);
      }
    }
    const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
    resultado.forEach(r => {
      if (r.retalhoId) return; // retalho do estoque: não baixa chapa nova
      const prev = consumoPorProd.get(r.prod) ?? { chapas: 0, m2: 0 };
      consumoPorProd.set(r.prod, { chapas: prev.chapas + 1, m2: prev.m2 + (r.W * r.H) / 1e6 });
    });
    for (const [prodNome, consumo] of consumoPorProd.entries()) {
      const prodId = produtos.find(pr => pr.nome === prodNome)?.id;
      // Lote escolhido pra este produto neste plano (resolverDimensaoPorProduto,
      // via rodar()) — quando presente, a baixa decrementa o lote específico
      // em vez do agregado por produto (ver services/lotes.service.ts).
      const loteId = loteUsadoPorProdutoNome.get(prodNome);
      const res = await registrarMovimentacao({
        produtoId: prodId, produtoNome: prodNome, loteId,
        tipo: "saida_producao", origemTipo: "otimizacao", origemId: pedidoRef,
        chapas: -consumo.chapas, m2: -parseFloat(consumo.m2.toFixed(4)),
      });
      if (res.jaExistia) {
        console.warn(`Baixa de estoque para o pedido ${pedidoRef} já tinha sido registrada — não aplicada de novo. Use "Zerar" antes de reotimizar.`);
      } else if (!res.ok) {
        toast(`Erro ao baixar estoque de "${prodNome}": ${res.motivo}`, "err");
        console.error("registrarMovimentacao (otimizador):", res.motivo);
      } else if (res.alertaMinimo) {
        toast(res.alertaMensagem ?? "", "warn");
      }
    }
    // Detalhe de perda de otimização por produto — uma vez por rodada, não
    // por pedido (rodada pode combinar vários pedidos; chapas_json duplica
    // as mesmas chapas em cada linha de historico_otimizador por pedido).
    // custo_m2 vem do custo PEPS (lib/custoLote.ts), custeando a mesma
    // quantidade de chapas novas (consumoPorProd) que acabou de ser baixada
    // acima — fica null (não 0) quando a fila PEPS precisa de um lote sem
    // custo definido, mesma regra usada em margem.service.ts.
    const produtoIdsEnvolvidos = Array.from(consumoPorProd.keys())
      .map(nome => produtos.find(pr => pr.nome === nome)?.id)
      .filter((id): id is number => id != null);
    const lotesPorProdutoCusto = await getLotesParaCustoPorProduto(produtoIdsEnvolvidos);

    const perdaPorProd = new Map<string, { bruta: number; pecas: number; retalhos: number }>();
    resultado.forEach(r => {
      const prev = perdaPorProd.get(r.prod) ?? { bruta: 0, pecas: 0, retalhos: 0 };
      prev.bruta += (r.W * r.H) / 1e6;
      prev.pecas += r.placed.reduce((a: number, p: any) => a + (p.l * p.a) / 1e6, 0);
      perdaPorProd.set(r.prod, prev);
    });
    retalhosGerados.forEach(fr => {
      const prev = perdaPorProd.get(fr.prod) ?? { bruta: 0, pecas: 0, retalhos: 0 };
      prev.retalhos += fr.m2;
      perdaPorProd.set(fr.prod, prev);
    });

    const perdaDetalhe: OtimizacaoPerdaDetalheInsert[] = Array.from(perdaPorProd.entries()).map(([prodNome, v]) => {
      const produtoId = produtos.find(pr => pr.nome === prodNome)?.id ?? null;
      const m2Perda = parseFloat((v.bruta - v.pecas - v.retalhos).toFixed(4));
      if (Math.abs(m2Perda) > 0.01 && v.bruta === 0) {
        console.warn(`Perda de otimização suspeita para "${prodNome}": bruta=0 mas pecas/retalhos > 0.`);
      }
      const m2ConsumidoNovo = consumoPorProd.get(prodNome)?.m2 ?? 0;
      const custoResultado = produtoId != null
        ? custoPeps(lotesPorProdutoCusto.get(produtoId) ?? [], m2ConsumidoNovo)
        : { custoM2: null, envolveDataEstimada: false };
      return {
        pedido_id: pedidoRef,
        produto_id: produtoId,
        produto_nome: prodNome,
        m2_bruta_chapas: parseFloat(v.bruta.toFixed(4)),
        m2_pecas: parseFloat(v.pecas.toFixed(4)),
        m2_retalhos: parseFloat(v.retalhos.toFixed(4)),
        m2_perda: m2Perda,
        custo_m2: custoResultado.custoM2,
        dt_otim: hoje,
      };
    });
    if (perdaDetalhe.length > 0) {
      const { error: perdaError } = await supabase.from("otimizacao_perda_detalhe").insert(perdaDetalhe as never);
      if (perdaError) console.error("otimizacao_perda_detalhe insert:", perdaError);
    }
    recarregarLotes();
    router.push("/pedidos/" + pedidoRef);
  }

  function addPeca() { setPecas(p => [...p, { l: 0, a: 0, qtd: 1, prod: "", produtoId: null, pedidoId: pedidoRef ?? undefined }]); }
  function remPeca(i: number) { setPecas(p => p.filter((_, idx) => idx !== i)); }
  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas(p => p.map((pc, idx) => {
      if (idx !== i) return pc;
      if (field === "prod") {
        // Peça adicionada manualmente: resolve produto_id pelo nome escolhido
        // no select (produtos já carregados), pra ela também entrar na
        // resolução de lote como qualquer peça vinda de um pedido real.
        const produtoId = produtos.find(pr => pr.nome === value)?.id ?? null;
        return { ...pc, prod: value as string, produtoId };
      }
      return { ...pc, [field]: value };
    }));
  }

  const stats = [
    { label: "Aproveitamento", value: resultado ? aprovNum.toFixed(2) + "%" : "—", color: "#3dffa0", bg: "rgba(61,255,160,.08)",  border: "rgba(61,255,160,.2)",  icon: "◈" },
    { label: "Perda",          value: resultado ? perdaNum.toFixed(2) + "%" : "—", color: "#f43f5e", bg: "rgba(244,63,94,.08)",   border: "rgba(244,63,94,.2)",   icon: "▽" },
    { label: "Chapas",         value: resultado ? String(statChapas)         : "—", color: "#00c8ff", bg: "rgba(0,200,255,.08)",   border: "rgba(0,200,255,.2)",   icon: "▦" },
    { label: "Retalhos",       value: resultado ? String(retalhosGerados.length) : "—", color: "#f59e0b", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.2)", icon: "↺" },
  ];

  function collapseHeader(label: string, aberto: boolean, toggle: () => void, badge?: string) {
    return (
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)" }}>
          {label}
          {badge && <span style={{ marginLeft: "8px", fontSize: "10px", padding: "1px 7px", borderRadius: "99px", background: "rgba(61,255,160,.15)", color: "var(--acc)", border: "1px solid rgba(61,255,160,.3)" }}>{badge}</span>}
        </span>
        <span style={{ fontSize: "12px", color: "var(--t3)", transition: "transform 0.2s", display: "inline-block", transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
      </div>
    );
  }

  // Renderiza badge de urgência ou ganho de aproveitamento
  function renderBadgePedido(ps: PedidoSugerido) {
    const urgente = ps.diasParaEntrega !== null && ps.diasParaEntrega <= 3;
    const atrasado = ps.diasParaEntrega !== null && ps.diasParaEntrega < 0;

    if (atrasado) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: "rgba(244,63,94,.2)", color: "#f43f5e", border: "1px solid rgba(244,63,94,.4)" }}>
            ⚠ {Math.abs(ps.diasParaEntrega!)}d atrasado
          </span>
          {ps.aprovSeCombinado !== null && (
            <span style={{ fontSize: "10px", color: ps.aprovSeCombinado >= 0 ? "#3dffa0" : "#f43f5e", fontFamily: "'DM Mono',monospace" }}>
              {ps.aprovSeCombinado >= 0 ? "+" : ""}{ps.aprovSeCombinado}%
            </span>
          )}
        </div>
      );
    }

    if (urgente) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "99px", background: "rgba(245,158,11,.2)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.4)" }}>
            ⏰ {ps.diasParaEntrega}d
          </span>
          {ps.aprovSeCombinado !== null && (
            <span style={{ fontSize: "10px", color: ps.aprovSeCombinado >= 0 ? "#3dffa0" : "#f43f5e", fontFamily: "'DM Mono',monospace" }}>
              {ps.aprovSeCombinado >= 0 ? "+" : ""}{ps.aprovSeCombinado}%
            </span>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "3px" }}>
        {ps.aprovSeCombinado !== null && (
          <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", background: ps.aprovSeCombinado >= 0 ? "rgba(61,255,160,.12)" : "rgba(244,63,94,.12)", color: ps.aprovSeCombinado >= 0 ? "#3dffa0" : "#f43f5e", border: `1px solid ${ps.aprovSeCombinado >= 0 ? "rgba(61,255,160,.3)" : "rgba(244,63,94,.3)"}`, fontFamily: "'DM Mono',monospace" }}>
            {ps.aprovSeCombinado >= 0 ? "+" : ""}{ps.aprovSeCombinado}%
          </span>
        )}
        {ps.dtRetirada && (
          <span style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>
            entrega {new Date(ps.dtRetirada + "T00:00:00").toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    );
  }

  function copiarUrlTeste() {
    const validas = pecas.filter(p => p.l > 0 && p.a > 0 && p.qtd > 0);
    if (validas.length === 0) return;
    // formato CSV compacto: l,a,qtd|l,a,qtd|...  (muito mais curto que base64-JSON)
    const csv = validas.map(p => `${p.l},${p.a},${p.qtd}`).join("|");
    const prod = validas[0]?.prod ?? "";
    const params = new URLSearchParams({ pecas: csv, cw: String(chapaW), ch: String(chapaH) });
    if (prod) params.set("prod", prod);
    const url = `${window.location.origin}/otimizador?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => setMsg("URL de teste copiada!")).catch(() => setMsg(url));
  }

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Otimizador de Corte</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {pedidoRef && (
            <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
              Pedido <strong style={{ color: "var(--acc)" }}>{pedidoRef}</strong>
              {pedidosSelecionados.size > 0 && <span style={{ color: "var(--acc2)", marginLeft: "8px" }}>+ {pedidosSelecionados.size} agrupado(s)</span>}
            </span>
          )}
          {simulando && <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>simulando combinações...</span>}
          <button className="btn bp sm" onClick={rodar} style={{ fontWeight: 700 }} title="Busca o melhor aproveitamento possível (~10s por produto)">◈ Calcular</button>
          {resultado && !modoTeste && pedidoRef && (
           <button className="btn bp sm" onClick={handleSalvar} disabled={salvando} style={{ background: "var(--ok)", borderColor: "var(--ok)", color: "#000", fontWeight: 700 }}>
            {salvando ? "Salvando..." : pedidosSelecionados.size > 0 ? `✓ Salvar ${pedidosSelecionados.size + 1} Pedidos` : "✓ Salvar Plano"}
           </button>
          )}
          {pedidoRef && (
            <button className="btn bg sm" onClick={handleZerar} disabled={zerando} style={{ borderColor: "var(--err)", color: "var(--err)" }}>
              {zerando ? "Zerando..." : "✕ Zerar Plano"}
            </button>
          )}
          {resultado && (
            <button className="btn bg sm" onClick={handleImprimirTeste}>🖨 Imprimir Plano</button>
          )}
          {pecas.some(p => p.l > 0 && p.a > 0) && (
            <button className="btn bg sm" onClick={copiarUrlTeste} title="Copia URL com as peças atuais para reusar sem redigitar">🔗 Copiar URL</button>
          )}
          {pedidoRef && <a href={"/pedidos/" + pedidoRef} className="btn bg sm">← Voltar ao Pedido</a>}
        </div>
      </div>

      {resumoPendente && resumoPendente.totalChapas > 0 && (
        <div className="con" style={{ paddingBottom: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
            padding: "10px 14px", background: "rgba(245,158,11,.1)", border: "1px solid var(--warn)",
            borderRadius: "10px", marginBottom: "10px",
          }}>
            <span style={{ fontSize: "16px" }}>⚠</span>
            <span style={{ fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>
              {resumoPendente.totalChapas} chapas ({resumoPendente.totalM2.toFixed(1)} m²) com dimensão pendente de confirmação
            </span>
            <span style={{ fontSize: "11px", color: "var(--t3)" }}>
              — {resumoPendente.produtos.map(p => `${p.nome} (${p.chapas})`).join(", ")} — saldo real em estoque, mas fora de qualquer plano de corte até a dimensão ser confirmada.
            </span>
          </div>
        </div>
      )}

      <div className="con">
        <div className="g2" style={{ alignItems: "start", gap: "14px" }}>

          {/* ── COL ESQUERDA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* Modo Teste */}
            {pedidoRef && (
              <div style={{ padding: "10px 14px", background: modoTeste ? "rgba(245,158,11,.1)" : "var(--surf1)", border: `1px solid ${modoTeste ? "var(--warn)" : "var(--b1)"}`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: modoTeste ? "var(--warn)" : "var(--t2)" }}>{modoTeste ? "⚠ Modo Teste ativo" : "Modo Teste"}</div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>{modoTeste ? "Nada será salvo — apenas simulação visual" : "Calcular sem salvar no banco"}</div>
                </div>
                <button onClick={() => setModoTeste(v => !v)} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${modoTeste ? "var(--warn)" : "var(--b2)"}`, background: modoTeste ? "rgba(245,158,11,.2)" : "transparent", color: modoTeste ? "var(--warn)" : "var(--t3)", transition: "all 0.15s" }}>
                  {modoTeste ? "Desativar" : "Ativar"}
                </button>
              </div>
            )}

            {/* Usar Retalhos do Estoque */}
            {pecas.some(p => p.prod) && (
              <div style={{ padding: "10px 14px", background: usarRetalhosEstoque ? "rgba(245,158,11,.1)" : "var(--surf1)", border: `1px solid ${usarRetalhosEstoque ? "rgba(245,158,11,.5)" : "var(--b1)"}`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: usarRetalhosEstoque ? "#f59e0b" : "var(--t2)", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>↺ Usar retalhos do estoque</span>
                    {usarRetalhosEstoque && retalhosDisponiveis.length > 0 && (
                      <span style={{ fontSize: "10px", padding: "1px 7px", borderRadius: "99px", background: "rgba(245,158,11,.2)", color: "#f59e0b", border: "1px solid rgba(245,158,11,.4)", fontFamily: "'DM Mono',monospace" }}>
                        {retalhosDisponiveis.length} disponível(is)
                      </span>
                    )}
                    {usarRetalhosEstoque && retalhosDisponiveis.length === 0 && (
                      <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>nenhum para este produto</span>
                    )}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>
                    {usarRetalhosEstoque ? "Peças serão alocadas nos retalhos antes de abrir chapas novas" : "Aproveitar retalhos disponíveis antes de usar chapas inteiras"}
                  </div>
                </div>
                <button onClick={() => setUsarRetalhosEstoque(v => !v)} style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${usarRetalhosEstoque ? "rgba(245,158,11,.5)" : "var(--b2)"}`, background: usarRetalhosEstoque ? "rgba(245,158,11,.2)" : "transparent", color: usarRetalhosEstoque ? "#f59e0b" : "var(--t3)", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                  {usarRetalhosEstoque ? "Desativar" : "Ativar"}
                </button>
              </div>
            )}

            {/* Configuração da Chapa — colapsável. Modo avulso/teste (sem
                produto_id real): tamanho manual, como sempre foi. Modo real
                (pedido carregado): dimensão vem de lotes_estoque, nunca de
                default — 1 lote utilizável usa automático, 2+ exige escolha
                explícita, 0 exclui o produto do plano (ver indicador acima
                do formulário e mensagem após rodar). */}
            <div className="card">
              {collapseHeader(
                modoTeste ? "Configuração da Chapa" : "Lote por Produto",
                chapaAberta, () => setChapaAberta(v => !v),
                modoTeste ? `${chapaW} × ${chapaH}` : (produtosDistintosNaLista.length > 0 ? `${produtosDistintosNaLista.length} produto(s)` : undefined)
              )}
              {chapaAberta && modoTeste && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ marginBottom: "12px" }}>
                    <label className="fl" style={{ marginBottom: "6px", display: "block" }}>Tamanho Padrão</label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {[{ label: "3300 × 2250", w: 3300, h: 2250 }, { label: "3660 × 2140", w: 3660, h: 2140 }, { label: "2150 × 3660", w: 2150, h: 3660 }].map(c => {
                        const ativo = chapaW === c.w && chapaH === c.h;
                        return (
                          <button key={c.label} onClick={() => { setChapaW(c.w); setChapaH(c.h); }}
                            style={{ padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontFamily: "'DM Mono', monospace", fontWeight: 600, border: `1px solid ${ativo ? "var(--acc)" : "var(--b2)"}`, background: ativo ? "rgba(61,255,160,.1)" : "transparent", color: ativo ? "var(--acc)" : "var(--t2)", transition: "all 0.15s" }}>
                            {c.label} mm
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="fr">
                    <Campo label="Largura Chapa (mm)"><input name="chapa_w" type="number" className="fc" value={chapaW} onChange={e => setChapaW(Number(e.target.value))} /></Campo>
                    <Campo label="Altura Chapa (mm)"><input name="chapa_h" type="number" className="fc" value={chapaH} onChange={e => setChapaH(Number(e.target.value))} /></Campo>
                  </div>
                  <div className="fr">
                    <Campo label="Folga / Diamante (mm)"><input name="kerf" type="number" className="fc" value={kerf} min={0} max={20} onChange={e => setKerf(Number(e.target.value))} /></Campo>
                    <Campo label="Borda Lapidação (mm)"><input name="bord" type="number" className="fc" value={bord} min={0} max={30} onChange={e => setBord(Number(e.target.value))} /></Campo>
                  </div>
                </div>
              )}
              {chapaAberta && !modoTeste && (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {produtosDistintosNaLista.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--t3)" }}>Nenhum produto na lista de peças ainda.</div>
                  ) : produtosDistintosNaLista.map(({ produtoId, nome }) => {
                    const lotes = lotesPorProdutoMap.get(produtoId) ?? [];
                    const excluidas = pecasExcluidasInfo.get(nome) ?? 0;
                    return (
                      <div key={produtoId} style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--surf2)", border: "1px solid var(--b1)" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--t1)", marginBottom: "6px" }}>{nome}</div>
                        {lotes.length === 0 && (
                          <div style={{ fontSize: "11px", color: "var(--err, #f43f5e)" }}>
                            ⚠ Sem lote com dimensão confirmada{excluidas > 0 ? ` — ${excluidas} peça(s) fora do plano` : ""}.
                          </div>
                        )}
                        {lotes.length === 1 && (
                          <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono', monospace" }}>
                            {lotes[0].chapa_largura_mm} × {lotes[0].chapa_altura_mm} mm · saldo {lotes[0].chapas_saldo} chapas
                          </div>
                        )}
                        {lotes.length > 1 && (
                          <select
                            className="fc" style={{ fontSize: "11px" }}
                            value={loteEscolhido.get(produtoId) ?? ""}
                            onChange={e => setLoteEscolhido(prev => new Map(prev).set(produtoId, Number(e.target.value)))}
                          >
                            <option value="">Escolher lote ({lotes.length} disponíveis)...</option>
                            {lotes.map(l => (
                              <option key={l.id} value={l.id}>
                                {l.chapa_largura_mm} × {l.chapa_altura_mm} mm · saldo {l.chapas_saldo} chapas · entrada {l.dt_entrada}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  <div className="fr">
                    <Campo label="Folga / Diamante (mm)"><input name="kerf" type="number" className="fc" value={kerf} min={0} max={20} onChange={e => setKerf(Number(e.target.value))} /></Campo>
                    <Campo label="Borda Lapidação (mm)"><input name="bord" type="number" className="fc" value={bord} min={0} max={30} onChange={e => setBord(Number(e.target.value))} /></Campo>
                  </div>
                </div>
              )}
            </div>

            {/* Agrupar Pedidos — colapsável com ranking */}
            {pedidoRef && (pedidosSugeridos.length > 0 || carregandoSugestoes || simulando) && (
              <div className="card">
                {collapseHeader(
                  "Agrupar Pedidos",
                  agrupAberta,
                  () => setAgrupAberta(v => !v),
                  simulando ? "simulando..." : pedidosSugeridos.length > 0 ? `${pedidosSugeridos.length} disponível(is)` : undefined
                )}
                {agrupAberta && (
                  <div style={{ marginTop: "14px" }}>
                    {aprovBase !== null && (
                      <div style={{ marginBottom: "10px", padding: "6px 10px", background: "var(--surf2)", borderRadius: "6px", fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono',monospace" }}>
                        Base atual: <strong style={{ color: "var(--acc)" }}>{aprovBase.toFixed(1)}%</strong> aproveitamento · badges mostram ganho se incluído
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {pedidosSugeridos.map((ps, rank) => {
                        const selecionado = pedidosSelecionados.has(ps.id);
                        const { stroke } = getColorForPedido(ps.id);
                        const urgente = ps.diasParaEntrega !== null && ps.diasParaEntrega <= 3;
                        const atrasado = ps.diasParaEntrega !== null && ps.diasParaEntrega < 0;
                        return (
                          <div key={ps.id} onClick={() => toggleSugerido(ps.id)}
                            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${atrasado ? "rgba(244,63,94,.4)" : urgente ? "rgba(245,158,11,.4)" : selecionado ? stroke : "var(--b2)"}`, background: selecionado ? `${stroke}14` : atrasado ? "rgba(244,63,94,.05)" : urgente ? "rgba(245,158,11,.05)" : "var(--surf2)", transition: "all 0.15s" }}>
                            {/* Rank */}
                            <div style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", minWidth: "14px", textAlign: "center" }}>#{rank + 1}</div>
                            {/* Checkbox */}
                            <div style={{ width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0, border: `2px solid ${selecionado ? stroke : "var(--b3)"}`, background: selecionado ? stroke : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {selecionado && <span style={{ fontSize: "10px", color: "#000", fontWeight: 900 }}>✓</span>}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>
                                {ps.id} <span style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 400 }}>{ps.clienteNome}</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{ps.totalPecas} peça(s) · {ps.produtos.join(", ")}</div>
                            </div>
                            {/* Badge direito */}
                            {renderBadgePedido(ps)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Peças a Cortar */}
            <div className="card">
              <div className="ct">Peças a Cortar</div>
              {carregando && <div style={{ textAlign: "center", color: "var(--t3)", fontSize: "12px", padding: "14px" }}>Carregando peças do pedido...</div>}
              {pecas.map((p, i) => (
                <div key={i} className="op">
                  <div className="oph">
                    <span>PEÇA {i + 1}{p.pedidoId && p.pedidoId !== pedidoRef && <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--acc2)", opacity: 0.7 }}>({p.pedidoId})</span>}</span>
                    <button className="btn bw xs" onClick={() => remPeca(i)}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 80px", gap: "7px" }}>
                    <Campo style={{ margin: 0 }} labelStyle={{ fontSize: "9px" }} label="Produto">
                      <select name={`p_prod_${i}`} className="fc" style={{ fontSize: "11px" }} value={p.prod} onChange={e => updPeca(i, "prod", e.target.value)}>
                        <option value="">Selecionar produto...</option>
                        {produtos.map(pr => <option key={pr.id} value={pr.nome}>{pr.nome}</option>)}
                      </select>
                    </Campo>
                    <Campo style={{ margin: 0 }} labelStyle={{ fontSize: "9px" }} label="Largura (mm)"><input name={`p_l_${i}`} type="number" className="fc" style={{ fontSize: "12px" }} value={p.l || ""} placeholder="1200" onChange={e => updPeca(i, "l", Number(e.target.value))} /></Campo>
                    <Campo style={{ margin: 0 }} labelStyle={{ fontSize: "9px" }} label="Altura (mm)"><input name={`p_a_${i}`} type="number" className="fc" style={{ fontSize: "12px" }} value={p.a || ""} placeholder="800" onChange={e => updPeca(i, "a", Number(e.target.value))} /></Campo>
                    <Campo style={{ margin: 0 }} labelStyle={{ fontSize: "9px" }} label="Quantidade"><input name={`p_qtd_${i}`} type="number" className="fc" style={{ fontSize: "12px" }} value={p.qtd} min={1} onChange={e => updPeca(i, "qtd", Number(e.target.value))} /></Campo>
                  </div>
                </div>
              ))}
              <button className="add-il" onClick={addPeca}>＋ Adicionar peça</button>
            </div>
          </div>

          {/* ── COL DIREITA ── */}
          <div>
            <div className="card mb14">
              <div className="ct">Resultado da Otimização</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "14px" }}>
                {stats.map(s => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: "18px", color: s.color, marginBottom: "2px" }}>{s.icon}</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                    <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace", marginTop: "4px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {comparacaoStats && resultado && (
                <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--surf2)", border: "1px solid var(--b1)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontFamily: "'DM Mono',monospace" }}>Comparação de cenários</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1, padding: "8px 10px", borderRadius: "6px", background: usarRetalhosEstoque ? "rgba(61,255,160,.08)" : "var(--surf1)", border: `1px solid ${usarRetalhosEstoque ? "rgba(61,255,160,.3)" : "var(--b2)"}` }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", marginBottom: "2px" }}>↺ Com Retalhos{usarRetalhosEstoque ? <span style={{ color: "var(--acc)", marginLeft: "4px" }}>← atual</span> : null}</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#3dffa0", fontFamily: "'Syne',sans-serif", lineHeight: 1.1 }}>{comparacaoStats.comRetalhos.aprov.toFixed(1)}%</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{comparacaoStats.comRetalhos.chapas} chapa(s)</div>
                    </div>
                    <div style={{ flex: 1, padding: "8px 10px", borderRadius: "6px", background: !usarRetalhosEstoque ? "rgba(0,200,255,.08)" : "var(--surf1)", border: `1px solid ${!usarRetalhosEstoque ? "rgba(0,200,255,.3)" : "var(--b2)"}` }}>
                      <div style={{ fontSize: "9px", color: "var(--t3)", fontFamily: "'DM Mono',monospace", textTransform: "uppercase", marginBottom: "2px" }}>☐ Sem Retalhos{!usarRetalhosEstoque ? <span style={{ color: "#00c8ff", marginLeft: "4px" }}>← atual</span> : null}</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#00c8ff", fontFamily: "'Syne',sans-serif", lineHeight: 1.1 }}>{comparacaoStats.semRetalhos.aprov.toFixed(1)}%</div>
                      <div style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono',monospace" }}>{comparacaoStats.semRetalhos.chapas} chapa(s)</div>
                    </div>
                  </div>
                  {(() => {
                    const delta = comparacaoStats.comRetalhos.aprov - comparacaoStats.semRetalhos.aprov;
                    const chapDelta = comparacaoStats.semRetalhos.chapas - comparacaoStats.comRetalhos.chapas;
                    return (
                      <div style={{ marginTop: "8px", fontSize: "11px", color: delta >= 0 ? "#3dffa0" : "#f43f5e", fontFamily: "'DM Mono',monospace", textAlign: "center" }}>
                        {delta >= 0 ? `↑ +${delta.toFixed(1)}% com retalhos` : `↓ ${Math.abs(delta).toFixed(1)}% com retalhos`}
                        {chapDelta !== 0 && (
                          <span style={{ marginLeft: "8px", color: chapDelta > 0 ? "#3dffa0" : "#f43f5e" }}>
                            · {chapDelta > 0 ? `-${chapDelta}` : `+${Math.abs(chapDelta)}`} chapa(s)
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {msg && <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono', monospace", marginBottom: "10px", padding: "7px 10px", background: "var(--surf2)", borderRadius: "6px", border: "1px solid var(--b1)" }}>{msg}</div>}

              {modoTeste && resultado && (
                <div style={{ marginBottom: "10px", padding: "8px 12px", background: "rgba(245,158,11,.1)", border: "1px solid var(--warn)", borderRadius: "8px", fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>
                  ⚠ MODO TESTE — Este resultado não será salvo
                </div>
              )}

              {resultado && resultado.length > 1 && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "9px" }}>
                  {resultado.map((r, i) => (
                    <button key={i} className="btn bg sm" onClick={() => setChapaIdx(i)}
                      style={chapaIdx === i
                        ? { borderColor: r.retalhoId ? "#f59e0b" : "var(--acc2)", color: r.retalhoId ? "#f59e0b" : "var(--acc2)", background: r.retalhoId ? "rgba(245,158,11,.1)" : "rgba(0,200,255,.08)" }
                        : r.retalhoId ? { borderColor: "rgba(245,158,11,.3)", color: "#f59e0b" } : {}}>
                      {r.retalhoId ? "↺ " : ""}Chapa {i + 1}{r.prod && <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "4px" }}>· {r.prod.split(" ").slice(0, 2).join(" ")}</span>}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ background: "#0d1117", border: "1px solid #2d3550", borderRadius: "10px", padding: "8px", position: "relative" }}>
                <div style={{ position: "absolute", top: "10px", left: "10px", fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#4a5568", pointerEvents: "none", zIndex: 1 }}>
                  {!resultado ? "Configure as peças e clique em Calcular" : `Chapa ${chapaIdx + 1} · ${resultado[chapaIdx]?.placed.length || 0} peças`}
                </div>
                <canvas ref={canvasRef} width={554} height={370} style={{ display: "block", width: "100%", height: "370px" }} />
              </div>

              {resultado && retalhosGerados.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#f59e0b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px" }}>↺</span>
                    {retalhosGerados.length} retalho(s) {modoTeste ? "— NÃO serão salvos" : "— salvos ao confirmar"}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {retalhosGerados.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: "8px", padding: "10px 14px" }}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{r.l} × {r.a} mm</div>
                          <div style={{ fontSize: "11px", color: "var(--t2)", marginTop: "2px" }}>{r.prod} · Chapa {r.chapaIdx + 1}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#f59e0b", fontFamily: "'Syne', sans-serif" }}>{r.m2} m²</div>
                          <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>aproveitável</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

{resultado && (
  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
    <button className="btn bg sm" style={{ width: "100%", padding: "10px" }} onClick={handleImprimirTeste}>
      🖨 Imprimir Plano (Teste)
    </button>
    {modoTeste && (
      <div style={{ padding: "10px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: "8px", fontSize: "11px", color: "var(--warn)", textAlign: "center" }}>
        Modo teste ativo — desative para salvar
      </div>
    )}
  </div>
)}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function OtimizadorPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <OtimizadorContent />
    </Suspense>
  );
}