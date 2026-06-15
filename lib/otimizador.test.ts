import { describe, it, expect } from "vitest";
import { empacotar, calcAproveitamento, type PecaPlacada } from "@/lib/otimizador";

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
