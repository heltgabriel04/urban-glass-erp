"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
import { formatPercent } from "@/lib/formatters";
import type { Produto } from "@/types";

// ─── TIPOS ────────────────────────────────────────────────
interface Peca {
  l: number;
  a: number;
  qtd: number;
  prod: string;
}

interface PecaPlacada {
  x: number;
  y: number;
  l: number;
  a: number;
  idx: number;
  prod: string;
  rot: boolean;
}

interface EspacoLivre {
  x: number;
  y: number;
  l: number;
  a: number;
}

interface ResultadoChapa {
  placed: PecaPlacada[];
  free: EspacoLivre[];
  W: number;
  H: number;
}

// ─── ALGORITMO GUILHOTINA ─────────────────────────────────
function guilhotina(
  W: number,
  H: number,
  pecas: Peca[],
  kerf: number
): { placed: PecaPlacada[]; free: EspacoLivre[] } {
  let free: EspacoLivre[] = [{ x: 0, y: 0, l: W, a: H }];
  const placed: PecaPlacada[] = [];

  pecas.forEach((peca, idx) => {
    if (!free.length) return;

    let best = Infinity;
    let bR: EspacoLivre | null = null;
    let bI = -1;
    let rot = false;

    free.forEach((fr, fi) => {
      if (peca.l <= fr.l && peca.a <= fr.a) {
        const s = Math.min(fr.l - peca.l, fr.a - peca.a);
        if (s < best) { best = s; bR = fr; bI = fi; rot = false; }
      }
      if (peca.a <= fr.l && peca.l <= fr.a) {
        const s = Math.min(fr.l - peca.a, fr.a - peca.l);
        if (s < best) { best = s; bR = fr; bI = fi; rot = true; }
      }
    });

    if (!bR || bI === -1) return;

    const fr = bR as EspacoLivre;
    const pl = rot ? peca.a : peca.l;
    const pa = rot ? peca.l : peca.a;

    placed.push({ x: fr.x, y: fr.y, l: pl, a: pa, idx, prod: peca.prod, rot });

    const nr: EspacoLivre[] = [];
    if (fr.l - (pl + kerf) >= 100) nr.push({ x: fr.x + pl + kerf, y: fr.y,             l: fr.l - (pl + kerf), a: pa });
    if (fr.a - (pa + kerf) >= 100) nr.push({ x: fr.x,              y: fr.y + pa + kerf, l: fr.l,               a: fr.a - (pa + kerf) });
    free.splice(bI, 1, ...nr);
  });

  return { placed, free };
}

// ─── CONSTANTES ───────────────────────────────────────────
const CHAPAS_PADRAO = [
  { label: "3210 × 2250 mm (Padrão)", w: 3210, h: 2250 },
  { label: "3000 × 2100 mm",          w: 3000, h: 2100 },
  { label: "2250 × 1605 mm",          w: 2250, h: 1605 },
];

const PAD = 12;

// ─── COMPONENTE ───────────────────────────────────────────
export default function OtimizadorPage() {
  const searchParams = useSearchParams();
  const pedidoParam  = searchParams.get("pedido"); // ex: "P-001"

  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [pecas, setPecas]           = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);
  const [chapaW, setChapaW]         = useState(3210);
  const [chapaH, setChapaH]         = useState(2250);
  const [kerf, setKerf]             = useState(3);
  const [resultado, setResultado]   = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx]     = useState(0);
  const [pedidoRef, setPedidoRef]   = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Carrega produtos
  useEffect(() => {
    supabase.from("produtos").select("*").eq("ativo", true).then(({ data }) => {
      setProdutos(data as Produto[] || []);
      // Só define peça em branco se não vier de pedido
      if (data && data.length > 0 && !pedidoParam) {
        setPecas([{ l: 0, a: 0, qtd: 1, prod: data[0].nome }]);
      }
    });
  }, []);

  // Carrega itens do pedido se vier ?pedido=P-001
  useEffect(() => {
    if (!pedidoParam) return;
    setCarregando(true);
    supabase
      .from("itens_pedido")
      .select("*, produtos(nome)")
      .eq("pedido_id", pedidoParam)
      .then(({ data, error }) => {
        setCarregando(false);
        if (error || !data || data.length === 0) return;

        // Agrupa itens iguais (mesmo produto + mesma dimensão) em qtd
        const map = new Map<string, Peca>();
        data.forEach((item: any) => {
          const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
          if (map.has(key)) {
            map.get(key)!.qtd += item.quantidade;
          } else {
            map.set(key, {
              l:    item.largura,
              a:    item.altura,
              qtd:  item.quantidade,
              prod: item.produto_nome,
            });
          }
        });

        setPecas(Array.from(map.values()));
        setPedidoRef(pedidoParam);
      });
  }, [pedidoParam]);

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) desenhar(resultado[chapaIdx], chapaIdx);
  }, [resultado, chapaIdx]);

  function addPeca() {
    setPecas(p => [...p, { l: 0, a: 0, qtd: 1, prod: produtos[0]?.nome || "" }]);
  }

  function remPeca(i: number) {
    setPecas(p => p.filter((_, idx) => idx !== i));
  }

  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas(p => p.map((pc, idx) => idx === i ? { ...pc, [field]: value } : pc));
  }

  function rodar() {
    const expandidas: Peca[] = [];
    pecas.forEach(p => {
      if (p.l > 0 && p.a > 0) {
        for (let q = 0; q < (p.qtd || 1); q++) expandidas.push({ ...p, qtd: 1 });
      }
    });
    if (!expandidas.length) return;
    expandidas.sort((a, b) => (b.l * b.a) - (a.l * a.a));

    const results: ResultadoChapa[] = [];
    let rem = [...expandidas];
    let ci = 0;

    while (rem.length && ci < 15) {
      const r = guilhotina(chapaW, chapaH, rem, kerf);
      results.push({ W: chapaW, H: chapaH, ...r });
      const used = new Set(r.placed.map(p => p.idx));
      rem = rem.filter((_, i) => !used.has(i));
      ci++;
      if (!r.placed.length) break;
    }

    setResultado(results);
    setChapaIdx(0);
  }

  function desenhar(chapa: ResultadoChapa, idx: number) {
    const canvas = canvasRef.current;
    if (!canvas || !chapa) return;
    const ctx = canvas.getContext("2d")!;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.offsetWidth;
    const displayH = canvas.offsetHeight;
    canvas.width  = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const LABEL_H = 18;
    const CW = displayW - PAD * 2;
    const CH = displayH - PAD * 2 - LABEL_H;
    const scale = Math.min(CW / chapa.W, CH / chapa.H);
    const dW = chapa.W * scale;
    const dH = chapa.H * scale;
    const ox = (CW - dW) / 2 + PAD;
    const oy = (CH - dH) / 2 + PAD + LABEL_H;

    ctx.clearRect(0, 0, displayW, displayH);

    ctx.fillStyle = "#444e68";
    ctx.font = "bold 9px DM Mono, monospace";
    ctx.fillText(
      `CHAPA ${idx + 1}  ·  ${chapa.W} × ${chapa.H} mm  ·  ${chapa.placed.length} peças`,
      PAD, PAD + 11
    );

    ctx.fillStyle = "#0d1f14";
    ctx.fillRect(ox, oy, dW, dH);

    ctx.strokeStyle = "rgba(255,255,255,.025)";
    ctx.lineWidth = 0.5;
    const step = 500 * scale;
    for (let gx = ox; gx <= ox + dW; gx += step) {
      ctx.beginPath(); ctx.moveTo(gx, oy); ctx.lineTo(gx, oy + dH); ctx.stroke();
    }
    for (let gy = oy; gy <= oy + dH; gy += step) {
      ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + dW, gy); ctx.stroke();
    }

    chapa.free.forEach(fr => {
      const isLg = fr.l >= 200 && fr.a >= 200;
      const fx = ox + fr.x * scale;
      const fy = oy + fr.y * scale;
      const fw = fr.l * scale;
      const fh = fr.a * scale;
      ctx.fillStyle = isLg ? "rgba(0,200,255,.06)" : "rgba(255,255,255,.01)";
      ctx.fillRect(fx, fy, fw, fh);
      if (isLg && fw > 22 && fh > 14) {
        ctx.fillStyle = "rgba(0,200,255,.5)";
        ctx.font = "9px DM Mono, monospace";
        ctx.fillText("↺", fx + 4, fy + 12);
      }
    });

    const fills   = ["#1a4d30","#163826","#1f5233","#17402a","#1c4a2e","#234f35","#193d28","#20472f","#1b432c"];
    const strokes = ["#3dffa0","#2de890","#4dffaa","#35f598","#38ffa3","#3affaa","#31f09a","#3cff9e","#36f8a0"];

    chapa.placed.forEach((p, i) => {
      const px = ox + p.x * scale;
      const py = oy + p.y * scale;
      const pw = p.l * scale;
      const ph = p.a * scale;
      const ci = i % fills.length;

      ctx.fillStyle = fills[ci];
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = strokes[ci];
      ctx.lineWidth = 0.8;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

      if (pw > 40 && ph > 20) {
        ctx.fillStyle = "rgba(210,255,235,.9)";
        ctx.font = `bold ${Math.max(8, Math.min(11, pw / 9))}px DM Sans, sans-serif`;
        ctx.fillText(`${p.l}×${p.a}`, px + 5, py + 13);
      }
      if (ph > 28 && pw > 60) {
        ctx.fillStyle = "rgba(150,220,180,.65)";
        ctx.font = `${Math.max(7, Math.min(9, pw / 12))}px DM Mono, monospace`;
        ctx.fillText(`${(p.l * p.a / 1e6).toFixed(3)} m²`, px + 5, py + 24);
      }
      if (p.rot && pw > 18 && ph > 18) {
        ctx.fillStyle = "rgba(245,158,11,.7)";
        ctx.font = "9px sans-serif";
        ctx.fillText("↻", px + pw - 13, py + 12);
      }
    });

    ctx.strokeStyle = "#2a5c3f";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, dW, dH);
    ctx.strokeStyle = "rgba(61,255,160,.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 1, oy + 1, dW - 2, dH - 2);
  }

  const aprov = resultado
    ? (() => {
        let totA = 0, usedA = 0;
        resultado.forEach(r => {
          totA += r.W * r.H;
          r.placed.forEach(p => { usedA += p.l * p.a; });
        });
        return totA > 0 ? usedA / totA * 100 : 0;
      })()
    : 0;
  const perda = 100 - aprov;

  const retalhosGerados = resultado
    ? resultado.flatMap(r => r.free.filter(fr => fr.l >= 200 && fr.a >= 200))
    : [];

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">
          ◈ Otimizador de Corte
          {pedidoRef && (
            <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--acc)", marginLeft: "10px" }}>
              — {pedidoRef}
            </span>
          )}
        </div>
        {pedidoRef && (
          <a href={`/pedidos/${pedidoRef}`} className="btn bg sm">← Voltar ao Pedido</a>
        )}
        {resultado && (
          <div style={{ display: "flex", gap: "8px" }}>
            <div className="clk" style={{ color: "var(--acc)" }}>✓ {formatPercent(aprov)} aproveitamento</div>
            <div className="clk" style={{ color: "var(--err)" }}>✗ {formatPercent(perda)} perda</div>
            <div className="clk">{resultado.length} chapa(s)</div>
            {retalhosGerados.length > 0 && (
              <div className="clk" style={{ color: "var(--acc2)" }}>↺ {retalhosGerados.length} retalho(s)</div>
            )}
          </div>
        )}
      </div>

      <div className="con">
        <div className="g2">

          {/* ── Painel esquerdo ── */}
          <div>
            <div className="card mb14">
              <div className="ct">Chapa / Vidro</div>
              <div className="fg mb14" style={{ marginBottom: "10px" }}>
                <label className="fl">Tamanho padrão</label>
                <select className="fc" onChange={e => {
                  const c = CHAPAS_PADRAO[parseInt(e.target.value)];
                  setChapaW(c.w); setChapaH(c.h);
                }}>
                  {CHAPAS_PADRAO.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
                </select>
              </div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Largura (mm)</label>
                  <input className="fc" type="number" value={chapaW}
                    onChange={e => setChapaW(parseInt(e.target.value) || 0)} />
                </div>
                <div className="fg">
                  <label className="fl">Altura (mm)</label>
                  <input className="fc" type="number" value={chapaH}
                    onChange={e => setChapaH(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Kerf / Espessura do corte (mm)</label>
                <input className="fc" type="number" value={kerf}
                  onChange={e => setKerf(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="card mb14">
              <div className="ct">
                {carregando ? (
                  <span style={{ color: "var(--t3)" }}>Carregando itens do pedido...</span>
                ) : (
                  <>
                    Peças a Cortar
                    {pedidoRef && (
                      <span style={{ fontSize: "10px", color: "var(--acc)", fontWeight: 400 }}>
                        do {pedidoRef}
                      </span>
                    )}
                  </>
                )}
                <button className="btn bp xs" onClick={addPeca}>+ Peça</button>
              </div>

              {pecas.map((p, i) => (
                <div key={i} style={{
                  background: "var(--surf2)", border: "1px solid var(--b1)",
                  borderRadius: "var(--r)", padding: "10px", marginBottom: "8px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span className="mono" style={{ fontSize: "10px", color: "var(--t3)" }}>PEÇA {i + 1}</span>
                    {pecas.length > 1 && (
                      <button className="btn bw xs" onClick={() => remPeca(i)}>✕</button>
                    )}
                  </div>
                  <div className="fr3">
                    <div className="fg">
                      <label className="fl">Larg. (mm)</label>
                      <input className="fc" type="number" value={p.l || ""}
                        onChange={e => updPeca(i, "l", parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div className="fg">
                      <label className="fl">Alt. (mm)</label>
                      <input className="fc" type="number" value={p.a || ""}
                        onChange={e => updPeca(i, "a", parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div className="fg">
                      <label className="fl">Qtd</label>
                      <input className="fc" type="number" value={p.qtd}
                        onChange={e => updPeca(i, "qtd", parseInt(e.target.value) || 1)} min={1} />
                    </div>
                  </div>
                  <div className="fg" style={{ marginTop: "6px" }}>
                    <label className="fl">Produto</label>
                    <select className="fc" value={p.prod} onChange={e => updPeca(i, "prod", e.target.value)}>
                      {produtos.map(pr => <option key={pr.id}>{pr.nome}</option>)}
                    </select>
                  </div>
                </div>
              ))}

              <button className="btn bp" style={{ width: "100%", marginTop: "4px" }} onClick={rodar}>
                ◈ Rodar Otimizador
              </button>
            </div>
          </div>

          {/* ── Painel direito ── */}
          <div>
            {resultado ? (
              <div className="card">
                <div className="ct">
                  Resultado — Chapa {chapaIdx + 1} de {resultado.length}
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button className="btn bg xs"
                      onClick={() => setChapaIdx(i => Math.max(0, i - 1))}
                      disabled={chapaIdx === 0}>←</button>
                    <button className="btn bg xs"
                      onClick={() => setChapaIdx(i => Math.min(resultado.length - 1, i + 1))}
                      disabled={chapaIdx === resultado.length - 1}>→</button>
                  </div>
                </div>

                <div style={{
                  background: "var(--surf2)", border: "1px solid var(--b1)",
                  borderRadius: "var(--r)", overflow: "hidden",
                }}>
                  <canvas
                    ref={canvasRef}
                    style={{ width: "100%", height: "380px", display: "block" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
                  {[
                    { color: "#1f5233", border: "#3dffa0",               label: "Peça cortada"           },
                    { color: "rgba(0,200,255,.1)", border: "rgba(0,200,255,.5)", label: "Retalho reaproveitável" },
                    { color: "rgba(255,255,255,.02)", border: "rgba(255,255,255,.1)", label: "Descarte"          },
                  ].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{
                        width: "12px", height: "12px", borderRadius: "3px",
                        background: l.color, border: `1px solid ${l.border}`, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: "11px", color: "var(--t3)" }}>{l.label}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "12px" }}>
                  <div className="sr">
                    <div className="sl">Peças nesta chapa</div>
                    <div className="sv">{resultado[chapaIdx].placed.length}</div>
                  </div>
                  <div className="sr">
                    <div className="sl">Retalhos reaproveitáveis</div>
                    <div className="sv" style={{ color: "var(--acc2)" }}>
                      {resultado[chapaIdx].free.filter(f => f.l >= 200 && f.a >= 200).length}
                    </div>
                  </div>
                </div>

                <div className="totbar" style={{ marginTop: "12px" }}>
                  <div className="ti">
                    <div className="tl">Chapas usadas</div>
                    <div className="tv">{resultado.length}</div>
                  </div>
                  <div className="ti">
                    <div className="tl">Aproveitamento</div>
                    <div className="tv" style={{ color: aprov >= 70 ? "var(--ok)" : aprov >= 50 ? "var(--warn)" : "var(--err)" }}>
                      {formatPercent(aprov)}
                    </div>
                  </div>
                  <div className="ti">
                    <div className="tl">Perda</div>
                    <div className="tv" style={{ color: "var(--err)" }}>{formatPercent(perda)}</div>
                  </div>
                  <div className="ti">
                    <div className="tl">↺ Retalhos</div>
                    <div className="tv" style={{ color: "var(--acc2)" }}>{retalhosGerados.length}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", minHeight: "400px", color: "var(--t3)",
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>◈</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", marginBottom: "8px" }}>
                  {carregando ? "Carregando itens do pedido..." : "Configure as peças e clique em"}
                </div>
                {!carregando && (
                  <div style={{ color: "var(--acc)", fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
                    Rodar Otimizador
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}