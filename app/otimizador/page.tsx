"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
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
        if (s < best) {
          best = s;
          bR = fr;
          bI = fi;
          rot = false;
        }
      }

      if (peca.a <= fr.l && peca.l <= fr.a) {
        const s = Math.min(fr.l - peca.a, fr.a - peca.l);
        if (s < best) {
          best = s;
          bR = fr;
          bI = fi;
          rot = true;
        }
      }
    });

    if (!bR || bI === -1) return;

    const fr = bR as EspacoLivre;
    const pl = rot ? peca.a : peca.l;
    const pa = rot ? peca.l : peca.a;

    placed.push({
      x: fr.x,
      y: fr.y,
      l: pl,
      a: pa,
      idx,
      prod: peca.prod,
      rot,
    });

    const nr: EspacoLivre[] = [];

    if (fr.l - (pl + kerf) >= 100) {
      nr.push({
        x: fr.x + pl + kerf,
        y: fr.y,
        l: fr.l - (pl + kerf),
        a: pa,
      });
    }

    if (fr.a - (pa + kerf) >= 100) {
      nr.push({
        x: fr.x,
        y: fr.y + pa + kerf,
        l: fr.l,
        a: fr.a - (pa + kerf),
      });
    }

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

// ──────────────────────────────────────────────────────────
// COMPONENTE INTERNO
// ──────────────────────────────────────────────────────────
function OtimizadorContent() {
  const searchParams = useSearchParams();
  const pedidoParam = searchParams.get("pedido");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([
    { l: 0, a: 0, qtd: 1, prod: "" },
  ]);

  const [chapaW, setChapaW] = useState(3210);
  const [chapaH, setChapaH] = useState(2250);
  const [kerf, setKerf] = useState(3);

  const [resultado, setResultado] = useState<ResultadoChapa[] | null>(null);

  const [chapaIdx, setChapaIdx] = useState(0);
  const [pedidoRef, setPedidoRef] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    supabase
      .from("produtos")
      .select("*")
      .eq("ativo", true)
      .then(({ data }) => {
        setProdutos((data as Produto[]) || []);

        if (data && data.length > 0 && !pedidoParam) {
          setPecas([
            {
              l: 0,
              a: 0,
              qtd: 1,
              prod: data[0].nome,
            },
          ]);
        }
      });
  }, []);

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

  useEffect(() => {
    if (resultado && resultado[chapaIdx]) {
      desenhar(resultado[chapaIdx], chapaIdx);
    }
  }, [resultado, chapaIdx]);

  function addPeca() {
    setPecas((p) => [
      ...p,
      {
        l: 0,
        a: 0,
        qtd: 1,
        prod: produtos[0]?.nome || "",
      },
    ]);
  }

  function remPeca(i: number) {
    setPecas((p) => p.filter((_, idx) => idx !== i));
  }

  function updPeca(i: number, field: keyof Peca, value: string | number) {
    setPecas((p) =>
      p.map((pc, idx) =>
        idx === i
          ? {
              ...pc,
              [field]: value,
            }
          : pc
      )
    );
  }

  function rodar() {
    const expandidas: Peca[] = [];

    pecas.forEach((p) => {
      if (p.l > 0 && p.a > 0) {
        for (let q = 0; q < (p.qtd || 1); q++) {
          expandidas.push({
            ...p,
            qtd: 1,
          });
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

      results.push({
        W: chapaW,
        H: chapaH,
        ...r,
      });

      const used = new Set(r.placed.map((p) => p.idx));

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

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const displayW = canvas.offsetWidth;
    const displayH = canvas.offsetHeight;

    canvas.width = displayW * dpr;
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
    ctx.font = "bold 9px monospace";

    ctx.fillText(
      `CHAPA ${idx + 1} · ${chapa.W} × ${chapa.H} mm`,
      PAD,
      PAD + 11
    );

    ctx.fillStyle = "#0d1f14";
    ctx.fillRect(ox, oy, dW, dH);
  }

  return (
    <AppLayout>
      <div style={{ padding: "20px" }}>
        <button onClick={rodar}>Rodar Otimizador</button>

        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "400px",
            marginTop: "20px",
          }}
        />
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