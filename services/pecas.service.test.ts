import { describe, it, expect } from "vitest";
import { casarPecasComItens, proximaAcaoPeca } from "@/services/pecas.service";

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
