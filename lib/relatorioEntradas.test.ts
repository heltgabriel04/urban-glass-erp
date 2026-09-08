import { describe, it, expect } from "vitest";
import {
  montarLinhasEntradas, parcelasRecebidasSemConta, pedidosSemLancamento, parcelasVencidasSemBaixa,
  contaFormaExibicao, formaPgtoExibicao,
} from "./relatorioEntradas";
import type { Lancamento, BaixaLancamento, ContaBancaria, Pedido } from "@/types";

function lanc(overrides: Partial<Lancamento>): Lancamento {
  return {
    id: 1, tipo: "Entrada", descricao: "Parcela 1/1 · P-001", valor: 1000, status: "A Receber",
    vencimento: "2026-09-01", pedido_id: "P-001", cliente_id: 1, created_at: "2026-08-01T00:00:00Z",
    clientes: { id: 1, nome: "Cliente A" },
    ...overrides,
  } as Lancamento;
}

function baixa(overrides: Partial<BaixaLancamento>): BaixaLancamento {
  return {
    id: 1, lancamento_id: 1, valor: 1000, data: "2026-09-05", conta_id: 1, forma_pgto: "Pix",
    obs: null, estornado_em: null, estornado_motivo: null, created_at: "2026-09-05T00:00:00Z",
    ...overrides,
  } as BaixaLancamento;
}

const contas: ContaBancaria[] = [
  { id: 1, nome: "Banco X", banco: "X", tipo: "Banco", saldo_inicial: 0, ativo: true, created_at: "" },
];
const contasPorId = new Map(contas.map(c => [c.id, c]));

describe("montarLinhasEntradas", () => {
  it("gera uma linha por baixa, com conta/forma/valor/data da baixa", () => {
    const l = lanc({ id: 1, status: "A Receber" });
    const baixas = new Map([[1, [baixa({ lancamento_id: 1, valor: 1000, conta_id: 1, forma_pgto: "Pix", data: "2026-09-05" })]]]);
    const linhas = montarLinhasEntradas([l], baixas, contasPorId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      pedidoId: "P-001", cliente: "Cliente A", parcela: "Parcela 1/1 · P-001",
      valor: 1000, conta: "Banco X", formaPgto: "Pix", data: "2026-09-05",
    });
  });

  it("divide pagamento parcial em contas diferentes em duas linhas", () => {
    const l = lanc({ id: 1, valor: 1000, status: "A Receber" });
    const baixas = new Map([[1, [
      baixa({ id: 1, lancamento_id: 1, valor: 600, conta_id: 1, data: "2026-09-05" }),
      baixa({ id: 2, lancamento_id: 1, valor: 400, conta_id: undefined as unknown as number, data: "2026-09-10", forma_pgto: "Dinheiro" }),
    ]]]);
    const linhas = montarLinhasEntradas([l], baixas, contasPorId);
    expect(linhas).toHaveLength(2);
    expect(linhas.map(r => r.valor).sort()).toEqual([400, 600]);
    // sem conta_id na segunda baixa -> "—"
    expect(linhas.find(r => r.valor === 400)?.conta).toBe("—");
  });

  it("baixa estornada não gera linha", () => {
    const l = lanc({ id: 1 });
    const baixas = new Map([[1, [baixa({ estornado_em: "2026-09-06T00:00:00Z" })]]]);
    expect(montarLinhasEntradas([l], baixas, contasPorId)).toHaveLength(0);
  });

  it("título Pago sem nenhuma baixa (legado) vira linha sintética a partir do próprio lançamento", () => {
    const l = lanc({ id: 2, status: "Pago", valor: 500, conta_id: 1, forma_pgto: "Boleto", dt_pagamento: "2026-08-20" });
    const linhas = montarLinhasEntradas([l], new Map(), contasPorId);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ valor: 500, conta: "Banco X", formaPgto: "Boleto", data: "2026-08-20" });
  });

  it("ignora lançamento de Saída, deletado, ou sem pedido_id", () => {
    const saida = lanc({ id: 3, tipo: "Saída", status: "Pago" });
    const deletado = lanc({ id: 4, status: "Pago", deletado_em: "2026-09-01T00:00:00Z" });
    const semPedido = lanc({ id: 5, status: "Pago", pedido_id: null });
    expect(montarLinhasEntradas([saida, deletado, semPedido], new Map(), contasPorId)).toHaveLength(0);
  });

  it("título A Receber sem nenhuma baixa não aparece (nada foi recebido)", () => {
    const l = lanc({ id: 6, status: "A Receber" });
    expect(montarLinhasEntradas([l], new Map(), contasPorId)).toHaveLength(0);
  });

  it("filtra por período usando a data da baixa", () => {
    const l = lanc({ id: 1 });
    const baixas = new Map([[1, [baixa({ data: "2026-09-05" })]]]);
    expect(montarLinhasEntradas([l], baixas, contasPorId, { inicio: "2026-08-01", fim: "2026-08-31" })).toHaveLength(0);
    expect(montarLinhasEntradas([l], baixas, contasPorId, { inicio: "2026-09-01", fim: "2026-09-30" })).toHaveLength(1);
  });
});

describe("parcelasRecebidasSemConta", () => {
  it("acusa parcela recebida cuja baixa não tem conta_id", () => {
    const l = lanc({ id: 1 });
    const baixas = new Map([[1, [baixa({ conta_id: null })]]]);
    const r = parcelasRecebidasSemConta([l], baixas);
    expect(r).toHaveLength(1);
    expect(r[0].pedidoId).toBe("P-001");
  });

  it("não acusa quando a baixa tem conta_id", () => {
    const l = lanc({ id: 1 });
    const baixas = new Map([[1, [baixa({ conta_id: 1 })]]]);
    expect(parcelasRecebidasSemConta([l], baixas)).toHaveLength(0);
  });

  it("legado Pago sem baixa e sem conta_id no lançamento é acusado", () => {
    const l = lanc({ id: 2, status: "Pago", conta_id: null });
    expect(parcelasRecebidasSemConta([l], new Map())).toHaveLength(1);
  });

  it("parcela ainda não recebida (valorPago 0) não entra na lista", () => {
    const l = lanc({ id: 1, status: "A Receber" });
    expect(parcelasRecebidasSemConta([l], new Map())).toHaveLength(0);
  });
});

describe("pedidosSemLancamento", () => {
  const pedidos: Pedido[] = [
    { id: "P-001", status: "Entregue", valor_total: 1000, clientes: { id: 1, nome: "Cliente A" } } as Pedido,
    { id: "P-002", status: "Finalizado", valor_total: 2000, clientes: { id: 2, nome: "Cliente B" } } as Pedido,
    { id: "P-003", status: "Cancelado", valor_total: 500, clientes: { id: 3, nome: "Cliente C" } } as Pedido,
  ];

  it("lista pedidos ativos sem nenhum lançamento de Entrada vinculado", () => {
    const lancamentos = [lanc({ id: 1, pedido_id: "P-001" })];
    const r = pedidosSemLancamento(pedidos, lancamentos);
    expect(r.map(p => p.pedidoId)).toEqual(["P-002"]);
  });

  it("ignora pedidos Cancelados mesmo sem lançamento", () => {
    const r = pedidosSemLancamento(pedidos, []);
    expect(r.map(p => p.pedidoId).sort()).toEqual(["P-001", "P-002"]);
  });

  it("lançamento deletado não conta como vínculo válido", () => {
    const lancamentos = [lanc({ id: 1, pedido_id: "P-001", deletado_em: "2026-09-01T00:00:00Z" })];
    const r = pedidosSemLancamento(pedidos, lancamentos);
    expect(r.map(p => p.pedidoId)).toContain("P-001");
  });
});

describe("contaFormaExibicao", () => {
  it("título ainda não recebido mostra travessão, sem alerta", () => {
    const r = contaFormaExibicao({ status: "A Receber", conta_id: null }, undefined, contasPorId);
    expect(r).toEqual({ texto: "—", faltando: false });
  });

  it("uma baixa com conta -> nome da conta", () => {
    const baixas = [baixa({ conta_id: 1 })];
    const r = contaFormaExibicao({ status: "A Receber", conta_id: null }, baixas, contasPorId);
    expect(r).toEqual({ texto: "Banco X", faltando: false });
  });

  it("baixa sem conta_id -> alerta", () => {
    const baixas = [baixa({ conta_id: null })];
    const r = contaFormaExibicao({ status: "A Receber", conta_id: null }, baixas, contasPorId);
    expect(r).toEqual({ texto: "sem conta", faltando: true });
  });

  it("duas baixas em contas diferentes -> resumo 'N contas'", () => {
    const outraConta = new Map([...contasPorId, [2, { id: 2, nome: "Caixa", banco: null, tipo: "Caixa", saldo_inicial: 0, ativo: true, created_at: "" } as ContaBancaria]]);
    const baixas = [baixa({ id: 1, conta_id: 1 }), baixa({ id: 2, conta_id: 2 })];
    const r = contaFormaExibicao({ status: "A Receber", conta_id: null }, baixas, outraConta);
    expect(r).toEqual({ texto: "2 contas", faltando: false });
  });

  it("legado Pago sem baixa usa conta_id do próprio lançamento", () => {
    const r = contaFormaExibicao({ status: "Pago", conta_id: 1 }, undefined, contasPorId);
    expect(r).toEqual({ texto: "Banco X", faltando: false });
  });

  it("legado Pago sem baixa e sem conta_id -> alerta", () => {
    const r = contaFormaExibicao({ status: "Pago", conta_id: null }, undefined, contasPorId);
    expect(r).toEqual({ texto: "sem conta", faltando: true });
  });
});

describe("formaPgtoExibicao", () => {
  it("junta formas distintas de várias baixas", () => {
    const baixas = [baixa({ id: 1, forma_pgto: "Pix" }), baixa({ id: 2, forma_pgto: "Boleto" })];
    expect(formaPgtoExibicao({ status: "A Receber", forma_pgto: null }, baixas)).toBe("Pix, Boleto");
  });

  it("sem baixa e não pago -> travessão", () => {
    expect(formaPgtoExibicao({ status: "A Receber", forma_pgto: null }, undefined)).toBe("—");
  });

  it("legado Pago sem baixa usa forma_pgto do lançamento", () => {
    expect(formaPgtoExibicao({ status: "Pago", forma_pgto: "Transferência" }, undefined)).toBe("Transferência");
  });
});

describe("parcelasVencidasSemBaixa", () => {
  const hoje = "2026-09-08";

  it("acusa parcela vencida sem nenhuma baixa", () => {
    const l = lanc({ id: 1, status: "A Receber", vencimento: "2026-08-01" });
    const r = parcelasVencidasSemBaixa([l], new Map(), hoje);
    expect(r).toHaveLength(1);
    expect(r[0].diasAtraso).toBe(38);
  });

  it("não acusa quando já teve baixa parcial", () => {
    const l = lanc({ id: 1, status: "A Receber", vencimento: "2026-08-01" });
    const baixas = new Map([[1, [baixa({ valor: 100 })]]]);
    expect(parcelasVencidasSemBaixa([l], baixas, hoje)).toHaveLength(0);
  });

  it("não acusa parcela ainda não vencida nem permuta", () => {
    const aVencer = lanc({ id: 1, status: "A Receber", vencimento: "2026-12-01" });
    const permuta = lanc({ id: 2, status: "A Receber", vencimento: "2026-08-01", permuta: true });
    expect(parcelasVencidasSemBaixa([aVencer, permuta], new Map(), hoje)).toHaveLength(0);
  });
});
