"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { salvarOtimizacao } from "@/services/otimizador.service";
import type { Produto } from "@/types";

interface Peca { l: number; a: number; qtd: number; prod: string; }
interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; }
interface EspacoLivre { x: number; y: number; l: number; a: number; }
interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; }
interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }

function guilhotina(W: number, H: number, pecas: Peca[], kerf: number): { placed: PecaPlacada[]; free: EspacoLivre[] } {
  let free: EspacoLivre[] = [{ x: 0, y: 0, l: W, a: H }];
  const placed: PecaPlacada[] = [];
  pecas.forEach((peca, idx) => {
    if (!free.length) return;
    let best = Infinity, bR: EspacoLivre | null = null, bI = -1, rot = false;
    free.forEach((fr) => {
      if (peca.l <= fr.l && peca.a <= fr.a) { const s = Math.min(fr.l - peca.l, fr.a - peca.a); if (s < best) { best = s; bR = fr; bI = free.indexOf(fr); rot = false; } }
      if (peca.a <= fr.l && peca.l <= fr.a) { const s = Math.min(fr.l - peca.a, fr.a - peca.l); if (s < best) { best = s; bR = fr; bI = free.indexOf(fr); rot = true; } }
    });
    if (!bR || bI === -1) return;
    const fr = bR as EspacoLivre;
    const pl = rot ? peca.a : peca.l, pa = rot ? peca.l : peca.a;
    placed.push({ x: fr.x, y: fr.y, l: pl, a: pa, idx, prod: peca.prod, rot });
    const nr: EspacoLivre[] = [];
    if (fr.l - (pl + kerf) >= 100) nr.push({ x: fr.x + pl + kerf, y: fr.y, l: fr.l - (pl + kerf), a: pa });
    if (fr.a - (pa + kerf) >= 100) nr.push({ x: fr.x, y: fr.y + pa + kerf, l: fr.l, a: fr.a - (pa + kerf) });
    free.splice(bI, 1, ...nr);
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

// Paleta de peças vibrante — sem tons de verde
const COLS_PECA = [
  "#1e40af","#7c3aed","#be185d","#b45309",
  "#0e7490","#065f46","#7f1d1d","#1d4ed8",
  "#4c1d95","#9d174d","#92400e","#164e63",
];
const COLS_STROKE = [
  "#60a5fa","#a78bfa","#f472b6","#fbbf24",
  "#22d3ee","#34d399","#fca5a5","#93c5fd",
  "#c4b5fd","#f9a8d4","#fde68a","#67e8f9",
];

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    supabase.from("produtos").select("*").eq("ativo", true).then(({ data }) => {
      const prods = (data as Produto[]) || [];
      setProdutos(prods);
      if (prods.length > 0 && !pedidoParam) {
        const nome = prods[0].nome;
        setPecas([{ l: 0, a: 0, qtd: 1, prod: nome }]);
        autoSetChapa(nome);
      }
    });
  }, []);

  useEffect(() => {
    if (!pedidoParam) return;
    setCarregando(true);
    supabase.from("itens_pedido").select("*, produtos(nome)").eq("pedido_id", pedidoParam).then(({ data, error }) => {
      setCarregando(false);
      if (error || !data || data.length === 0) return;
      const map = new Map<string, Peca>();
      data.forEach((item: any) => {
        const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
        if (map.has(key)) map.get(key)!.qtd += item.quantidade;
        else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome });
      });
      const carregadas = Array.from(map.values());
      setPecas(carregadas);
      setPedidoRef(pedidoParam);
      if (carregadas.length > 0) autoSetChapa(carregadas[0].prod);
    });
  }, [pedidoParam]);

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) drawOpt(resultado[chapaIdx], chapaIdx, bord);
  }, [resultado, chapaIdx]);

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

    // Fundo escuro neutro — nem tão verde
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, displayW, displayH);

    // Chapa: cinza escuro com leve azul
    ctx.fillStyle = "#1a1f2e";
    ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeStyle = "#2d3550";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, dW, dH);

    // Borda lapidação em laranja
    if (bordMm > 0) {
      const bs = bordMm * scale;
      ctx.fillStyle = "rgba(255,107,53,0.18)";
      ctx.fillRect(ox, oy, dW, bs);
      ctx.fillRect(ox, oy + dH - bs, dW, bs);
      ctx.fillRect(ox, oy, bs, dH);
      ctx.fillRect(ox + dW - bs, oy, bs, dH);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(255,107,53,0.55)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(ox + bs, oy + bs, dW - bs * 2, dH - bs * 2);
      ctx.setLineDash([]);
    }

    // Label da chapa
    ctx.fillStyle = "#4a5568";
    ctx.font = "bold 9px 'DM Mono', monospace";
    ctx.fillText("CHAPA " + (idx + 1) + "  ·  " + r.W + " × " + r.H + " mm" + (r.prod ? "  ·  " + r.prod : ""), ox + 4, oy - 4);

    // Peças com paleta colorida distinta
    r.placed.forEach((p, i) => {
      const px = ox + (p.x + bordMm) * scale;
      const py = oy + (p.y + bordMm) * scale;
      const pw = p.l * scale;
      const ph = p.a * scale;
      const fill   = COLS_PECA[i % COLS_PECA.length];
      const stroke = COLS_STROKE[i % COLS_STROKE.length];

      ctx.fillStyle = fill;
      ctx.fillRect(px, py, pw, ph);

      // Gradiente sutil de brilho no topo
      const grad = ctx.createLinearGradient(px, py, px, py + ph * 0.4);
      grad.addColorStop(0, "rgba(255,255,255,0.12)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, pw, ph * 0.4);

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(px, py, pw, ph);

      if (pw > 30 && ph > 18) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        const fs = Math.max(7, Math.min(11, pw / 7));
        ctx.font = `bold ${fs}px 'DM Mono', monospace`;
        ctx.fillText(p.l + "×" + p.a, px + 4, py + fs + 3);
        if (ph > 28 && pw > 50) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.font = `7px 'DM Mono', monospace`;
          ctx.fillText(((p.l * p.a) / 1e6).toFixed(3) + " m²", px + 4, py + fs + 14);
        }
      }
    });

    // Retalhos aproveitáveis em azul ciano
    r.free.forEach((fr) => {
      const isLg = fr.l >= 200 && fr.a >= 200;
      if (!isLg) return;
      const fx = ox + (fr.x + bordMm) * scale;
      const fy = oy + (fr.y + bordMm) * scale;
      const fw = fr.l * scale;
      const fh = fr.a * scale;
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

    // Borda final da chapa
    ctx.strokeStyle = "#3d4a6a";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, dW, dH);
  }

  function rodar() {
    const grupos = new Map<string, Peca[]>();
    pecas.forEach((p) => {
      if (p.l > 0 && p.a > 0) {
        const grupo = grupos.get(p.prod) || [];
        for (let q = 0; q < (p.qtd || 1); q++) grupo.push({ ...p, qtd: 1 });
        grupos.set(p.prod, grupo);
      }
    });
    if (grupos.size === 0) return;

    const results: ResultadoChapa[] = [];
    let totalPlaced = 0, totalPecas = 0;

    grupos.forEach((expandidas, prodNome) => {
      const ci2 = PRODUTO_CHAPA[prodNome];
      const chapa = ci2 !== undefined ? CHAPAS_PADRAO[ci2] : null;
      const W = (chapa ? chapa.w : chapaW) - bord * 2;
      const H = (chapa ? chapa.h : chapaH) - bord * 2;
      const CW = chapa ? chapa.w : chapaW;
      const CH = chapa ? chapa.h : chapaH;
      expandidas.sort((a, b) => b.l * b.a - a.l * a.a);
      totalPecas += expandidas.length;
      let rem = [...expandidas], ci = 0;
      while (rem.length && ci < 15) {
        const r = guilhotina(W, H, rem, kerf);
        results.push({ W: CW, H: CH, prod: prodNome, ...r });
        const used = new Set(r.placed.map((p) => p.idx));
        rem = rem.filter((_, i) => !used.has(i));
        totalPlaced += r.placed.length;
        ci++;
        if (!r.placed.length) break;
      }
    });

    setResultado(results);
    setChapaIdx(0);

    let totA = 0, usedA = 0;
    results.forEach((r) => { totA += r.W * r.H; r.placed.forEach((p) => (usedA += p.l * p.a)); });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    const perda = 100 - aprov;
    setAprovNum(aprov);
    setPerdaNum(perda);
    setTotalPecasNum(totalPecas);
    setStatChapas(results.length);

    const retPend: RetalhoGerado[] = [];
    results.forEach((r, ri) => r.free.filter((fr) => fr.l >= 200 && fr.a >= 200).forEach((fr) => {
      retPend.push({ ...fr, chapaIdx: ri, prod: r.prod, m2: parseFloat(((fr.l * fr.a) / 1e6).toFixed(4)) });
    }));
    setRetalhosGerados(retPend);

    const naoCouberam = totalPecas - totalPlaced;
    const gruposLabel = grupos.size > 1 ? ` · ${grupos.size} produtos` : "";
    setMsg(`${totalPecas} peças · ${results.length} chapa(s)${gruposLabel} · ${naoCouberam > 0 ? naoCouberam + " não couberam" : "✓ Todas alocadas"}`);
  }

  async function handleSalvar() {
    if (!resultado || !pedidoRef) return;
    setSalvando(true);
    const hoje = new Date().toISOString().split("T")[0];

    const ok = await salvarOtimizacao({
      pedido_id:        pedidoRef,
      dt_otim:          hoje,
      aproveitamento:   parseFloat(aprovNum.toFixed(2)),
      perda:            parseFloat(perdaNum.toFixed(2)),
      chapas_usadas:    resultado.length,
      retalhos_gerados: retalhosGerados.length,
      total_pecas:      totalPecasNum,
      chapa_w:          chapaW,
      chapa_h:          chapaH,
      kerf,
      borda:            bord,
      pecas_json:       pecas,
      chapas_json:      resultado.map(r => ({ W: r.W, H: r.H, prod: r.prod, placed: r.placed, free: r.free })),
      usuario:          null,
    });

    if (!ok) { setSalvando(false); alert("Erro ao salvar plano de corte."); return; }

    if (retalhosGerados.length > 0) {
      const rows = retalhosGerados.map((fr) => ({
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

    router.push("/pedidos/" + pedidoRef);
  }

  function addPeca() { setPecas((p) => [...p, { l: 0, a: 0, qtd: 1, prod: produtos[0]?.nome || "" }]); }
  function remPeca(i: number) { setPecas((p) => p.filter((_, idx) => idx !== i)); }
  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas((p) => p.map((pc, idx) => {
      if (idx !== i) return pc;
      if (field === "prod") autoSetChapa(value as string);
      return { ...pc, [field]: value };
    }));
  }
  function aplicarChapaPadrao(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v < 0 || v >= CHAPAS_PADRAO.length) return;
    setChapaW(CHAPAS_PADRAO[v].w); setChapaH(CHAPAS_PADRAO[v].h);
  }

  // Cards de stat com cores e ícones distintos
  const stats = [
    { label: "Aproveitamento", value: resultado ? aprovNum.toFixed(1) + "%" : "—", color: "#3dffa0", bg: "rgba(61,255,160,.08)",  border: "rgba(61,255,160,.2)",  icon: "◈" },
    { label: "Perda",          value: resultado ? perdaNum.toFixed(1) + "%" : "—", color: "#f43f5e", bg: "rgba(244,63,94,.08)",   border: "rgba(244,63,94,.2)",   icon: "▽" },
    { label: "Chapas",         value: resultado ? String(statChapas)         : "—", color: "#00c8ff", bg: "rgba(0,200,255,.08)",   border: "rgba(0,200,255,.2)",   icon: "▦" },
    { label: "Retalhos",       value: resultado ? String(retalhosGerados.length) : "—", color: "#f59e0b", bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.2)", icon: "↺" },
  ];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Otimizador de Corte</div>
        {pedidoRef && (
          <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "'DM Mono', monospace" }}>
            Pedido <strong style={{ color: "var(--acc)" }}>{pedidoRef}</strong>
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
              <div className="fr">
                <div className="fg">
                  <label className="fl">Tipo de Chapa</label>
                  <select className="fc" onChange={aplicarChapaPadrao}>
                    {CHAPAS_PADRAO.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Folga / Diamante (mm)</label>
                  <input type="number" className="fc" value={kerf} min={0} max={20} onChange={(e) => setKerf(Number(e.target.value))} />
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
                  <label className="fl">Borda Lapidação (mm)</label>
                  <input type="number" className="fc" value={bord} min={0} max={30} onChange={(e) => setBord(Number(e.target.value))} />
                </div>
              </div>
            </div>

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
              {pecas.length === 0 && !carregando && (
                <div style={{ textAlign: "center", color: "var(--t3)", fontSize: "12px", padding: "14px", fontFamily: "'DM Mono', monospace" }}>
                  Nenhuma peça. Clique em + para adicionar.
                </div>
              )}
              {pecas.map((p, i) => (
                <div key={i} className="op">
                  <div className="oph">
                    <span>PEÇA {i + 1}</span>
                    <button className="btn bw xs" onClick={() => remPeca(i)}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 60px", gap: "7px" }}>
                    <div className="fg" style={{ margin: 0 }}>
                      <label className="fl" style={{ fontSize: "9px" }}>Produto</label>
                      <select className="fc" style={{ fontSize: "11px" }} value={p.prod} onChange={(e) => updPeca(i, "prod", e.target.value)}>
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

              {/* STATS — 4 cards coloridos distintos */}
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

              {/* Seletor de chapas */}
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

              {/* Canvas */}
              <div style={{ background: "#0d1117", border: "1px solid #2d3550", borderRadius: "10px", padding: "8px", position: "relative" }}>
                <div style={{ position: "absolute", top: "10px", left: "10px", fontSize: "10px", fontFamily: "'DM Mono', monospace", color: "#4a5568", pointerEvents: "none", zIndex: 1 }}>
                  {!resultado ? "Configure as peças e clique em Calcular" : "Chapa " + (chapaIdx + 1) + " · " + (resultado[chapaIdx]?.placed.length || 0) + " peças"}
                </div>
                <canvas ref={canvasRef} width={554} height={370} style={{ display: "block", width: "100%", height: "370px" }} />
              </div>

              {/* Legenda */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "10px", padding: "8px 10px", background: "var(--surf2)", borderRadius: "7px" }}>
                {[
                  { color: COLS_PECA[0],             label: "Peças cortadas" },
                  { color: "rgba(255,107,53,0.5)",    label: "Borda lapidação" },
                  { color: "rgba(0,200,255,0.25)",    label: "Retalho aproveitável" },
                  { color: "#1a1f2e",                 label: "Descarte" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--t2)" }}>
                    <div style={{ width: "13px", height: "13px", borderRadius: "3px", background: item.color, flexShrink: 0, border: "1px solid rgba(255,255,255,0.1)" }} />
                    {item.label}
                  </div>
                ))}
              </div>

              {/* Retalhos gerados — cards legíveis */}
              {resultado && retalhosGerados.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#f59e0b", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ fontSize: "14px" }}>↺</span>
                    {retalhosGerados.length} retalho(s) aproveitável(is) — salvos automaticamente ao confirmar
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {retalhosGerados.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: "8px", padding: "10px 14px" }}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>
                            {r.l} × {r.a} mm
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--t2)", marginTop: "2px" }}>
                            {r.prod} · Chapa {r.chapaIdx + 1}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#f59e0b", fontFamily: "'Syne', sans-serif" }}>
                            {r.m2} m²
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--t3)", marginTop: "1px" }}>aproveitável</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão único de salvar */}
              {resultado && pedidoRef && (
                <div style={{ marginTop: "16px" }}>
                  <button
                    className="btn bp sm"
                    style={{ width: "100%", padding: "12px", fontSize: "13px" }}
                    onClick={handleSalvar}
                    disabled={salvando}
                  >
                    {salvando ? "Salvando plano e retalhos..." : "✓ Salvar Plano e Voltar ao Pedido"}
                  </button>
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