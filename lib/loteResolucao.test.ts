import { describe, it, expect } from "vitest";
import { resolverDimensaoPorProduto } from "@/lib/loteResolucao";
import type { LoteEstoque } from "@/types";

function lote(over: Partial<LoteEstoque>): LoteEstoque {
  return {
    id: 1, produto_id: 10, origem_tipo: "compra", origem_id: null, origem_mercadoria: null,
    chapa_largura_mm: 3660, chapa_altura_mm: 2140, pode_rotacionar: true,
    chapas_entrada: 10, chapas_saldo: 10, m2_por_chapa: 7.8324, m2_saldo: 78.324,
    custo_m2: null, dt_entrada: "2026-07-20", dt_entrada_estimada: false,
    estoque_minimo_chapas: 0, ativo: true, dimensao_confirmada: true, created_at: "2026-07-20",
    ...over,
  };
}

describe("resolverDimensaoPorProduto", () => {
  it("usa o único lote utilizável automaticamente", () => {
    const pecas = [{ prod: "Laminado 4+4 Incolor", produtoId: 10 }];
    const lotesPorProduto = new Map([[10, [lote({ id: 6 })]]]);
    const r = resolverDimensaoPorProduto(pecas, lotesPorProduto, new Map());
    expect(r.dimensaoPorProduto.get("Laminado 4+4 Incolor")).toEqual({ w: 3660, h: 2140 });
    expect(r.loteUsadoPorProduto.get("Laminado 4+4 Incolor")).toBe(6);
    expect(r.pecasExcluidas.size).toBe(0);
  });

  it("exclui produto sem nenhum lote utilizável (mapa vazio)", () => {
    const pecas = [{ prod: "Laminado 4+4 Verde", produtoId: 13 }, { prod: "Laminado 4+4 Verde", produtoId: 13 }];
    const r = resolverDimensaoPorProduto(pecas, new Map(), new Map());
    expect(r.dimensaoPorProduto.size).toBe(0);
    expect(r.pecasExcluidas.get("Laminado 4+4 Verde")).toBe(2);
  });

  it("exclui produto com múltiplos lotes SEM escolha explícita do operador", () => {
    const pecas = [{ prod: "Laminado 4+4 Incolor", produtoId: 10 }];
    const lotesPorProduto = new Map([[10, [lote({ id: 1, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }), lote({ id: 6 })]]]);
    const r = resolverDimensaoPorProduto(pecas, lotesPorProduto, new Map());
    expect(r.dimensaoPorProduto.size).toBe(0);
    expect(r.pecasExcluidas.get("Laminado 4+4 Incolor")).toBe(1);
  });

  it("usa o lote escolhido explicitamente quando há múltiplos", () => {
    const pecas = [{ prod: "Laminado 4+4 Incolor", produtoId: 10 }];
    const lotesPorProduto = new Map([[10, [lote({ id: 1, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }), lote({ id: 6 })]]]);
    const r = resolverDimensaoPorProduto(pecas, lotesPorProduto, new Map([[10, 6]]));
    expect(r.dimensaoPorProduto.get("Laminado 4+4 Incolor")).toEqual({ w: 3660, h: 2140 });
    expect(r.loteUsadoPorProduto.get("Laminado 4+4 Incolor")).toBe(6);
  });

  it("peça sem produtoId (modo avulso/teste) fica de fora, sem contar como excluída por falta de lote", () => {
    const pecas = [{ prod: "Teste avulso", produtoId: undefined }];
    const r = resolverDimensaoPorProduto(pecas, new Map(), new Map());
    expect(r.dimensaoPorProduto.size).toBe(0);
    expect(r.pecasExcluidas.get("Teste avulso")).toBe(1);
  });

  it("resolve produtos diferentes independentemente na mesma chamada", () => {
    const pecas = [
      { prod: "A", produtoId: 10 },
      { prod: "B", produtoId: 13 },
    ];
    const lotesPorProduto = new Map([[10, [lote({ id: 6 })]]]); // só produto 10 tem lote
    const r = resolverDimensaoPorProduto(pecas, lotesPorProduto, new Map());
    expect(r.dimensaoPorProduto.get("A")).toEqual({ w: 3660, h: 2140 });
    expect(r.dimensaoPorProduto.has("B")).toBe(false);
    expect(r.pecasExcluidas.get("B")).toBe(1);
  });
});
