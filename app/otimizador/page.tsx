"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { salvarOtimizacao } from "@/services/otimizador.service";
import { updatePedido } from "@/services/pedidos.service";
import { baixarChapasEstoque, salvarRetalhos } from "@/services/estoque.service";
import type { Produto } from "@/types";

interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; }
interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }
interface PedidoSugerido { id: string; clienteNome: string; totalPecas: number; produtos: string[]; itens: Peca[]; }
interface Retangulo { x: number; y: number; w: number; h: number; }

function empacotar(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  const placed: PecaPlacada[] = [];
  const usados = new Set<number>();
  let espacos: Retangulo[] = [{ x: 0, y: 0, w: W, h: H }];
  const ordem = pecas.map((p, i) => ({ ...p, origIdx: i })).sort((a, b) => b.l * b.a - a.l * a.a);

  for (const peca of ordem) {
    if (usados.has(peca.origIdx)) continue;
    let melhor: { espacoIdx: number; rotacionado: boolean; fit: number; areaLivre: number; pl: number; pa: number } | null = null;
    for (let i = 0; i < espacos.length; i++) {
      const e = espacos[i];
      for (const rot of [false, true]) {
        const pl = rot ? peca.a : peca.l;
        const pa = rot ? peca.l : peca.a;
        if (pl > e.w || pa > e.h) continue;
        const fit = Math.floor(e.w / pl) * Math.floor(e.h / pa);
        const areaLivre = e.w * e.h - pl * pa;
        if (!melhor || fit > melhor.fit || (fit === melhor.fit && areaLivre < melhor.areaLivre)) {
          melhor = { espacoIdx: i, rotacionado: rot, fit, areaLivre, pl, pa };
        }
      }
    }
    if (!melhor) continue;
    const { espacoIdx, rotacionado, pl, pa } = melhor;
    const e = espacos[espacoIdx];
    placed.push({ x: e.x, y: e.y, l: pl, a: pa, idx: peca.origIdx, prod: peca.prod, rot: rotacionado, pedidoId: peca.pedidoId });
    usados.add(peca.origIdx);
    const dx = e.w - pl - kerf;
    const dy = e.h - pa - kerf;
    let dir: Retangulo, baixo: Retangulo;
    if (dx >= dy) {
      dir   = { x: e.x + pl + kerf, y: e.y,            w: dx, h: e.h };
      baixo = { x: e.x,             y: e.y + pa + kerf, w: pl, h: dy  };
    } else {
      dir   = { x: e.x + pl + kerf, y: e.y,            w: dx, h: pa  };
      baixo = { x: e.x,             y: e.y + pa + kerf, w: e.w,h: dy  };
    }
    espacos.splice(espacoIdx, 1);
    if (dir.w   > 0 && dir.h   > 0) espacos.push(dir);
    if (baixo.w > 0 && baixo.h > 0) espacos.push(baixo);
    espacos.sort((a, b) => a.w * a.h - b.w * b.h);
  }

  const free: EspacoLivre[] = espacos
    .filter(e => e.w >= 200 && e.h >= 200)
    .map(e => ({ x: e.x, y: e.y, l: e.w, a: e.h }));

  return { placed, usados, free };
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
  "Vidro Laminado 4+4": 0, "Vidro Laminado 3+3": 1, "Verde Laminado 4+4": 2,
  "Reflecta 4+4 Prata": 3, "Reflecta 4+4 Silver Grey": 4, "Reflecta 4+4 Champagne": 5,
  "Laminado 4+4 Fumê": 6, "Vidro Monolítico 4mm": 10,
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

  const [produtos, setProdutos]           = useState<Produto[]>([]);
  const [pecas, setPecas]                 = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);
  const [chapaW, setChapaW]               = useState(3300);
  const [chapaH, setChapaH]               = useState(2250);
  const [kerf, setKerf]                   = useState(4);
  const [bord, setBord]                   = useState(3);
  const [resultado, setResultado]         = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx]           = useState(0);
  const [pedidoRef, setPedidoRef]         = useState<string | null>(null);
  const [carregando, setCarregando]       = useState(false);
  const [aprovNum, setAprovNum]           = useState(0);
  const [perdaNum, setPerdaNum]           = useState(0);
  const [totalPecasNum, setTotalPecasNum] = useState(0);
  const [statChapas, setStatChapas]       = useState(0);
  const [msg, setMsg]                     = useState("");
  const [retalhosGerados, setRetalhosGerados] = useState<RetalhoGerado[]>([]);
  const [salvando, setSalvando]           = useState(false);
  const [zerando, setZerando]             = useState(false);
  const [modoTeste, setModoTeste]         = useState(false); // 1.1 — modo teste

  const [pedidosSugeridos, setPedidosSugeridos]       = useState<PedidoSugerido[]>([]);
  const [pedidosSelecionados, setPedidosSelecionados] = useState<Set<string>>(new Set());
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);

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
      buscarSugestoes(pedidoParam, produtosNoPedido);
    });
  }, [pedidoParam]);

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) drawOpt(resultado[chapaIdx], chapaIdx, bord);
  }, [resultado, chapaIdx]);

  async function buscarSugestoes(pedidoPrincipal: string, produtosNoPedido: string[]) {
    setCarregandoSugestoes(true);
    const { data: pedidosAguardando } = await supabase
      .from("pedidos").select("id, clientes(nome)")
      .eq("status", "Aguardando otimização").neq("id", pedidoPrincipal);
    if (!pedidosAguardando || pedidosAguardando.length === 0) { setCarregandoSugestoes(false); return; }
    const sugestoes: PedidoSugerido[] = [];
    for (const ped of pedidosAguardando) {
      const { data: itens } = await supabase.from("itens_pedido").select("*").eq("pedido_id", ped.id);
      if (!itens || itens.length === 0) continue;
      const produtosDoPedido = [...new Set(itens.map((i: any) => i.produto_nome as string))];
      if (!produtosDoPedido.some(p => produtosNoPedido.includes(p))) continue;
      const map = new Map<string, Peca>();
      itens.forEach((item: any) => {
        const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
        if (map.has(key)) map.get(key)!.qtd += item.quantidade;
        else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome, pedidoId: ped.id });
      });
      sugestoes.push({ id: ped.id, clienteNome: (ped as any).clientes?.nome ?? "—", totalPecas: itens.length, produtos: produtosDoPedido, itens: Array.from(map.values()) });
    }
    setPedidosSugeridos(sugestoes);
    setCarregandoSugestoes(false);
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

    const grupos = new Map<string, typeof flat>();
    flat.forEach(p => { const g = grupos.get(p.prod) ?? []; g.push(p); grupos.set(p.prod, g); });

    const results: ResultadoChapa[] = [];
    let totalPlaced = 0;
    const totalPecas = flat.length;

    grupos.forEach((grupo, prodNome) => {
      const ci2 = PRODUTO_CHAPA[prodNome];
      const chapa = ci2 !== undefined ? CHAPAS_PADRAO[ci2] : null;
      const CW = chapa ? chapa.w : chapaW;
      const CH = chapa ? chapa.h : chapaH;
      const W = CW - bord * 2;
      const H = CH - bord * 2;
      grupo.sort((a, b) => b.l * b.a - a.l * a.a);
      let rem = [...grupo];
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

    setResultado(results);
    setChapaIdx(0);

    let totA = 0, usedA = 0;
    results.forEach(r => {
      const W = r.W - bord * 2, H = r.H - bord * 2;
      totA += W * H;
      r.placed.forEach(p => (usedA += p.l * p.a));
    });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    setAprovNum(aprov); setPerdaNum(100 - aprov);
    setTotalPecasNum(totalPecas); setStatChapas(results.length);

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

  // ── 1.1 — Imprimir plano de corte (teste — sem salvar) ────────────────────
  function handleImprimirTeste() {
    if (!resultado) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const chapasHtml = resultado.map((r, i) => `
      <div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#2d5fa6">
          CHAPA ${i + 1} · ${r.prod} · ${r.W} × ${r.H} mm
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#2d5fa6;color:white">
              <th style="padding:6px;text-align:left">Peça</th>
              <th style="padding:6px">Dim. (mm)</th>
              <th style="padding:6px">Pedido</th>
              <th style="padding:6px">Posição X</th>
              <th style="padding:6px">Posição Y</th>
            </tr>
          </thead>
          <tbody>
            ${r.placed.map((p, j) => `
              <tr style="background:${j % 2 === 0 ? '#fff' : '#f7f9ff'}">
                <td style="padding:5px 6px">${j + 1}</td>
                <td style="padding:5px 6px;text-align:center;font-family:monospace">${p.l} × ${p.a}</td>
                <td style="padding:5px 6px;text-align:center">${p.pedidoId ?? pedidoRef ?? "—"}</td>
                <td style="padding:5px 6px;text-align:center;font-family:monospace">${p.x}</td>
                <td style="padding:5px 6px;text-align:center;font-family:monospace">${p.y}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        ${r.free.filter(f => f.l >= 200 && f.a >= 200).length > 0 ? `
          <div style="margin-top:8px;font-size:11px;color:#b45309">
            Retalhos aproveitáveis: ${r.free.filter(f => f.l >= 200 && f.a >= 200).map(f => `${f.l}×${f.a}mm`).join(", ")}
          </div>
        ` : ""}
      </div>
    `).join("");

    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Plano de Corte (TESTE) · ${pedidoRef ?? "—"}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px;color:#1a1a2e} @page{margin:15mm} @media print{button{display:none}}</style>
      </head><body>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #2d5fa6">
          <div>
            <div style="font-size:22px;font-weight:900;color:#2d5fa6">urbanglass</div>
            <div style="font-size:10px;color:#888;margin-top:2px">Urban Glass Comércio Ltda</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:2px">Plano de Corte</div>
            <div style="font-size:20px;font-weight:900;color:#2d5fa6">${pedidoRef ?? "AVULSO"}</div>
            <div style="display:inline-block;margin-top:6px;padding:3px 12px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:99px;font-size:10px;font-weight:700">⚠ SIMULAÇÃO — NÃO SALVO</div>
            <div style="font-size:10px;color:#888;margin-top:4px">Emissão: ${new Date().toLocaleDateString("pt-BR")}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          <div style="padding:10px;background:#f0f4ff;border-radius:8px;border-left:4px solid #2d5fa6">
            <div style="font-size:9px;color:#2d5fa6;font-weight:700;text-transform:uppercase">Aproveitamento</div>
            <div style="font-size:20px;font-weight:900;color:#2d5fa6">${aprovNum.toFixed(1)}%</div>
          </div>
          <div style="padding:10px;background:#fff1f2;border-radius:8px;border-left:4px solid #f43f5e">
            <div style="font-size:9px;color:#f43f5e;font-weight:700;text-transform:uppercase">Perda</div>
            <div style="font-size:20px;font-weight:900;color:#f43f5e">${perdaNum.toFixed(1)}%</div>
          </div>
          <div style="padding:10px;background:#f0fdff;border-radius:8px;border-left:4px solid #00c8ff">
            <div style="font-size:9px;color:#00c8ff;font-weight:700;text-transform:uppercase">Chapas</div>
            <div style="font-size:20px;font-weight:900;color:#00c8ff">${statChapas}</div>
          </div>
          <div style="padding:10px;background:#fffbeb;border-radius:8px;border-left:4px solid #f59e0b">
            <div style="font-size:9px;color:#f59e0b;font-weight:700;text-transform:uppercase">Retalhos</div>
            <div style="font-size:20px;font-weight:900;color:#f59e0b">${retalhosGerados.length}</div>
          </div>
        </div>
        ${chapasHtml}
        <div style="margin-top:20px;padding:10px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:11px;color:#92400e">
          ⚠ Este documento é uma SIMULAÇÃO. Nenhum dado foi salvo no sistema. Para confirmar o plano, use "Salvar Plano" no otimizador.
        </div>
        <button onclick="window.print()" style="margin-top:16px;padding:10px 24px;background:#2d5fa6;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer">🖨 Imprimir</button>
      </body></html>
    `);
    win.document.close();
  }

  // ── 1.3 — Zerar plano de corte ────────────────────────────────────────────
  async function handleZerar() {
    if (!pedidoRef) return;
    if (!confirm("Apagar completamente a otimização deste pedido? Esta ação não pode ser desfeita.")) return;
    setZerando(true);

    // Remove otimizações do banco
    await supabase.from("otimizacoes").delete().eq("pedido_id", pedidoRef);

    // Volta status do pedido para "Aguardando otimização"
    await updatePedido(pedidoRef, { status: "Aguardando otimização" });

    // Se havia pedidos agrupados, reverte status deles também
    for (const pid of pedidosSelecionados) {
      await supabase.from("otimizacoes").delete().eq("pedido_id", pid);
      await updatePedido(pid, { status: "Aguardando otimização" });
    }

    setResultado(null);
    setMsg("");
    setRetalhosGerados([]);
    setPedidosSelecionados(new Set());
    setZerando(false);
    alert("Plano de corte zerado. O pedido voltou para 'Aguardando otimização'.");
  }

  // ── Salvar plano (real) ───────────────────────────────────────────────────
  async function handleSalvar() {
    if (!resultado || !pedidoRef) return;
    setSalvando(true);
    const hoje = new Date().toISOString().split("T")[0];
    const todosPedidos = [pedidoRef, ...Array.from(pedidosSelecionados)];
    const chapasJson = resultado.map(r => ({ W: r.W, H: r.H, prod: r.prod, placed: r.placed, free: r.free }));

    // Salva otimização por pedido
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

    // Avança status
    for (const pid of todosPedidos) {
      await updatePedido(pid, { status: "Em Produção – Corte" });
    }

    // ── 1.4 — Salva retalhos corretamente ────────────────────────────────────
    if (retalhosGerados.length > 0) {
      await salvarRetalhos(retalhosGerados.map(fr => ({
        produto_nome: fr.prod,
        largura: fr.l,
        altura: fr.a,
        m2: fr.m2,
        chapa_origem: `CHAPA ${fr.chapaIdx + 1}`,
        pedido_origem: pedidoRef,
        status: "Disponível",
        dt_gerado: hoje,
      })));
    }

    // ── 6.1 — Baixa de chapas no estoque por produto ─────────────────────────
    const consumoPorProd = new Map<string, { chapas: number; m2: number }>();
    resultado.forEach(r => {
      const prev = consumoPorProd.get(r.prod) ?? { chapas: 0, m2: 0 };
      consumoPorProd.set(r.prod, {
        chapas: prev.chapas + 1,
        m2: parseFloat((prev.m2 + (r.W * r.H) / 1e6).toFixed(4)),
      });
    });

    for (const [prodNome, consumo] of consumoPorProd.entries()) {
      await baixarChapasEstoque(prodNome, consumo.chapas, consumo.m2);
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
  const pedidosNoCanvas = pedidoRef ? [pedidoRef, ...Array.from(pedidosSelecionados)] : [];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Otimizador de Corte</div>
        {pedidoRef && (
          <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
            Pedido <strong style={{ color: "var(--acc)" }}>{pedidoRef}</strong>
            {pedidosSelecionados.size > 0 && <span style={{ color: "var(--acc2)", marginLeft: "8px" }}>+ {pedidosSelecionados.size} agrupado(s)</span>}
          </span>
        )}
        {/* 1.3 — Botão Zerar */}
        {pedidoRef && (
          <button className="btn bg sm" onClick={handleZerar} disabled={zerando}
            style={{ borderColor: "var(--err)", color: "var(--err)" }}>
            {zerando ? "Zerando..." : "✕ Zerar Plano"}
          </button>
        )}
        {pedidoRef && <a href={"/pedidos/" + pedidoRef} className="btn bg sm">← Voltar ao Pedido</a>}
      </div>

      <div className="con">
        <div className="g2" style={{ alignItems: "start", gap: "14px" }}>

          {/* ── COL ESQUERDA ── */}
          <div>
            {/* 1.1 — Toggle modo teste */}
            {pedidoRef && (
              <div style={{ marginBottom: "14px", padding: "10px 14px", background: modoTeste ? "rgba(245,158,11,.1)" : "var(--surf1)", border: `1px solid ${modoTeste ? "var(--warn)" : "var(--b1)"}`, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: modoTeste ? "var(--warn)" : "var(--t2)" }}>
                    {modoTeste ? "⚠ Modo Teste ativo" : "Modo Teste"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--t3)", marginTop: "2px" }}>
                    {modoTeste ? "Nada será salvo — apenas simulação visual" : "Calcular sem salvar no banco"}
                  </div>
                </div>
                <button
                  onClick={() => setModoTeste(v => !v)}
                  style={{ padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", border: `1px solid ${modoTeste ? "var(--warn)" : "var(--b2)"}`, background: modoTeste ? "rgba(245,158,11,.2)" : "transparent", color: modoTeste ? "var(--warn)" : "var(--t3)", transition: "all 0.15s" }}
                >
                  {modoTeste ? "Desativar" : "Ativar"}
                </button>
              </div>
            )}

            <div className="card mb14">
              <div className="ct">Configuração da Chapa</div>
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

            {pedidoRef && (
              <div className="card mb14">
                <div className="ct">Agrupar Pedidos {carregandoSugestoes && <span style={{ fontSize: "10px", color: "var(--t3)" }}>buscando...</span>}</div>
                {!carregandoSugestoes && pedidosSugeridos.length === 0 && (
                  <div style={{ fontSize: "11px", color: "var(--t3)", padding: "8px 0", textAlign: "center" }}>Nenhum outro pedido aguardando com o mesmo produto.</div>
                )}
                {pedidosSugeridos.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pedidosSugeridos.map(ps => {
                      const selecionado = pedidosSelecionados.has(ps.id);
                      const { stroke } = getColorForPedido(ps.id);
                      return (
                        <div key={ps.id} onClick={() => toggleSugerido(ps.id)}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${selecionado ? stroke : "var(--b2)"}`, background: selecionado ? `${stroke}14` : "var(--surf2)", transition: "all 0.15s" }}>
                          <div style={{ width: "16px", height: "16px", borderRadius: "4px", flexShrink: 0, border: `2px solid ${selecionado ? stroke : "var(--b3)"}`, background: selecionado ? stroke : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {selecionado && <span style={{ fontSize: "10px", color: "#000", fontWeight: 900 }}>✓</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{ps.id} <span style={{ fontSize: "11px", color: "var(--t3)", fontWeight: 400 }}>{ps.clienteNome}</span></div>
                            <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "2px" }}>{ps.totalPecas} peça(s) · {ps.produtos.join(", ")}</div>
                          </div>
                          <div style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px", border: `1px solid ${stroke}`, color: stroke }}>{selecionado ? "incluído" : "incluir"}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="card">
              <div className="ct">Peças a Cortar <button className="btn bp sm" onClick={rodar}>◈ Calcular</button></div>
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

              {/* 1.1 — Badge modo teste */}
              {modoTeste && resultado && (
                <div style={{ marginBottom: "10px", padding: "8px 12px", background: "rgba(245,158,11,.1)", border: "1px solid var(--warn)", borderRadius: "8px", fontSize: "12px", color: "var(--warn)", fontWeight: 700 }}>
                  ⚠ MODO TESTE — Este resultado não será salvo
                </div>
              )}

              {resultado && resultado.length > 1 && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "9px" }}>
                  {resultado.map((r, i) => (
                    <button key={i} className="btn bg sm" onClick={() => setChapaIdx(i)}
                      style={chapaIdx === i ? { borderColor: "var(--acc2)", color: "var(--acc2)", background: "rgba(0,200,255,.08)" } : {}}>
                      Chapa {i + 1}{r.prod && <span style={{ fontSize: "9px", opacity: 0.6, marginLeft: "4px" }}>· {r.prod.split(" ").slice(0, 2).join(" ")}</span>}
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
                    {retalhosGerados.length} retalho(s)
                    {modoTeste ? " — NÃO serão salvos (modo teste)" : " — salvos automaticamente ao confirmar"}
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
                  {/* 1.2 — Botão imprimir teste */}
                  <button className="btn bg sm" style={{ width: "100%", padding: "10px" }} onClick={handleImprimirTeste}>
                    🖨 Imprimir Plano (Teste — sem salvar)
                  </button>

                  {/* Botão salvar — oculto em modo teste */}
                  {!modoTeste && pedidoRef && (
                    <button className="btn bp sm" style={{ width: "100%", padding: "12px", fontSize: "13px" }} onClick={handleSalvar} disabled={salvando}>
                      {salvando ? "Salvando..." : pedidosSelecionados.size > 0
                        ? `✓ Salvar e Avançar ${pedidosSelecionados.size + 1} Pedidos para Corte`
                        : "✓ Salvar Plano e Voltar ao Pedido"}
                    </button>
                  )}
                  {modoTeste && (
                    <div style={{ padding: "10px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: "8px", fontSize: "11px", color: "var(--warn)", textAlign: "center" }}>
                      Modo teste ativo — desative para salvar o plano
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