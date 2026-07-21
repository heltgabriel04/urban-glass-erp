import { describe, it, expect } from "vitest";
import { calcularMovimentacao } from "@/lib/movimentacaoEstoque";

describe("calcularMovimentacao", () => {
  it("saída simples decrementa saldo e usa o custo vigente como custo efetivo", () => {
    const r = calcularMovimentacao(
      { chapasSaldo: 10, m2Saldo: 74.25, custoM2: 20 },
      { tipo: "saida_producao", chapas: -1, m2: -7.425 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resultado.novoSaldoChapas).toBe(9);
      expect(r.resultado.novoSaldoM2).toBeCloseTo(66.825, 3);
      expect(r.resultado.custoEfetivo).toBe(20); // custo vigente, não informado na saída
      expect(r.resultado.novoCustoM2).toBe(20); // saída não recalcula média
    }
  });

  it("bloqueia saída que levaria chapas_saldo a negativo", () => {
    const r = calcularMovimentacao(
      { chapasSaldo: 1, m2Saldo: 7.425, custoM2: 20 },
      { tipo: "saida_producao", chapas: -2, m2: -14.85 },
    );
    expect(r.ok).toBe(false);
  });

  it("bloqueia saída que levaria m2_saldo a negativo", () => {
    const r = calcularMovimentacao(
      { chapasSaldo: 5, m2Saldo: 1, custoM2: 20 },
      { tipo: "saida_producao", chapas: -1, m2: -5 },
    );
    expect(r.ok).toBe(false);
  });

  it("entrada com custo recalcula média ponderada pelo saldo anterior", () => {
    // 100m² a 10 + 50m² a 40 = (1000+2000)/150 = 20
    const r = calcularMovimentacao(
      { chapasSaldo: 10, m2Saldo: 100, custoM2: 10 },
      { tipo: "entrada_compra", chapas: 5, m2: 50, custoUnitarioM2: 40 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado.novoCustoM2).toBe(20);
  });

  it("'ajuste' com custo substitui direto, sem diluir na média", () => {
    const r = calcularMovimentacao(
      { chapasSaldo: 10, m2Saldo: 100, custoM2: 10 },
      { tipo: "ajuste", chapas: 5, m2: 50, custoUnitarioM2: 999 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado.novoCustoM2).toBe(999);
  });

  it("entrada sem custo informado preserva o custo médio atual", () => {
    const r = calcularMovimentacao(
      { chapasSaldo: 10, m2Saldo: 100, custoM2: 15 },
      { tipo: "entrada_compra", chapas: 5, m2: 50 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado.novoCustoM2).toBe(15);
  });

  // Regressão: lotes_estoque.custo_m2 pode ser null (lote sem custo
  // definido ainda) — comportamento que não existia antes desta migração.
  describe("custoM2 atual null (só possível em lote)", () => {
    it("saída sem custo informado sai com custoEfetivo null — nunca vira 0", () => {
      const r = calcularMovimentacao(
        { chapasSaldo: 10, m2Saldo: 78.324, custoM2: null },
        { tipo: "saida_producao", chapas: -1, m2: -7.8324 },
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.resultado.custoEfetivo).toBeNull();
        expect(r.resultado.novoCustoM2).toBeNull(); // continua indisponível
      }
    });

    it("primeira entrada com custo informado define o custo direto (nada pra diluir)", () => {
      const r = calcularMovimentacao(
        { chapasSaldo: 10, m2Saldo: 78.324, custoM2: null },
        { tipo: "entrada_compra", chapas: 5, m2: 39.162, custoUnitarioM2: 25 },
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.resultado.novoCustoM2).toBe(25);
    });
  });
});
