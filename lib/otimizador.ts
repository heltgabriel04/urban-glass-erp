// ============================================================
// lib/otimizador.ts — Algoritmo de otimização de corte de vidro
// Funções puras (sem React/estado), extraídas de app/otimizador/page.tsx
// para permitir reuso e testes.
// ============================================================
import { CHAPAS_PADRAO, PRODUTO_CHAPA } from "@/lib/chapas";

export interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
export interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
export interface EspacoLivre { x: number; y: number; l: number; a: number; }
export interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; retalhoId?: string; }
export interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }

// Algoritmo de guilhotina em 2 estágios (strip-packing):
// 1° corte: horizontal por toda a largura → separa faixas
// 2° corte: vertical dentro de cada faixa → peças individuais
// Reflete o fluxo real de corte em vidro pesado.
//
// Empacota numa ÚNICA chapa, respeitando a ordem de colocação recebida (`ordem`).
// Usa Best-Fit: cada peça vai para a faixa que desperdiça MENOS altura (encaixe
// mais justo), testando as duas orientações. Só abre faixa nova se não couber.
export function empacotarOrdem(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number,
  ordem: number[]
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  type Strip = { y: number; h: number; xUsed: number };

  const placed: PecaPlacada[] = [];
  const usados  = new Set<number>();
  const strips: Strip[] = [];
  let   bottomY = 0;

  for (const origIdx of ordem) {
    const peca = pecas[origIdx];

    // Ambas as orientações que cabem na largura da chapa (rotaciona pra melhor encaixe)
    const oris = [
      { pl: peca.l, pa: peca.a, rot: false as boolean },
      { pl: peca.a, pa: peca.l, rot: true  as boolean },
    ].filter(o => o.pl <= W);

    if (oris.length === 0) continue;

    // ── Best-Fit: melhor faixa existente (menor sobra de altura, depois menor sobra de largura) ──
    let best: { strip: Strip; pl: number; pa: number; rot: boolean; x: number; waste: number; leftW: number } | null = null;
    for (const strip of strips) {
      for (const ori of oris) {
        if (ori.pa > strip.h) continue;                         // não cabe na altura da faixa
        const x = strip.xUsed > 0 ? strip.xUsed + kerf : 0;
        if (x + ori.pl > W) continue;                           // não cabe na largura restante
        const waste = strip.h - ori.pa;                         // altura desperdiçada na faixa
        const leftW = W - (x + ori.pl);                         // largura restante após a peça
        if (!best || waste < best.waste || (waste === best.waste && leftW < best.leftW)) {
          best = { strip, pl: ori.pl, pa: ori.pa, rot: ori.rot, x, waste, leftW };
        }
      }
    }

    if (best) {
      placed.push({ x: best.x, y: best.strip.y, l: best.pl, a: best.pa,
        idx: origIdx, prod: peca.prod, rot: best.rot, pedidoId: peca.pedidoId });
      usados.add(origIdx);
      best.strip.xUsed = best.x + best.pl;
      continue;
    }

    // ── Abre nova faixa (novo corte longitudinal) ──
    // Prefere a orientação mais baixa que ainda caiba na altura restante da chapa.
    const y = strips.length > 0 ? bottomY + kerf : 0;
    const chosen = [...oris].sort((a, b) => a.pa - b.pa).find(o => y + o.pa <= H);
    if (!chosen) continue;

    placed.push({ x: 0, y, l: chosen.pl, a: chosen.pa,
      idx: origIdx, prod: peca.prod, rot: chosen.rot, pedidoId: peca.pedidoId });
    usados.add(origIdx);
    strips.push({ y, h: chosen.pa, xUsed: chosen.pl });
    bottomY = y + chosen.pa;
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

// Empacota numa única chapa testando VÁRIAS ordens de colocação e fica com a melhor
// (maior área aproveitada, desempate por mais peças). Explora a "melhor possibilidade"
// em vez de depender de uma única heurística fixa.
export function empacotar(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  const base = pecas.map((_, i) => i);
  const orderings: number[][] = [
    [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)), // menor lado ↓
    [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)), // maior lado ↓
    [...base].sort((a, b) => pecas[b].a - pecas[a].a),                                             // altura ↓
    [...base].sort((a, b) => pecas[b].l - pecas[a].l),                                             // largura ↓
    [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),               // área ↓
  ];

  let melhor: ReturnType<typeof empacotarOrdem> | null = null;
  let melhorArea = -1, melhorQtd = -1;
  for (const ordem of orderings) {
    const r = empacotarOrdem(W, H, pecas, kerf, ordem);
    const area = r.placed.reduce((s, p) => s + p.l * p.a, 0);
    const qtd  = r.placed.length;
    if (area > melhorArea || (area === melhorArea && qtd > melhorQtd)) {
      melhor = r; melhorArea = area; melhorQtd = qtd;
    }
  }
  return melhor ?? { placed: [], usados: new Set<number>(), free: [] };
}

// Calcula aproveitamento de um conjunto de peças (sem estado React)
export function calcAproveitamento(
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
