"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { salvarOtimizacao } from "@/services/otimizador.service";
import { updatePedido } from "@/services/pedidos.service";
import { baixarChapasEstoque, salvarRetalhos } from "@/services/estoque.service";
import type { Produto, Retalho } from "@/types";
import { CHAPAS_PADRAO, PRODUTO_CHAPA, isChapaInteira } from "@/lib/chapas";

interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; retalhoId?: string; }
interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }
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


// Algoritmo de guilhotina em 2 estágios (strip-packing):
// 1° corte: horizontal por toda a largura → separa faixas
// 2° corte: vertical dentro de cada faixa → peças individuais
// Reflete o fluxo real de corte em vidro pesado.
function empacotar(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  type Strip = { y: number; h: number; xUsed: number };

  const placed: PecaPlacada[] = [];
  const usados  = new Set<number>();
  const strips: Strip[] = [];
  let   bottomY = 0;

  // Ordena pela menor dimensão decrescente: peças mais "altas" (em paisagem) abrem
  // as primeiras faixas e permitem que peças menores caibam nelas.
  const ordem = pecas
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => Math.min(b.l, b.a) - Math.min(a.l, a.a));

  for (const peca of ordem) {
    if (usados.has(peca.origIdx)) continue;

    // Ambas as orientações que cabem na largura da chapa
    const oris = [
      { pl: peca.l, pa: peca.a, rot: false as boolean },
      { pl: peca.a, pa: peca.l, rot: true  as boolean },
    ].filter(o => o.pl <= W);

    if (oris.length === 0) continue;

    let ok = false;

    // ── Tenta encaixar numa faixa existente (First-Fit) ──
    for (const strip of strips) {
      // Orientações que cabem na altura da faixa; prefere a que mais preenche a altura
      const cand = oris
        .filter(o => o.pa <= strip.h)
        .sort((a, b) => b.pa - a.pa);

      for (const ori of cand) {
        const x = strip.xUsed > 0 ? strip.xUsed + kerf : 0;
        if (x + ori.pl > W) continue;
        placed.push({ x, y: strip.y, l: ori.pl, a: ori.pa,
          idx: peca.origIdx, prod: peca.prod, rot: ori.rot, pedidoId: peca.pedidoId });
        usados.add(peca.origIdx);
        strip.xUsed = x + ori.pl;
        ok = true;
        break;
      }
      if (ok) break;
    }

    // ── Abre nova faixa (novo corte longitudinal) ──
    if (!ok) {
      // Prefere orientação que gera faixa mais estreita (menor altura)
      const best = [...oris].sort((a, b) => a.pa - b.pa)[0];
      const y    = strips.length > 0 ? bottomY + kerf : 0;
      if (y + best.pa > H) continue;

      placed.push({ x: 0, y, l: best.pl, a: best.pa,
        idx: peca.origIdx, prod: peca.prod, rot: best.rot, pedidoId: peca.pedidoId });
      usados.add(peca.origIdx);
      strips.push({ y, h: best.pa, xUsed: best.pl });
      bottomY = y + best.pa;
    }
  }

  // Espaços livres: lateral direita de cada faixa + retalho inferior
  const free: EspacoLivre[] = [];
  for (const s of strips) {
    const x = s.xUsed > 0 ? s.xUsed + kerf : 0;
    const w = W - x;
    if (w >= 200 && s.h >= 200) free.push({ x, y: s.y, l: w, a: s.h });
  }
  const yBot = strips.length > 0 ? bottomY + kerf : 0;
  if (H - yBot >= 200 && W >= 200) free.push({ x: 0, y: yBot, l: W, a: H - yBot });

  return { placed, usados, free };
}

// Calcula aproveitamento de um conjunto de peças (sem estado React)
function calcAproveitamento(
  pecasFlat: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  bord: number, kerf: number,
  fallbackW = 3300, fallbackH = 2250
): number {
  const grupos = new Map<string, typeof pecasFlat>();
  pecasFlat.forEach(p => { const g = grupos.get(p.prod) ?? []; g.push(p); grupos.set(p.prod, g); });

  let totA = 0, usedA = 0;
  grupos.forEach((grupo, prodNome) => {
    const ci2 = PRODUTO_CHAPA[prodNome];
    const chapa = ci2 !== undefined ? CHAPAS_PADRAO[ci2] : null;
    const CW = chapa ? chapa.w : fallbackW;
    const CH = chapa ? chapa.h : fallbackH;
    const W = CW - bord * 2;
    const H = CH - bord * 2;
    let rem = [...grupo];
    let ci = 0;
    while (rem.length > 0 && ci < 100) {
      const { placed, usados } = empacotar(W, H, rem, kerf);
      if (placed.length === 0) break;
      totA += W * H;
      placed.forEach(p => (usedA += p.l * p.a));
      rem = rem.filter((_, i) => !usados.has(i));
      ci++;
    }
  });
  return totA > 0 ? (usedA / totA) * 100 : 0;
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
  const pedidoParam = searchParams.get("pedido");

  const [produtos, setProdutos]           = useState<Produto[]>([]);
  const [pecas, setPecas]                 = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);
  const [chapaW, setChapaW]               = useState(3300);
  const [chapaH, setChapaH]               = useState(2250);
  const [kerf, setKerf]                   = useState(0);
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
  const [usarRetalhosEstoque, setUsarRetalhosEstoque] = useState(false);
  const [retalhosDisponiveis, setRetalhosDisponiveis] = useState<Retalho[]>([]);
  const [retalhosUsados, setRetalhosUsados] = useState<string[]>([]);

  const [pedidosSugeridos, setPedidosSugeridos]       = useState<PedidoSugerido[]>([]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<Set<string>>(new Set());
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);
  const [aprovBase, setAprovBase]                     = useState<number | null>(null);

  const [chapaAberta, setChapaAberta] = useState(false);
  const [agrupAberta, setAgrupAberta] = useState(false);

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
  }, []);

  useEffect(() => {
    if (!pedidoParam) return;
    setCarregando(true);
    supabase.from("itens_pedido").select("*").eq("pedido_id", pedidoParam).then(async ({ data, error }) => {
      setCarregando(false);
      if (error || !data || data.length === 0) return;
      const map = new Map<string, Peca>();
      data.forEach((item: any) => {
        const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
        if (map.has(key)) map.get(key)!.qtd += item.quantidade;
        else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, pedidoId: pedidoParam });
      });
      const carregadas = Array.from(map.values());
      setPecas(carregadas);
      setPedidoRef(pedidoParam);
      if (carregadas.length > 0) autoSetChapa(carregadas[0].prod);
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
    if (!usarRetalhosEstoque) { setRetalhosDisponiveis([]); return; }
    const produtosNomes = [...new Set(pecas.map(p => p.prod).filter(Boolean))];
    if (produtosNomes.length === 0) return;
    supabase
      .from("retalhos")
      .select("*")
      .eq("status", "Disponível")
      .in("produto_nome", produtosNomes)
      .order("m2", { ascending: false })
      .then(({ data }) => setRetalhosDisponiveis((data as Retalho[]) || []));
  }, [usarRetalhosEstoque, pecas]);

  // Monta flat de peças sem estado
  function montarFlat(pecasList: Peca[], pedidoId: string | null) {
    const flat: Array<{ l: number; a: number; prod: string; pedidoId?: string }> = [];
    pecasList.forEach(p => {
      if (p.l > 0 && p.a > 0)
        for (let q = 0; q < (p.qtd || 1); q++)
          flat.push({ l: p.l, a: p.a, prod: p.prod, pedidoId: p.pedidoId ?? pedidoId ?? undefined });
    });
    return flat;
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
    const base = calcAproveitamento(flatBase, bordRef.current, kerfRef.current, chapaWRef.current, chapaHRef.current);
    setAprovBase(base);

    const resultados = await Promise.all(
      pedidosAguardando.map(async (ped) => {
        const { data: itens } = await supabase.from("itens_pedido").select("*").eq("pedido_id", ped.id);
        if (!itens || itens.length === 0) return null;

        const todosChapa = itens.every((item: any) => isChapaInteira(item.largura, item.altura));
        if (todosChapa) return null;

        const produtosDoPedido = [...new Set(itens.map((i: any) => i.produto_nome as string))];
        if (!produtosDoPedido.some(p => produtosNoPedido.includes(p))) return null;

        const map = new Map<string, Peca>();
        itens.forEach((item: any) => {
          const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
          if (map.has(key)) map.get(key)!.qtd += item.quantidade;
          else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, pedidoId: ped.id });
        });

        const itensDoPedido = Array.from(map.values());

        const flatCombinado = [...flatBase, ...montarFlat(itensDoPedido, ped.id)];
        const aprovCombinado = calcAproveitamento(flatCombinado, bordRef.current, kerfRef.current, chapaWRef.current, chapaHRef.current);
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

  function autoSetChapa(prodNome: string) {
    const idx = PRODUTO_CHAPA[prodNome];
    if (idx !== undefined && CHAPAS_PADRAO[idx]) { setChapaW(CHAPAS_PADRAO[idx].w); setChapaH(CHAPAS_PADRAO[idx].h); }
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

  function rodar() {
    const flat: Array<{ l: number; a: number; prod: string; pedidoId?: string }> = [];
    pecas.forEach(p => {
      if (p.l > 0 && p.a > 0)
        for (let q = 0; q < (p.qtd || 1); q++)
          flat.push({ l: p.l, a: p.a, prod: p.prod, pedidoId: p.pedidoId ?? pedidoRef ?? undefined });
    });
    pedidosSugeridos.filter(ps => pedidosSelecionados.has(ps.id)).forEach(ps =>
      ps.itens.forEach(p => {
        if (p.l > 0 && p.a > 0)
          for (let q = 0; q < (p.qtd || 1); q++)
            flat.push({ l: p.l, a: p.a, prod: p.prod, pedidoId: ps.id });
      })
    );
    if (flat.length === 0) return;

    const invalidas = flat.filter(p => p.l <= 0 || p.a <= 0);
    if (invalidas.length > 0) {
      setMsg(`Erro: ${invalidas.length} peça(s) com dimensão inválida (0mm). Corrija antes de otimizar.`);
      return;
    }

    const grupos = new Map<string, typeof flat>();
    flat.forEach(p => { const g = grupos.get(p.prod) ?? []; g.push(p); grupos.set(p.prod, g); });

    const results: ResultadoChapa[] = [];
    let totalPlaced = 0;
    const totalPecas = flat.length;
    const retalhosUsadosIds: string[] = [];

    grupos.forEach((grupo, prodNome) => {
      const ci2 = PRODUTO_CHAPA[prodNome];
      const chapa = ci2 !== undefined ? CHAPAS_PADRAO[ci2] : null;
      const CW = chapa ? chapa.w : chapaW;
      const CH = chapa ? chapa.h : chapaH;
      const W = CW - bord * 2;
      const H = CH - bord * 2;
      grupo.sort((a, b) => b.l * b.a - a.l * a.a);
      let rem = [...grupo];

      // Tenta usar retalhos do estoque antes de abrir chapas novas
      if (usarRetalhosEstoque) {
        const retDoProd = retalhosDisponiveis.filter(r => r.produto_nome === prodNome);
        for (const ret of retDoProd) {
          if (rem.length === 0) break;
          const { placed, usados, free } = empacotar(ret.largura, ret.altura, rem, kerf);
          if (placed.length === 0) continue;
          results.push({ W: ret.largura, H: ret.altura, prod: prodNome, placed, free, retalhoId: ret.id });
          totalPlaced += placed.length;
          rem = rem.filter((_, i) => !usados.has(i));
          retalhosUsadosIds.push(ret.id);
        }
      }

      let ci = 0;
      while (rem.length > 0 && ci < 100) {
        const { placed, usados, free } = empacotar(W, H, rem, kerf);
        if (placed.length === 0) break;
        results.push({ W: CW, H: CH, prod: prodNome, placed, free });
        totalPlaced += placed.length;
        rem = rem.filter((_, i) => !usados.has(i));
        ci++;
      }
    });

    setRetalhosUsados(retalhosUsadosIds);

    setResultado(results);
    setChapaIdx(0);

    let totA = 0, usedA = 0;
    results.forEach(r => {
      const bordEfetivo = r.retalhoId ? 0 : bord;
      const W = r.W - bordEfetivo * 2, H = r.H - bordEfetivo * 2;
      totA += W * H;
      r.placed.forEach(p => (usedA += p.l * p.a));
    });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    setAprovNum(aprov); setPerdaNum(100 - aprov); setStatChapas(results.length);

    const retPend: RetalhoGerado[] = [];
    results.forEach((r, ri) =>
      r.free.filter(fr => fr.l >= 200 && fr.a >= 200).forEach(fr =>
        retPend.push({ ...fr, chapaIdx: ri, prod: r.prod, m2: parseFloat(((fr.l * fr.a) / 1e6).toFixed(4)) })
      )
    );
    setRetalhosGerados(retPend);

    const naoCouberam = totalPecas - totalPlaced;
    setMsg(
      `${totalPecas} peças · ${results.length} chapa(s)` +
      (pedidosSelecionados.size > 0 ? ` · ${pedidosSelecionados.size + 1} pedidos agrupados` : "") +
      ` · ${naoCouberam > 0 ? naoCouberam + " não couberam" : "✓ Todas alocadas"}`
    );
  }

  function handleImprimirTeste() {
    if (!resultado) return;
    const win = window.open("", "_blank");
    if (!win) return;

    // Paleta de cores por pedido
    const CORES_PEDIDO = ["#2d5fa6","#16a34a","#dc2626","#9333ea","#ea580c","#0891b2","#b45309","#be185d","#15803d","#1e40af"];
    const pedidoList = Array.from(new Set(resultado.flatMap(r => r.placed.map(p => p.pedidoId ?? pedidoRef ?? "?"))));
    const corPedido = (pid: string) => CORES_PEDIDO[pedidoList.indexOf(pid) % CORES_PEDIDO.length];

    // Gera SVG proporcional da chapa com as peças posicionadas
    function svgChapa(r: ResultadoChapa): string {
      const MAX_W = 580, MAX_H = 270;
      const sc = Math.min(MAX_W / r.W, MAX_H / r.H);
      const sw = Math.round(r.W * sc), sh = Math.round(r.H * sc);
      const bp = bord * sc;
      let s = `<rect width="${sw}" height="${sh}" fill="#dce8f7" stroke="#2d5fa6" stroke-width="1.5" rx="2"/>`;
      if (bord > 0) {
        s += `<rect width="${sw}" height="${bp}" fill="rgba(220,80,30,0.12)"/>`;
        s += `<rect y="${sh - bp}" width="${sw}" height="${bp}" fill="rgba(220,80,30,0.12)"/>`;
        s += `<rect width="${bp}" height="${sh}" fill="rgba(220,80,30,0.12)"/>`;
        s += `<rect x="${sw - bp}" width="${bp}" height="${sh}" fill="rgba(220,80,30,0.12)"/>`;
        s += `<rect x="${bp}" y="${bp}" width="${sw - bp * 2}" height="${sh - bp * 2}" fill="none" stroke="rgba(220,80,30,0.45)" stroke-width="0.8" stroke-dasharray="4,3"/>`;
      }
      r.placed.forEach((p, j) => {
        const pid = p.pedidoId ?? pedidoRef ?? "?";
        const cor = corPedido(pid);
        const px = Math.round(bp + p.x * sc), py = Math.round(bp + p.y * sc);
        const pw = Math.round(p.l * sc), ph = Math.round(p.a * sc);
        const fs = Math.max(7, Math.min(11, pw / 7));
        s += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${cor}" fill-opacity="0.72" stroke="${cor}" stroke-width="0.9"/>`;
        s += `<rect x="${px}" y="${py}" width="${pw}" height="${Math.round(ph * 0.28)}" fill="white" fill-opacity="0.18"/>`;
        if (pw > 22 && ph > 14) {
          s += `<text x="${px + 3}" y="${py + fs + 1}" font-size="${fs}" font-family="monospace" font-weight="bold" fill="white">${j + 1}· ${p.l}×${p.a}${p.rot ? " ↺" : ""}</text>`;
          if (ph > 26 && pw > 55) s += `<text x="${px + 3}" y="${py + fs + 12}" font-size="7" font-family="monospace" fill="rgba(255,255,255,0.65)">${pid}</text>`;
        }
      });
      r.free.filter(f => f.l >= 200 && f.a >= 200).forEach(f => {
        const fx = Math.round(bp + f.x * sc), fy = Math.round(bp + f.y * sc);
        const fw = Math.round(f.l * sc), fh = Math.round(f.a * sc);
        s += `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="rgba(0,180,220,0.10)" stroke="#0891b2" stroke-width="0.8" stroke-dasharray="4,3"/>`;
        if (fw > 26 && fh > 13) s += `<text x="${fx + 3}" y="${fy + 10}" font-size="8" font-family="monospace" fill="#0070a0">↺ ${f.l}×${f.a}</text>`;
      });
      return `<svg width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" style="display:block;max-width:100%;height:auto">${s}</svg>`;
    }

    // Lista global de todas as peças
    const todasPecas = resultado.flatMap(r => r.placed.map(p => ({ ...p, prod: r.prod })));

    const legendaPedidos = pedidoList.length > 1 ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        ${pedidoList.map(pid => `<div style="display:flex;align-items:center;gap:5px;font-size:11px">
          <div style="width:12px;height:12px;border-radius:3px;background:${corPedido(pid)}"></div>
          <span>${pid}</span>
        </div>`).join("")}
      </div>` : "";

    const resumoPecas = `
      <div style="margin-bottom:28px">
        <div style="font-size:12px;font-weight:700;color:#2d5fa6;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #2d5fa6;padding-bottom:5px;margin-bottom:10px">
          Lista de Peças · ${todasPecas.length} peças
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#2d5fa6;color:white">
            <th style="padding:5px 7px;text-align:left">#</th>
            <th style="padding:5px 7px;text-align:left">Material</th>
            <th style="padding:5px 7px;text-align:center">Dimensão (mm)</th>
            <th style="padding:5px 7px;text-align:center">m²</th>
            <th style="padding:5px 7px;text-align:center">Pedido</th>
            <th style="padding:5px 7px;text-align:center">Chapa</th>
          </tr></thead>
          <tbody>${todasPecas.map((p, i) => {
            const chapaIdx = resultado.findIndex(r => r.placed.includes(p as PecaPlacada));
            return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f4f7ff"}">
              <td style="padding:4px 7px;font-weight:700">${i + 1}</td>
              <td style="padding:4px 7px">${p.prod}</td>
              <td style="padding:4px 7px;text-align:center;font-family:monospace">${p.l} × ${p.a}${p.rot ? " ↺" : ""}</td>
              <td style="padding:4px 7px;text-align:center;font-family:monospace">${((p.l * p.a) / 1e6).toFixed(4)}</td>
              <td style="padding:4px 7px;text-align:center;font-family:monospace">${p.pedidoId ?? pedidoRef ?? "—"}</td>
              <td style="padding:4px 7px;text-align:center;font-weight:700;color:#2d5fa6">${chapaIdx + 1}</td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>`;

    const chapasHtml = resultado.map((r, i) => {
      const retalhos = r.free.filter(f => f.l >= 200 && f.a >= 200);
      const areaUtil = r.retalhoId ? r.W * r.H : (r.W - bord * 2) * (r.H - bord * 2);
      const areaUsada = r.placed.reduce((a, p) => a + p.l * p.a, 0);
      const apChapa = areaUtil > 0 ? ((areaUsada / areaUtil) * 100).toFixed(1) : "0";
      return `
        <div style="margin-bottom:28px;border:1px solid #d1daf0;border-radius:10px;${i > 0 ? "page-break-before:always;" : ""}">
          <div style="background:#2d5fa6;color:white;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="font-size:13px;font-weight:700">CHAPA ${i + 1} · ${r.prod}</div>
            <div style="display:flex;gap:18px;font-size:11px;opacity:.93">
              <span>${r.W} × ${r.H} mm</span>
              <span>Aproveit.: <strong>${apChapa}%</strong></span>
              <span>${r.placed.length} peça(s)</span>
              ${retalhos.length > 0 ? `<span>${retalhos.length} retalho(s)</span>` : ""}
            </div>
          </div>
          <div style="padding:14px 16px;background:#f8faff">
            <div style="margin-bottom:12px;text-align:center">${svgChapa(r)}</div>
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead><tr style="background:#e8eef8;color:#2d5fa6">
                <th style="padding:5px 7px;text-align:left">#</th>
                <th style="padding:5px 7px">Dimensão (mm)</th>
                <th style="padding:5px 7px">Pedido</th>
                <th style="padding:5px 7px">Posição X · Y</th>
                <th style="padding:5px 7px">Girada</th>
              </tr></thead>
              <tbody>${r.placed.map((p, j) => `
                <tr style="background:${j % 2 === 0 ? "#fff" : "#f4f7ff"}">
                  <td style="padding:4px 7px;font-weight:700;color:#2d5fa6">${j + 1}</td>
                  <td style="padding:4px 7px;text-align:center;font-family:monospace">${p.l} × ${p.a}</td>
                  <td style="padding:4px 7px;text-align:center;font-family:monospace">${p.pedidoId ?? pedidoRef ?? "—"}</td>
                  <td style="padding:4px 7px;text-align:center;font-family:monospace">${p.x} · ${p.y}</td>
                  <td style="padding:4px 7px;text-align:center">${p.rot ? "↺ Sim" : "—"}</td>
                </tr>`).join("")}</tbody>
            </table>
            ${retalhos.length > 0 ? `
              <div style="margin-top:10px;padding:7px 10px;background:#e0f4ff;border-radius:6px;font-size:11px;border-left:3px solid #0891b2">
                <span style="font-weight:700;color:#0070a0">Retalhos aproveitáveis:</span>
                <span style="margin-left:6px;font-family:monospace;color:#0070a0">${retalhos.map(f => `${f.l}×${f.a} mm (${((f.l * f.a) / 1e6).toFixed(4)} m²)`).join(" · ")}</span>
              </div>` : ""}
          </div>
        </div>`;
    }).join("");

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Plano de Corte · ${pedidoRef ?? "—"}</title>
      <meta charset="utf-8">
      <style>
        body{font-family:Arial,sans-serif;padding:20px;color:#1a1a2e;font-size:13px}
        @page{margin:12mm}
        @media print{.noprint{display:none!important}}
      </style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #2d5fa6">
        <div>
          <div style="font-size:26px;font-weight:900;color:#2d5fa6;letter-spacing:-1px">urbanglass</div>
          <div style="font-size:10px;color:#888">Urban Glass Comércio Ltda</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px">Plano de Corte</div>
          <div style="font-size:22px;font-weight:900;color:#2d5fa6">${pedidoRef ?? "AVULSO"}</div>
          <div style="margin-top:4px;display:inline-block;padding:2px 10px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:99px;font-size:10px;font-weight:700">⚠ SIMULAÇÃO</div>
          <div style="font-size:10px;color:#888;margin-top:4px">Emissão: ${new Date().toLocaleDateString("pt-BR")}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        <div style="padding:12px;background:#f0f4ff;border-radius:8px;border-left:4px solid #2d5fa6">
          <div style="font-size:9px;color:#2d5fa6;font-weight:700;text-transform:uppercase">Aproveitamento</div>
          <div style="font-size:22px;font-weight:900;color:#2d5fa6">${aprovNum.toFixed(1)}%</div>
        </div>
        <div style="padding:12px;background:#fff1f2;border-radius:8px;border-left:4px solid #f43f5e">
          <div style="font-size:9px;color:#f43f5e;font-weight:700;text-transform:uppercase">Perda</div>
          <div style="font-size:22px;font-weight:900;color:#f43f5e">${perdaNum.toFixed(1)}%</div>
        </div>
        <div style="padding:12px;background:#f0fdff;border-radius:8px;border-left:4px solid #00a8cc">
          <div style="font-size:9px;color:#00a8cc;font-weight:700;text-transform:uppercase">Chapas Usadas</div>
          <div style="font-size:22px;font-weight:900;color:#00a8cc">${statChapas}</div>
        </div>
        <div style="padding:12px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b">
          <div style="font-size:9px;color:#f59e0b;font-weight:700;text-transform:uppercase">Retalhos Gerados</div>
          <div style="font-size:22px;font-weight:900;color:#f59e0b">${retalhosGerados.length}</div>
        </div>
      </div>

      ${legendaPedidos}
      ${resumoPecas}

      <div style="font-size:12px;font-weight:700;color:#2d5fa6;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #2d5fa6;padding-bottom:5px;margin-bottom:16px">
        Diagrama de Corte · ${resultado.length} Chapa(s)
      </div>
      ${chapasHtml}

      <div class="noprint" style="text-align:center;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0">
        <button onclick="window.print()" style="padding:10px 32px;background:#2d5fa6;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 Imprimir / Salvar PDF</button>
      </div>
    </body></html>`);
    win.document.close();
  }

  async function handleZerar() {
    if (!pedidoRef) return;
    if (!confirm("Apagar completamente a otimização deste pedido?")) return;
    setZerando(true);
    await supabase.from("otimizacoes").delete().eq("pedido_id", pedidoRef);
    await updatePedido(pedidoRef, { status: "Aguardando otimização" });
    for (const pid of pedidosSelecionados) {
      await supabase.from("otimizacoes").delete().eq("pedido_id", pid);
      await updatePedido(pid, { status: "Aguardando otimização" });
    }
    setResultado(null); setMsg(""); setRetalhosGerados([]); setPedidosSelecionados(new Set()); setRetalhosUsados([]);
    setZerando(false);
    alert("Plano zerado.");
  }

  async function handleSalvar() {
    if (!resultado || !pedidoRef) return;
    setSalvando(true);
    const hoje = new Date().toISOString().split("T")[0];
    const todosPedidos = [pedidoRef, ...Array.from(pedidosSelecionados)];
    const chapasJson = resultado.map(r => ({ W: r.W, H: r.H, prod: r.prod, placed: r.placed, free: r.free }));
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
        chapa_w: chapaW, chapa_h: chapaH, kerf, borda: bord,
        pecas_json: pecasDoPedido, chapas_json: chapasComPecasDoPedido, usuario: null,
      });
    }
    for (const pid of todosPedidos) await updatePedido(pid, { status: "Em Produção – Corte" });
    if (retalhosGerados.length > 0) {
      const ok = await salvarRetalhos(retalhosGerados.map(fr => ({
        produto_nome: fr.prod, largura: fr.l, altura: fr.a, m2: fr.m2,
        chapa_origem: `CHAPA ${fr.chapaIdx + 1}`, pedido_origem: pedidoRef,
        status: "Disponível", dt_gerado: hoje,
      })));
      if (!ok) { setSalvando(false); alert("Erro ao salvar retalhos. Tente novamente."); return; }
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
      await baixarChapasEstoque(prodNome, consumo.chapas, parseFloat(consumo.m2.toFixed(4)));
    }
    router.push("/pedidos/" + pedidoRef);
  }

  function addPeca() { setPecas(p => [...p, { l: 0, a: 0, qtd: 1, prod: "", pedidoId: pedidoRef ?? undefined }]); }
  function remPeca(i: number) { setPecas(p => p.filter((_, idx) => idx !== i)); }
  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas(p => p.map((pc, idx) => {
      if (idx !== i) return pc;
      if (field === "prod") autoSetChapa(value as string);
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
          <button className="btn bp sm" onClick={rodar} style={{ fontWeight: 700 }}>◈ Calcular</button>
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
          {pedidoRef && <a href={"/pedidos/" + pedidoRef} className="btn bg sm">← Voltar ao Pedido</a>}
        </div>
      </div>

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
            {pedidoRef && (
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

            {/* Configuração da Chapa — colapsável */}
            <div className="card">
              {collapseHeader("Configuração da Chapa", chapaAberta, () => setChapaAberta(v => !v), `${chapaW} × ${chapaH}`)}
              {chapaAberta && (
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
                    <div className="fg"><label className="fl">Largura Chapa (mm)</label><input type="number" className="fc" value={chapaW} onChange={e => setChapaW(Number(e.target.value))} /></div>
                    <div className="fg"><label className="fl">Altura Chapa (mm)</label><input type="number" className="fc" value={chapaH} onChange={e => setChapaH(Number(e.target.value))} /></div>
                  </div>
                  <div className="fr">
                    <div className="fg"><label className="fl">Folga / Diamante (mm)</label><input type="number" className="fc" value={kerf} min={0} max={20} onChange={e => setKerf(Number(e.target.value))} /></div>
                    <div className="fg"><label className="fl">Borda Lapidação (mm)</label><input type="number" className="fc" value={bord} min={0} max={30} onChange={e => setBord(Number(e.target.value))} /></div>
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
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 60px", gap: "7px" }}>
                    <div className="fg" style={{ margin: 0 }}><label className="fl" style={{ fontSize: "9px" }}>Produto</label>
                      <select className="fc" style={{ fontSize: "11px" }} value={p.prod} onChange={e => updPeca(i, "prod", e.target.value)}>
                        <option value="">Selecionar produto...</option>
                        {produtos.map(pr => <option key={pr.id} value={pr.nome}>{pr.nome}</option>)}
                      </select>
                    </div>
                    <div className="fg" style={{ margin: 0 }}><label className="fl" style={{ fontSize: "9px" }}>Largura (mm)</label><input type="number" className="fc" style={{ fontSize: "12px" }} value={p.l || ""} placeholder="1200" onChange={e => updPeca(i, "l", Number(e.target.value))} /></div>
                    <div className="fg" style={{ margin: 0 }}><label className="fl" style={{ fontSize: "9px" }}>Altura (mm)</label><input type="number" className="fc" style={{ fontSize: "12px" }} value={p.a || ""} placeholder="800" onChange={e => updPeca(i, "a", Number(e.target.value))} /></div>
                    <div className="fg" style={{ margin: 0 }}><label className="fl" style={{ fontSize: "9px" }}>Qtd</label><input type="number" className="fc" style={{ fontSize: "12px" }} value={p.qtd} min={1} onChange={e => updPeca(i, "qtd", Number(e.target.value))} /></div>
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