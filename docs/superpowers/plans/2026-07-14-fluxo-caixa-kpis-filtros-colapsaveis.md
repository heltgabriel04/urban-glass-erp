# Fluxo de Caixa — KPIs em Primeiro Plano + Filtros Colapsáveis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, same session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na página `/fluxo`, os 4 KPIs de valor viram a primeira coisa visível depois da topbar, e o painel de filtros extras (Tipo/Situação/Plano de Contas/Busca) passa a ficar escondido por padrão, atrás de um botão "Filtros" com contador.

**Architecture:** Tudo em `app/fluxo/page.tsx` — reordenação de JSX + 1 estado novo (`filtrosAbertos`) + 1 valor derivado (`filtrosAtivos`). Zero mudança em lógica de filtro/cálculo/persistência de URL existente.

**Tech Stack:** Next.js/TypeScript.

## Global Constraints

- Zero mudança em `useMemo`/`useEffect` existentes, nos cálculos de `visiveis`/`totaisPeriodo`/`menorSaldo`, ou na persistência de URL (só `de`/`ate`/`tudo` continuam persistindo).
- Sem teste automatizado disponível — validar via `tsc --noEmit` + `next build`; validação visual fica por conta do usuário.
- Spec de referência: `docs/superpowers/specs/2026-07-14-fluxo-caixa-kpis-filtros-colapsaveis-design.md`.

---

### Task 1: Reordenar KPIs, adicionar estado de filtros colapsáveis

**Files:**
- Modify: `app/fluxo/page.tsx`

- [ ] **Step 1: Adicionar o estado `filtrosAbertos`**, logo depois dos outros estados de filtro

De:

```tsx
  // Filtros extras (vieram de Movimentações, que foi descontinuada)
  const [filtroTipo, setFiltroTipo] = useState<"Todos" | "Entrada" | "Saída">("Todos");
  const [filtroSituacao, setFiltroSituacao] = useState<"Todos" | (typeof SITUACOES)[number]>("Todos");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [busca, setBusca] = useState("");
```

Para:

```tsx
  // Filtros extras (vieram de Movimentações, que foi descontinuada)
  const [filtroTipo, setFiltroTipo] = useState<"Todos" | "Entrada" | "Saída">("Todos");
  const [filtroSituacao, setFiltroSituacao] = useState<"Todos" | (typeof SITUACOES)[number]>("Todos");
  const [filtroPlano, setFiltroPlano] = useState("");
  const [busca, setBusca] = useState("");
  // Painel de filtros extras começa fechado — ocupava espaço grande demais
  // parado no estado padrão, empurrando os KPIs pra baixo.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
```

- [ ] **Step 2: Adicionar o cálculo de `filtrosAtivos`**, logo antes do `return (`

De:

```tsx
  function handleExportar() {
    exportarExcel(`FluxoCaixa_UrbanGlass_${dataIni}_a_${dataFim}`,
      ["Data", "Cliente/Fornecedor", "Descrição", "Pedido/Documento", "Situação", "Valor", "Saldo"],
      visiveis.map(l => [
        formatDate(l.data), l.pessoa ?? "", l.descricao, l.pedidoId ?? l.documento ?? "",
        situacaoLabel(l), l.tipo === "Saída" ? -l.valor : l.valor, l.saldoAcumulado,
      ])
    );
  }

  return (
```

Para:

```tsx
  function handleExportar() {
    exportarExcel(`FluxoCaixa_UrbanGlass_${dataIni}_a_${dataFim}`,
      ["Data", "Cliente/Fornecedor", "Descrição", "Pedido/Documento", "Situação", "Valor", "Saldo"],
      visiveis.map(l => [
        formatDate(l.data), l.pessoa ?? "", l.descricao, l.pedidoId ?? l.documento ?? "",
        situacaoLabel(l), l.tipo === "Saída" ? -l.valor : l.valor, l.saldoAcumulado,
      ])
    );
  }

  const filtrosAtivos = (filtroTipo !== "Todos" ? 1 : 0) + (filtroSituacao !== "Todos" ? 1 : 0) + (filtroPlano ? 1 : 0) + (busca ? 1 : 0);

  return (
```

- [ ] **Step 3: Mover os KPIs pra logo depois da topbar, adicionar o botão "Filtros" na barra de período, e esconder o painel de filtros extras atrás de `filtrosAbertos`**

De:

```tsx
      {/* Teste visual: fundo neutro frio (cinza-azulado) no lugar do bege
          quente padrão do tema claro — só nesta página, só no claro, pra
          o usuário decidir se estende pro resto do sistema. */}
      <div className="con" style={theme === "light" ? { background: "#eef1f6" } : undefined}>

        {/* Filtro de período — estilo extrato */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {ATALHOS.map(a => {
              const [ai, af] = a.get();
              const ativo = !verTudo && ai === dataIni && af === dataFim;
              return (
                <button key={a.label} className={ativo ? "btn bp xs" : "btn bg xs"}
                  onClick={() => setPeriodo(ai, af)}>
                  {a.label}
                </button>
              );
            })}
            <button className={verTudo ? "btn bp xs" : "btn bg xs"} onClick={() => setVerTudo(true)}>
              Ver tudo
            </button>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>De</span>
            <DateInput value={dataIni} onChange={v => setPeriodo(v, dataFim)} style={inputXs} />
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Até</span>
            <DateInput value={dataFim} onChange={v => setPeriodo(dataIni, v)} style={inputXs} />
          </div>
        </div>

        {/* Filtros extras — vieram de Movimentações */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <select className="fc" style={inputSelXs} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as typeof filtroTipo)}>
            <option value="Todos">Todos os tipos</option>
            <option value="Entrada">↑ Entrada</option>
            <option value="Saída">↓ Saída</option>
          </select>
          <select className="fc" style={inputSelXs} value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}>
            <option value="Todos">Todas as situações</option>
            {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="fc" style={{ ...inputSelXs, width: "200px" }} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
            <option value="">Todos os planos de contas</option>
            {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
          </select>
          <input className="fc" style={{ ...inputSelXs, width: "220px" }} placeholder="Buscar cliente, fornecedor ou descrição..."
            value={busca} onChange={e => setBusca(e.target.value)} />
          {(filtroTipo !== "Todos" || filtroSituacao !== "Todos" || filtroPlano || busca) && (
            <button className="btn bg xs" onClick={() => { setFiltroTipo("Todos"); setFiltroSituacao("Todos"); setFiltroPlano(""); setBusca(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="g4" style={{ marginBottom: "16px" }}>
          <div className="kpi">
            <div className="kpi-l">Caixa Atual</div>
            <div className="kpi-v" style={{ color: saldoAtual >= 0 ? "var(--ok)" : "var(--err)" }}>{formatBRL(saldoAtual)}</div>
            <div className="kpi-s">Saldo real agora, em todas as contas</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Menor Saldo no Período</div>
            <div className="kpi-v" style={{ color: menorSaldo && menorSaldo.saldoAcumulado < 0 ? "var(--err)" : "var(--acc)" }}>
              {menorSaldo ? formatBRL(menorSaldo.saldoAcumulado) : "—"}
            </div>
            <div className="kpi-s">{menorSaldo ? `Em ${formatDate(menorSaldo.data)}` : "Sem movimentações no período"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Entradas no Período</div>
            <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(totaisPeriodo.ent)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Entrada").length} lançamento(s)</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Saídas no Período</div>
            <div className="kpi-v" style={{ color: "var(--err)" }}>{formatBRL(totaisPeriodo.sai)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Saída").length} lançamento(s)</div>
          </div>
        </div>
```

Para:

```tsx
      {/* Teste visual: fundo neutro frio (cinza-azulado) no lugar do bege
          quente padrão do tema claro — só nesta página, só no claro, pra
          o usuário decidir se estende pro resto do sistema. */}
      <div className="con" style={theme === "light" ? { background: "#eef1f6" } : undefined}>

        {/* KPIs — primeira coisa visível na página, antes de qualquer filtro */}
        <div className="g4" style={{ marginBottom: "16px" }}>
          <div className="kpi">
            <div className="kpi-l">Caixa Atual</div>
            <div className="kpi-v" style={{ color: saldoAtual >= 0 ? "var(--ok)" : "var(--err)" }}>{formatBRL(saldoAtual)}</div>
            <div className="kpi-s">Saldo real agora, em todas as contas</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Menor Saldo no Período</div>
            <div className="kpi-v" style={{ color: menorSaldo && menorSaldo.saldoAcumulado < 0 ? "var(--err)" : "var(--acc)" }}>
              {menorSaldo ? formatBRL(menorSaldo.saldoAcumulado) : "—"}
            </div>
            <div className="kpi-s">{menorSaldo ? `Em ${formatDate(menorSaldo.data)}` : "Sem movimentações no período"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Entradas no Período</div>
            <div className="kpi-v" style={{ color: "var(--ok)" }}>{formatBRL(totaisPeriodo.ent)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Entrada").length} lançamento(s)</div>
          </div>
          <div className="kpi">
            <div className="kpi-l">Saídas no Período</div>
            <div className="kpi-v" style={{ color: "var(--err)" }}>{formatBRL(totaisPeriodo.sai)}</div>
            <div className="kpi-s">{visiveis.filter(l => l.tipo === "Saída").length} lançamento(s)</div>
          </div>
        </div>

        {/* Filtro de período — estilo extrato */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {ATALHOS.map(a => {
              const [ai, af] = a.get();
              const ativo = !verTudo && ai === dataIni && af === dataFim;
              return (
                <button key={a.label} className={ativo ? "btn bp xs" : "btn bg xs"}
                  onClick={() => setPeriodo(ai, af)}>
                  {a.label}
                </button>
              );
            })}
            <button className={verTudo ? "btn bp xs" : "btn bg xs"} onClick={() => setVerTudo(true)}>
              Ver tudo
            </button>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>De</span>
            <DateInput value={dataIni} onChange={v => setPeriodo(v, dataFim)} style={inputXs} />
            <span style={{ fontSize: "10px", color: "var(--t3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Até</span>
            <DateInput value={dataFim} onChange={v => setPeriodo(dataIni, v)} style={inputXs} />
            <button className={filtrosAbertos ? "btn bp xs" : "btn bg xs"} onClick={() => setFiltrosAbertos(v => !v)}>
              ⚙ Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ""}
            </button>
          </div>
        </div>

        {/* Filtros extras — vieram de Movimentações, escondidos por padrão */}
        {filtrosAbertos && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px", background: "var(--surf1)", border: "1px solid var(--b1)", borderRadius: "8px", padding: "9px 12px" }}>
          <select className="fc" style={inputSelXs} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as typeof filtroTipo)}>
            <option value="Todos">Todos os tipos</option>
            <option value="Entrada">↑ Entrada</option>
            <option value="Saída">↓ Saída</option>
          </select>
          <select className="fc" style={inputSelXs} value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}>
            <option value="Todos">Todas as situações</option>
            {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="fc" style={{ ...inputSelXs, width: "200px" }} value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}>
            <option value="">Todos os planos de contas</option>
            {planos.map(p => <option key={p.id} value={p.id}>{p.codigo_estruturado} · {p.descricao}</option>)}
          </select>
          <input className="fc" style={{ ...inputSelXs, width: "220px" }} placeholder="Buscar cliente, fornecedor ou descrição..."
            value={busca} onChange={e => setBusca(e.target.value)} />
          {(filtroTipo !== "Todos" || filtroSituacao !== "Todos" || filtroPlano || busca) && (
            <button className="btn bg xs" onClick={() => { setFiltroTipo("Todos"); setFiltroSituacao("Todos"); setFiltroPlano(""); setBusca(""); }}>
              ✕ Limpar
            </button>
          )}
        </div>
        )}
```

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero erros.

- [ ] **Step 5: Rodar build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 6: Commit**

```bash
git add app/fluxo/page.tsx
git commit -m "feat(fluxo): KPIs sobem pro topo, filtros extras viram colapsaveis"
```

---

### Task 2: Push e instruções de validação manual

**Files:**
- Nenhum arquivo novo — task de fechamento.

- [ ] **Step 1: Push**

```bash
git push
```

- [ ] **Step 2: Reportar ao usuário**

Sem ambiente de teste visual automatizado nesta sessão. Pedir pro usuário abrir `/fluxo` e conferir:
- Os 4 KPIs aparecem logo abaixo da topbar, antes de qualquer filtro.
- O botão "⚙ Filtros" aparece na ponta direita da barra de período, sem contador quando nenhum filtro extra está ativo.
- Clicar no botão abre o painel com os 4 campos (Tipo/Situação/Plano de Contas/Busca); clicar de novo fecha.
- Aplicar um filtro (ex: Tipo = Entrada) faz o botão virar "⚙ Filtros (1)" e a tabela filtrar normalmente, exatamente como antes.
- "✕ Limpar" continua funcionando e zera o contador do botão.

Isso encerra o ajuste de layout do Fluxo de Caixa.
