"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { salvarOtimizacao } from "@/services/otimizador.service";
import { updatePedido } from "@/services/pedidos.service";
import type { Produto } from "@/types";

interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; }
interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }
interface PedidoSugerido { id: string; clienteNome: string; totalPecas: number; produtos: string[]; itens: Peca[]; }

function guilhotina(W: number, H: number, pecas: Peca[], kerf: number): { placed: PecaPlacada[]; free: EspacoLivre[] } {
  let free: EspacoLivre[] = [{ x: 0, y: 0, l: W, a: H }];
  const placed: PecaPlacada[] = [];

  function melhorEncaixe(peca: Peca, freeList: EspacoLivre[]): { fi: number; rot: boolean; score: number } | null {
    let best: { fi: number; rot: boolean; score: number } | null = null;
    freeList.forEach((fr, fi) => {
      // Orientação normal
      if (peca.l <= fr.l && peca.a <= fr.a) {
        const score = (fr.l - peca.l) * (fr.a - peca.a);
        if (!best || score < best.score) best = { fi, rot: false, score };
      }
      // Orientação rotacionada (90°)
      if (peca.a <= fr.l && peca.l <= fr.a) {
        const score = (fr.l - peca.a) * (fr.a - peca.l);
        if (!best || score < best.score) best = { fi, rot: true, score };
      }
    });
    return best;
  }

  function colocar(peca: Peca, idx: number, fi: number, rot: boolean) {
    const fr = free[fi];
    const pl = rot ? peca.a : peca.l;
    const pa = rot ? peca.l : peca.a;
    placed.push({ x: fr.x, y: fr.y, l: pl, a: pa, idx, prod: peca.prod, rot, pedidoId: peca.pedidoId });

    // ─── FIX: espaço à direita usa fr.a (altura total do espaço), não pa ───
    const nr: EspacoLivre[] = [];
    const remX = fr.l - pl - kerf;
    const remY = fr.a - pa - kerf;

    if (remX >= 100) nr.push({ x: fr.x + pl + kerf, y: fr.y,           l: remX,  a: fr.a }); // CORRIGIDO: era a: pa
    if (remY >= 100) nr.push({ x: fr.x,              y: fr.y + pa + kerf, l: fr.l, a: remY });

    free.splice(fi, 1, ...nr);

    // Mesclar espaços redundantes
    free = free.filter((a, ai) =>
      !free.some((b, bi) => bi !== ai && b.x <= a.x && b.y <= a.y && b.x + b.l >= a.x + a.l && b.y + b.a >= a.y + a.a)
    );

    // Ordenar por y,x para favorecer preenchimento top-left
    free.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
  }

  pecas.forEach((peca, idx) => {
    const enc = melhorEncaixe(peca, free);
    if (!enc) return;
    colocar(peca, idx, enc.fi, enc.rot);
  });

  return { placed, free };
}

const CHAPAS_PADRAO = [
  { label: "Chapa 4+4 Incolor — 3300 × 2250 mm",         w: 3300, h: 2250 },
  { label: "Chapa 3+3 Incolor — 3300 × 2250 mm",         w: 3300, h: 2250 },
  { label: "Chapa 4+4 Verde — 3300 × 2250 mm",           w: 3300, h: 2250 },
  { label: "Reflecta 4+4 — 2150 × 3660 mm",              w: 2150, h: 3660 },
  { label: "Reflecta 4+4 Silver Grey — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Reflecta 4+4 Champagne — 3660 × 2140 mm",    w: 3660, h: 2140 },
  { label: "Euro Grey Laminado 4+4 — 3660 × 2140 mm",    w: 3660, h: 2140 },
  { label: "French Green Laminado 4+4 — 3660 × 2140 mm", w: 3660, h: 2140 },
  { label: "Reflecta Silver Grey 4mm — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Reflecta Silver Grey 6mm — 3660 × 2140 mm",  w: 3660, h: 2140 },
  { label: "Vidro Monolítico 4mm — 3660 × 2140 mm",      w: 3660, h: 2140 },
  { label: "Vidro Monolítico 6mm — 3660 × 2140 mm",      w: 3660, h: 2140 },
  { label: "Personalizado",                               w: 3300, h: 2250 },
];

const PRODUTO_CHAPA: Record<string, number> = {
  "Vidro Laminado 4+4":       0,
  "Vidro Laminado 3+3":       1,
  "Verde Laminado 4+4":       2,
  "Reflecta 4+4 Prata":       3,
  "Reflecta 4+4 Silver Grey": 4,
  "Reflecta 4+4 Champagne":   5,
  "Laminado 4+4 Fumê":        6,
  "Vidro Monolítico 4mm":     10,
};

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

  const [produtos, setProdutos]             = useState<Produto[]>([]);
  const [pecas, setPecas]                   = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);
  const [chapaW, setChapaW]                 = useState(3300);
  const [chapaH, setChapaH]                 = useState(2250);
  const [kerf, setKerf]                     = useState(4);
  const [bord, setBord]                     = useState(3);
  const [resultado, setResultado]           = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx]             = useState(0);
  const [pedidoRef, setPedidoRef]           = useState<string | null>(null);
  const [carregando, setCarregando]         = useState(false);
  const [aprovNum, setAprovNum]             = useState(0);
  const [perdaNum, setPerdaNum]             = useState(0);
  const [totalPecasNum, setTotalPecasNum]   = useState(0);
  const [statChapas, setStatChapas]         = useState(0);
  const [msg, setMsg]                       = useState("");
  const [retalhosGerados, setRetalhosGerados] = useState<RetalhoGerado[]>([]);
  const [salvando, setSalvando]             = useState(false);

  const [pedidosSugeridos, setPedidosSugeridos] = useState<PedidoSugerido[]>([]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<Set<string>>(new Set());
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    supabase.from("produtos").select("*").eq("ativo", true).then(({ data }) => {
      const prods = (data as Produto[]) || [];
      setProdutos(prods);
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
      buscarSugestoes(pedidoParam, produtosNoPedido);
    });
  }, [pedidoParam]);

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) drawOpt(resultado[chapaIdx], chapaIdx, bord);
  }, [resultado, chapaIdx]);

  async function buscarSugestoes(pedidoPrincipal: string, produtosNoPedido: string[]) {
    setCarregandoSugestoes(true);

    const { data: pedidosAguardando } = await supabase
      .from("pedidos")
      .select("id, clientes(nome)")
      .eq("status", "Aguardando otimização")
      .neq("id", pedidoPrincipal);

    if (!pedidosAguardando || pedidosAguardando.length === 0) {
      setCarregandoSugestoes(false);
      return;
    }

    const sugestoes: PedidoSugerido[] = [];
    for (const ped of pedidosAguardando) {
      const { data: itens } = await supabase
        .from("itens_pedido")
        .select("*")
        .eq("pedido_id", ped.id);

      if (!itens || itens.length === 0) continue;

      const produtosDoPedido = [...new Set(itens.map((i: any) => i.produto_nome as string))];
      const temProdutoEmComum = produtosDoPedido.some(p => produtosNoPedido.includes(p));

      if (!temProdutoEmComum) continue;

      const map = new Map<string, Peca>();
      itens.forEach((item: any) => {
        const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
        if (map.has(key)) map.get(key)!.qtd += item.quantidade;
        else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, pedidoId: ped.id });
      });

      sugestoes.push({
        id:          ped.id,
        clienteNome: (ped as any).clientes?.nome ?? "—",
        totalPecas:  itens.length,
        produtos:    produtosDoPedido,
        itens:       Array.from(map.values()),
      });
    }

    setPedidosSugeridos(sugestoes);
    setCarregandoSugestoes(false);
  }

  function toggleSugerido(id: string) {
    setPedidosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResultado(null);
  }

  function autoSetChapa(prodNome: string) {
    const idx = PRODUTO_CHAPA[prodNome];
    if (idx !== undefined && CHAPAS_PADRAO[idx]) {
      setChapaW(CHAPAS_PADRAO[idx].w);
      setChapaH(CHAPAS_PADRAO[idx].h);
    }
  }

  function drawOpt(r: ResultadoChapa, idx: number, bordMm: number) {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const displayW = cv.offsetWidth, displayH = cv.offsetHeight;
    cv.width = displayW * dpr; cv.height = displayH * dpr;
    ctx.scale(dpr, dpr);
    const CW = displayW - 16, CH = displayH - 16;
    const scale = Math.min(CW / r.W, CH / r.H);
    const dW = r.W * scale, dH = r.H * scale;
    const ox = (CW - dW) / 2 + 8, oy = (CH - dH) / 2 + 8;

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, displayW, displayH);
    ctx.fillStyle = "#1a1f2e";
    ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeStyle = "#2d3550";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, dW, dH);

    if (bordMm > 0) {
      const bs = bordMm * scale;
      ctx.fillStyle = "rgba(255,107,53,0.18)";
      ctx.fillRect(ox, oy, dW, bs); ctx.fillRect(ox, oy + dH - bs, dW, bs);
      ctx.fillRect(ox, oy, bs, dH); ctx.fillRect(ox + dW - bs, oy, bs, dH);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(255,107,53,0.55)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(ox + bs, oy + bs, dW - bs * 2, dH - bs * 2);
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#4a5568";
    ctx.font = "bold 9px 'DM Mono', monospace";
    ctx.fillText("CHAPA " + (idx + 1) + "  ·  " + r.W + " × " + r.H + " mm  ·  " + r.prod, ox + 4, oy - 4);

    r.placed.forEach((p) => {
      const pid = p.pedidoId ?? pedidoRef ?? "?";
      const { fill, stroke } = getColorForPedido(pid);
      const px = ox + (p.x + bordMm) * scale;
      const py = oy + (p.y + bordMm) * scale;
      const pw = p.l * scale;
      const ph = p.a * scale;

      ctx.fillStyle = fill;
      ctx.fillRect(px, py, pw, ph);

      const grad = ctx.createLinearGradient(px, py, px, py + ph * 0.4);
      grad.addColorStop(0, "rgba(255,255,255,0.10)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph * 0.4);

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px, py, pw, ph);

      if (pw > 30 && ph > 18) {
        ctx.fillStyle = "rgba(255,255,255,0.90)";
        const fs = Math.max(7, Math.min(11, pw / 7));
        ctx.font = `bold ${fs}px 'DM Mono', monospace`;
        ctx.fillText(p.l + "×" + p.a, px + 4, py + fs + 3);
        if (ph > 28 && pw > 50) {
          ctx.fillStyle = "rgba(255,255,255,0.50)";
          ctx.font = "7px 'DM Mono', monospace";
          ctx.fillText(pid, px + 4, py + fs + 14);
        }
      }
    });

    r.free.forEach((fr) => {
      const isLg = fr.l >= 200 && fr.a >= 200;
      if (!isLg) return;
      const fx = ox + (fr.x + bordMm) * scale;
      const fy = oy + (fr.y + bordMm) * scale;
      const fw = fr.l * scale, fh = fr.a * scale;
      ctx.fillStyle = "rgba(0,200,255,0.07)";
      ctx.fillRect(fx, fy, fw, fh);
      ctx.strokeStyle = "rgba(0,200,255,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 0.7;
      ctx.strokeRect(fx, fy, fw, fh);
      ctx.setLineDash([]);
      if (fw > 20 && fh > 14) {
        ctx.fillStyle = "rgba(0,200,255,0.7)";
        ctx.font = "bold 9px 'DM Mono', monospace";
        ctx.fillText("↺ ret", fx + 3, fy + 11);
      }
    });

    ctx.strokeStyle = "#3d4a6a";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, dW, dH);
  }

  function rodar() {
    const todasAsPecas: Peca[] = [];

    pecas.forEach(p => {
      if (p.l > 0 && p.a > 0) {
        for (let q = 0; q < (p.qtd || 1); q++) {
          todasAsPecas.push({ ...p, qtd: 1, pedidoId: p.pedidoId ?? pedidoRef ?? undefined });
        }
      }
    });

    pedidosSugeridos
      .filter(ps => pedidosSelecionados.has(ps.id))
      .forEach(ps => {
        ps.itens.forEach(p => {
          if (p.l > 0 && p.a > 0) {
            for (let q = 0; q < (p.qtd || 1); q++) {
              todasAsPecas.push({ ...p, qtd: 1, pedidoId: ps.id });
            }
          }
        });
      });

    if (todasAsPecas.length === 0) return;

    const grupos = new Map<string, Peca[]>();
    todasAsPecas.forEach(p => {
      const grupo = grupos.get(p.prod) || [];
      grupo.push(p);
      grupos.set(p.prod, grupo);
    });

    const results: ResultadoChapa[] = [];
    let totalPlaced = 0, totalPecas = todasAsPecas.length;

    grupos.forEach((expandidas, prodNome) => {
      const ci2 = PRODUTO_CHAPA[prodNome];
      const chapa = ci2 !== undefined ? CHAPAS_PADRAO[ci2] : null;
      const W = (chapa ? chapa.w : chapaW) - bord * 2;
      const H = (chapa ? chapa.h : chapaH) - bord * 2;
      const CW = chapa ? chapa.w : chapaW;
      const CH = chapa ? chapa.h : chapaH;

      expandidas.sort((a, b) => {
        const diff = b.l * b.a - a.l * a.a;
        if (diff !== 0) return diff;
        return Math.max(b.l, b.a) - Math.max(a.l, a.a);
      });

      let rem = [...expandidas], ci = 0;
      while (rem.length && ci < 15) {
        const r = guilhotina(W, H, rem, kerf);
        results.push({ W: CW, H: CH, prod: prodNome, ...r });
        const used = new Set(r.placed.map(p => p.idx));
        rem = rem.filter((_, i) => !used.has(i));
        totalPlaced += r.placed.length;
        ci++;
        if (!r.placed.length) break;
      }
    });

    setResultado(results);
    setChapaIdx(0);

    let totA = 0, usedA = 0;
    results.forEach(r => { totA += r.W * r.H; r.placed.forEach(p => (usedA += p.l * p.a)); });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    const perda = 100 - aprov;
    setAprovNum(aprov);
    setPerdaNum(perda);
    setTotalPecasNum(totalPecas);
    setStatChapas(results.length);

    const retPend: RetalhoGerado[] = [];
    results.forEach((r, ri) => r.free.filter(fr => fr.l >= 200 && fr.a >= 200).forEach(fr => {
      retPend.push({ ...fr, chapaIdx: ri, prod: r.prod, m2: parseFloat(((fr.l * fr.a) / 1e6).toFixed(4)) });
    }));
    setRetalhosGerados(retPend);

    const agrupados = pedidosSelecionados.size;
    const naoCouberam = totalPecas - totalPlaced;
    setMsg(
      `${totalPecas} peças · ${results.length} chapa(s)` +
      (agrupados > 0 ? ` · ${agrupados + 1} pedidos agrupados` : "") +
      ` · ${naoCouberam > 0 ? naoCouberam + " não couberam" : "✓ Todas alocadas"}`
    );
  }

  async function handleSalvar() {
    if (!resultado || !pedidoRef) return;
    setSalvando(true);

    const hoje = new Date().toISOString().split("T")[0];
    const todosPedidos = [pedidoRef, ...Array.from(pedidosSelecionados)];

    const chapasJson = resultado.map(r => ({
      W: r.W, H: r.H, prod: r.prod, placed: r.placed, free: r.free,
    }));

    for (const pid of todosPedidos) {
      const pecasDoPedido = pid === pedidoRef
        ? pecas.filter(p => !p.pedidoId || p.pedidoId === pedidoRef)
        : (pedidosSugeridos.find(s => s.id === pid)?.itens ?? []);

      const chapasComPecasDoPedido = chapasJson.map(chapa => ({
        ...chapa,
        placed: chapa.placed.filter((p: any) => (p.pedidoId ?? pedidoRef) === pid),
      }));

      await salvarOtimizacao({
        pedido_id:        pid,
        dt_otim:          hoje,
        aproveitamento:   parseFloat(aprovNum.toFixed(2)),
        perda:            parseFloat(perdaNum.toFixed(2)),
        chapas_usadas:    resultado.length,
        retalhos_gerados: retalhosGerados.length,
        total_pecas:      pecasDoPedido.reduce((a, p) => a + (p.qtd || 1), 0),
        chapa_w:          chapaW,
        chapa_h:          chapaH,
        kerf,
        borda:            bord,
        pecas_json:       pecasDoPedido,
        chapas_json:      chapasComPecasDoPedido,
        usuario:          null,
      });
    }

    for (const pid of todosPedidos) {
      await updatePedido(pid, { status: "Em Produção – Corte" });
    }

    if (retalhosGerados.length > 0) {
      const rows = retalhosGerados.map(fr => ({
        produto_nome:  fr.prod,
        largura:       fr.l,
        altura:        fr.a,
        m2:            fr.m2,
        chapa_origem:  "CHAPA " + (fr.chapaIdx + 1),
        pedido_origem: pedidoRef,
        status:        "Disponível",
        dt_gerado:     hoje,
      }));
      await supabase.from("retalhos").insert(rows);
    }

    const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
    resultado.forEach(r => {
      const prev = consumoPorProd.get(r.prod) ?? { chapas: 0, m2: 0 };
      const m2Chapa = (r.W * r.H) / 1e6;
      consumoPorProd.set(r.prod, {
        chapas: prev.chapas + 1,
        m2:     parseFloat((prev.m2 + m2Chapa).toFixed(4)),
      });
    });

    for (const [prodNome, consumo] of consumoPorProd.entries()) {
      const { data: estoqueItems } = await supabase
        .from("estoque")
        .select("id, chapas_saldo, m2_saldo, m2_consumido, produtos!inner(nome)")
        .eq("produtos.nome", prodNome)
        .limit(1);

      if (!estoqueItems || estoqueItems.length === 0) continue;
      const item = estoqueItems[0];

      const novoSaldoChapas = Math.max(0, Number(item.chapas_saldo) - consumo.chapas);
      const novoSaldoM2     = parseFloat(Math.max(0, Number(item.m2_saldo) - consumo.m2).toFixed(4));
      const novoConsumidoM2 = parseFloat((Number(item.m2_consumido) + consumo.m2).toFixed(4));

      await supabase
        .from("estoque")
        .update({
          chapas_saldo:  novoSaldoChapas,
          m2_saldo:      novoSaldoM2,
          m2_consumido:  novoConsumidoM2,
          updated_at:    new Date().toISOString(),
        })
        .eq("id", item.id);
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

  const pedidosNoCanvas = pedidoRef
    ? [pedidoRef, ...Array.from(pedidosSelecionados)]
    : [];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Otimizador de Corte</div>
        {pedidoRef && (
          <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
            Pedido <strong style={{ color: "var(--acc)" }}>{pedidoRef}</strong>
            {pedidosSelecionados.size > 0 && (
              <span style={{ color: "var(--acc2)", marginLeft: "8px" }}>
                + {pedidosSelecionados.size} agrupado(s)
              </span>
            )}
          </span>
        )}
        {pedidoRef && <a href={"/pedidos/" + pedidoRef} className="btn bg sm">← Voltar ao Pedido</a>}
      </div>

      <div className="con">
        <div className="g2" style={{ alignItems: "start", gap: "14px" }}>

          {/* ── COL ESQUERDA ── */}
          <div>
            <div className="card mb14">
              <div className="ct">Configuração da Chapa</div>

              <div style={{ marginBottom: "12px" }}>
                <label className="fl" style={{ marginBottom: "6px", display: "block" }}>Tamanho Padrão</label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[
                    { label: "3300 × 2250", w: 3300, h: 2250 },
                    { label: "3660 × 2140", w: 3660, h: 2140 },
                    { label: "2150 × 3660", w: 2150, h: 3660 },
                  ].map(c => {
                    const ativo = chapaW === c.w && chapaH === c.h;
                    return (
                      <button
                        key={c.label}
                        onClick={() => { setChapaW(c.w); setChapaH(c.h); }}
                        style={{
                          padding: "5px 12px", borderRadius: "6px", cursor: "pointer",
                          fontSize: "11px", fontFamily: "'DM Mono', monospace", fontWeight: 600,
                          border: `1px solid ${ativo ? "var(--acc)" : "var(--b2)"}`,
                          background: ativo ? "rgba(61,255,160,.1)" : "transparent",
                          color: ativo ? "var(--acc)" : "var(--t2)",
                          transition: "all 0.15s",
                        }}
                      >
                        {c.label} mm
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="fr">
                <div className="fg">
                  <label className="fl">Largura Chapa (mm)</label>
                  <input type="number" className="fc" value={chapaW} onChange={(e) => setChapaW(Number(e.target.value))} />
                </div>
                <div className="fg">
                  <label className="fl">Altura Chapa (mm)</label>
                  <input type="number" className="fc" value={chapaH} onChange={(e) => setChapaH(Number(e.target.value))} />
                </div>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Folga / Diamante (mm)</label>
                  <input type="number" className="fc" value={kerf} min={0} max={20} onChange={(e) => setKerf(Number(e.target.value))} />
                </div>
                <div className="fg">
                  <label className="fl">Borda Lapidação (mm)</label>
                  <input type="number" className="fc" value={bord} min={0} max={30} onChange={(e) => setBord(Number(e.target.value))} />
                </div>
              </div>
            </div>

            {/* ── SUGESTÕES DE AGRUPAMENTO ── */}
            {pedidoRef && (
              <div className="card mb14">
                <div className="ct">
                  Agrupar Pedidos
                  {carregandoSugestoes && (
                    <span style={{ fontSize: "10px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>buscando...</span>
                  )}
                </div>

                {!carregandoSugestoes && pedidosSugeridos.length === 0 && (
                  <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace", padding: "8px 0", textAlign: "center" }}>
                    Nenhum outro pedido aguardando otimização com o mesmo produto.
                  </div>
                )}

                {pedidosSugeridos.length > 0 && (
                  <>
                    <div style={{ fontSize: "11px", color: "var(--t2)", marginBottom: "10px", lineHeight: 1.5 }}>
                      Pedidos com produto compatível. Selecione para otimizar juntos e aproveitar melhor as chapas.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {pedidosSugeridos.map(ps => {
                        const selecionado = pedidosSelecionados.has(ps.id);
                        const { stroke } = getColorForPedido(ps.id);
                        return (
                          <div
                            key={ps.id}
                            onClick={() => toggleSugerido(ps.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: "10px",
                              padding: "10px 12px", borderRadius: "8px", cursor: "pointer",
                              border: `1px solid ${selecionado ? stroke : "var(--b2)"}`,
                              background: selecionado ? `${stroke}14` : "var(--surf2)",
                              transition: "all 0.15s",
                            }}
                          >
                            <div style={{
                              width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0,
                              border: `2px solid ${selecionado ? stroke : "var(--b3)"}`,
                              background: selecionado ? stroke : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {selecionado && <span style={{ fontSize: "10px", color: "#000", fontWeight: 900 }}>✓</span>}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 700, color: selecionado ? "var(--t1)" : "var(--t2)", fontFamily: "'DM Mono', monospace" }}>
                                  {ps.id}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--t3)" }}>
                                  {ps.clienteNome}
                                </span>
                              </div>
                              <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px", fontFamily: "'DM Mono', monospace" }}>
                                {ps.totalPecas} peça(s) · {ps.produtos.join(", ")}
                              </div>
                            </div>

                            <div style={{
                              fontSize: "10px", fontWeight: 700, padding: "2px 8px",
                              borderRadius: "99px", border: `1px solid ${stroke}`,
                              color: stroke, background: `${stroke}14`,
                              fontFamily: "'DM Mono', monospace",
                            }}>
                              {selecionado ? "incluído" : "incluir"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {pedidosSelecionados.size > 0 && (
                      <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--acc2)", fontFamily: "'DM Mono', monospace", padding: "7px 10px", background: "rgba(0,200,255,.06)", border: "1px solid rgba(0,200,255,.2)", borderRadius: "7px" }}>
                        ◈ {pedidosSelecionados.size + 1} pedidos serão otimizados juntos e avançarão para "Em Produção – Corte" ao salvar.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="card">
              <div className="ct">
                Peças a Cortar
                <button className="btn bp sm" onClick={rodar}>◈ Calcular</button>
              </div>
              {carregando && (
                <div style={{ textAlign: "center", color: "var(--t3)", fontSize: "12px", padding: "14px", fontFamily: "'DM Mono', monospace" }}>
                  Carregando peças do pedido...
                </div>
              )}
              {pecas.map((p, i) => (
                <div key={i} className="op">
                  <div className="oph">
                    <span>
                      PEÇA {i + 1}
                      {p.pedidoId && p.pedidoId !== pedidoRef && (
                        <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--acc2)", opacity: 0.7 }}>
                          ({p.pedidoId})
                        </span>
                      )}
                    </span>
                    <button className="btn bw xs" onClick={() => remPeca(i)}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 60px", gap: "7px" }}>
                    <div className="fg" style={{ margin: 0 }}>
                      <label className="fl" style={{ fontSize: "9px" }}>Produto</label>
                      <select className="fc" style={{ fontSize: "11px" }} value={p.prod} onChange={(e) => updPeca(i, "prod", e.target.value)}>
                        <option value="">Selecionar produto...</option>
                        {produtos.map((pr) => <option key={pr.id} value={pr.nome}>{pr.nome}</option>)}
                      </select>
                    </div>
                    <div className="fg" style={{ margin: 0 }}>
                      <label className="fl" style={{ fontSize: "9px" }}>Largura (mm)</label>
                      <input type="number" className="fc" style={{ fontSize: "12px" }} value={p.l || ""} placeholder="1200" onChange={(e) => updPeca(i, "l", Number(e.target.value))} />
                    </div>
                    <div className="fg" style={{ margin: 0 }}>
                      <label className="fl" style={{ fontSize: "9px" }}>Altura (mm)</label>
                      <input type="number" className="fc" style={{ fontSize: "12px" }} value={p.a || ""} placeholder="800" onChange={(e) => updPeca(i, "a", Number(e.target.value))} />
                    </div>
                    <div className="fg" style={{ margin: 0 }}>
                      <label className="fl" style={{ fontSize: "9px" }}>Qtd</label>
                      <input type="number" className="fc" style={{ fontSize: "12px" }} value={p.qtd} min={1} onChange={(e) => updPeca(i, "qtd", Number(e.target.value))} />
                    </div>
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
                {stats.map((s) => (
                  <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", padding: "12px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: "18px", color: s.color, marginBottom: "2px" }}>{s.icon}</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: "20px", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                    <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'DM Mono', monospace", marginTop: "4px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {msg && (
                <div style={{ fontSize: "11px", color: "var(--t2)", fontFamily: "'DM Mono', monospace", marginBottom: "10px", padding: "7px 10px", background: "var(--surf2)", borderRadius: "6px", border: "1px solid var(--b1)" }}>
                  {msg}
                </div>
              )}

              {resultado && resultado.length > 1 && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "9px" }}>
                  {resultado.map((r, i) => (
                    <button key={i} className="btn bg sm" onClick={() => setChapaIdx(i)}
                      style={chapaIdx === i ? { borderColor: "var(--acc2)", color: "var(--acc2)", background: "rgba(0,200,255,.08)" } : {}}>
                      Chapa {i + 1}
                      {r.prod && <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "4px" }}>· {r.prod.split(" ").slice(0, 2).join(" ")}</span>}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ background: "#0d1117", border: "1px solid #2d3550", borderRadius: "10px", padding: "8px", position: "relative" }}>
                <div style={{ position: "absolute", top: "10px", left: "10px", fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#4a5568", pointerEvents: "none", zIndex: 1 }}>
                  {!resultado ? "Configure as peças e clique em Calcular" : "Chapa " + (chapaIdx + 1) + " · " + (resultado[chapaIdx]?.placed.length || 0) + " peças"}
                </div>
                <canvas ref={canvasRef} width={554} height={370} style={{ display: "block", width: "100%", height: "370px" }} />
              </div>

              {resultado && pedidosNoCanvas.length > 1 && (
                <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px", padding: "8px 10px", background: "var(--surf2)", borderRadius: "7px" }}>
                  {pedidosNoCanvas.map(pid => {
                    const { fill, stroke } = getColorForPedido(pid);
                    const ps = pedidosSugeridos.find(s => s.id === pid);
                    return (
                      <div key={pid} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--t2)" }}>
                        <div style={{ width: "13px", height: "13px", borderRadius: "3px", background: fill, border: `1px solid ${stroke}`, flexShrink: 0 }} />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{pid}</span>
                        {ps && <span style={{ color: "var(--t3)", fontSize: "10px" }}>· {ps.clienteNome}</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {(!resultado || pedidosNoCanvas.length <= 1) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "10px", padding: "8px 10px", background: "var(--surf2)", borderRadius: "7px" }}>
                  {[
                    { color: "#1e2d45", border: "#4a7fa5", label: "Peças cortadas" },
                    { color: "rgba(255,107,53,0.5)", border: "transparent", label: "Borda lapidação" },
                    { color: "rgba(0,200,255,0.25)", border: "rgba(0,200,255,0.5)", label: "Retalho aproveitável" },
                    { color: "#1a1f2e", border: "#2d3550", label: "Descarte" },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--t2)" }}>
                      <div style={{ width: "13px", height: "13px", borderRadius: "3px", background: item.color, border: `1px solid ${item.border}`, flexShrink: 0 }} />
                      {item.label}
                    </div>
                  ))}
                </div>
              )}

              {resultado && retalhosGerados.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#f59e0b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ fontSize: "14px" }}>↺</span>
                    {retalhosGerados.length} retalho(s) — salvos automaticamente ao confirmar
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

              {resultado && pedidoRef && (
                <div style={{ marginTop: "16px" }}>
                  <button
                    className="btn bp sm"
                    style={{ width: "100%", padding: "12px", fontSize: "13px" }}
                    onClick={handleSalvar}
                    disabled={salvando}
                  >
                    {salvando
                      ? "Salvando..."
                      : pedidosSelecionados.size > 0
                        ? `✓ Salvar e Avançar ${pedidosSelecionados.size + 1} Pedidos para Corte`
                        : "✓ Salvar Plano e Voltar ao Pedido"
                    }
                  </button>
                  {pedidosSelecionados.size > 0 && (
                    <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--t3)", textAlign: "center", fontFamily: "'DM Mono', monospace" }}>
                      {[pedidoRef, ...Array.from(pedidosSelecionados)].join(", ")} → Em Produção – Corte
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