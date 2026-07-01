import { describe, it, expect } from "vitest";
import {
  alocarBloco, construirDiasBloqueadosPorLinha, minutosRestantesNoDia,
  proximaTarefaParaEncaixe, calcularPrioridadePedido, produtoPrincipal,
} from "@/services/programacao.service";
import type { ProducaoLinha, ConfigTempoProducao } from "@/types";

const linha: Pick<ProducaoLinha, "inicio_dia" | "fim_dia"> = {
  inicio_dia: "08:00:00",
  fim_dia: "17:00:00",
};

// Segunda-feira 08:00 — evita cair em fim de semana nos testes
function segundaAs(hora: number, min = 0): Date {
  const d = new Date(2026, 0, 5, hora, min, 0, 0); // 2026-01-05 é uma segunda-feira
  return d;
}

describe("alocarBloco", () => {
  it("aloca a tarefa a partir do próprio cursor quando cabe no mesmo dia", () => {
    const cursor = segundaAs(8, 0);
    const { inicio, fim } = alocarBloco(cursor, 45, linha);
    expect(inicio.getTime()).toBe(cursor.getTime());
    expect(fim.getTime() - inicio.getTime()).toBe(45 * 60_000);
  });

  it("empacota duas tarefas curtas no mesmo dia, sem sobreposição", () => {
    const cursor = segundaAs(8, 0);
    const t1 = alocarBloco(cursor, 45, linha);
    const t2 = alocarBloco(t1.fim, 30, linha);
    expect(t2.inicio.getTime()).toBe(t1.fim.getTime());
    expect(t2.inicio.toDateString()).toBe(t1.inicio.toDateString());
  });

  it("não corta um bloco no meio do dia — empurra pro próximo dia útil inteiro", () => {
    const cursor = segundaAs(16, 30); // só sobram 30min de expediente
    const { inicio, fim } = alocarBloco(cursor, 90, linha); // precisa de 90min
    expect(inicio.getDate()).toBe(cursor.getDate() + 1); // terça-feira
    expect(inicio.getHours()).toBe(8);
    expect(fim.getTime() - inicio.getTime()).toBe(90 * 60_000);
  });

  it("pula fins de semana", () => {
    const sexta1630 = new Date(2026, 0, 9, 16, 30); // sexta-feira
    const { inicio } = alocarBloco(sexta1630, 90, linha);
    expect(inicio.getDay()).toBe(1); // segunda-feira seguinte
    expect(inicio.getDate()).toBe(12);
  });

  it("pula datas bloqueadas (feriado/manutenção)", () => {
    const cursor = segundaAs(8, 0);
    const bloqueados = new Set(["2026-01-05"]); // bloqueia a própria segunda
    const { inicio } = alocarBloco(cursor, 45, linha, bloqueados);
    expect(inicio.getDate()).toBe(6); // terça-feira
  });

  it("cursor antes do expediente é ajustado pro início do dia", () => {
    const cursor = segundaAs(6, 0);
    const { inicio } = alocarBloco(cursor, 30, linha);
    expect(inicio.getHours()).toBe(8);
    expect(inicio.getMinutes()).toBe(0);
  });
});

describe("construirDiasBloqueadosPorLinha", () => {
  it("aplica bloqueio global (linha_id null) a todas as linhas", () => {
    const linhas = [{ id: 1 }, { id: 2 }];
    const bloqueios = [{ linha_id: null, dt_inicio: "2026-01-05T00:00:00Z", dt_fim: "2026-01-05T00:00:00Z" }];
    const result = construirDiasBloqueadosPorLinha(linhas, new Set(), bloqueios);
    expect(result[1].has("2026-01-05")).toBe(true);
    expect(result[2].has("2026-01-05")).toBe(true);
  });

  it("aplica bloqueio de uma linha específica só a ela", () => {
    const linhas = [{ id: 1 }, { id: 2 }];
    const bloqueios = [{ linha_id: 1, dt_inicio: "2026-01-05T00:00:00Z", dt_fim: "2026-01-06T00:00:00Z" }];
    const result = construirDiasBloqueadosPorLinha(linhas, new Set(), bloqueios);
    expect(result[1].has("2026-01-05")).toBe(true);
    expect(result[1].has("2026-01-06")).toBe(true);
    expect(result[2].has("2026-01-05")).toBe(false);
  });
});

describe("minutosRestantesNoDia", () => {
  it("calcula minutos restantes até o fim do expediente", () => {
    expect(minutosRestantesNoDia(segundaAs(16, 0), linha)).toBe(60);
  });
  it("retorna 0 se o cursor já passou do fim do expediente", () => {
    expect(minutosRestantesNoDia(segundaAs(18, 0), linha)).toBe(0);
  });
});

describe("proximaTarefaParaEncaixe (gap-fill)", () => {
  it("escolhe a primeira tarefa (maior prioridade) quando ela cabe", () => {
    const pendentes = [{ dur: 30 }, { dur: 20 }];
    const idx = proximaTarefaParaEncaixe(pendentes, 60, t => t.dur);
    expect(idx).toBe(0);
  });

  it("pula pra uma tarefa menor quando a mais prioritária não cabe", () => {
    const pendentes = [{ dur: 120 }, { dur: 30 }];
    const idx = proximaTarefaParaEncaixe(pendentes, 60, t => t.dur);
    expect(idx).toBe(1);
  });

  it("cai de volta pra tarefa mais prioritária se nenhuma couber", () => {
    const pendentes = [{ dur: 120 }, { dur: 90 }];
    const idx = proximaTarefaParaEncaixe(pendentes, 60, t => t.dur);
    expect(idx).toBe(0);
  });
});

const config: ConfigTempoProducao[] = [
  { etapa: "Corte", min_por_m2: 2, min_por_peca: 0.5, min_por_lapidacao: 0, min_por_furo: 0, setup_pedido_min: 10, fator_vidro_especial: 1.3, updated_at: "" },
  { etapa: "Lapidação", min_por_m2: 0.5, min_por_peca: 0, min_por_lapidacao: 4, min_por_furo: 0, setup_pedido_min: 8, fator_vidro_especial: 1.2, updated_at: "" },
];

describe("calcularPrioridadePedido", () => {
  it("marca como atrasado quando a folga é negativa", () => {
    const agora = new Date(2026, 0, 5, 8, 0);
    const pedido = { dt_retirada: new Date(2026, 0, 5, 8, 10).toISOString() }; // 10min de prazo
    const itens = [{ m2: 5, quantidade: 2, lapidacao: 0, produto_nome: "Comum" }]; // ~21min de corte
    const info = calcularPrioridadePedido(pedido, itens, config, agora);
    expect(info.atrasado).toBe(true);
    expect(info.score).toBeGreaterThan(10_000);
  });

  it("não marca como atrasado quando há folga suficiente", () => {
    const agora = new Date(2026, 0, 5, 8, 0);
    const pedido = { dt_retirada: new Date(2026, 0, 10, 8, 0).toISOString() }; // 5 dias de prazo
    const itens = [{ m2: 1, quantidade: 1, lapidacao: 0, produto_nome: "Comum" }];
    const info = calcularPrioridadePedido(pedido, itens, config, agora);
    expect(info.atrasado).toBe(false);
    expect(info.score).toBeLessThan(10_000);
  });

  it("pedido sem dt_retirada recebe folga infinita e score 0", () => {
    const info = calcularPrioridadePedido({ dt_retirada: null }, [], config);
    expect(info.folgaHoras).toBe(Infinity);
    expect(info.score).toBe(0);
  });
});

describe("produtoPrincipal", () => {
  it("retorna o produto de maior m² somado", () => {
    const itens = [
      { produto_nome: "A", m2: 1 },
      { produto_nome: "B", m2: 5 },
      { produto_nome: "A", m2: 2 },
    ];
    expect(produtoPrincipal(itens)).toBe("B"); // B: 5 > A: 1+2=3
  });
});
