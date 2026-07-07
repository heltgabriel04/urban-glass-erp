// ============================================================
// lib/otimizador.ts — Algoritmo de otimização de corte de vidro
// ============================================================
import { CHAPAS_PADRAO, PRODUTO_CHAPA } from "@/lib/chapas";

export interface Peca { l: number; a: number; qtd: number; prod: string; pedidoId?: string; }
export interface PecaPlacada { x: number; y: number; l: number; a: number; idx: number; prod: string; rot: boolean; pedidoId?: string; }
export interface EspacoLivre { x: number; y: number; l: number; a: number; }
/** Um risco de corte guilhotina: "V" = vertical (linha em x=pos), "H" = horizontal (em y=pos).
 *  O segmento vai de `ini` a `fim` no eixo perpendicular. `seq` é a ordem de execução na mesa. */
export interface CorteLinha { seq: number; dir: "V" | "H"; pos: number; ini: number; fim: number; }
export interface ResultadoChapa { placed: PecaPlacada[]; free: EspacoLivre[]; W: number; H: number; prod: string; retalhoId?: string; cortes?: CorteLinha[]; }
export interface RetalhoGerado extends EspacoLivre { chapaIdx: number; prod: string; m2: number; }

// ── Primitivas de posicionamento GUILHOTINA ────────────────────────────────────
// Vidro só corta em guilhotina: cada risco atravessa o painel de ponta a ponta.
// Os retângulos livres aqui são DISJUNTOS e formam as folhas de uma árvore de
// divisões — colocar uma peça num retângulo e dividir a sobra em dois com um
// risco reto garante, por construção, que todo layout gerado é cortável numa
// mesa de corte real (diferente do MAXRECTS usado antes, que produzia mosaicos
// impossíveis de riscar de ponta a ponta).

interface MRect { x: number; y: number; l: number; a: number; }

function mrFreeRects(freeRects: MRect[]): EspacoLivre[] {
  return freeRects
    .filter(fr => fr.l >= 200 && fr.a >= 200)
    .sort((a, b) => (b.l * b.a) - (a.l * a.a))
    .map(fr => ({ x: fr.x, y: fr.y, l: fr.l, a: fr.a }));
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

// Coloca uma peça no canto inferior-esquerdo do retângulo livre e divide a
// sobra em L em DOIS retângulos disjuntos com um único risco reto (guilhotina).
// Das duas divisões possíveis, escolhe a que preserva o maior retângulo livre
// contíguo — sobras grandes e "inteiras" viram retalhos aproveitáveis.
// W e H (dimensões da chapa) não são mais necessários: o kerf é limitado ao
// próprio retângulo livre.
function mrPlace(freeRects: MRect[], fr: MRect, pl: number, pa: number, kerf: number, _W: number, _H: number): MRect[] {
  const ul = Math.min(pl + kerf, fr.l); // dimensões ocupadas (peça + risco)
  const ua = Math.min(pa + kerf, fr.a);

  // Opção A — risco horizontal em y=fr.y+ua: sobra direita baixa + topo inteiro
  const rightA: MRect = { x: fr.x + ul, y: fr.y,      l: fr.l - ul, a: ua };
  const topA:   MRect = { x: fr.x,      y: fr.y + ua, l: fr.l,      a: fr.a - ua };
  // Opção B — risco vertical em x=fr.x+ul: sobra direita inteira + topo estreito
  const rightB: MRect = { x: fr.x + ul, y: fr.y,      l: fr.l - ul, a: fr.a };
  const topB:   MRect = { x: fr.x,      y: fr.y + ua, l: ul,        a: fr.a - ua };

  const area = (r: MRect) => r.l * r.a;
  const maxA = Math.max(area(rightA), area(topA));
  const maxB = Math.max(area(rightB), area(topB));
  const [r1, r2] = maxA >= maxB ? [rightA, topA] : [rightB, topB];

  const next = freeRects.filter(r => r !== fr);
  if (r1.l > 0 && r1.a > 0) next.push(r1);
  if (r2.l > 0 && r2.a > 0) next.push(r2);
  return next;
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

// ── Repack Group: empacota um conjunto de PecaPlacada em ≤ maxSheets chapas ─────
// Tenta múltiplas ordenações e retorna null se não couber dentro do limite.
// Diferente do BFD normal, opera sobre peças JÁ colocadas (com rot já definida)
// e considera ambas as orientações ao remontar.

function repackGroup(
  W: number, H: number,
  pieces: PecaPlacada[],
  kerf: number,
  maxSheets: number
): SheetState[] | null {
  const orderings: PecaPlacada[][] = [
    [...pieces].sort((a, b) => b.l * b.a - a.l * a.a),
    [...pieces].sort((a, b) => Math.max(b.l, b.a) - Math.max(a.l, a.a)),
    [...pieces].sort((a, b) => Math.min(b.l, b.a) - Math.min(a.l, a.a)),
    [...pieces].sort((a, b) => (b.l / b.a) - (a.l / a.a)),
    [...pieces].sort((a, b) => a.l * a.a - b.l * b.a),
    [...pieces],
  ];

  // Retorna o MELHOR resultado entre todos (menor nº de chapas; em empate, maior rect livre)
  let best: SheetState[] | null = null;
  let bestN = Infinity;
  let bestMaxFree = -1;

  for (const ordem of orderings) {
    const sheets: SheetState[] = [];
    let failed = false;

    for (const piece of ordem) {
      const oris = [
        { pl: piece.l, pa: piece.a, rot: piece.rot },
        { pl: piece.a, pa: piece.l, rot: !piece.rot },
      ];

      let bestScore = Infinity, bestSi = -1, bestFr: MRect | null = null, bestOri = oris[0];

      for (let si = 0; si < sheets.length; si++) {
        for (const ori of oris) {
          const fit = mrBestFit(sheets[si].freeRects, ori.pl, ori.pa);
          if (fit && fit.score < bestScore) {
            bestScore = fit.score; bestSi = si; bestFr = fit.fr; bestOri = ori;
          }
        }
      }

      if (bestFr === null) {
        if (sheets.length >= maxSheets) { failed = true; break; }
        sheets.push({ freeRects: [{ x: 0, y: 0, l: W, a: H }], placed: [] });
        bestSi = sheets.length - 1;
        bestScore = Infinity;
        for (const ori of oris) {
          const fit = mrBestFit(sheets[bestSi].freeRects, ori.pl, ori.pa);
          if (fit && fit.score < bestScore) {
            bestScore = fit.score; bestFr = fit.fr; bestOri = ori;
          }
        }
        if (bestFr === null) { failed = true; break; }
      }

      sheets[bestSi].placed.push({
        ...piece,
        x: bestFr!.x, y: bestFr!.y,
        l: bestOri.pl, a: bestOri.pa, rot: bestOri.rot,
      });
      sheets[bestSi].freeRects = mrPlace(
        sheets[bestSi].freeRects, bestFr!, bestOri.pl, bestOri.pa, kerf, W, H
      );
    }

    if (!failed && sheets.length <= maxSheets) {
      const n = sheets.length;
      const maxFree = sheets.reduce((s, sh) =>
        Math.max(s, sh.freeRects.reduce((a, r) => Math.max(a, r.l * r.a), 0)), 0);
      if (n < bestN || (n === bestN && maxFree > bestMaxFree)) {
        bestN = n; bestMaxFree = maxFree; best = sheets;
      }
    }
  }

  return best;
}

// ── Per-Sheet Reoptimization ─────────────────────────────────────────────────
// Para cada chapa, testa múltiplas ordenações das suas próprias peças e escolhe
// a que maximiza o maior retângulo livre contíguo (proxy para "espaço mais útil").
// Isto defragmenta o espaço interno das chapas, permitindo que o Sheet Merging
// encontre espaço para as peças das chapas menos carregadas.

function reoptimizeSheet(W: number, H: number, sheet: SheetState, kerf: number): SheetState {
  const pieces = sheet.placed;
  if (pieces.length <= 1) return sheet;

  const orderings: PecaPlacada[][] = [
    [...pieces].sort((a, b) => b.l * b.a - a.l * a.a),
    [...pieces].sort((a, b) => Math.max(b.l, b.a) - Math.max(a.l, a.a)),
    [...pieces].sort((a, b) => Math.min(b.l, b.a) - Math.min(a.l, a.a)),
    [...pieces].sort((a, b) => (b.l / b.a) - (a.l / a.a)),
    [...pieces].sort((a, b) => a.l * a.a - b.l * b.a),
    [...pieces],
  ];

  let bestSheet = sheet;
  let bestMaxFree = sheet.freeRects.reduce((s, r) => Math.max(s, r.l * r.a), 0);

  for (const ordering of orderings) {
    let frs: MRect[] = [{ x: 0, y: 0, l: W, a: H }];
    const placed: PecaPlacada[] = [];
    let ok = true;

    for (const piece of ordering) {
      const oris = [
        { pl: piece.l, pa: piece.a, rot: piece.rot },
        { pl: piece.a, pa: piece.l, rot: !piece.rot },
      ];
      let best: { fr: MRect; pl: number; pa: number; rot: boolean; score: number } | null = null;
      for (const ori of oris) {
        const fit = mrBestFit(frs, ori.pl, ori.pa);
        if (fit && (!best || fit.score < best.score))
          best = { fr: fit.fr, pl: ori.pl, pa: ori.pa, rot: ori.rot, score: fit.score };
      }
      if (!best) { ok = false; break; }
      placed.push({ ...piece, x: best.fr.x, y: best.fr.y, l: best.pl, a: best.pa, rot: best.rot });
      frs = mrPlace(frs, best.fr, best.pl, best.pa, kerf, W, H);
    }

    if (ok) {
      const maxFree = frs.reduce((s, r) => Math.max(s, r.l * r.a), 0);
      if (maxFree > bestMaxFree) {
        bestMaxFree = maxFree;
        bestSheet = { freeRects: frs, placed };
      }
    }
  }

  return bestSheet;
}

// ── k-Eliminate: tenta eliminar chapas remontando grupos de 2 ou 3 do zero ──────
// A diferença crítica em relação ao Sheet Merging:
//   Merging usa o espaço livre fragmentado atual das outras chapas (frequentemente falha).
//   kEliminate repõe as chapas do grupo do ZERO — elimina a fragmentação completamente.
// Tenta pares (2→1) e triplas (3→2) começando pelas chapas com menor carga.

function kEliminate(
  W: number, H: number,
  sheets: SheetState[],
  kerf: number,
  deadline: number
): SheetState[] {
  let current = sheets;
  let improved = true;

  while (improved && current.length > 1 && Date.now() < deadline) {
    improved = false;

    const byLoad = current
      .map((s, i) => ({ i, area: s.placed.reduce((sum, p) => sum + p.l * p.a, 0) }))
      .sort((a, b) => a.area - b.area);

    const sheetArea = W * H;
    const n = byLoad.length;

    // ── Tentativa 1: par de chapas → 1 chapa (2→1) ──
    outerPair: for (let ai = 0; ai < n && !improved; ai++) {
      for (let aj = ai + 1; aj < n && !improved; aj++) {
        if (Date.now() >= deadline) break outerPair;
        if (byLoad[ai].area + byLoad[aj].area > sheetArea * 0.98) continue;

        const pieces = [
          ...current[byLoad[ai].i].placed,
          ...current[byLoad[aj].i].placed,
        ];
        const result = repackGroup(W, H, pieces, kerf, 1);
        if (result) {
          const kill = new Set([byLoad[ai].i, byLoad[aj].i]);
          const rest = current.filter((_, k) => !kill.has(k));
          current = mergeSheets(W, H, [...rest, ...result], kerf);
          improved = true;
        }
      }
    }

    if (improved) continue;

    // ── Tentativa 2: tripla de chapas → 2 chapas (3→2) ──
    outerTriple: for (let ai = 0; ai < n && !improved; ai++) {
      for (let aj = ai + 1; aj < n && !improved; aj++) {
        for (let ak = aj + 1; ak < n && !improved; ak++) {
          if (Date.now() >= deadline) break outerTriple;
          const combined = byLoad[ai].area + byLoad[aj].area + byLoad[ak].area;
          if (combined > sheetArea * 1.99) continue;

          const pieces = [
            ...current[byLoad[ai].i].placed,
            ...current[byLoad[aj].i].placed,
            ...current[byLoad[ak].i].placed,
          ];
          const result = repackGroup(W, H, pieces, kerf, 2);
          if (result) {
            const kill = new Set([byLoad[ai].i, byLoad[aj].i, byLoad[ak].i]);
            const rest = current.filter((_, k) => !kill.has(k));
            current = mergeSheets(W, H, [...rest, ...result], kerf);
            improved = true;
          }
        }
      }
    }

    if (improved) continue;

    // ── Tentativa 3: quadrupla de chapas → 3 chapas (4→3) ──
    // Cobre o caso comum: 4 chapas com ~75% cada (total ~300%) → 3 chapas com ~100% cada.
    // Mais custoso (O(n⁴)) mas filtrado agressivamente pela área combinada.
    outerQuad: for (let ai = 0; ai < n && !improved; ai++) {
      for (let aj = ai + 1; aj < n && !improved; aj++) {
        for (let ak = aj + 1; ak < n && !improved; ak++) {
          for (let al = ak + 1; al < n && !improved; al++) {
            if (Date.now() >= deadline) break outerQuad;
            const combined = byLoad[ai].area + byLoad[aj].area + byLoad[ak].area + byLoad[al].area;
            if (combined > sheetArea * 2.97) continue;
            const pieces = [
              ...current[byLoad[ai].i].placed,
              ...current[byLoad[aj].i].placed,
              ...current[byLoad[ak].i].placed,
              ...current[byLoad[al].i].placed,
            ];
            const result = repackGroup(W, H, pieces, kerf, 3);
            if (result) {
              const kill = new Set([byLoad[ai].i, byLoad[aj].i, byLoad[ak].i, byLoad[al].i]);
              const rest = current.filter((_, k) => !kill.has(k));
              current = mergeSheets(W, H, [...rest, ...result], kerf);
              improved = true;
            }
          }
        }
      }
    }
  }

  return current;
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

    remaining[bestSi].placed.push({ ...piece, x: bestFr.x, y: bestFr.y, l: bestOri.pl, a: bestOri.pa, rot: bestOri.rot });
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

// ── 2-Stage Guillotine Strip Packing (FFDH) ──────────────────────────────────
// Replica a abordagem de faixas/colunas do Corte Certo (software industrial).
// mode='H': faixas horizontais (altura fixa por faixa, peças esq→dir)
// mode='V': colunas verticais  (largura fixa por coluna, peças baixo→cima)
// Produz cortes guilhotina válidos — toda faixa/coluna é separada por um corte único.

function stripFFDH(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number,
  ordem: number[],
  mode: 'H' | 'V'
): SheetState[] {
  // H: eixo primário=Y(altura da faixa), secundário=X(largura p/ encaixe)
  // V: eixo primário=X(largura da coluna), secundário=Y(altura p/ encaixe)
  const maxP = mode === 'H' ? H : W;
  const maxS = mode === 'H' ? W : H;

  type Strip = { primaryPos: number; pieceDim: number; fill: number };

  const sheets: SheetState[] = [];
  let placed: PecaPlacada[] = [];
  let strips: Strip[] = [];
  let totalPrimaryUsed = 0;

  function flush() {
    if (placed.length === 0) return;
    const frees: MRect[] = [];
    for (const s of strips) {
      const rem = maxS - s.fill;
      if (rem > 0 && s.pieceDim > 0) {
        if (mode === 'H') frees.push({ x: s.fill, y: s.primaryPos, l: rem, a: s.pieceDim });
        else              frees.push({ x: s.primaryPos, y: s.fill, l: s.pieceDim, a: rem });
      }
    }
    const afterAll = maxP - totalPrimaryUsed;
    if (afterAll > 0) {
      if (mode === 'H') frees.push({ x: 0, y: totalPrimaryUsed, l: maxS, a: afterAll });
      else              frees.push({ x: totalPrimaryUsed, y: 0, l: afterAll, a: maxS });
    }
    sheets.push({ placed, freeRects: frees });
    placed = []; strips = []; totalPrimaryUsed = 0;
  }

  function tryPlace(origIdx: number): boolean {
    const p = pecas[origIdx];
    const oris = [
      { pl: p.l, pa: p.a, rot: false as boolean },
      { pl: p.a, pa: p.l, rot: true  as boolean },
    ];

    // 1) Tenta encaixar em faixa/coluna já existente (First Fit)
    for (const ori of oris) {
      const pPrim = mode === 'H' ? ori.pa : ori.pl;
      const pSec  = mode === 'H' ? ori.pl : ori.pa;
      for (const strip of strips) {
        if (pPrim <= strip.pieceDim && strip.fill + pSec + kerf <= maxS) {
          const x = mode === 'H' ? strip.fill : strip.primaryPos;
          const y = mode === 'H' ? strip.primaryPos : strip.fill;
          placed.push({ x, y, l: ori.pl, a: ori.pa, idx: origIdx, prod: p.prod, rot: ori.rot, pedidoId: p.pedidoId });
          strip.fill += pSec + kerf;
          return true;
        }
      }
    }

    // 2) Abre nova faixa/coluna
    for (const ori of oris) {
      const pPrim = mode === 'H' ? ori.pa : ori.pl;
      const pSec  = mode === 'H' ? ori.pl : ori.pa;
      if (totalPrimaryUsed + pPrim + kerf <= maxP && pSec + kerf <= maxS) {
        const s: Strip = { primaryPos: totalPrimaryUsed, pieceDim: pPrim, fill: 0 };
        strips.push(s);
        totalPrimaryUsed += pPrim + kerf;
        const x = mode === 'H' ? 0 : s.primaryPos;
        const y = mode === 'H' ? s.primaryPos : 0;
        placed.push({ x, y, l: ori.pl, a: ori.pa, idx: origIdx, prod: p.prod, rot: ori.rot, pedidoId: p.pedidoId });
        s.fill = pSec + kerf;
        return true;
      }
    }

    return false;
  }

  for (const origIdx of ordem) {
    if (!tryPlace(origIdx)) {
      flush();
      if (!tryPlace(origIdx)) continue; // peça maior que a chapa — ignora
    }
  }
  flush();

  return sheets;
}

export function empacotarTodas(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number,
  timeLimitMs = 500
): ResultadoChapa[] {
  if (pecas.length === 0) return [];
  const base = pecas.map((_, i) => i);

  // Ordenação intercalada: une peças grandes com pequenas para evitar o efeito
  // "última chapa leve" — distribui tamanhos menores junto das maiores no BFD.
  const sortedByLong = [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a));
  const intercaladaFixa: number[] = [];
  { let lo = 0, hi = sortedByLong.length - 1;
    while (lo <= hi) { intercaladaFixa.push(sortedByLong[lo++]); if (lo <= hi) intercaladaFixa.push(sortedByLong[hi--]); }
  }

  // Ordenações fixas diversificadas — cobrem diferentes heurísticas conhecidas
  const fixas: number[][] = [
    [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),          // área dec
    [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)), // lado maior dec
    [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)), // lado menor dec
    [...base].sort((a, b) => pecas[b].a - pecas[a].a),                                          // altura dec
    [...base].sort((a, b) => pecas[b].l - pecas[a].l),                                          // largura dec
    [...base].sort((a, b) => (pecas[a].l * pecas[a].a) - (pecas[b].l * pecas[b].a)),           // área asc
    [...base].sort((a, b) => 2*(pecas[b].l + pecas[b].a) - 2*(pecas[a].l + pecas[a].a)),       // perímetro dec
    [...base].sort((a, b) => {                                                                    // razão asp dec (mais retangular)
      const rA = Math.max(pecas[a].l, pecas[a].a) / Math.min(pecas[a].l, pecas[a].a);
      const rB = Math.max(pecas[b].l, pecas[b].a) / Math.min(pecas[b].l, pecas[b].a);
      return rB - rA;
    }),
    [...base].sort((a, b) => {                                                                    // razão asp asc (mais quadrado)
      const rA = Math.max(pecas[a].l, pecas[a].a) / Math.min(pecas[a].l, pecas[a].a);
      const rB = Math.max(pecas[b].l, pecas[b].a) / Math.min(pecas[b].l, pecas[b].a);
      return rA - rB;
    }),
    intercaladaFixa,                                                                              // grande+pequena intercaladas
    [...base],                                                                                     // ordem original
  ];

  let melhorSheets: SheetState[] | null = null;
  let melhorN = Infinity, melhorAprov = -1;

  function avaliar(sheets: SheetState[]) {
    const n = sheets.length;
    if (n === 0) return;
    const usedArea = sheets.reduce((s, sh) => s + sh.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = usedArea / (n * W * H);
    if (n < melhorN || (n === melhorN && aprov > melhorAprov)) {
      melhorN = n; melhorAprov = aprov; melhorSheets = sheets;
    }
  }

  function avaliarOrdem(ordem: number[]) {
    avaliar(mergeSheets(W, H, bfdRun(W, H, pecas, kerf, ordem), kerf));
  }

  // ── Fase 1: ordenações fixas (com defragmentação antes do merge) ─────────────
  // Defragmentar antes do primeiro mergeSheets é crítico: o BFD produz freeRects
  // fragmentados; sem defrag, mergeSheets falha em pares que caberiam facilmente.
  for (const ordem of fixas) {
    const raw = bfdRun(W, H, pecas, kerf, ordem);
    const defragged = raw.map(s => reoptimizeSheet(W, H, s, kerf));
    avaliar(mergeSheets(W, H, defragged, kerf));
  }
  if (process.env.OTIM_DEBUG) console.log(`[fase1] melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}%`);
  if (melhorN === 1) {
    const early: SheetState[] = melhorSheets ?? [];
    return early.map(sheet => ({ W, H, prod: sheet.placed[0]?.prod ?? '', placed: sheet.placed, free: mrFreeRects(sheet.freeRects) }));
  }

  // ── Fase 2: random restarts (LCG, 60% do tempo) ──────────────────────────────
  const tStart = Date.now();
  const tTotal = Math.max(0, timeLimitMs - 80);
  const deadlineRestarts = tStart + Math.floor(tTotal * 0.60);

  // Seed determinística (função só das dimensões e nº de peças): rodar duas
  // vezes o mesmo pedido produz o mesmo plano — essencial pra conferência.
  let seed = (0x9e3779b9 ^ (W * 31) ^ H ^ Math.imul(pecas.length, 2654435761)) >>> 0;
  function lcg() {
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    return ((seed ^ (seed >>> 16)) >>> 0) / 0x100000000;
  }

  let nIter = 0;
  while (Date.now() < deadlineRestarts) {
    const ordem = [...base];
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(lcg() * (i + 1));
      const t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t;
    }
    avaliarOrdem(ordem);
    nIter++;
    if (melhorN === 1) break;
  }
  if (process.env.OTIM_DEBUG) console.log(`[fase2] iter=${nIter} melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}%`);

  // ── Fase 3: Defragmentação + kEliminate (40% do tempo) ──────────────────────
  // Pipline: reoptimize cada chapa → mergeSheets → kEliminate (grupos 2-3)
  if (melhorN > 1 && melhorSheets !== null) {
    const deadlineK = tStart + tTotal;

    // Passo A: reotimiza cada chapa individualmente para maximizar rect livre
    const best0: SheetState[] = melhorSheets;
    const reopt = best0.map(s => reoptimizeSheet(W, H, s, kerf));

    // Passo B: tenta Sheet Merging com as chapas defragmentadas
    const afterMerge = mergeSheets(W, H, reopt, kerf);
    avaliar(afterMerge);
    if (process.env.OTIM_DEBUG) console.log(`[fase3-merge] n=${afterMerge.length} melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}%`);

    // Passo C: kEliminate sobre afterMerge (espaços livres mais limpos) e também
    // sobre melhorSheets bruto se diferente (melhor aproveitamento individual das chapas).
    // Testar os dois garante que nenhuma oportunidade seja perdida.
    const base3a = afterMerge;
    const base3b = melhorSheets as SheetState[];
    if (base3a.length > 1 && Date.now() < deadlineK) {
      const kResult = kEliminate(W, H, base3a, kerf, deadlineK);
      avaliar(kResult);
      if (process.env.OTIM_DEBUG) console.log(`[fase3-kelim-a] n=${kResult.length} melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}% tempoRestante=${deadlineK - Date.now()}ms`);
    }
    if (base3b.length > 1 && base3b !== base3a && Date.now() < deadlineK) {
      const kResult2 = kEliminate(W, H, base3b, kerf, deadlineK);
      avaliar(kResult2);
      if (process.env.OTIM_DEBUG) console.log(`[fase3-kelim-b] n=${kResult2.length} melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}% tempoRestante=${deadlineK - Date.now()}ms`);
    }
  }

  // ── Fase 4: Strip packing guilhotina (estilo Corte Certo) ─────────────────────
  // Faixas horizontais e colunas verticais (FFDH) com múltiplas ordenações.
  // Compete diretamente com o MAXRECTS — o melhor resultado global é mantido.
  // Após o melhor strip, aplica kEliminate para consolidar chapas fracas.
  {
    // Ordenação "intercalada": combina peças grandes e pequenas na mesma faixa,
    // evitando que faixas fiquem com 2 peças grandes e espaço residual inutilizado.
    const sorted = [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a));
    const intercalada: number[] = [];
    let lo = 0, hi = sorted.length - 1;
    while (lo <= hi) {
      intercalada.push(sorted[lo++]);
      if (lo <= hi) intercalada.push(sorted[hi--]);
    }

    const ordsStrip: number[][] = [
      [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),
      [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)),
      [...base].sort((a, b) => pecas[b].a - pecas[a].a),
      [...base].sort((a, b) => pecas[b].l - pecas[a].l),
      [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)),
      intercalada,
      [...base],
    ];

    let bestStripSheets: SheetState[] | null = null;
    let bestStripN = Infinity;

    for (const ordem of ordsStrip) {
      for (const mode of ['H', 'V'] as const) {
        const r = stripFFDH(W, H, pecas, kerf, ordem, mode);
        if (r.length > 0) {
          const merged = mergeSheets(W, H, r, kerf);
          avaliar(merged);
          if (merged.length < bestStripN) {
            bestStripN = merged.length;
            bestStripSheets = merged;
          }
        }
      }
    }
    if (process.env.OTIM_DEBUG) console.log(`[fase4-strip] melhorN=${melhorN} aprov=${(melhorAprov*100).toFixed(2)}%`);

    // Aplica kEliminate sobre o melhor resultado strip — combina as forças de ambos os algoritmos.
    if (bestStripSheets !== null && bestStripSheets.length > 1) {
      const deadlineStrip = Date.now() + 150;
      const kStrip = kEliminate(W, H, bestStripSheets, kerf, deadlineStrip);
      avaliar(kStrip);
      if (process.env.OTIM_DEBUG) console.log(`[fase4-strip-kelim] n=${kStrip.length} melhorN=${melhorN}`);
    }
  }

  const sheets: SheetState[] = melhorSheets ?? [];
  return sheets.map(sheet => ({
    W, H,
    prod: sheet.placed[0]?.prod ?? '',
    placed: sheet.placed,
    free: mrFreeRects(sheet.freeRects),
  }));
}

// ── Sequência de cortes (árvore guilhotina derivada do layout final) ──────────
// Reconstrói recursivamente os riscos de ponta a ponta que produzem o layout:
// em cada painel, procura uma linha (vertical ou horizontal) que o atravesse
// inteiro sem passar por dentro de nenhuma peça; risca, divide em dois painéis
// e repete. A numeração (seq) segue a ordem natural de execução na mesa:
// risca, destaca a primeira metade, corta ela toda, volta pra segunda.
// Também devolve a ordem em que as peças ficam soltas (ordemExtracao) — é a
// ordem correta de impressão das etiquetas.
// Retorna null se o layout não for guilhotinável (não deve acontecer com os
// layouts gerados aqui — usado como validação nos testes).

export function derivarCortes(
  placed: PecaPlacada[], W: number, H: number
): { cortes: CorteLinha[]; ordemExtracao: number[] } | null {
  const EPS = 0.5; // mm — coordenadas de entrada são inteiras
  const cortes: CorteLinha[] = [];
  const ordemExtracao: number[] = [];
  let seq = 0;

  function rec(px: number, py: number, pw: number, ph: number, idxs: number[]): boolean {
    if (idxs.length === 0) return true;

    if (idxs.length === 1) {
      // Painel com uma peça só: riscos de acabamento pra soltá-la da sobra.
      const i = idxs[0];
      const p = placed[i];
      if (p.x - px > EPS)              cortes.push({ seq: ++seq, dir: "V", pos: p.x,       ini: py,  fim: py + ph });
      if (px + pw - (p.x + p.l) > EPS) cortes.push({ seq: ++seq, dir: "V", pos: p.x + p.l, ini: py,  fim: py + ph });
      if (p.y - py > EPS)              cortes.push({ seq: ++seq, dir: "H", pos: p.y,       ini: p.x, fim: p.x + p.l });
      if (py + ph - (p.y + p.a) > EPS) cortes.push({ seq: ++seq, dir: "H", pos: p.y + p.a, ini: p.x, fim: p.x + p.l });
      ordemExtracao.push(i);
      return true;
    }

    // Candidatos a risco: bordas de peças estritamente dentro do painel.
    const xsSet = new Set<number>();
    const ysSet = new Set<number>();
    for (const i of idxs) {
      const p = placed[i];
      if (p.x > px + EPS && p.x < px + pw - EPS)                 xsSet.add(p.x);
      if (p.x + p.l > px + EPS && p.x + p.l < px + pw - EPS)     xsSet.add(p.x + p.l);
      if (p.y > py + EPS && p.y < py + ph - EPS)                 ysSet.add(p.y);
      if (p.y + p.a > py + EPS && p.y + p.a < py + ph - EPS)     ysSet.add(p.y + p.a);
    }

    let best: { dir: "V" | "H"; pos: number; balance: number; lado1: number[]; lado2: number[] } | null = null;

    function tentar(dir: "V" | "H", pos: number) {
      const lado1: number[] = []; // esquerda / baixo
      const lado2: number[] = []; // direita / cima
      for (const i of idxs) {
        const p = placed[i];
        const lo = dir === "V" ? p.x : p.y;
        const hi = dir === "V" ? p.x + p.l : p.y + p.a;
        if (hi <= pos + EPS) lado1.push(i);
        else if (lo >= pos - EPS) lado2.push(i);
        else return; // o risco atravessaria o interior desta peça — inválido
      }
      // Preferimos o risco mais "equilibrado" (peças dos dois lados); riscos com
      // tudo de um lado só ainda são válidos (aparam sobra) mas rendem menos.
      const balance = Math.min(lado1.length, lado2.length);
      if (!best || balance > best.balance) best = { dir, pos, balance, lado1, lado2 };
    }

    // Ordena os candidatos pra escolha ser determinística.
    [...xsSet].sort((a, b) => a - b).forEach(x => tentar("V", x));
    [...ysSet].sort((a, b) => a - b).forEach(y => tentar("H", y));

    if (!best) return false; // não existe risco de ponta a ponta → não guilhotinável
    const b: { dir: "V" | "H"; pos: number; balance: number; lado1: number[]; lado2: number[] } = best;

    if (b.dir === "V") {
      cortes.push({ seq: ++seq, dir: "V", pos: b.pos, ini: py, fim: py + ph });
      return rec(px, py, b.pos - px, ph, b.lado1) && rec(b.pos, py, px + pw - b.pos, ph, b.lado2);
    } else {
      cortes.push({ seq: ++seq, dir: "H", pos: b.pos, ini: px, fim: px + pw });
      return rec(px, py, pw, b.pos - py, b.lado1) && rec(px, b.pos, pw, py + ph - b.pos, b.lado2);
    }
  }

  return rec(0, 0, W, H, placed.map((_, i) => i)) ? { cortes, ordemExtracao } : null;
}

/** Validação: o layout pode ser executado só com riscos de ponta a ponta? */
export function ehGuilhotinavel(placed: PecaPlacada[], W: number, H: number): boolean {
  return derivarCortes(placed, W, H) !== null;
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
    const chapas = empacotarTodas(W, H, grupo, kerf, 100);
    chapas.forEach(c => {
      totA += W * H;
      c.placed.forEach(p => (usedA += p.l * p.a));
    });
  });
  return totA > 0 ? (usedA / totA) * 100 : 0;
}
