# Análise de Importações (Contabilidade) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova aba "Importações" em Contabilidade mostrando, por mês/ano,
os KPIs e a lista das compras importadas — recalculando o custo real de
cada uma a partir dos dados de DI já salvos, sem duplicar a lógica que já
existe em `lib/custoImportacao.ts`.

**Architecture:** Uma função de leitura nova em
`services/compras.service.ts` busca as compras importadas do período; a
página monta, pra cada uma, o resumo via `calcularCustoImportacao()`
(já existente) e compara com o que de fato foi gravado em
`compras_itens.custo_unitario_m2`. Segue o padrão visual já
estabelecido em `/contabilidade/estoque` (seletor mês/ano, cards de
KPI) e `/compras` (tabela com linha expansível).

**Tech Stack:** Next.js (App Router, client components), Supabase-js,
TypeScript.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-20-analise-importacoes-design.md`.
- **Não persiste nada novo** — só leitura. Nenhuma tabela/coluna SQL
  nova nesta feature.
- Reusar `calcularCustoImportacao()` de `lib/custoImportacao.ts` — não
  reimplementar a fórmula.
- **Custo/m² (DI) vs Custo/m² (Aplicado)** sempre lado a lado — nunca
  assumir que são iguais. Divergência (`> R$ 0,01` de diferença)
  sinalizada visualmente.
- Todos os status de compra (Rascunho e Recebida) entram na análise —
  sem filtro de status.
- Tela é somente leitura — nenhum botão de editar/salvar aqui.
- Sem teste automatizado pra service de I/O nem pra página (nenhum tem
  neste projeto — só `lib/` puro, que não muda nesta feature).
  Verificação via `npx tsc --noEmit` e `npm run build`.
- Commit direto na `main` (workflow padrão do projeto), mensagens em
  português no padrão do `git log --oneline`.

---

### Task 1: `getComprasImportadas` em `services/compras.service.ts`

**Files:**
- Modify: `services/compras.service.ts`

**Interfaces:**
- Produces: `ComprasImportadasFiltro { ano: number; mes: number }` e
  `getComprasImportadas(filtro: ComprasImportadasFiltro): Promise<Compra[]>`
  — exportados de `services/compras.service.ts`. Cada `Compra` retornada
  já vem com `fornecedores` (`{id, nome}`) e `compras_itens` (array
  completo, com `produtos`) populados, mesmo shape de `getCompras()`.

- [ ] **Step 1: Adicionar a função**

Localizar em `services/compras.service.ts`:

```ts
export async function getCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from('compras')
    .select('*, fornecedores ( id, nome ), compras_itens ( *, produtos ( id, nome, cod, chapas_por_colar ) )')
    .order('created_at', { ascending: false });
  if (error) { console.error('getCompras:', error); return []; }
  return data as Compra[];
}
```

Substituir por:

```ts
export async function getCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from('compras')
    .select('*, fornecedores ( id, nome ), compras_itens ( *, produtos ( id, nome, cod, chapas_por_colar ) )')
    .order('created_at', { ascending: false });
  if (error) { console.error('getCompras:', error); return []; }
  return data as Compra[];
}

export interface ComprasImportadasFiltro { ano: number; mes: number; }

// Compras importadas (eh_importacao = true) dentro de um mês/ano, pra
// tela de análise em Contabilidade → Importações. Mesmo shape de
// getCompras() (fornecedores + itens), só filtrada por período e flag.
export async function getComprasImportadas(filtro: ComprasImportadasFiltro): Promise<Compra[]> {
  const ultimoDia = new Date(filtro.ano, filtro.mes, 0).getDate();
  const inicio = `${filtro.ano}-${String(filtro.mes).padStart(2, '0')}-01`;
  const fim = `${filtro.ano}-${String(filtro.mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('compras')
    .select('*, fornecedores ( id, nome ), compras_itens ( *, produtos ( id, nome, cod, chapas_por_colar ) )')
    .eq('eh_importacao', true)
    .gte('dt_compra', inicio)
    .lte('dt_compra', fim)
    .order('dt_compra', { ascending: false });
  if (error) { console.error('getComprasImportadas:', error); return []; }
  return data as Compra[];
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add services/compras.service.ts
git commit -m "feat: getComprasImportadas busca compras importadas por periodo"
```

---

### Task 2: Aba "Importações" em `ContabilidadeTabs`

**Files:**
- Modify: `components/contabilidade/ContabilidadeTabs.tsx`

**Interfaces:**
- Produces: `ContabilidadeTabs` aceita `ativo="importacoes"` (novo
  valor no union type da prop).

- [ ] **Step 1: Adicionar a aba**

Localizar em `components/contabilidade/ContabilidadeTabs.tsx`:

```tsx
const ABAS: Aba[] = [
  { label: "Dashboard", slug: "" },
  { label: "Checklist Mensal", slug: "checklist" },
  { label: "Documentos Fiscais", slug: "documentos" },
  { label: "Estoque / CMV", slug: "estoque" },
  { label: "Ativo Imobilizado", slug: "ativo-imobilizado" },
  { label: "Cartões", slug: "cartoes" },
  { label: "Empréstimos", slug: "emprestimos" },
  { label: "Consórcios", slug: "consorcios" },
  { label: "Documentos Diversos", slug: "diversos" },
  { label: "Configuração Fiscal", slug: "fiscal-produtos" },
];

export default function ContabilidadeTabs({ ativo }: { ativo: "dashboard" | "checklist" | "documentos" | "estoque" | "ativo-imobilizado" | "cartoes" | "emprestimos" | "consorcios" | "diversos" | "fiscal-produtos" }) {
```

Substituir por:

```tsx
const ABAS: Aba[] = [
  { label: "Dashboard", slug: "" },
  { label: "Checklist Mensal", slug: "checklist" },
  { label: "Documentos Fiscais", slug: "documentos" },
  { label: "Estoque / CMV", slug: "estoque" },
  { label: "Importações", slug: "importacoes" },
  { label: "Ativo Imobilizado", slug: "ativo-imobilizado" },
  { label: "Cartões", slug: "cartoes" },
  { label: "Empréstimos", slug: "emprestimos" },
  { label: "Consórcios", slug: "consorcios" },
  { label: "Documentos Diversos", slug: "diversos" },
  { label: "Configuração Fiscal", slug: "fiscal-produtos" },
];

export default function ContabilidadeTabs({ ativo }: { ativo: "dashboard" | "checklist" | "documentos" | "estoque" | "importacoes" | "ativo-imobilizado" | "cartoes" | "emprestimos" | "consorcios" | "diversos" | "fiscal-produtos" }) {
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add components/contabilidade/ContabilidadeTabs.tsx
git commit -m "feat: aba Importacoes em ContabilidadeTabs"
```

---

### Task 3: Página `app/contabilidade/importacoes/page.tsx`

**Files:**
- Create: `app/contabilidade/importacoes/page.tsx`

**Interfaces:**
- Consumes: `getComprasImportadas`, `ComprasImportadasFiltro` (Task 1);
  `ContabilidadeTabs` com `ativo="importacoes"` (Task 2);
  `calcularCustoImportacao`, `DadosImportacao`, `CustoImportacao`
  (`lib/custoImportacao.ts`, já existe); `EmptyState`
  (`components/ui/EmptyState.tsx`, já existe); `formatBRL`, `formatDate`
  (`lib/formatters.ts`); tipos `Compra`, `StatusCompra` (`types/index.ts`).

- [ ] **Step 1: Criar a página**

Criar `app/contabilidade/importacoes/page.tsx`:

```tsx
"use client";

import { Fragment, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ContabilidadeTabs from "@/components/contabilidade/ContabilidadeTabs";
import EmptyState from "@/components/ui/EmptyState";
import { formatBRL, formatDate } from "@/lib/formatters";
import { calcularCustoImportacao, type DadosImportacao, type CustoImportacao } from "@/lib/custoImportacao";
import { getComprasImportadas } from "@/services/compras.service";
import type { Compra, StatusCompra } from "@/types";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const CHIP: Record<StatusCompra, string> = {
  rascunho: "chip cy",
  recebido: "chip cg",
};

interface LinhaImportacao {
  compra: Compra;
  resumo: CustoImportacao;
  custoAplicado: number;
  diverge: boolean;
}

// Recalcula o custo (não é persistido — só os 14 campos brutos da DI
// ficam salvos) e compara com o que de fato está gravado nos itens.
function montarLinha(compra: Compra): LinhaImportacao {
  const dados: DadosImportacao = {
    valor_fob_usd: Number(compra.valor_fob_usd) || 0,
    frete_internacional_usd: Number(compra.frete_internacional_usd) || 0,
    seguro_internacional_usd: Number(compra.seguro_internacional_usd) || 0,
    cambio_usd: Number(compra.cambio_usd) || 0,
    ii: Number(compra.ii) || 0,
    ipi_importacao: Number(compra.ipi_importacao) || 0,
    pis_cofins_importacao: Number(compra.pis_cofins_importacao) || 0,
    icms_importacao: Number(compra.icms_importacao) || 0,
    despesas_aduaneiras: Number(compra.despesas_aduaneiras) || 0,
    ipi_creditavel: Boolean(compra.ipi_creditavel),
    pis_cofins_creditavel: Boolean(compra.pis_cofins_creditavel),
    icms_creditavel: Boolean(compra.icms_creditavel),
  };
  const itens = compra.compras_itens ?? [];
  const m2Total = itens.reduce((a, i) => a + Number(i.m2), 0);
  const resumo = calcularCustoImportacao(dados, m2Total);
  const custoAplicado = m2Total > 0
    ? itens.reduce((a, i) => a + Number(i.custo_unitario_m2) * Number(i.m2), 0) / m2Total
    : 0;
  const diverge = Math.abs(resumo.custoM2 - custoAplicado) > 0.01;
  return { compra, resumo, custoAplicado, diverge };
}

export default function ImportacoesPage() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<string | null>(null);

  useEffect(() => { load(); }, [ano, mes]);

  async function load() {
    setLoading(true);
    const compras = await getComprasImportadas({ ano, mes });
    setLinhas(compras.map(montarLinha));
    setLoading(false);
  }

  const kpis = linhas.reduce((a, l) => ({
    desembolsado: a.desembolsado + l.resumo.custoDesembolsado,
    naoRecuperavel: a.naoRecuperavel + l.resumo.custoNaoRecuperavel,
    creditos: a.creditos + l.resumo.creditosTributarios,
  }), { desembolsado: 0, naoRecuperavel: 0, creditos: 0 });

  return (
    <AppLayout>
      <div className="tb">
        <div className="tb-title">Importações</div>
      </div>
      <ContabilidadeTabs ativo="importacoes" />

      <div className="con">
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <select name="mes" className="fc" value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: "140px" }}>
            {MESES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
          </select>
          <input name="ano" className="fc" type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} style={{ width: "90px" }} />
        </div>

        {loading ? (
          <div className="loading">Carregando...</div>
        ) : linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma compra importada neste período."
            subtitle="Marque 'Compra importada' ao lançar uma compra em /compras pra ela aparecer aqui."
          />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
              {[
                { label: "Desembolsado Total", value: formatBRL(kpis.desembolsado) },
                { label: "Custo Não-Recuperável Total", value: formatBRL(kpis.naoRecuperavel) },
                { label: "Créditos Tributários Total", value: formatBRL(kpis.creditos) },
              ].map((c) => (
                <div key={c.label} style={{ background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "10px", padding: "16px 20px" }}>
                  <div style={{ fontSize: "11px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "4px" }}>{c.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--t1)", fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
                </div>
              ))}
            </div>

            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Fornecedor</th><th>Nº DI</th><th>Status</th><th>Câmbio</th>
                    <th>Valor Aduaneiro</th><th>Desembolsado</th><th>Não-Recuperável</th><th>Créditos</th>
                    <th>Custo/m² (DI)</th><th>Custo/m² (Aplicado)</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(({ compra, resumo, custoAplicado, diverge }) => (
                    <Fragment key={compra.id}>
                      <tr>
                        <td className="mono">{formatDate(compra.dt_compra)}</td>
                        <td><strong>{compra.fornecedores?.nome ?? "—"}</strong></td>
                        <td>
                          <span className="mono" style={{ color: "var(--acc2)", cursor: "pointer" }} onClick={() => setExpandida(expandida === compra.id ? null : compra.id)}>
                            {expandida === compra.id ? "▾" : "▸"} {compra.numero_di || "—"}
                          </span>
                        </td>
                        <td><span className={CHIP[compra.status]}>{compra.status === "rascunho" ? "Pendente" : "Recebida"}</span></td>
                        <td className="mono">{Number(compra.cambio_usd ?? 0).toFixed(4)}</td>
                        <td className="mono">{formatBRL(resumo.valorAduaneiroBrl)}</td>
                        <td className="mono">{formatBRL(resumo.custoDesembolsado)}</td>
                        <td className="mono" style={{ color: "var(--acc)" }}>{formatBRL(resumo.custoNaoRecuperavel)}</td>
                        <td className="mono" style={{ color: "var(--ok)" }}>{formatBRL(resumo.creditosTributarios)}</td>
                        <td className="mono">{formatBRL(resumo.custoM2)}</td>
                        <td className="mono" style={diverge ? { color: "var(--err)", fontWeight: 700 } : undefined} title={diverge ? "Diverge do custo calculado da DI" : undefined}>
                          {formatBRL(custoAplicado)}{diverge ? " ⚠" : ""}
                        </td>
                      </tr>
                      {expandida === compra.id && (
                        <tr>
                          <td colSpan={11} style={{ background: "var(--surf2)", padding: "12px 20px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", marginBottom: "10px" }}>
                              {[
                                { label: "FOB (USD)", value: formatBRL(Number(compra.valor_fob_usd ?? 0)) },
                                { label: "Frete Intl. (USD)", value: formatBRL(Number(compra.frete_internacional_usd ?? 0)) },
                                { label: "Seguro Intl. (USD)", value: formatBRL(Number(compra.seguro_internacional_usd ?? 0)) },
                                { label: "II (R$)", value: formatBRL(Number(compra.ii ?? 0)) },
                                { label: "Despesas Aduaneiras (R$)", value: formatBRL(Number(compra.despesas_aduaneiras ?? 0)) },
                              ].map((c) => (
                                <div key={c.label}>
                                  <div style={{ fontSize: "9px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{c.label}</div>
                                  <div className="mono" style={{ fontSize: "12px" }}>{c.value}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                IPI ({formatBRL(Number(compra.ipi_importacao ?? 0))}) — <span className={compra.ipi_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.ipi_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                PIS/COFINS ({formatBRL(Number(compra.pis_cofins_importacao ?? 0))}) — <span className={compra.pis_cofins_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.pis_cofins_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                              <span style={{ fontSize: "11px", color: "var(--t2)" }}>
                                ICMS ({formatBRL(Number(compra.icms_importacao ?? 0))}) — <span className={compra.icms_creditavel ? "chip cg" : "chip cgr"} style={{ fontSize: "10px" }}>{compra.icms_creditavel ? "✓ Creditável" : "— Não creditável"}</span>
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar build completo**

Run: `npm run build`
Expected: build completo sem erros (rota nova `/contabilidade/importacoes`
entra no build do Next normalmente).

- [ ] **Step 4: Commit**

```bash
git add "app/contabilidade/importacoes/page.tsx"
git commit -m "feat: pagina de analise de importacoes em Contabilidade"
```

---

### Task 4: Verificação manual

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar build completo**

Run: `npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Conferir sem dados**

Subir o dev server, abrir `/contabilidade` e clicar na aba "Importações"
(deve aparecer entre "Estoque / CMV" e "Ativo Imobilizado"). Num mês sem
nenhuma compra importada, confirmar que aparece o `EmptyState` (não uma
tela quebrada nem cards zerados).

- [ ] **Step 3: Conferir com a compra de teste da feature anterior**

Ir pro mês/ano da compra `__teste_*` importada (criada na validação de
"Custo de Importação por Lote"). Conferir:
- Ela aparece na lista, com os mesmos números que apareceram no
  formulário de criação (Câmbio, Valor Aduaneiro, Desembolsado,
  Não-Recuperável, Créditos, Custo/m²).
- Os KPIs do topo somam corretamente (se for a única compra do mês, os
  3 cards batem com as colunas dessa linha).
- Clicar no nº da DI expande a linha e mostra os 14 campos + as 3 flags
  de creditabilidade certas.

- [ ] **Step 4: Testar o caso de divergência**

Criar uma segunda compra `__teste_*` importada: preencher a seção
Importação normalmente, mas **antes** de clicar "Aplicar aos itens",
editar manualmente o Custo/m² de um item pra um valor diferente do
calculado, e salvar assim (sem aplicar). Na tela de Importações,
conferir que "Custo/m² (Aplicado)" aparece diferente de "Custo/m²
(DI)", com o aviso visual (cor de alerta + ⚠). Excluir as duas compras
de teste ao final.
