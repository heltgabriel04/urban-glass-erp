import { describe, it, expect } from "vitest";
import { statusCaixa, filtrarCaixasCandidatas, resolverCaixaParaVenda } from "@/lib/caixaEstoque";
import type { LoteEstoque } from "@/types";

function loteFake(overrides: Partial<LoteEstoque>): LoteEstoque {
  return {
    id: 1, produto_id: 10, origem_tipo: "compra", origem_id: null, origem_mercadoria: null,
    chapa_largura_mm: 3300, chapa_altura_mm: 2250, pode_rotacionar: true,
    chapas_entrada: 18, chapas_saldo: 18, m2_por_chapa: 7.425, m2_saldo: 133.65,
    custo_m2: null, dt_entrada: "2026-07-21", dt_entrada_estimada: false,
    estoque_minimo_chapas: 0, ativo: true, dimensao_confirmada: true,
    created_at: "2026-07-21T00:00:00Z", codigo: "CX-000001", qr_token: "aaa",
    ...overrides,
  };
}

describe("statusCaixa", () => {
  it("fechada quando saldo == entrada", () => {
    expect(statusCaixa(18, 18)).toBe("fechada");
  });
  it("aberta quando 0 < saldo < entrada", () => {
    expect(statusCaixa(11, 18)).toBe("aberta");
  });
  it("esgotada quando saldo == 0", () => {
    expect(statusCaixa(0, 18)).toBe("esgotada");
  });
  it("esgotada quando saldo negativo (não deveria ocorrer, mas não quebra)", () => {
    expect(statusCaixa(-1, 18)).toBe("esgotada");
  });
});

describe("filtrarCaixasCandidatas", () => {
  const lotes = [
    loteFake({ id: 1, produto_id: 10, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }),
    loteFake({ id: 2, produto_id: 10, chapa_largura_mm: 3660, chapa_altura_mm: 2140 }),
    loteFake({ id: 3, produto_id: 99, chapa_largura_mm: 3300, chapa_altura_mm: 2250 }),
  ];
  it("filtra por produto e medida (com tolerância de rotação)", () => {
    const r = filtrarCaixasCandidatas(lotes, 10, 2250, 3300);
    expect(r.map(l => l.id)).toEqual([1]);
  });
  it("retorna vazio se produtoId for null", () => {
    expect(filtrarCaixasCandidatas(lotes, null, 3300, 2250)).toEqual([]);
  });
  it("retorna vazio se largura/altura forem 0", () => {
    expect(filtrarCaixasCandidatas(lotes, 10, 0, 0)).toEqual([]);
  });
  it("ignora lotes sem dimensão confirmada (chapa_largura_mm null)", () => {
    const comNull = [...lotes, loteFake({ id: 4, produto_id: 10, chapa_largura_mm: null, chapa_altura_mm: null })];
    const r = filtrarCaixasCandidatas(comNull, 10, 3300, 2250);
    expect(r.map(l => l.id)).toEqual([1]);
  });
});

describe("resolverCaixaParaVenda", () => {
  it("nenhuma candidata", () => {
    expect(resolverCaixaParaVenda([], undefined, 5)).toEqual({ ok: false, motivo: "nenhuma_candidata" });
  });
  it("1 candidata com saldo suficiente — auto-resolve sem precisar de escolha", () => {
    const c = loteFake({ id: 7, chapas_saldo: 10 });
    expect(resolverCaixaParaVenda([c], undefined, 5)).toEqual({ ok: true, caixaId: 7 });
  });
  it("1 candidata com saldo insuficiente", () => {
    const c = loteFake({ id: 7, chapas_saldo: 3 });
    expect(resolverCaixaParaVenda([c], undefined, 5)).toEqual({ ok: false, motivo: "saldo_insuficiente", caixaId: 7, saldo: 3, necessario: 5 });
  });
  it("múltiplas candidatas sem escolha — bloqueia pedindo escolha", () => {
    const candidatas = [loteFake({ id: 1 }), loteFake({ id: 2 })];
    expect(resolverCaixaParaVenda(candidatas, undefined, 5)).toEqual({ ok: false, motivo: "multiplas_candidatas", candidatas });
  });
  it("múltiplas candidatas com escolha válida e saldo suficiente", () => {
    const candidatas = [loteFake({ id: 1, chapas_saldo: 10 }), loteFake({ id: 2, chapas_saldo: 20 })];
    expect(resolverCaixaParaVenda(candidatas, 2, 15)).toEqual({ ok: true, caixaId: 2 });
  });
  it("múltiplas candidatas com escolha inválida (id não está entre as candidatas) — trata como sem escolha", () => {
    const candidatas = [loteFake({ id: 1 }), loteFake({ id: 2 })];
    expect(resolverCaixaParaVenda(candidatas, 999, 5)).toEqual({ ok: false, motivo: "multiplas_candidatas", candidatas });
  });
});
