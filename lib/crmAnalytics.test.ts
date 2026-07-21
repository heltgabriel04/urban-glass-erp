import { describe, it, expect } from "vitest";
import {
  calcularFollowUpsAtrasados, calcularVolumePorMes,
  calcularConversaoInteracaoOrcamento, calcularClientesSemContato,
  type InteracaoComCliente,
} from "@/lib/crmAnalytics";

// data no formato real da coluna (timestamptz) — nunca YYYY-MM-DD puro, pra
// pegar de verdade o bug de comparar timestamp completo com date pura
// (dt_criacao de orçamento).
function interacao(over: Partial<InteracaoComCliente> & { data?: string }): InteracaoComCliente {
  const dataBase = over.data ?? "2026-07-01";
  return {
    id: 1, cliente_id: 1, clienteNome: "Cliente A",
    tipo: "ligacao", proximo_contato: null,
    ...over,
    data: dataBase.includes("T") ? dataBase : `${dataBase}T14:30:00+00:00`,
  };
}

describe("calcularFollowUpsAtrasados", () => {
  it("inclui interação com proximo_contato no passado", () => {
    const out = calcularFollowUpsAtrasados(
      [interacao({ id: 1, proximo_contato: "2026-07-10" })],
      "2026-07-21",
    );
    expect(out).toHaveLength(1);
    expect(out[0].diasAtraso).toBe(11);
  });

  it("ignora interação sem proximo_contato ou com data futura", () => {
    const out = calcularFollowUpsAtrasados(
      [
        interacao({ id: 1, proximo_contato: null }),
        interacao({ id: 2, proximo_contato: "2026-08-01" }),
      ],
      "2026-07-21",
    );
    expect(out).toHaveLength(0);
  });

  it("ordena do mais atrasado pro menos atrasado", () => {
    const out = calcularFollowUpsAtrasados(
      [
        interacao({ id: 1, proximo_contato: "2026-07-19" }),
        interacao({ id: 2, proximo_contato: "2026-07-01" }),
      ],
      "2026-07-21",
    );
    expect(out.map(f => f.interacaoId)).toEqual([2, 1]);
  });
});

describe("calcularVolumePorMes", () => {
  it("agrupa por mês e tipo", () => {
    const out = calcularVolumePorMes([
      interacao({ tipo: "ligacao", data: "2026-07-05" }),
      interacao({ tipo: "email", data: "2026-07-10" }),
      interacao({ tipo: "ligacao", data: "2026-06-15" }),
    ]);
    expect(out).toEqual([
      { mes: "2026-06", ligacao: 1, email: 0, reuniao: 0, nota: 0, total: 1 },
      { mes: "2026-07", ligacao: 1, email: 1, reuniao: 0, nota: 0, total: 2 },
    ]);
  });
});

describe("calcularConversaoInteracaoOrcamento", () => {
  it("conta como convertido quando há orçamento dentro da janela após a 1ª interação", () => {
    const r = calcularConversaoInteracaoOrcamento(
      [interacao({ cliente_id: 1, data: "2026-06-01", clienteNome: "A" })],
      [{ cliente_id: 1, dt_criacao: "2026-06-20" }],
      90,
    );
    expect(r.totalClientesComInteracao).toBe(1);
    expect(r.clientesConvertidos).toBe(1);
    expect(r.taxaConversao).toBe(100);
    expect(r.detalhes[0].diasParaConverter).toBe(19);
  });

  it("não conta orçamento fora da janela ou anterior à interação", () => {
    const r = calcularConversaoInteracaoOrcamento(
      [interacao({ cliente_id: 1, data: "2026-06-01" })],
      [
        { cliente_id: 1, dt_criacao: "2026-05-01" }, // antes
        { cliente_id: 1, dt_criacao: "2026-10-01" }, // fora da janela de 90 dias
      ],
      90,
    );
    expect(r.clientesConvertidos).toBe(0);
    expect(r.taxaConversao).toBe(0);
  });

  it("usa a primeira interação do cliente como âncora", () => {
    const r = calcularConversaoInteracaoOrcamento(
      [
        interacao({ cliente_id: 1, data: "2026-06-15" }),
        interacao({ cliente_id: 1, data: "2026-06-01" }),
      ],
      [{ cliente_id: 1, dt_criacao: "2026-06-10" }],
      90,
    );
    expect(r.detalhes[0].dataInteracao).toBe("2026-06-01");
  });

  // Regressão: interacoes_cliente.data é timestamptz (string completa,
  // "2026-06-01T14:30:00+00:00"), dt_criacao de orçamento é date pura
  // ("2026-06-01"). Comparar as strings cruas faria uma conversão no MESMO
  // dia parecer "antes" da interação (prefixo de string é sempre "menor"),
  // excluindo o caso mais comum de follow-up eficaz.
  it("conta conversão no mesmo dia da interação (timestamp completo vs. date pura)", () => {
    const r = calcularConversaoInteracaoOrcamento(
      [interacao({ cliente_id: 1, data: "2026-06-01T14:30:00+00:00" })],
      [{ cliente_id: 1, dt_criacao: "2026-06-01" }],
      90,
    );
    expect(r.clientesConvertidos).toBe(1);
    expect(r.detalhes[0].diasParaConverter).toBe(0);
  });
});

describe("calcularClientesSemContato", () => {
  it("inclui cliente sem nenhuma interação registrada", () => {
    const out = calcularClientesSemContato(
      [{ id: 1, nome: "Nunca contatado" }],
      [],
      "2026-07-21",
    );
    expect(out).toHaveLength(1);
    expect(out[0].ultimaInteracao).toBeNull();
  });

  it("exclui cliente com interação recente (abaixo do limiar)", () => {
    const out = calcularClientesSemContato(
      [{ id: 1, nome: "Recente" }],
      [interacao({ cliente_id: 1, data: "2026-07-10" })],
      "2026-07-21",
      60,
    );
    expect(out).toHaveLength(0);
  });

  it("inclui cliente cuja última interação passou do limiar", () => {
    const out = calcularClientesSemContato(
      [{ id: 1, nome: "Sumido" }],
      [interacao({ cliente_id: 1, data: "2026-01-01" })],
      "2026-07-21",
      60,
    );
    expect(out).toHaveLength(1);
    expect(out[0].diasSemContato).toBeGreaterThan(60);
  });

  it("ordena do mais tempo sem contato pro menos", () => {
    const out = calcularClientesSemContato(
      [{ id: 1, nome: "Nunca" }, { id: 2, nome: "90 dias" }],
      [interacao({ cliente_id: 2, data: "2026-04-22" })],
      "2026-07-21",
      60,
    );
    // "Nunca" (null, tratado como infinito) vem antes de "90 dias"
    expect(out.map(c => c.clienteNome)).toEqual(["Nunca", "90 dias"]);
  });
});
