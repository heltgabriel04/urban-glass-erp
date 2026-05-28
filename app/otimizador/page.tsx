"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
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

// retalho com referência à chapa de origem
interface RetalhoGerado extends EspacoLivre {
  chapaIdx: number; // índice base-0 da chapa no array resultado
}

// ─── ALGORITMO GUILHOTINA ─────────────────────────────────
// NÃO ALTERAR — best-fit por menor desperdício
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
    if (fr.l - (pl + kerf) >= 100) nr.push({ x: fr.x + pl + kerf, y: fr.y, l: fr.l - (pl + kerf), a: pa });
    if (fr.a - (pa + kerf) >= 100) nr.push({ x: fr.x, y: fr.y + pa + kerf, l: fr.l, a: fr.a - (pa + kerf) });
    free.splice(bI, 1, ...nr);
  });

  return { placed, free };
}

// ─── CONSTANTES ───────────────────────────────────────────
const CHAPAS_PADRAO = [
  { label: "3210 × 2250 mm (Padrão)", w: 3210, h: 2250 },
  { label: "3000 × 2100 mm", w: 3000, h: 2100 },
  { label: "2250 × 1605 mm", w: 2250, h: 1605 },
];

const PAD = 12;

// paleta de cores por produto (canvas)
const CORES_PRODUTO = [
  "#3dffa0", "#00c8ff", "#a78bfa", "#f59e0b",
  "#f43f5e", "#38bdf8", "#fb923c", "#4ade80",
];

// ──────────────────────────────────────────────────────────
// COMPONENTE INTERNO
// ──────────────────────────────────────────────────────────
function OtimizadorContent() {
  const searchParams = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);

  const [chapaW, setChapaW] = useState(3210);
  const [chapaH, setChapaH] = useState(2250);
  const [kerf, setKerf] = useState(3);

  const [resultado, setResultado] = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx] = useState(0);
  const [pedidoRef, setPedidoRef] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // estado dos retalhos
  const [salvandoRetalhos, setSalvandoRetalhos] = useState(false);
  const [retalhosSalvos, setRetalhosSalvos] = useState(false);
  const [erroRetalhos, setErroRetalhos] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── carrega produtos ──
  useEffect(() => {
    supabase
      .from("produtos")
      .select("*")
      .eq("ativo", true)
      .then(({ data }) => {
        setProdutos((data as Produto[]) || []);
        if (data && data.length > 0 && !pedidoParam) {
          setPecas([{ l: 0, a: 0, qtd: 1, prod: data[0].nome }]);
        }
      });
  }, []);

  // ── carrega peças do pedido via URL param ──
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

        const map = new Map<string, Peca>();
        data.forEach((item: any) => {
          const key = `${item.largura}x${item.altura}x${item.produto_nome}`;
          if (map.has(key)) {
            map.get(key)!.qtd += item.quantidade;
          } else {
            map.set(key, {
              l: item.largura,
              a: item.altura,
              qtd: item.quantidade,
              prod: item.produto_nome,
            });
          }
        });

        setPecas(Array.from(map.values()));
        setPedidoRef(pedidoParam);
      });
  }, [pedidoParam]);

  // ── redesenha quando muda chapa visualizada ──
  useEffect(() => {
    if (resultado && resultado[chapaIdx]) {
      desenhar(resultado[chapaIdx], chapaIdx, pecas);
    }
  }, [resultado, chapaIdx]);

  // ─── DESENHAR ────────────────────────────────────────────
  function desenhar(chapa: ResultadoChapa, idx: number, pecasRef: Peca[]) {
    const canvas = canvasRef.current;
    if (!canvas || !chapa) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = canvas.offsetWidth;
    const displayH = canvas.offsetHeight;

    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const LABEL_H = 22;
    const CW = displayW - PAD * 2;
    const CH = displayH - PAD * 2 - LABEL_H;

    const scale = Math.min(CW / chapa.W, CH / chapa.H);
    const dW = chapa.W * scale;
    const dH = chapa.H * scale;
    const ox = (CW - dW) / 2 + PAD;
    const oy = (CH - dH) / 2 + PAD + LABEL_H;

    ctx.clearRect(0, 0, displayW, displayH);

    // label da chapa
    ctx.fillStyle = "#444e68";
    ctx.font = "bold 10px 'DM Mono', monospace";
    ctx.fillText(`CHAPA ${idx + 1} · ${chapa.W} × ${chapa.H} mm`, PAD, PAD + 13);

    // fundo da chapa
    ctx.fillStyle = "#0d1f14";
    ctx.strokeStyle = "#1a2035";
    ctx.lineWidth = 1;
    ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeRect(ox, oy, dW, dH);

    // grid de referência (linhas a cada 500mm)
    ctx.strokeStyle = "rgba(61,255,160,0.06)";
    ctx.lineWidth = 0.5;
    for (let gx = 500; gx < chapa.W; gx += 500) {
      const px = ox + gx * scale;
      ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + dH); ctx.stroke();
    }
    for (let gy = 500; gy < chapa.H; gy += 500) {
      const py = oy + gy * scale;
      ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + dW, py); ctx.stroke();
    }

    // mapeia produto → cor (consistente por nome)
    const prodMap = new Map<string, string>();
    let ci = 0;
    pecasRef.forEach((p) => {
      if (!prodMap.has(p.prod)) {
        prodMap.set(p.prod, CORES_PRODUTO[ci % CORES_PRODUTO.length]);
        ci++;
      }
    });

    // peças colocadas
    chapa.placed.forEach((p) => {
      const cor = prodMap.get(p.prod) || "#3dffa0";
      const px = ox + p.x * scale;
      const py = oy + p.y * scale;
      const pw = p.l * scale;
      const ph = p.a * scale;

      ctx.fillStyle = cor + "33"; // 20% alpha
      ctx.fillRect(px, py, pw, ph);

      ctx.strokeStyle = cor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, pw, ph);

      // label da peça (só se couber)
      if (pw > 30 && ph > 18) {
        ctx.fillStyle = cor;
        ctx.font = `bold ${Math.min(10, pw / 6)}px 'DM Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = p.rot
          ? `${p.a}×${p.l}`
          : `${p.l}×${p.a}`;
        ctx.fillText(label, px + pw / 2, py + ph / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
    });

    // espaços livres ≥200×200 (retalhos)
    chapa.free
      .filter((fr) => fr.l >= 200 && fr.a >= 200)
      .forEach((fr) => {
        const px = ox + fr.x * scale;
        const py = oy + fr.y * scale;
        const pw = fr.l * scale;
        const ph = fr.a * scale;

        ctx.fillStyle = "rgba(167,139,250,0.08)";
        ctx.fillRect(px, py, pw, ph);

        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);

        if (pw > 40 && ph > 16) {
          ctx.fillStyle = "#a78bfa88";
          ctx.font = "8px 'DM Mono', monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${fr.l}×${fr.a}`, px + pw / 2, py + ph / 2);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
        }
      });
  }

  // ─── RODAR OTIMIZADOR ────────────────────────────────────
  function rodar() {
    const expandidas: Peca[] = [];
    pecas.forEach((p) => {
      if (p.l > 0 && p.a > 0) {
        for (let q = 0; q < (p.qtd || 1); q++) {
          expandidas.push({ ...p, qtd: 1 });
        }
      }
    });
    if (!expandidas.length) return;

    expandidas.sort((a, b) => b.l * b.a - a.l * a.a);

    const results: ResultadoChapa[] = [];
    let rem = [...expandidas];
    let ci = 0;

    while (rem.length && ci < 15) {
      const r = guilhotina(chapaW, chapaH, rem, kerf);
      results.push({ W: chapaW, H: chapaH, ...r });
      const used = new Set(r.placed.map((p) => p.idx));
      rem = rem.filter((_, i) => !used.has(i));
      ci++;
      if (!r.placed.length) break;
    }

    setResultado(results);
    setChapaIdx(0);
    setRetalhosSalvos(false);
    setErroRetalhos(null);
  }

  // ─── RETALHOS GERADOS ────────────────────────────────────
  // Mantém referência à chapa de origem — o flatMap simples do handoff perdia isso
  const retalhosGerados: RetalhoGerado[] = resultado
    ? resultado.flatMap((chapa, ci) =>
        chapa.free
          .filter((fr) => fr.l >= 200 && fr.a >= 200)
          .map((fr) => ({ ...fr, chapaIdx: ci }))
      )
    : [];

  // nome do produto predominante para etiquetar os retalhos
  const produtoPredominante =
    pecas.find((p) => p.prod)?.prod || "Retalho";

  // ─── SALVAR RETALHOS ────────────────────────────────────
  async function salvarRetalhos() {
    if (!resultado || retalhosGerados.length === 0) return;

    setSalvandoRetalhos(true);
    setErroRetalhos(null);

    const hoje = new Date().toISOString().split("T")[0]; // date → YYYY-MM-DD

    const rows = retalhosGerados.map((fr) => ({
      produto_nome: produtoPredominante,
      largura: fr.l,
      altura: fr.a,
      m2: parseFloat(((fr.l * fr.a) / 1_000_000).toFixed(4)),
      chapa_origem: `CHAPA ${fr.chapaIdx + 1}`,
      pedido_origem: pedidoRef ?? null,
      status: "Disponível",
      dt_gerado: hoje,
    }));

    const { error } = await supabase.from("retalhos").insert(rows);

    setSalvandoRetalhos(false);

    if (error) {
      setErroRetalhos(`Erro ao salvar: ${error.message}`);
    } else {
      setRetalhosSalvos(true);
    }
  }

  // ─── HELPERS UI ──────────────────────────────────────────
  function addPeca() {
    setPecas((p) => [...p, { l: 0, a: 0, qtd: 1, prod: produtos[0]?.nome || "" }]);
  }

  function remPeca(i: number) {
    setPecas((p) => p.filter((_, idx) => idx !== i));
  }

  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas((p) =>
      p.map((pc, idx) => (idx === i ? { ...pc, [field]: value } : pc))
    );
  }

  function aplicarChapaPadrao(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = parseInt(e.target.value);
    if (isNaN(v)) return;
    const c = CHAPAS_PADRAO[v];
    setChapaW(c.w);
    setChapaH(c.h);
  }

  // ── stats ──
  const totalPecas = pecas.reduce((s, p) => s + (p.qtd || 1), 0);
  const totalChapas = resultado?.length ?? 0;
  const totalPlaced = resultado?.reduce((s, r) => s + r.placed.length, 0) ?? 0;
  const eficiencia =
    resultado && resultado.length > 0
      ? pecas.reduce((s, p) => s + p.l * p.a * p.qtd, 0) /
        (resultado.length * chapaW * chapaH)
      : null;

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="pw" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {pedidoRef && (
            <a
              href={`/pedidos/${pedidoRef}`}
              className="btn btn-ghost"
              style={{ fontSize: "12px", gap: "6px" }}
            >
              ← Voltar ao Pedido
            </a>
          )}
          <h1 style={{ fontFamily: "var(--font-syne)", fontSize: "18px", fontWeight: 700, flex: 1 }}>
            ◈ Otimizador de Corte
          </h1>
          {pedidoRef && (
            <span className="chip chip-blue" style={{ fontSize: "11px" }}>
              Pedido {pedidoRef}
            </span>
          )}
        </div>

        {/* grid principal */}
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "16px", alignItems: "start" }}>

          {/* coluna esquerda — inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* chapa */}
            <div className="card" style={{ padding: "16px" }}>
              <p className="label" style={{ marginBottom: "10px" }}>Chapa</p>

              <select className="input" onChange={aplicarChapaPadrao} style={{ marginBottom: "10px" }}>
                {CHAPAS_PADRAO.map((c, i) => (
                  <option key={i} value={i}>{c.label}</option>
                ))}
                <option value={-1}>Personalizado</option>
              </select>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div>
                  <p className="label" style={{ marginBottom: "4px" }}>Largura</p>
                  <input
                    type="number"
                    className="input"
                    value={chapaW}
                    onChange={(e) => setChapaW(Number(e.target.value))}
                  />
                </div>
                <div>
                  <p className="label" style={{ marginBottom: "4px" }}>Altura</p>
                  <input
                    type="number"
                    className="input"
                    value={chapaH}
                    onChange={(e) => setChapaH(Number(e.target.value))}
                  />
                </div>
                <div>
                  <p className="label" style={{ marginBottom: "4px" }}>Kerf (mm)</p>
                  <input
                    type="number"
                    className="input"
                    value={kerf}
                    onChange={(e) => setKerf(Number(e.target.value))}
                    min={0}
                    max={10}
                  />
                </div>
              </div>
            </div>

            {/* peças */}
            <div className="card" style={{ padding: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <p className="label">Peças ({totalPecas})</p>
                <button className="btn btn-ghost" style={{ fontSize: "11px", padding: "4px 10px" }} onClick={addPeca}>
                  + Adicionar
                </button>
              </div>

              {carregando && (
                <p style={{ color: "var(--t3)", fontSize: "12px", textAlign: "center", padding: "12px" }}>
                  Carregando peças do pedido...
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
                {pecas.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 28px", gap: "6px", alignItems: "center" }}>
                    <input
                      type="number"
                      className="input"
                      placeholder="Larg."
                      value={p.l || ""}
                      onChange={(e) => updPeca(i, "l", Number(e.target.value))}
                    />
                    <input
                      type="number"
                      className="input"
                      placeholder="Alt."
                      value={p.a || ""}
                      onChange={(e) => updPeca(i, "a", Number(e.target.value))}
                    />
                    <input
                      type="number"
                      className="input"
                      placeholder="Qtd"
                      value={p.qtd}
                      min={1}
                      onChange={(e) => updPeca(i, "qtd", Number(e.target.value))}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px", color: "var(--err)", fontSize: "13px" }}
                      onClick={() => remPeca(i)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* botão rodar */}
            <button
              className="btn btn-primary"
              onClick={rodar}
              style={{ width: "100%", padding: "12px" }}
            >
              ◈ Calcular Otimização
            </button>

            {/* stats */}
            {resultado && (
              <div className="card" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="label">Chapas usadas</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--t1)" }}>{totalChapas}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="label">Peças alocadas</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--t1)" }}>{totalPlaced}</span>
                </div>
                {eficiencia !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label">Eficiência</span>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      color: eficiencia >= 0.8 ? "var(--ok)" : eficiencia >= 0.6 ? "var(--warn)" : "var(--err)"
                    }}>
                      {formatPercent(eficiencia)}
                    </span>
                  </div>
                )}
                {retalhosGerados.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="label">Retalhos ≥200×200</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "#a78bfa" }}>
                      {retalhosGerados.length} espaço{retalhosGerados.length > 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* botão salvar retalhos — só aparece quando há resultado e pedido */}
            {resultado && retalhosGerados.length > 0 && pedidoRef && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  className="btn"
                  onClick={salvarRetalhos}
                  disabled={salvandoRetalhos || retalhosSalvos}
                  style={{
                    width: "100%",
                    padding: "11px",
                    background: retalhosSalvos ? "var(--ok)" : "rgba(167,139,250,0.15)",
                    border: "1px solid",
                    borderColor: retalhosSalvos ? "var(--ok)" : "#a78bfa",
                    color: retalhosSalvos ? "#fff" : "#a78bfa",
                    cursor: retalhosSalvos ? "default" : "pointer",
                    borderRadius: "var(--r)",
                    fontWeight: 600,
                    fontSize: "13px",
                    transition: "all .2s",
                  }}
                >
                  {salvandoRetalhos
                    ? "Salvando..."
                    : retalhosSalvos
                    ? `✓ ${retalhosGerados.length} retalho${retalhosGerados.length > 1 ? "s" : ""} salvo${retalhosGerados.length > 1 ? "s" : ""}`
                    : `◧ Salvar ${retalhosGerados.length} retalho${retalhosGerados.length > 1 ? "s" : ""} no estoque`}
                </button>

                {erroRetalhos && (
                  <p style={{ fontSize: "11px", color: "var(--err)", textAlign: "center" }}>
                    {erroRetalhos}
                  </p>
                )}

                {!retalhosSalvos && (
                  <p style={{ fontSize: "10px", color: "var(--t3)", textAlign: "center" }}>
                    Espaços livres ≥ 200×200 mm serão salvos em /retalhos vinculados a {pedidoRef}
                  </p>
                )}
              </div>
            )}

            {/* aviso quando há retalhos mas não veio de pedido */}
            {resultado && retalhosGerados.length > 0 && !pedidoRef && (
              <p style={{ fontSize: "11px", color: "var(--t3)", textAlign: "center", lineHeight: 1.4 }}>
                {retalhosGerados.length} retalho{retalhosGerados.length > 1 ? "s" : ""} identificado{retalhosGerados.length > 1 ? "s" : ""}.
                Para salvar no estoque, acesse o otimizador a partir de um pedido.
              </p>
            )}
          </div>

          {/* coluna direita — canvas + navegação */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

            {/* navegação entre chapas */}
            {resultado && resultado.length > 1 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {resultado.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setChapaIdx(i)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "11px",
                      padding: "4px 10px",
                      background: chapaIdx === i ? "rgba(61,255,160,0.1)" : undefined,
                      borderColor: chapaIdx === i ? "var(--acc)" : undefined,
                      color: chapaIdx === i ? "var(--acc)" : undefined,
                    }}
                  >
                    Chapa {i + 1}
                  </button>
                ))}
              </div>
            )}

            {/* canvas */}
            <div
              className="card"
              style={{
                padding: "0",
                overflow: "hidden",
                minHeight: "480px",
                position: "relative",
                background: "var(--surf)",
              }}
            >
              {!resultado && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--t3)", fontSize: "13px", flexDirection: "column", gap: "8px"
                }}>
                  <span style={{ fontSize: "32px" }}>◈</span>
                  <span>Configure as peças e clique em Calcular</span>
                </div>
              )}
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "480px", display: "block" }}
              />
            </div>

            {/* legenda */}
            {resultado && (
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", paddingLeft: "4px" }}>
                {Array.from(new Set(pecas.map((p) => p.prod))).map((prod, i) => (
                  <div key={prod} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{
                      width: "10px", height: "10px", borderRadius: "2px",
                      background: CORES_PRODUTO[i % CORES_PRODUTO.length],
                    }} />
                    <span style={{ fontSize: "11px", color: "var(--t2)" }}>{prod || "—"}</span>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "2px",
                    background: "#a78bfa", border: "1px dashed #a78bfa"
                  }} />
                  <span style={{ fontSize: "11px", color: "var(--t2)" }}>Retalho aproveitável</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ──────────────────────────────────────────────────────────
// EXPORT PRINCIPAL COM SUSPENSE
// ──────────────────────────────────────────────────────────
export default function OtimizadorPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <OtimizadorContent />
    </Suspense>
  );
}