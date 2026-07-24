import { describe, it, expect } from "vitest";
import { casarPecasComItens, proximaAcaoPeca, compararConsistenciaPecas } from "@/services/pecas.service";

describe("casarPecasComItens", () => {
  it("casa peças com itens por dimensão, na ordem do plano de corte", () => {
    const chapas = [
      { placed: [{ l: 500, a: 300 }, { l: 500, a: 300 }, { l: 800, a: 400 }] },
    ];
    const itens = [
      { id: 1, largura: 500, altura: 300, quantidade: 2 },
      { id: 2, largura: 800, altura: 400, quantidade: 1 },
    ];
    const out = casarPecasComItens(chapas, itens);
    expect(out).toHaveLength(3);
    expect(out[0].itemPedidoId).toBe(1);
    expect(out[1].itemPedidoId).toBe(1);
    expect(out[2].itemPedidoId).toBe(2);
    expect(out.map(p => p.ordem)).toEqual([0, 1, 2]);
  });

  it("casa peça rotacionada (largura/altura invertidas) com o mesmo item", () => {
    const chapas = [{ placed: [{ l: 300, a: 500 }] }];
    const itens = [{ id: 1, largura: 500, altura: 300, quantidade: 1 }];
    const out = casarPecasComItens(chapas, itens);
    expect(out[0].itemPedidoId).toBe(1);
  });

  it("retorna itemPedidoId null quando a fila da dimensão já esgotou", () => {
    const chapas = [{ placed: [{ l: 500, a: 300 }, { l: 500, a: 300 }] }];
    const itens = [{ id: 1, largura: 500, altura: 300, quantidade: 1 }];
    const out = casarPecasComItens(chapas, itens);
    expect(out[0].itemPedidoId).toBe(1);
    expect(out[1].itemPedidoId).toBeNull();
  });

  it("numera chapaNum a partir de 1 e preserva ordem entre múltiplas chapas", () => {
    const chapas = [
      { placed: [{ l: 100, a: 100 }] },
      { placed: [{ l: 200, a: 200 }] },
    ];
    const itens = [
      { id: 1, largura: 100, altura: 100, quantidade: 1 },
      { id: 2, largura: 200, altura: 200, quantidade: 1 },
    ];
    const out = casarPecasComItens(chapas, itens);
    expect(out[0].chapaNum).toBe(1);
    expect(out[1].chapaNum).toBe(2);
    expect(out.map(p => p.ordem)).toEqual([0, 1]);
  });
});

describe("compararConsistenciaPecas", () => {
  it("não reporta falta quando toda peça esperada foi criada", () => {
    const itens = [
      { id: 1, produto_nome: "Laminado 4+4 Incolor", quantidade: 2 },
      { id: 2, produto_nome: "Laminado 3+3 Incolor", quantidade: 3 },
    ];
    const pecas = [
      { item_pedido_id: 1 }, { item_pedido_id: 1 },
      { item_pedido_id: 2 }, { item_pedido_id: 2 }, { item_pedido_id: 2 },
    ];
    const out = compararConsistenciaPecas(itens, pecas);
    expect(out).toEqual({ totalEsperado: 5, totalCriado: 5, pecasOrfas: 0, itensComFalta: [] });
  });

  it("reporta item com 0 peças criadas (chapas_json não tem nenhuma peça dessa dimensão)", () => {
    const itens = [{ id: 1, produto_nome: "Laminado 3+3 Incolor", quantidade: 3 }];
    const out = compararConsistenciaPecas(itens, []);
    expect(out.itensComFalta).toEqual([
      { item_pedido_id: 1, produto_nome: "Laminado 3+3 Incolor", quantidade_esperada: 3, pecas_criadas: 0, faltando: 3 },
    ]);
  });

  it("reporta item com falta parcial (algumas peças criadas, não todas)", () => {
    const itens = [{ id: 1, produto_nome: "Laminado 3+3 Incolor", quantidade: 5 }];
    const pecas = [{ item_pedido_id: 1 }, { item_pedido_id: 1 }];
    const out = compararConsistenciaPecas(itens, pecas);
    expect(out.itensComFalta).toEqual([
      { item_pedido_id: 1, produto_nome: "Laminado 3+3 Incolor", quantidade_esperada: 5, pecas_criadas: 2, faltando: 3 },
    ]);
  });

  it("conta peça órfã (item_pedido_id null) separado, sem afetar itensComFalta", () => {
    const itens = [{ id: 1, produto_nome: "Laminado 3+3 Incolor", quantidade: 1 }];
    const pecas = [{ item_pedido_id: 1 }, { item_pedido_id: null }];
    const out = compararConsistenciaPecas(itens, pecas);
    expect(out.pecasOrfas).toBe(1);
    expect(out.totalCriado).toBe(1); // só a peça com item_pedido_id real conta
    expect(out.itensComFalta).toEqual([]);
  });

  it("reproduz a divergência real encontrada manualmente no pedido P-065 (plano desatualizado)", () => {
    // Dados reais dos 35 itens_pedido do pedido P-065 (lidos direto do banco),
    // cada um anotado com quantas peças o chapas_json salvo de fato casou —
    // 13 itens ficaram com 0 peças (17 unidades faltando no total), porque o
    // plano foi salvo antes do pedido ser editado. + 1 peça órfã real
    // (dimensão 2300x1100, que não bate com nenhum item atual).
    const itensComCriadasReais: { id: number; produto_nome: string; quantidade: number; criadasReais: number }[] = [
      { id: 831, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 832, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 833, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 834, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 835, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 836, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 837, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 838, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 839, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 840, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 841, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 842, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 843, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 844, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 845, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 846, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 847, produto_nome: "Laminado 3+3 Incolor", quantidade: 3, criadasReais: 0 },
      { id: 848, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 849, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 850, produto_nome: "Laminado 3+3 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 851, produto_nome: "Laminado 3+3 Incolor", quantidade: 2, criadasReais: 0 },
      { id: 852, produto_nome: "Laminado 3+3 Incolor", quantidade: 2, criadasReais: 0 },
      { id: 818, produto_nome: "Laminado 4+4 Incolor", quantidade: 3, criadasReais: 3 },
      { id: 819, produto_nome: "Laminado 4+4 Incolor", quantidade: 3, criadasReais: 3 },
      { id: 820, produto_nome: "Laminado 4+4 Incolor", quantidade: 2, criadasReais: 2 },
      { id: 821, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 822, produto_nome: "Laminado 4+4 Incolor", quantidade: 2, criadasReais: 2 },
      { id: 823, produto_nome: "Laminado 4+4 Incolor", quantidade: 2, criadasReais: 2 },
      { id: 824, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 0 },
      { id: 825, produto_nome: "Laminado 4+4 Incolor", quantidade: 3, criadasReais: 3 },
      { id: 826, produto_nome: "Laminado 4+4 Incolor", quantidade: 2, criadasReais: 2 },
      { id: 827, produto_nome: "Laminado 4+4 Incolor", quantidade: 3, criadasReais: 3 },
      { id: 828, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 829, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
      { id: 830, produto_nome: "Laminado 4+4 Incolor", quantidade: 1, criadasReais: 1 },
    ];

    const itens = itensComCriadasReais.map(({ id, produto_nome, quantidade }) => ({ id, produto_nome, quantidade }));
    const pecas = [
      ...itensComCriadasReais.flatMap(i => Array.from({ length: i.criadasReais }, () => ({ item_pedido_id: i.id }))),
      { item_pedido_id: null }, // peça órfã real, dimensão 2300x1100
    ];

    const out = compararConsistenciaPecas(itens, pecas);

    expect(out.totalEsperado).toBe(51);
    expect(out.totalCriado).toBe(34);
    expect(out.pecasOrfas).toBe(1);
    expect(out.itensComFalta).toHaveLength(13);
    expect(out.itensComFalta.reduce((soma, i) => soma + i.faltando, 0)).toBe(17);
    expect(out.itensComFalta.every(i => i.pecas_criadas === 0)).toBe(true);
    expect(out.itensComFalta.map(i => i.item_pedido_id).sort((a, b) => a - b)).toEqual(
      [841, 842, 843, 844, 845, 846, 847, 848, 849, 850, 851, 852, 824].sort((a, b) => a - b),
    );
  });
});

describe("proximaAcaoPeca", () => {
  it("pendente → corte", () => {
    expect(proximaAcaoPeca({ status: "pendente" })).toBe("corte");
  });
  it("cortada → lapidacao", () => {
    expect(proximaAcaoPeca({ status: "cortada" })).toBe("lapidacao");
  });
  it("lapidada → separacao", () => {
    expect(proximaAcaoPeca({ status: "lapidada" })).toBe("separacao");
  });
  it("separada → null (já concluída)", () => {
    expect(proximaAcaoPeca({ status: "separada" })).toBeNull();
  });
});
