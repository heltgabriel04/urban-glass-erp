import { describe, it, expect } from "vitest";
import { empacotarTodas, ehGuilhotinavel } from "@/lib/otimizador";
import pecasReais from "@/lib/fixtures/pecas-p058-p059.json";

// Benchmark com o pedido REAL da obra São Lourenço (P-058 + P-059, 417 peças,
// 226.324 m², Laminado 4+4). Referência: o Corte Certo resolveu em 33 chapas
// (~92.4% de aproveitamento). Nosso motor pré-fase-5 fazia 37 (82.4%) — cada
// chapa a mais é dinheiro indo embora. Teórico: ceil(226.324/7.425) = 31.

describe("benchmark real P-058/P-059 vs Corte Certo", () => {
  it("resolve as 417 peças reais em até 34 chapas (Corte Certo: 33)", () => {
    const pecas = (pecasReais as Array<{ l: number; a: number; pedido: string }>).map(p => ({
      l: p.l, a: p.a, prod: "Laminado 4+4 Incolor", pedidoId: p.pedido,
    }));
    expect(pecas).toHaveLength(417);

    const W = 3300, H = 2250;
    const t0 = Date.now();
    const chapas = empacotarTodas(W, H, pecas, 4, 10000);
    const ms = Date.now() - t0;

    const totalPlaced = chapas.reduce((s, c) => s + c.placed.length, 0);
    const usedArea = chapas.reduce((s, c) => s + c.placed.reduce((a, p) => a + p.l * p.a, 0), 0);
    const aprov = (usedArea / (chapas.length * W * H)) * 100;

    console.log(`REAL P-058/P-059: chapas=${chapas.length} aprov=${aprov.toFixed(2)}% colocadas=${totalPlaced}/417 tempo=${ms}ms (Corte Certo: 33 chapas / 92.4%)`);
    chapas.forEach((c, i) => {
      const fill = c.placed.reduce((s, p) => s + p.l * p.a, 0) / (W * H) * 100;
      console.log(`  chapa${String(i + 1).padStart(2)}: ${String(c.placed.length).padStart(2)} peças, fill=${fill.toFixed(1)}%`);
    });

    // toda chapa precisa ser executável em guilhotina
    chapas.forEach(c => expect(ehGuilhotinavel(c.placed, W, H)).toBe(true));

    expect(totalPlaced).toBe(417);
    expect(chapas.length).toBeLessThanOrEqual(34);
  }, 60000);
});
