"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { supabase } from "@/lib/supabase/client";
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
  isRet?: boolean;
}

interface RetalhoGerado extends EspacoLivre {
  chapaIdx: number;
  prod: string;
  m2: number;
}

// ─── ALGORITMO GUILHOTINA — NÃO ALTERAR ──────────────────
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
    let best = Infinity, bR: EspacoLivre | null = null, bI = -1, rot = false;

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

const COLS_PECA = [
  "#1f4d32","#173d26","#255c3b","#1a4530",
  "#204228","#2a5c3f","#1e3a2a","#18402e",
];

// ─── COMPONENTE INTERNO ───────────────────────────────────
function OtimizadorContent() {
  const searchParams = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([{ l: 0, a: 0, qtd: 1, prod: "" }]);

  const [chapaW, setChapaW] = useState(3210);
  const [chapaH, setChapaH] = useState(2250);
  const [kerf, setKerf] = useState(4);
  const [bord, setBord] = useState(3);

  const [resultado, setResultado] = useState<ResultadoChapa[] | null>(null);
  const [chapaIdx, setChapaIdx] = useState(0);
  const [pedidoRef, setPedidoRef] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // stats
  const [statAprov, setStatAprov] = useState("—");
  const [statPerda, setStatPerda] = useState("—");
  const [statChapas, setStatChapas] = useState("—");
  const [statRetalhos, setStatRetalhos] = useState("—");
  const [msg, setMsg] = useState("");

  // retalhos gerados
  const [retalhosGerados, setRetalhosGerados] = useState<RetalhoGerado[]>([]);
  const [mostrarCardRet, setMostrarCardRet] = useState(false);
  const [salvandoRetalhos, setSalvandoRetalhos] = useState(false);
  const [retalhosSalvos, setRetalhosSalvos] = useState(false);
  const [erroRetalhos, setErroRetalhos] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultadoRef = useRef<ResultadoChapa[] | null>(null);

  // ── produtos ──
  useEffect(() => {
    supabase.from("produtos").select("*").eq("ativo", true).then(({ data }) => {
      const prods = (data as Produto[]) || [];
      setProdutos(prods);
      if (prods.length > 0 && !pedidoParam) {
        setPecas([{ l: 0, a: 0, qtd: 1, prod: prods[0].nome }]);
      }
    });
  }, []);

  // ── pedido via URL ──
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
          if (map.has(key)) map.get(key)!.qtd += item.quantidade;
          else map.set(key, { l: item.largura, a: item.altura, qtd: item.quantidade, prod: item.produto_nome });
        });
        setPecas(Array.from(map.values()));
        setPedidoRef(pedidoParam);
      });
  }, [pedidoParam]);

  // ── redesenha ──
  useEffect(() => {
    if (resultado && resultado[chapaIdx]) {
      drawOpt(resultado[chapaIdx], chapaIdx, bord);
    }
  }, [resultado, chapaIdx]);

  // ── DESENHAR ──────────────────────────────────────────────
  function drawOpt(r: ResultadoChapa, idx: number, bordMm: number) {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = cv.offsetWidth;
    const displayH = cv.offsetHeight;
    cv.width = displayW * dpr;
    cv.height = displayH * dpr;
    ctx.scale(dpr, dpr);

    const CW = displayW - 14;
    const CH = displayH - 14;
    const scale = Math.min(CW / r.W, CH / r.H);
    const dW = r.W * scale;
    const dH = r.H * scale;
    const ox = (CW - dW) / 2 + 7;
    const oy = (CH - dH) / 2 + 7;

    ctx.clearRect(0, 0, displayW, displayH);

    // fundo chapa
    ctx.fillStyle = r.isRet ? "#0b1a2a" : "#0a1710";
    ctx.fillRect(ox, oy, dW, dH);
    ctx.strokeStyle = r.isRet ? "#1a4060" : "#1a4028";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, dW, dH);

    // borda lapidação
    if (bordMm > 0) {
      const bs = bordMm * scale;
      ctx.fillStyle = "rgba(255,107,53,0.12)";
      ctx.fillRect(ox, oy, dW, bs);
      ctx.fillRect(ox, oy + dH - bs, dW, bs);
      ctx.fillRect(ox, oy, bs, dH);
      ctx.fillRect(ox + dW - bs, oy, bs, dH);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(255,107,53,0.35)";
      ctx.lineWidth = 0.6;
      ctx.strokeRect(ox + bs, oy + bs, dW - bs * 2, dH - bs * 2);
      ctx.setLineDash([]);
    }

    // label
    ctx.fillStyle = "#444e68";
    ctx.font = "9px 'DM Mono', monospace";
    ctx.fillText(
      (r.isRet ? "RETALHO " : "CHAPA ") + (idx + 1) + " · " + r.W + "×" + r.H + "mm",
      ox, oy - 3
    );

    // peças
    r.placed.forEach((p, i) => {
      const px = ox + (p.x + bordMm) * scale;
      const py = oy + (p.y + bordMm) * scale;
      const pw = p.l * scale;
      const ph = p.a * scale;
      ctx.fillStyle = COLS_PECA[i % COLS_PECA.length];
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = "rgba(61,255,160,.45)";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(px, py, pw, ph);
      if (pw > 35 && ph > 18) {
        ctx.fillStyle = "rgba(200,255,230,.88)";
        ctx.font = `${Math.max(7, Math.min(10, pw / 8))}px 'DM Sans', sans-serif`;
        ctx.fillText(p.l + "×" + p.a, px + 3, py + 11);
        if (ph > 23 && pw > 55) {
          ctx.font = "7px 'DM Mono', monospace";
          ctx.fillStyle = "rgba(150,220,180,.7)";
          ctx.fillText(((p.l * p.a) / 1e6).toFixed(3) + "m²", px + 3, py + 20);
        }
      }
    });

    // free rects
    r.free.forEach((fr) => {
      const isLg = fr.l >= 200 && fr.a >= 200;
      const fx = ox + (fr.x + bordMm) * scale;
      const fy = oy + (fr.y + bordMm) * scale;
      const fw = fr.l * scale;
      const fh = fr.a * scale;
      ctx.fillStyle = isLg ? "rgba(0,200,255,.05)" : "rgba(255,255,255,.015)";
      ctx.fillRect(fx, fy, fw, fh);
      if (isLg && fw > 18 && fh > 12) {
        ctx.fillStyle = "rgba(0,200,255,.4)";
        ctx.font = "9px 'DM Mono', monospace";
        ctx.fillText("↺", fx + 3, fy + 10);
      }
    });
  }

  // ── RODAR ────────────────────────────────────────────────
  function rodar() {
    const tipoProd = pecas.find((p) => p.prod)?.prod || "Retalho";
    let expandidas: Peca[] = [];
    pecas.forEach((p) => {
      if (p.l > 0 && p.a > 0) {
        for (let q = 0; q < (p.qtd || 1); q++) expandidas.push({ ...p, qtd: 1 });
      }
    });
    if (!expandidas.length) return;
    expandidas.sort((a, b) => b.l * b.a - a.l * a.a);

    const results: ResultadoChapa[] = [];
    let rem = [...expandidas];
    let ci = 0;

    while (rem.length && ci < 15) {
      const r = guilhotina(chapaW - bord * 2, chapaH - bord * 2, rem, kerf);
      results.push({ W: chapaW, H: chapaH, ...r });
      const used = new Set(r.placed.map((p) => p.idx));
      rem = rem.filter((_, i) => !used.has(i));
      ci++;
      if (!r.placed.length) break;
    }

    resultadoRef.current = results;
    setResultado(results);
    setChapaIdx(0);
    setRetalhosSalvos(false);
    setErroRetalhos(null);

    // stats
    let totA = 0, usedA = 0;
    results.forEach((r) => {
      totA += r.W * r.H;
      r.placed.forEach((p) => (usedA += p.l * p.a));
    });
    const aprov = totA > 0 ? (usedA / totA) * 100 : 0;
    const perda = 100 - aprov;
    setStatAprov(aprov.toFixed(2) + "%");
    setStatPerda(perda.toFixed(2) + "%");
    setStatChapas(String(results.length));

    // retalhos gerados
    const retPend: RetalhoGerado[] = [];
    results.forEach((r, ri) => {
      r.free
        .filter((fr) => fr.l >= 200 && fr.a >= 200)
        .forEach((fr) => {
          retPend.push({
            ...fr,
            chapaIdx: ri,
            prod: tipoProd,
            m2: parseFloat(((fr.l * fr.a) / 1e6).toFixed(4)),
          });
        });
    });

    setRetalhosGerados(retPend);
    setStatRetalhos(String(retPend.length));
    setMostrarCardRet(retPend.length > 0);

    const totalPecas = expandidas.length;
    const totalPlaced = results.reduce((s, r) => s + r.placed.length, 0);
    const naoCouberam = totalPecas - totalPlaced;
    setMsg(
      `${totalPecas} peças · ${results.length} superfície(s) · ${naoCouberam > 0 ? naoCouberam + " não couberam" : "Todas alocadas!"}`
    );
  }

  // ── SALVAR RETALHOS ──────────────────────────────────────
  async function salvarRetalhos() {
    if (retalhosGerados.length === 0) return;
    setSalvandoRetalhos(true);
    setErroRetalhos(null);

    const hoje = new Date().toISOString().split("T")[0];
    const rows = retalhosGerados.map((fr) => ({
      produto_nome: fr.prod,
      largura: fr.l,
      altura: fr.a,
      m2: fr.m2,
      chapa_origem: `CHAPA ${fr.chapaIdx + 1}`,
      pedido_origem: pedidoRef ?? null,
      status: "Disponível",
      dt_gerado: hoje,
    }));

    const { error } = await supabase.from("retalhos").insert(rows);
    setSalvandoRetalhos(false);
    if (error) {
      setErroRetalhos(`Erro: ${error.message}`);
    } else {
      setRetalhosSalvos(true);
      setMostrarCardRet(false);
    }
  }

  // ── HELPERS ──────────────────────────────────────────────
  function addPeca() {
    setPecas((p) => [...p, { l: 0, a: 0, qtd: 1, prod: produtos[0]?.nome || "" }]);
  }
  function remPeca(i: number) {
    setPecas((p) => p.filter((_, idx) => idx !== i));
  }
  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas((p) => p.map((pc, idx) => (idx === i ? { ...pc, [field]: value } : pc)));
  }
  function aplicarChapaPadrao(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v < 0) return;
    setChapaW(CHAPAS_PADRAO[v].w);
    setChapaH(CHAPAS_PADRAO[v].h);
  }

  // ── RENDER ───────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="con">
        {/* toolbar voltar */}
        {pedidoRef && (
          <div style={{ marginBottom: "14px", display: "flex", alignItems: "center", gap: "10px" }}>
            <a href={`/pedidos/${pedidoRef}`} className="btn bg sm">← Voltar ao Pedido</a>
            <span style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "var(--font-mono)" }}>
              Otimizando pedido {pedidoRef}
            </span>
          </div>
        )}

        <div className="g2" style={{ alignItems: "start", gap: "14px" }}>

          {/* ── COL ESQUERDA ── */}
          <div>
            {/* Configuração da Chapa */}
            <div className="card mb14">
              <div className="ct">Configuração da Chapa</div>
              <div className="fr">
                <div className="fg">
                  <label className="fl">Tipo de Chapa</label>
                  <select className="fc" onChange={aplicarChapaPadrao}>
                    {CHAPAS_PADRAO.map((c, i) => (
                      <option key={i} value={i}>{c.label}</option>
                    ))}
                    <option value={-1}>Personalizado</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Folga do Corte / Diamante (mm)</label>
                  <input
                    type="number" className="fc" value={kerf} min={0} max={20}
                    onChange={(e) => setKerf(Number(e.target.value))}
                  />
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
                  <label className="fl">Perda de Borda Lapidação (mm)</label>
                  <input
                    type="number" className="fc" value={bord} min={0} max={30}
                    onChange={(e) => setBord(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Peças */}
            <div className="card">
              <div className="ct">
                Peças a Cortar
                <button className="btn bp sm" onClick={rodar}>◈ Calcular</button>
              </div>

              {carregando && (
                <div style={{ textAlign: "center", color: "var(--t3)", fontSize: "12px", padding: "14px", fontFamily: "var(--font-mono)" }}>
                  Carregando peças do pedido...
                </div>
              )}

              <div id="opt-pecas">
                {pecas.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--t3)", fontSize: "12px", padding: "14px", fontFamily: "var(--font-mono)" }}>
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
                        <select
                          className="fc" style={{ fontSize: "11px" }} value={p.prod}
                          onChange={(e) => updPeca(i, "prod", e.target.value)}
                        >
                          {produtos.map((pr) => (
                            <option key={pr.id} value={pr.nome}>{pr.nome}</option>
                          ))}
                        </select>
                      </div>
                      <div className="fg" style={{ margin: 0 }}>
                        <label className="fl" style={{ fontSize: "9px" }}>Largura (mm)</label>
                        <input
                          type="number" className="fc" style={{ fontSize: "12px" }}
                          value={p.l || ""} placeholder="1200"
                          onChange={(e) => updPeca(i, "l", Number(e.target.value))}
                        />
                      </div>
                      <div className="fg" style={{ margin: 0 }}>
                        <label className="fl" style={{ fontSize: "9px" }}>Altura (mm)</label>
                        <input
                          type="number" className="fc" style={{ fontSize: "12px" }}
                          value={p.a || ""} placeholder="800"
                          onChange={(e) => updPeca(i, "a", Number(e.target.value))}
                        />
                      </div>
                      <div className="fg" style={{ margin: 0 }}>
                        <label className="fl" style={{ fontSize: "9px" }}>Qtd</label>
                        <input
                          type="number" className="fc" style={{ fontSize: "12px" }}
                          value={p.qtd} min={1}
                          onChange={(e) => updPeca(i, "qtd", Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button className="add-il" onClick={addPeca}>＋ Adicionar peça</button>
            </div>
          </div>

          {/* ── COL DIREITA ── */}
          <div>
            {/* Resultado */}
            <div className="card mb14">
              <div className="ct">
                Resultado da Otimização
                {resultado && retalhosSalvos && (
                  <span style={{ fontSize: "11px", color: "var(--ok)", fontFamily: "var(--font-mono)" }}>
                    ✓ Retalhos salvos
                  </span>
                )}
              </div>

              {/* stats */}
              <div className="rs">
                <div className="rsi">
                  <div className="rsv" style={{ color: "var(--acc)" }}>{statAprov}</div>
                  <div className="rsl">Aproveitamento</div>
                </div>
                <div className="rsi">
                  <div className="rsv" style={{ color: "var(--err)" }}>{statPerda}</div>
                  <div className="rsl">Perda</div>
                </div>
                <div className="rsi">
                  <div className="rsv">{statChapas}</div>
                  <div className="rsl">Chapas</div>
                </div>
                <div className="rsi">
                  <div className="rsv" style={{ color: "var(--acc2)" }}>{statRetalhos}</div>
                  <div className="rsl">Retalhos Gerados</div>
                </div>
              </div>

              {msg && (
                <div style={{ fontSize: "11px", color: "var(--t3)", fontFamily: "var(--font-mono)", marginBottom: "10px" }}>
                  {msg}
                </div>
              )}

              {/* tabs chapas */}
              {resultado && resultado.length > 1 && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "9px" }}>
                  {resultado.map((_, i) => (
                    <button
                      key={i}
                      className="btn bg sm"
                      onClick={() => setChapaIdx(i)}
                      style={chapaIdx === i ? { borderColor: "var(--acc)", color: "var(--acc)" } : {}}
                    >
                      Chapa {i + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* canvas */}
              <div className="cvw">
                <div className="cvi" id="opt-cvi">
                  {!resultado ? "Configure peças e calcule" : `Chapa ${chapaIdx + 1} · ${resultado[chapaIdx]?.placed.length || 0} peças`}
                </div>
                <canvas
                  ref={canvasRef}
                  width={554}
                  height={365}
                  style={{ display: "block", width: "100%", height: "365px" }}
                />
              </div>

              {/* legenda */}
              <div className="cvleg">
                <div className="cvli"><div className="cvld" style={{ background: "#1f4d32" }} />Peça cortada</div>
                <div className="cvli"><div className="cvld" style={{ background: "#3a1a08", opacity: 0.7 }} />Perda borda</div>
                <div className="cvli"><div className="cvld" style={{ background: "#1a1a2a" }} />Descarte</div>
              </div>
            </div>

            {/* Card retalhos gerados */}
            {mostrarCardRet && (
              <div className="card">
                <div className="ct">Retalhos Gerados — Rastreabilidade</div>
                <div>
                  {retalhosGerados.map((r, i) => (
                    <div key={i} className="sr">
                      <div className="sl">
                        Retalho {i + 1} — {r.prod}
                        <small>{r.l}×{r.a}mm · {r.m2} m² · Chapa {r.chapaIdx + 1}</small>
                      </div>
                      <span className="rtag">↺ Reutilizável</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="btn bp sm"
                    onClick={salvarRetalhos}
                    disabled={salvandoRetalhos}
                  >
                    {salvandoRetalhos ? "Salvando..." : "✓ Salvar Retalhos"}
                  </button>
                  <button
                    className="btn bg sm"
                    onClick={() => setMostrarCardRet(false)}
                  >
                    Descartar
                  </button>
                  {!pedidoRef && (
                    <span style={{ fontSize: "10px", color: "var(--warn)", fontFamily: "var(--font-mono)" }}>
                      ⚠ Sem pedido vinculado — pedido_origem será nulo
                    </span>
                  )}
                  {erroRetalhos && (
                    <span style={{ fontSize: "10px", color: "var(--err)" }}>{erroRetalhos}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ── EXPORT COM SUSPENSE ───────────────────────────────────
export default function OtimizadorPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <OtimizadorContent />
    </Suspense>
  );
}