// ============================================================
// lib/otimizador.ts — Algoritmo de otimização de corte de vidro
// ============================================================
import { CHAPAS_PADRAO, PRODUTO_CHAPA } from "@/lib/chapas";

export interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
export interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
export interface EspacoLivre { x: number; y: number; l: number; a: number; }
export interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; retalhoId?: string; }
export interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }

// ── Primitivas MAXRECTS ────────────────────────────────────────────────────────

interface MRect { x: number; y: number; l: number; a: number; }

function mrOverlap(r1: MRect, r2: MRect): boolean {
  return r1.x < r2.x + r2.l && r1.x + r1.l > r2.x &&
         r1.y < r2.y + r2.a && r1.y + r1.a > r2.y;
}

function mrSplit(fr: MRect, used: MRect): MRect[] {
  if (!mrOverlap(fr, used)) return [fr];
  const out: MRect[] = [];
  if (used.x > fr.x)                 out.push({ x: fr.x,          y: fr.y, l: used.x - fr.x,                   a: fr.a });
  if (used.x + used.l < fr.x + fr.l) out.push({ x: used.x + used.l, y: fr.y, l: fr.x + fr.l - used.x - used.l, a: fr.a });
  if (used.y > fr.y)                 out.push({ x: fr.x, y: fr.y,           l: fr.l, a: used.y - fr.y });
  if (used.y + used.a < fr.y + fr.a) out.push({ x: fr.x, y: used.y + used.a, l: fr.l, a: fr.y + fr.a - used.y - used.a });
  return out;
}

function mrContains(outer: MRect, inner: MRect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y &&
         outer.x + outer.l >= inner.x + inner.l && outer.y + outer.a >= inner.y + inner.a;
}

function mrPrune(rects: MRect[]): MRect[] {
  return rects.filter((r1, i) => !rects.some((r2, j) => i !== j && mrContains(r2, r1)));
}

function mrFreeRects(freeRects: MRect[]): EspacoLivre[] {
  const candidates = freeRects
    .filter(fr => fr.l >= 200 && fr.a >= 200)
    .sort((a, b) => (b.l * b.a) - (a.l * a.a));
  const selected: MRect[] = [];
  for (const fr of candidates) {
    if (!selected.some(s => mrOverlap(s, fr))) selected.push(fr);
  }
  return selected.map(fr => ({ x: fr.x, y: fr.y, l: fr.l, a: fr.a }));
}

// Coloca uma peça num conjunto de retângulos livres (BSSF), retorna score e posição.
// Retorna null se a peça não cabe em nenhum retângulo.
function mrBestFit(
  freeRects: MRect[],
  pl: number, pa: number
): { fr: MRect; score: number } | null {
  let best: { fr: MRect; score: number } | null = null;
  for (const fr of freeRects) {
    if (pl > fr.l || pa > fr.a) continue;
    const shortSide = Math.min(fr.l - pl, fr.a - pa);
    const longSide  = Math.max(fr.l - pl, fr.a - pa);
    const score = shortSide * 1_000_000 + longSide;
    if (best === null || score < best.score) best = { fr, score };
  }
  return best;
}

// Coloca uma peça e atualiza os retângulos livres da chapa.
function mrPlace(freeRects: MRect[], fr: MRect, pl: number, pa: number, kerf: number, W: number, H: number): MRect[] {
  const usedRect: MRect = {
    x: fr.x, y: fr.y,
    l: Math.min(pl + kerf, W - fr.x),
    a: Math.min(pa + kerf, H - fr.y),
  };
  const next: MRect[] = [];
  for (const r of freeRects) {
    if (mrOverlap(r, usedRect)) next.push(...mrSplit(r, usedRect));
    else next.push(r);
  }
  return mrPrune(next);
}

// ── MAXRECTS single-sheet (usada para retalhos de estoque e cálculo de aproveitamento) ──

export function empacotarOrdem(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number,
  ordem: number[]
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  let freeRects: MRect[] = [{ x: 0, y: 0, l: W, a: H }];
  const placed: PecaPlacada[] = [];
  const usados = new Set<number>();

  for (const origIdx of ordem) {
    const peca = pecas[origIdx];
    const oris = [
      { pl: peca.l, pa: peca.a, rot: false as boolean },
      { pl: peca.a, pa: peca.l, rot: true  as boolean },
    ];
    let best: { fr: MRect; pl: number; pa: number; rot: boolean; score: number } | null = null;
    for (const ori of oris) {
      const fit = mrBestFit(freeRects, ori.pl, ori.pa);
      if (fit && (best === null || fit.score < best.score)) {
        best = { fr: fit.fr, pl: ori.pl, pa: ori.pa, rot: ori.rot, score: fit.score };
      }
    }
    if (!best) continue;
    placed.push({ x: best.fr.x, y: best.fr.y, l: best.pl, a: best.pa,
      idx: origIdx, prod: peca.prod, rot: best.rot, pedidoId: peca.pedidoId });
    usados.add(origIdx);
    freeRects = mrPlace(freeRects, best.fr, best.pl, best.pa, kerf, W, H);
  }

  return { placed, usados, free: mrFreeRects(freeRects) };
}

export function empacotar(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  const base = pecas.map((_, i) => i);
  const orderings: number[][] = [
    [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),
    [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)),
    [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)),
    [...base].sort((a, b) => pecas[b].a - pecas[a].a),
    [...base].sort((a, b) => pecas[b].l - pecas[a].l),
    [...base].sort((a, b) => (pecas[a].l * pecas[a].a) - (pecas[b].l * pecas[b].a)),
    [...base],
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

// ── FFD Multi-Sheet (Best-Fit Decreasing global com MAXRECTS-BSSF) ────────────
// Estratégia global: distribui TODAS as peças pelas chapas em uma passagem.
// Para cada peça, busca a melhor posição entre TODAS as chapas já abertas
// (Best-Fit Decreasing = BFD); só abre nova chapa se nenhuma acomodar.
// Testa múltiplas ordenações globais e retorna a distribuição com
// menor nº de chapas (desempate: maior aproveitamento total).

interface SheetState { freeRects: MRect[]; placed: PecaPlacada[]; }

function bfdRun(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number,
  ordem: number[]
): SheetState[] {
  const sheets: SheetState[] = [];

  for (const origIdx of ordem) {
    const peca = pecas[origIdx];
    const oris = [
      { pl: peca.l, pa: peca.a, rot: false as boolean },
      { pl: peca.a, pa: peca.l, rot: true  as boolean },
    ];

    // Melhor encaixe entre TODAS as chapas abertas
    let bestScore = Infinity;
    let bestSi = -1;
    let bestFr: MRect | null = null;
    let bestOri = oris[0];

    for (let si = 0; si < sheets.length; si++) {
      for (const ori of oris) {
        const fit = mrBestFit(sheets[si].freeRects, ori.pl, ori.pa);
        if (fit && fit.score < bestScore) {
          bestScore = fit.score; bestSi = si; bestFr = fit.fr; bestOri = ori;
        }
      }
    }

    // Nenhuma chapa existente acomoda → abre nova
    if (bestFr === null) {
      sheets.push({ freeRects: [{ x: 0, y: 0, l: W, a: H }], placed: [] });
      bestSi = sheets.length - 1;
      for (const ori of oris) {
        const fit = mrBestFit(sheets[bestSi].freeRects, ori.pl, ori.pa);
        if (fit && fit.score < bestScore) {
          bestScore = fit.score; bestFr = fit.fr; bestOri = ori;
        }
      }
      if (bestFr === null) continue; // peça não cabe nem numa chapa inteira
    }

    const sheet = sheets[bestSi];
    sheet.placed.push({
      x: bestFr.x, y: bestFr.y, l: bestOri.pl, a: bestOri.pa,
      idx: origIdx, prod: peca.prod, rot: bestOri.rot, pedidoId: peca.pedidoId,
    });
    sheet.freeRects = mrPlace(sheet.freeRects, bestFr, bestOri.pl, bestOri.pa, kerf, W, H);
  }

  return sheets;
}

// ── Sheet Merging (elimina chapas pouco ocupadas redistribuindo suas peças) ─────
// Após o BFD produzir N chapas, tenta eliminar a menos carregada colocando
// cada uma de suas peças na melhor posição disponível nas N-1 restantes.
// Repete até não conseguir mais reduções.

function cloneSheets(sheets: SheetState[]): SheetState[] {
  return sheets.map(s => ({
    freeRects: s.freeRects.map(r => ({ ...r })),
    placed: [...s.placed],
  }));
}

function tryEliminateSheet(
  W: number, H: number,
  sheets: SheetState[],
  targetSi: number,
  kerf: number
): SheetState[] | null {
  const sortedPieces = [...sheets[targetSi].placed].sort((a, b) => b.l * b.a - a.l * a.a);
  const remaining = cloneSheets(sheets.filter((_, i) => i !== targetSi));

  for (const piece of sortedPieces) {
    const oris = [
      { pl: piece.l, pa: piece.a, rot: piece.rot },
      { pl: piece.a, pa: piece.l, rot: !piece.rot },
    ];

    let bestScore = Infinity, bestSi = -1;
    let bestFr: MRect | null = null, bestOri = oris[0];

    for (let si = 0; si < remaining.length; si++) {
      for (const ori of oris) {
        const fit = mrBestFit(remaining[si].freeRects, ori.pl, ori.pa);
        if (fit && fit.score < bestScore) {
          bestScore = fit.score; bestSi = si; bestFr = fit.fr; bestOri = ori;
        }
      }
    }

    if (bestFr === null) return null;

    remaining[bestSi].placed.push({ ...piece, l: bestOri.pl, a: bestOri.pa, rot: bestOri.rot });
    remaining[bestSi].freeRects = mrPlace(
      remaining[bestSi].freeRects, bestFr, bestOri.pl, bestOri.pa, kerf, W, H
    );
  }

  return remaining;
}

function mergeSheets(W: number, H: number, sheets: SheetState[], kerf: number): SheetState[] {
  let current = sheets;
  let improved = true;
  while (improved && current.length > 1) {
    improved = false;
    const byLoad = current
      .map((s, i) => ({ i, area: s.placed.reduce((sum, p) => sum + p.l * p.a, 0) }))
      .sort((a, b) => a.area - b.area);
    for (const { i } of byLoad) {
      const result = tryEliminateSheet(W, H, current, i, kerf);
      if (result !== null) { current = result; improved = true; break; }
    }
  }
  return current;
}

export function empacotarTodas(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): ResultadoChapa[] {
  if (pecas.length === 0) return [];
  const base = pecas.map((_, i) => i);
  const orderings: number[][] = [
    [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),               // área ↓
    [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)), // maior lado ↓
    [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)), // menor lado ↓
    [...base].sort((a, b) => pecas[b].a - pecas[a].a),                                               // altura ↓
    [...base].sort((a, b) => pecas[b].l - pecas[a].l),                                               // largura ↓
    [...base].sort((a, b) => (pecas[a].l * pecas[a].a) - (pecas[b].l * pecas[b].a)),               // área ↑
    [...base],                                                                                         // original
  ];

  let melhorSheets: SheetState[] | null = null;
  let melhorN = Infinity, melhorAprov = -1;

  for (const ordem of orderings) {
    const sheets = mergeSheets(W, H, bfdRun(W, H, pecas, kerf, ordem), kerf);
    const n = sheets.length;
    if (n === 0) continue;
    const usedArea = sheets.reduce((s, sh) => s + sh.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = usedArea / (n * W * H);
    if (n < melhorN || (n === melhorN && aprov > melhorAprov)) {
      melhorN = n; melhorAprov = aprov; melhorSheets = sheets;
    }
  }

  return (melhorSheets ?? []).map(sheet => ({
    W, H,
    prod: sheet.placed[0]?.prod ?? '',
    placed: sheet.placed,
    free: mrFreeRects(sheet.freeRects),
  }));
}

// ── calcAproveitamento (usa FFD global para estimativa precisa) ────────────────

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
    const chapas = empacotarTodas(W, H, grupo, kerf);
    chapas.forEach(c => {
      totA += W * H;
      c.placed.forEach(p => (usedA += p.l * p.a));
    });
  });
  return totA > 0 ? (usedA / totA) * 100 : 0;
}
