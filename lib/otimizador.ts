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

// ── MAXRECTS (Maximal Rectangles — Best Short-Side Fit) ───────────────────────
// Substitui o strip packing anterior. Mantém o conjunto de retângulos livres
// maximais da chapa e, para cada peça, escolhe o retângulo cujo encaixe deixa
// a menor sobra no lado curto (BSSF). Muito superior ao strip packing em
// aproveitamento (tipicamente +10–20 pp) sem custo computacional relevante.

interface MRect { x: number; y: number; l: number; a: number; }

function mrOverlap(r1: MRect, r2: MRect): boolean {
  return r1.x < r2.x + r2.l && r1.x + r1.l > r2.x &&
         r1.y < r2.y + r2.a && r1.y + r1.a > r2.y;
}

function mrSplit(fr: MRect, used: MRect): MRect[] {
  if (!mrOverlap(fr, used)) return [fr];
  const out: MRect[] = [];
  if (used.x > fr.x)              out.push({ x: fr.x,          y: fr.y, l: used.x - fr.x,                   a: fr.a });
  if (used.x + used.l < fr.x + fr.l) out.push({ x: used.x + used.l, y: fr.y, l: fr.x + fr.l - used.x - used.l, a: fr.a });
  if (used.y > fr.y)              out.push({ x: fr.x, y: fr.y,          l: fr.l, a: used.y - fr.y });
  if (used.y + used.a < fr.y + fr.a) out.push({ x: fr.x, y: used.y + used.a, l: fr.l, a: fr.y + fr.a - used.y - used.a });
  return out;
}

function mrContains(outer: MRect, inner: MRect): boolean {
  return outer.x <= inner.x && outer.y <= inner.y &&
         outer.x + outer.l >= inner.x + inner.l && outer.y + outer.a >= inner.y + inner.a;
}

// Empacota numa ÚNICA chapa respeitando a ordem fornecida.
// Usa MAXRECTS-BSSF: cada peça vai ao retângulo livre onde o lado curto
// restante é mínimo (encaixe mais justo), testando as duas orientações.
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

    let bestScore = Infinity;
    let bestFr: MRect | null = null;
    let bestOri = oris[0];

    for (const fr of freeRects) {
      for (const ori of oris) {
        if (ori.pl > fr.l || ori.pa > fr.a) continue;
        // BSSF: minimiza sobra no lado curto, desempate pelo lado longo
        const shortSide = Math.min(fr.l - ori.pl, fr.a - ori.pa);
        const longSide  = Math.max(fr.l - ori.pl, fr.a - ori.pa);
        const score = shortSide * 1_000_000 + longSide;
        if (score < bestScore) { bestScore = score; bestFr = fr; bestOri = ori; }
      }
    }

    if (!bestFr) continue;

    placed.push({
      x: bestFr.x, y: bestFr.y, l: bestOri.pl, a: bestOri.pa,
      idx: origIdx, prod: peca.prod, rot: bestOri.rot, pedidoId: peca.pedidoId,
    });
    usados.add(origIdx);

    // Área consumida inclui kerf (limitado às bordas da chapa)
    const usedRect: MRect = {
      x: bestFr.x, y: bestFr.y,
      l: Math.min(bestOri.pl + kerf, W - bestFr.x),
      a: Math.min(bestOri.pa + kerf, H - bestFr.y),
    };

    // Subdivide retângulos livres que intersectam a área consumida
    const next: MRect[] = [];
    for (const fr of freeRects) {
      if (mrOverlap(fr, usedRect)) next.push(...mrSplit(fr, usedRect));
      else next.push(fr);
    }

    // Remove retângulos contidos em outros (invariante MAXRECTS)
    freeRects = next.filter((r1, i) =>
      !next.some((r2, j) => i !== j && mrContains(r2, r1))
    );
  }

  // Retalhos úteis: MAXRECTS produz rects sobrepostos internamente;
  // seleciona os maiores sem sobreposição para reportar ao usuário.
  const candidates = freeRects
    .filter(fr => fr.l >= 200 && fr.a >= 200)
    .sort((a, b) => (b.l * b.a) - (a.l * a.a));
  const selected: MRect[] = [];
  for (const fr of candidates) {
    if (!selected.some(s => mrOverlap(s, fr))) selected.push(fr);
  }
  const free: EspacoLivre[] = selected.map(fr => ({ x: fr.x, y: fr.y, l: fr.l, a: fr.a }));

  return { placed, usados, free };
}

// Empacota numa única chapa testando VÁRIAS ordens de colocação e fica com a melhor
// (maior área aproveitada, desempate por mais peças alocadas).
export function empacotar(
  W: number, H: number,
  pecas: Array<{ l: number; a: number; prod: string; pedidoId?: string }>,
  kerf: number
): { placed: PecaPlacada[]; usados: Set<number>; free: EspacoLivre[] } {
  const base = pecas.map((_, i) => i);
  const orderings: number[][] = [
    [...base].sort((a, b) => (pecas[b].l * pecas[b].a) - (pecas[a].l * pecas[a].a)),               // área ↓
    [...base].sort((a, b) => Math.max(pecas[b].l, pecas[b].a) - Math.max(pecas[a].l, pecas[a].a)), // maior lado ↓
    [...base].sort((a, b) => Math.min(pecas[b].l, pecas[b].a) - Math.min(pecas[a].l, pecas[a].a)), // menor lado ↓
    [...base].sort((a, b) => pecas[b].a - pecas[a].a),                                               // altura ↓
    [...base].sort((a, b) => pecas[b].l - pecas[a].l),                                               // largura ↓
    [...base].sort((a, b) => (pecas[a].l * pecas[a].a) - (pecas[b].l * pecas[b].a)),               // área ↑
    [...base],                                                                                         // ordem original
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
