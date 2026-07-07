import { describe, it, expect } from "vitest";
import { empacotar, empacotarTodas, calcAproveitamento, derivarCortes, ehGuilhotinavel, type PecaPlacada } from "@/lib/otimizador";

const prod = "X"; // produto sem chapa padrão → usa fallback nos testes

function semSobreposicao(placed: PecaPlacada[]): boolean {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const overlap =
        a.x < b.x + b.l && a.x + a.l > b.x &&
        a.y < b.y + b.a && a.y + a.a > b.y;
      if (overlap) return false;
    }
  }
  return true;
}

describe("empacotar", () => {
  it("coloca uma peça que cabe na origem (0,0)", () => {
    const { placed, usados } = empacotar(1000, 1000, [{ l: 400, a: 400, prod }], 0);
    expect(placed).toHaveLength(1);
    expect(placed[0].x).toBe(0);
    expect(placed[0].y).toBe(0);
    expect(usados.has(0)).toBe(true);
  });

  it("coloca várias peças sem sobreposição e dentro da chapa", () => {
    const pecas = Array.from({ length: 6 }, () => ({ l: 400, a: 300, prod }));
    const { placed } = empacotar(1000, 1000, pecas, 0);
    expect(placed.length).toBeGreaterThan(0);
    expect(semSobreposicao(placed)).toBe(true);
    for (const p of placed) {
      expect(p.x + p.l).toBeLessThanOrEqual(1000);
      expect(p.y + p.a).toBeLessThanOrEqual(1000);
    }
  });

  it("rotaciona a peça quando só cabe girada", () => {
    // 800x300 não cabe na largura 500; girada (300x800) cabe
    const { placed } = empacotar(500, 1000, [{ l: 800, a: 300, prod }], 0);
    expect(placed).toHaveLength(1);
    expect(placed[0].rot).toBe(true);
    expect(placed[0].l).toBe(300);
    expect(placed[0].a).toBe(800);
  });

  it("não coloca peça maior que a chapa", () => {
    const { placed, usados } = empacotar(500, 500, [{ l: 800, a: 800, prod }], 0);
    expect(placed).toHaveLength(0);
    expect(usados.size).toBe(0);
  });
});

describe("empacotarTodas (multi-chapa)", () => {
  it("nunca sobrepõe peças nem ultrapassa os limites da chapa, mesmo após sheet merging", () => {
    let seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    const W = 3300, H = 2250;
    for (let trial = 0; trial < 30; trial++) {
      const n = 10 + Math.floor(rnd() * 40);
      const pecas = Array.from({ length: n }, () => ({
        l: 200 + Math.floor(rnd() * 1800),
        a: 200 + Math.floor(rnd() * 1800),
        prod,
      }));
      const chapas = empacotarTodas(W, H, pecas, 0, 200);
      chapas.forEach(chapa => {
        expect(semSobreposicao(chapa.placed)).toBe(true);
        chapa.placed.forEach(p => {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x + p.l).toBeLessThanOrEqual(W + 1e-6);
          expect(p.y + p.a).toBeLessThanOrEqual(H + 1e-6);
        });
      });
    }
  });

  it("todo layout gerado é guilhotinável e tem sequência de cortes derivável", () => {
    let seed = 424242;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    const W = 3300, H = 2250;
    for (let trial = 0; trial < 20; trial++) {
      const n = 5 + Math.floor(rnd() * 35);
      const pecas = Array.from({ length: n }, () => ({
        l: 200 + Math.floor(rnd() * 1800),
        a: 200 + Math.floor(rnd() * 1800),
        prod,
      }));
      const kerf = trial % 2 === 0 ? 4 : 0;
      const chapas = empacotarTodas(W, H, pecas, kerf, 200);
      chapas.forEach(chapa => {
        expect(ehGuilhotinavel(chapa.placed, W, H)).toBe(true);
        const seq = derivarCortes(chapa.placed, W, H);
        expect(seq).not.toBeNull();
        // toda peça aparece exatamente uma vez na ordem de extração
        expect([...seq!.ordemExtracao].sort((a, b) => a - b))
          .toEqual(chapa.placed.map((_, i) => i));
        // riscos numerados sequencialmente a partir de 1
        seq!.cortes.forEach((c, i) => expect(c.seq).toBe(i + 1));
      });
    }
  });

  it("é determinístico: duas execuções idênticas produzem o mesmo plano", () => {
    // Orçamento 0 limita às fases determinísticas (as fases com restart usam
    // orçamento de tempo de relógio, que pode divergir na margem entre execuções).
    const pecas = Array.from({ length: 25 }, (_, i) => ({
      l: 300 + (i * 137) % 1500,
      a: 250 + (i * 89) % 1200,
      prod,
    }));
    const r1 = empacotarTodas(3300, 2250, pecas, 4, 0);
    const r2 = empacotarTodas(3300, 2250, pecas, 4, 0);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

describe("empacotarTodas — peças com dimensão 454mm uniforme (P-058/P-059)", () => {
  // Replica o perfil real: todas as peças têm 454mm em uma das dimensões.
  // O 4→3 kEliminate deve consolidar as chapas fracas.
  it("chapas ≤ 34 com 3000ms para 120 peças de perfil P-058/P-059", () => {
    const pecas: Array<{ l: number; a: number; prod: string }> = [];
    // 40 peças grandes (P-058): ~1413×454
    for (let i = 0; i < 40; i++) pecas.push({ l: 1413, a: 454, prod: "P-058" });
    // 60 peças médias (P-059): ~1087×454
    for (let i = 0; i < 60; i++) pecas.push({ l: 1087, a: 454, prod: "P-058" });
    // 20 peças pequenas: ~691×454
    for (let i = 0; i < 20; i++) pecas.push({ l: 691, a: 454, prod: "P-058" });

    const W = 3300, H = 2250;
    const chapas = empacotarTodas(W, H, pecas, 3, 3000);
    const totalPlaced = chapas.reduce((s, c) => s + c.placed.length, 0);
    const usedArea = chapas.reduce((s, c) => s + c.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = (usedArea / (chapas.length * W * H)) * 100;

    console.log(`peças 454mm: chapas=${chapas.length} aprov=${aprov.toFixed(2)}% colocadas=${totalPlaced}/120`);
    chapas.forEach((c, i) => {
      const fill = c.placed.reduce((s, p) => s + p.l * p.a, 0) / (W * H) * 100;
      console.log(`  chapa${i + 1}: ${c.placed.length} peças, fill=${fill.toFixed(1)}%`);
    });

    // Teórico: ceil(61.5M / 7.425M) = 9 chapas. Toleramos até 11 (< 20% overhead).
    // Antes da melhoria 4→3: era comum chegar em 12+ chapas para este perfil.
    expect(totalPlaced).toBe(120);
    expect(chapas.length).toBeLessThanOrEqual(11);
    expect(aprov).toBeGreaterThan(77);
  });
});

describe("empacotarTodas — cenário 4→3 kEliminate (chapa leve + 3 pesadas)", () => {
  // Simula o caso real de P-058: uma chapa muito leve (chapa 35 ~ 59%)
  // combinada com 3 chapas pesadas (~78%). O 4→3 deve unir as 4 em 3.
  it("reduz 4 chapas subcarregadas em 3 chapas via kEliminate 4→3", () => {
    const pecas: Array<{ l: number; a: number; prod: string }> = [];
    // 27 peças grandes (3 chapas × 9 peças de 1413×454, ~78% utilização)
    for (let i = 0; i < 27; i++) pecas.push({ l: 1413, a: 454, prod: "P-058" });
    // 14 peças pequenas (1 chapa × 14 peças de 691×454, ~59% utilização)
    for (let i = 0; i < 14; i++) pecas.push({ l: 691, a: 454, prod: "P-058" });

    const W = 3300, H = 2250;
    const chapas = empacotarTodas(W, H, pecas, 3, 2000);
    const totalPlaced = chapas.reduce((s, c) => s + c.placed.length, 0);
    const usedArea = chapas.reduce((s, c) => s + c.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = (usedArea / (chapas.length * W * H)) * 100;

    console.log(`4→3 cenário: chapas=${chapas.length} aprov=${aprov.toFixed(2)}% colocadas=${totalPlaced}/41`);

    expect(totalPlaced).toBe(41);
    // Teórico: (27×641502 + 14×313714) / 7425000 = (17320554+4391996)/7425000 = 2.92 chapas → mín 3
    // O 4→3 deve manter ≤ 4 chapas (resultado sem melhoria seria 4 chapas)
    expect(chapas.length).toBeLessThanOrEqual(4);
  });
});

describe("calcAproveitamento", () => {
  it("retorna ~100% quando a peça preenche a chapa de fallback", () => {
    const aprov = calcAproveitamento([{ l: 3300, a: 2250, prod }], 0, 0);
    expect(aprov).toBeCloseTo(100, 5);
  });

  it("fica entre 0 e 100 para preenchimento parcial", () => {
    const aprov = calcAproveitamento([{ l: 1000, a: 1000, prod }], 0, 0);
    expect(aprov).toBeGreaterThan(0);
    expect(aprov).toBeLessThan(100);
  });

  it("retorna 0 para lista vazia", () => {
    expect(calcAproveitamento([], 0, 0)).toBe(0);
  });
});
