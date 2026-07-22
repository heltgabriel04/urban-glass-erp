# Reorganização da Página de Detalhe do Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `app/pedidos/[id]/page.tsx` num card de resumo (hero) sempre visível + seções retráteis (accordion), reduzindo scroll, duplicação de informação e cor ad-hoc — sem mudar nenhuma lógica de negócio.

**Architecture:** É uma mudança de casca (JSX/CSS), não de comportamento. O padrão de accordion (botão-header com seta ▾/▲ + `useState<boolean>` + render condicional) já existe hoje na seção "Romaneio/NF-e/Boleto/Comprovante/Observações" desta mesma página — cada task estende esse mesmo padrão pras demais seções, e o hero consolida números que já são calculados (só reposiciona onde aparecem).

**Tech Stack:** Next.js (App Router), React, TypeScript. Sem novas dependências.

## Global Constraints

- Nenhuma lógica de negócio muda — cálculos (`totalComIpi`, `aberto`, `quitado`, `saldoRetiradas`, `resumoRetiradaPorProduto`, etc.) continuam exatamente como estão, só a posição na tela muda.
- Área de impressão (`.print-area`, a partir de `{/* ─── ROMANEIO PDF ─── */}`) não é tocada em nenhuma task — cores hex fixas ali são intencionais.
- Onde uma task pedir para "reindentar" um bloco existente (adicionar 2 espaços em cada linha), é uma operação mecânica de indentação — o conteúdo em si (texto, lógica, JSX) não muda uma vírgula. Não é necessário reproduzir esse bloco inteiro no plano; o arquivo real (`app/pedidos/[id]/page.tsx`) é a fonte da verdade para essas linhas.
- Depois de cada task: `npx tsc --noEmit -p .` deve rodar sem output, e `npx vitest run` deve continuar em 199/199 (nenhuma task adiciona teste novo — é reorganização de UI existente, sem lógica nova a testar isoladamente).

---

### Task 1: Estado das novas seções retráteis

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:167` (logo depois da declaração de `abrirObs`)

**Interfaces:**
- Consumes: nenhuma.
- Produces: `abrirItens` (default `true`), `abrirInformacoes`, `abrirFinanceiro`, `abrirRetiradas`, `abrirDocumentos` (default `false` os 4) — cada um com seu setter (`setAbrirItens`, etc.), usados pelas Tasks 3-6.

- [ ] **Step 1: Adicionar os 5 novos `useState`**

Em `app/pedidos/[id]/page.tsx`, logo depois da linha `const [abrirObs, setAbrirObs] = useState(false);` (linha 167), inserir:

```typescript
  const [abrirItens,        setAbrirItens]        = useState(true);
  const [abrirInformacoes,  setAbrirInformacoes]   = useState(false);
  const [abrirFinanceiro,   setAbrirFinanceiro]    = useState(false);
  const [abrirRetiradas,    setAbrirRetiradas]     = useState(false);
  const [abrirDocumentos,   setAbrirDocumentos]    = useState(false);
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output (sem erros — variáveis novas ainda não usadas não geram erro, `noUnusedLocals` não está ativado neste projeto).

- [ ] **Step 3: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: estado das novas secoes retrateis da pagina do pedido"
```

---

### Task 2: Seção "Itens do Pedido" vira retrátil (aberta por padrão)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:1438-1476` (bloco atual, do comentário `{/* Itens */}` até o `</div>` que fecha esse card)

**Interfaces:**
- Consumes: `abrirItens`/`setAbrirItens` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Trocar o header estático por um botão clicável + condicional**

Hoje (linhas 1438-1445):

```typescript
          {/* Itens */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
              {temItens && !todosVidroCliente && !todosChapa && (
                <a href={"/otimizador?pedido=" + pedido.id} className="btn bg xs">◈ Otimizar Corte</a>
              )}
            </div>
            {!temItens ? (
```

Substituir por (o título+seta viram um `<button>` que só faz o toggle; o link "Otimizar Corte" fica como irmão dele na mesma linha flex, sempre visível, exatamente como hoje — sem hacks de posicionamento):

```typescript
          {/* Itens */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: abrirItens ? "16px" : 0 }}>
              <button onClick={() => setAbrirItens(v => !v)} style={{ display:"flex", alignItems:"center", gap:"10px", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>ITENS DO PEDIDO ({pedido.itens_pedido?.length ?? 0})</div>
                <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirItens ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
              </button>
              {temItens && !todosVidroCliente && !todosChapa && (
                <a href={"/otimizador?pedido=" + pedido.id} className="btn bg xs">◈ Otimizar Corte</a>
              )}
            </div>
            {abrirItens && !temItens ? (
```

Isso muda a condição de `{!temItens ? (` pra `{abrirItens && !temItens ? (` — o próximo passo ajusta o `else` correspondente.

- [ ] **Step 2: Envolver o corpo (tabela) na condição de aberto**

Logo abaixo, a linha `) : (` (antes de `<div className="tw">`) e o fechamento `)}` antes do `</div>` do card precisam ficar condicionados a `abrirItens` também. Trocar:

```typescript
            ) : (
              <div className="tw">
```

por:

```typescript
            ) : abrirItens ? (
              <div className="tw">
```

E o `)}` que fecha esse bloco ternário (linha 1475, logo antes do `</div>` do card) continua igual — mas como o ternário agora tem 3 ramos possíveis (`abrirItens && !temItens`, `abrirItens && temItens`, `!abrirItens`), adicionar um ramo final `null` explícito antes do fechamento:

```typescript
              </div>
            ) : null}
          </div>
```

(troca o `)}`  original por `) : null}` — o `</div>` que fecha a tabela continua exatamente onde está.)

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output.

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando (mesma contagem de antes — esta task não adiciona teste).

- [ ] **Step 5: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: secao Itens do Pedido vira retratil (aberta por padrao)"
```

---

### Task 3: Hero — consolida cliente/valores/retirada no cabeçalho

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:891-918` (o `<div className="tb no-print">` atual)

**Interfaces:**
- Consumes: `pedido.clientes?.nome`, `totalComIpi`, `pedido.valor_recebido`, `aberto`, `quitado` (já calculados na linha 806-808), `totalPecasRetirado`, `totalPecasPedido` (já calculados na linha 820-822), `temItens`.
- Produces: nada consumido por outra task (Task 4 remove a duplicata que existe hoje na seção Retiradas, mas não depende de nomes novos daqui — os valores já existem como variáveis desde antes desta task).

- [ ] **Step 1: Adicionar uma segunda linha ao cabeçalho com cliente + valores + retirada**

Hoje (linhas 890-918):

```typescript
      <AppLayout>
        <div className="tb no-print">
          <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
          <div className="tb-title" style={{ flex:1 }}>
            Pedido <span style={{ color:"var(--acc)" }}>{pedido.id}</span>
          </div>
          <span className={CHIP[pedido.status] ?? "chip cgr"}>{pedido.status}</span>
          {temItens && !todosVidroCliente && !todosChapa && (
            <a href={"/otimizador?pedido=" + pedido.id} className="btn bg sm">◈ Otimizar Corte</a>
          )}
          <button
            className="btn sm"
            onClick={() => podeRomaneio && handlePrintRomaneio()}
            style={{ background: podeRomaneio ? "rgba(16,185,129,.15)" : "transparent", border: "1px solid " + (podeRomaneio ? "var(--ok)" : "var(--b2)"), color: podeRomaneio ? "var(--ok)" : "var(--t3)", fontWeight:700, cursor: podeRomaneio ? "pointer" : "default", opacity: podeRomaneio ? 1 : 0.35, transition:"all 0.2s" }}
          >R</button>
          <button
            className="btn sm"
            onClick={() => setModalNC(true)}
            title="Registrar Não Conformidade"
            style={{ background: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.12)" : "transparent", border: `1px solid ${ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "rgba(244,63,94,.5)" : "var(--b2)"}`, color: ncs.filter(n => ["Aberta","Em Análise","Aguardando Correção"].includes(n.status)).length > 0 ? "var(--err)" : "var(--t3)", fontWeight:700 }}
          >
            ⚑ NC{ncs.length > 0 ? ` (${ncs.length})` : ""}
          </button>
          {podeAvancar && (
            <button className="btn bp sm" onClick={handleAvancar} disabled={salvando || bloqueadoSemOtim} style={bloqueadoSemOtim ? { opacity:0.45, cursor:"not-allowed" } : {}}>
              {salvando ? "Salvando..." : bloqueadoSemOtim ? "⚠ Otimização pendente" : "Avançar Status →"}
            </button>
          )}
        </div>
        <PedidoTabs id={id} temItens={temItens} />
```

Manter essa `<div className="tb no-print">` **exatamente como está** (nenhuma linha muda) e inserir uma nova `<div>` logo depois dela, antes de `<PedidoTabs .../>`:

```typescript
        <div className="tb no-print" style={{ borderTop:"none", paddingTop:0, flexWrap:"wrap", rowGap:"10px" }}>
          <div style={{ fontSize:"13px", color:"var(--t2)", fontWeight:600 }}>{pedido.clientes?.nome ?? "—"}</div>
          <div style={{ flex:1 }} />
          <div style={{ display:"flex", gap:"18px", fontSize:"12px", fontFamily:"'DM Mono', monospace" }}>
            <span style={{ color:"var(--t3)" }}>Total <strong style={{ color:"var(--t1)" }}>{formatBRL(totalComIpi)}</strong></span>
            <span style={{ color:"var(--t3)" }}>Recebido <strong style={{ color: pedido.valor_recebido > 0 ? "var(--ok)" : "var(--t3)" }}>{formatBRL(pedido.valor_recebido)}</strong></span>
            <span style={{ color:"var(--t3)" }}>{quitado ? "Quitado ✓" : "Em aberto"} <strong style={{ color: quitado ? "var(--ok)" : "var(--warn)" }}>{formatBRL(Math.max(0, aberto))}</strong></span>
            {temItens && (
              <span style={{ color:"var(--t3)" }}>Retirada <strong style={{ color: totalPecasRetirado >= totalPecasPedido ? "var(--ok)" : "var(--warn)" }}>{totalPecasRetirado}/{totalPecasPedido} peças</strong></span>
            )}
          </div>
        </div>
        <PedidoTabs id={id} temItens={temItens} />
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output.

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando.

- [ ] **Step 4: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: hero com cliente, valores e progresso de retirada no cabecalho do pedido"
```

---

### Task 4: Seção "Retiradas" vira retrátil (fechada) e para de repetir o resumo que agora está no hero

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:1009-1092` (bloco `{/* Retiradas */}` inteiro)

**Interfaces:**
- Consumes: `abrirRetiradas`/`setAbrirRetiradas` (Task 1), o hero da Task 3 (pra saber que o resumo de peças já está visível em cima e não precisa repetir aqui).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Substituir o header estático (com o resumo duplicado) por um botão retrátil**

Hoje (linhas 1009-1024):

```typescript
          {/* Retiradas */}
          {temItens && (
            <div style={{ border: `1px solid ${corRetiradas.border}`, borderRadius:"10px", overflow:"hidden" }}>
              <div style={{ background: corRetiradas.bg, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>
                <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", marginBottom:"2px" }}>RETIRADAS</div>
                    <div style={{ fontSize:"13px", color: corRetiradas.text, fontWeight:700 }}>
                      {totalPecasRetirado} de {totalPecasPedido} peça(s) retirada(s)
                    </div>
                  </div>
                  <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                    <span>Viagens: <strong style={{ color:"var(--t1)" }}>{retiradas.length}</strong></span>
                    <span>Pendente: <strong style={{ color:"var(--t1)" }}>{totalPecasPedido - totalPecasRetirado}</strong></span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
```

Substituir o `<div style={{ background: corRetiradas.bg, ...` de header por um `<button>` clicável (o resumo "X de Y peça(s)" some daqui — já está no hero — mas "Viagens" e "Pendente" continuam, por serem detalhe específico desta seção):

```typescript
          {/* Retiradas */}
          {temItens && (
            <div style={{ border: `1px solid ${corRetiradas.border}`, borderRadius:"10px", overflow:"hidden" }}>
              <button onClick={() => setAbrirRetiradas(v => !v)} style={{ width:"100%", background: corRetiradas.bg, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px", border:"none", cursor:"pointer" }}>
                <div style={{ display:"flex", gap:"24px", alignItems:"center" }}>
                  <div style={{ fontSize:"10px", color:"var(--t3)", fontWeight:600, letterSpacing:".06em", display:"flex", alignItems:"center", gap:"6px" }}>
                    RETIRADAS
                    <span style={{ transform: abrirRetiradas ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
                  </div>
                  <div style={{ fontSize:"12px", color:"var(--t3)", fontFamily:"'DM Mono', monospace", display:"flex", gap:"16px" }}>
                    <span>Viagens: <strong style={{ color:"var(--t1)" }}>{retiradas.length}</strong></span>
                    <span>Pendente: <strong style={{ color:"var(--t1)" }}>{totalPecasPedido - totalPecasRetirado}</strong></span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }} onClick={e => e.stopPropagation()}>
```

- [ ] **Step 2: Fechar o `<button>` no lugar da antiga `</div>` de header, e condicionar o restante do corpo a `abrirRetiradas`**

Logo abaixo (linhas 1025-1037 hoje):

```typescript
                  {totalPecasPedido - totalPecasRetirado > 0 && (
                    <button
                      className="btn sm"
                      onClick={() => { setShowRetTudo(v => !v); setRetTudoData(hoje()); }}
                      style={{ background: showRetTudo ? "rgba(99,102,241,.18)" : "rgba(99,102,241,.08)", border:"1px solid var(--acc)", color:"var(--acc)", fontWeight:700, whiteSpace:"nowrap" }}
                    >
                      ✓ Retirar tudo
                    </button>
                  )}
                  <a href={`/pedidos/${id}/retiradas`} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🚚 Ver Retiradas</a>
                </div>
              </div>

              {resumoRetiradaPorProduto.length > 0 && (
```

Trocar o `</div>` que fecha a div de header (a que agora virou o miolo do `<button>`) por `</div></button>`, e envolver o resto do corpo (resumo por vidro + form de retirar tudo) num `{abrirRetiradas && (...)}`:

```typescript
                  {totalPecasPedido - totalPecasRetirado > 0 && (
                    <button
                      className="btn sm"
                      onClick={() => { setShowRetTudo(v => !v); setRetTudoData(hoje()); }}
                      style={{ background: showRetTudo ? "rgba(99,102,241,.18)" : "rgba(99,102,241,.08)", border:"1px solid var(--acc)", color:"var(--acc)", fontWeight:700, whiteSpace:"nowrap" }}
                    >
                      ✓ Retirar tudo
                    </button>
                  )}
                  <a href={`/pedidos/${id}/retiradas`} className="btn bg sm" style={{ whiteSpace:"nowrap", textDecoration:"none" }}>🚚 Ver Retiradas</a>
                </div>
              </button>

              {abrirRetiradas && (
              <>
              {resumoRetiradaPorProduto.length > 0 && (
```

- [ ] **Step 3: Fechar o novo fragment antes do `</div>` final da seção**

No final do bloco (linha 1091-1092 hoje):

```typescript
                </div>
              )}
            </div>
          )}
```

Trocar por (fecha o `{showRetTudo && (...)}` como já era, fecha o `<>`/`abrirRetiradas &&`, e por fim fecha a `<div>` externa e o `{temItens && (...)}`):

```typescript
                </div>
              )}
              </>
              )}
            </div>
          )}
```

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output.

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando.

- [ ] **Step 6: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: secao Retiradas vira retratil e para de repetir resumo do hero"
```

---

### Task 5: "Informações do Pedido" e "Financeiro" saem do grid 2 colunas e viram 2 seções retráteis (fechadas)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:1094-1437` (bloco `{/* Grid info + financeiro */}` inteiro, incluindo as 2 cards que ele contém)

**Interfaces:**
- Consumes: `abrirInformacoes`/`setAbrirInformacoes`, `abrirFinanceiro`/`setAbrirFinanceiro` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Trocar o grid por uma coluna, e o header de "Informações do Pedido" por um botão retrátil**

Hoje (linhas 1094-1098):

```typescript
          {/* Grid info + financeiro */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px" }}>
            <div className="card" style={{ padding:"20px 24px" }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
```

Substituir por (remove o `display:"grid"`, vira flex-column; header de Informações vira botão):

```typescript
          {/* Informações do Pedido */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <button onClick={() => setAbrirInformacoes(v => !v)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirInformacoes ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>INFORMAÇÕES DO PEDIDO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirInformacoes ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
            </button>
            {abrirInformacoes && (
              <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
```

- [ ] **Step 2: Fechar a condicional de Informações e transformar o header de Financeiro do mesmo jeito**

Hoje (linhas 1123-1129, o fim do card de Informações e o começo do card de Financeiro):

```typescript
                {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            </div>

            <div className="card" style={{ padding:"20px 24px" }}>
              {/* Cabeçalho */}
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, marginBottom:"16px", letterSpacing:".06em" }}>FINANCEIRO</div>
```

Substituir por (fecha o `{abrirInformacoes && (...)}` e o card de Informações; abre o card de Financeiro já como seção retrátil, sem o grid pai):

```typescript
                {pedido.obs && <Row label="Observações" value={pedido.obs} />}
              </div>
            )}
          </div>

          {/* Financeiro */}
          <div className="card" style={{ padding:"20px 24px" }}>
            <button onClick={() => setAbrirFinanceiro(v => !v)} style={{ width:"100%", display:"flex", alignItems:"center", gap:"8px", marginBottom: abrirFinanceiro ? "16px" : 0, background:"none", border:"none", cursor:"pointer", padding:0 }}>
              <div style={{ fontSize:"11px", color:"var(--t3)", fontWeight:700, letterSpacing:".06em" }}>FINANCEIRO</div>
              <span style={{ fontSize:"11px", color:"var(--t3)", transform: abrirFinanceiro ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .2s" }}>▾</span>
            </button>
            {abrirFinanceiro && (
            <>
```

- [ ] **Step 3: Fechar o card de Financeiro (sem o grid pai) no final do bloco**

Hoje (linhas 1430-1437, o fim do card de Financeiro e do grid):

```typescript
              {quitado && (
                <div style={{ padding:"10px", background:"rgba(0,200,100,.08)", borderRadius:"8px", color:"var(--ok)", fontSize:"13px", textAlign:"center" }}>
                  ✓ Pagamento quitado
                </div>
              )}
            </div>
          </div>
```

Substituir por (fecha o `<>` e o `{abrirFinanceiro && (...)}`, fecha o card — não fecha mais um grid, porque o grid não existe mais):

```typescript
              {quitado && (
                <div style={{ padding:"10px", background:"rgba(0,200,100,.08)", borderRadius:"8px", color:"var(--ok)", fontSize:"13px", textAlign:"center" }}>
                  ✓ Pagamento quitado
                </div>
              )}
            </>
            )}
          </div>
```

- [ ] **Step 4: Reindentar o conteúdo interno (mecânico)**

Tudo que ficou entre as duas condicionais abertas nos Steps 1-3 (o conteúdo de dentro de "Informações do Pedido" nas linhas ~1099-1122, e o conteúdo de dentro de "Financeiro" nas linhas ~1131-1429 do arquivo original) precisa ganhar 2 espaços a mais de indentação por estar 1 nível mais fundo (dentro do novo `{abrirX && (` em vez de direto dentro do `<div className="card">`). É só indentação — nenhuma linha de lógica, valor ou JSX muda de conteúdo.

- [ ] **Step 5: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output. Se aparecer erro de JSX (tag não fechada, parêntese sobrando), conferir se todos os `{abrirInformacoes && (` / `{abrirFinanceiro && (` têm exatamente 1 `)}` correspondente e se o grid antigo (`display:"grid", gridTemplateColumns:"1fr 1fr"`) não sobrou em nenhum lugar.

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando.

- [ ] **Step 7: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: Informacoes do Pedido e Financeiro saem do grid e viram secoes retrateis"
```

---

### Task 6: Card "Documentos" ganha um toggle externo (fechado por padrão)

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:1478-1479` (abertura do card) e `app/pedidos/[id]/page.tsx:1725` (fechamento do card)

**Interfaces:**
- Consumes: `abrirDocumentos`/`setAbrirDocumentos` (Task 1).
- Produces: nada consumido por outra task. Os 4 toggles internos (`abrirRomaneio`/`abrirNfe`/`abrirBoleto`/`abrirComprovante`/`abrirObs`) continuam existindo e funcionando exatamente como hoje — este toggle é só mais um nível por fora.

- [ ] **Step 1: Adicionar o header/botão externo antes do primeiro toggle interno**

Hoje (linhas 1478-1481):

```typescript
          {/* Romaneio / NF-e / Boleto / Observações — um card só, compacto */}
          <div className="card" style={{ overflow: "hidden" }}>
            {/* Romaneio(s) Assinado(s) */}
            <button onClick={() => setAbrirRomaneio(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--t1)" }}>
```

Substituir por (novo botão externo "DOCUMENTOS", envolvendo tudo que já existe):

```typescript
          {/* Documentos: Romaneio / NF-e / Boleto / Comprovante / Observações */}
          <div className="card" style={{ overflow: "hidden" }}>
            <button onClick={() => setAbrirDocumentos(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", cursor: "pointer", color: "var(--t1)" }}>
              <div style={{ fontSize: "10.5px", color: "var(--t3)", fontWeight: 700, letterSpacing: ".06em" }}>DOCUMENTOS</div>
              <span style={{ fontSize: "11px", color: "var(--t3)", transform: abrirDocumentos ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}>▾</span>
            </button>
            {abrirDocumentos && (
            <>
            {/* Romaneio(s) Assinado(s) */}
            <button onClick={() => setAbrirRomaneio(v => !v)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px", background: "none", border: "none", borderTop: "1px solid var(--b1)", cursor: "pointer", color: "var(--t1)" }}>
```

(Nota: o botão de Romaneio ganhou `borderTop: "1px solid var(--b1)"` pra separar visualmente do novo header "DOCUMENTOS" — os outros 4 toggles internos já tinham essa borda, só o de Romaneio não tinha por ser o primeiro item do card antes.)

- [ ] **Step 2: Fechar o `<>` e o `{abrirDocumentos && (...)}` no final do card**

Hoje (linhas 1724-1725, fim da seção de Observações):

```typescript
            )}
          </div>
        </div>
```

Substituir por (fecha o fragment e a condicional externa, mantém o fechamento do card e do container):

```typescript
            )}
            </>
            )}
          </div>
        </div>
```

- [ ] **Step 3: Reindentar o miolo (mecânico)**

Tudo entre o novo `<>` (Step 1) e o novo fechamento (Step 2) — ou seja, as 4 seções de NF-e/Boleto/Comprovante/Observações que já existiam — ganha 2 espaços a mais de indentação por estar 1 nível mais fundo. Sem mudança de conteúdo.

- [ ] **Step 4: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output.

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando.

- [ ] **Step 6: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "feat: card Documentos ganha toggle externo (fechado por padrao)"
```

---

### Task 7: Consistência de cor — `corRetiradas` usa as variáveis semânticas do app

**Files:**
- Modify: `app/pedidos/[id]/page.tsx:845-848`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Trocar os valores rgba ad-hoc pelas variáveis já existentes**

Hoje (linhas 845-848):

```typescript
  const corRetiradas =
    totalPecasRetirado === 0          ? { bg: "rgba(255,255,255,.04)", border: "var(--b2)",          text: "var(--t2)"  }
    : totalPecasRetirado >= totalPecasPedido ? { bg: "rgba(16,185,129,.06)", border: "rgba(16,185,129,.3)", text: "var(--ok)"   }
    :                                    { bg: "rgba(245,158,11,.08)", border: "rgba(245,158,11,.3)", text: "var(--warn)" };
```

Substituir por (mantém a mesma lógica/aparência visual — os valores rgba já correspondiam a `--ok`/`--warn` em opacidade reduzida; a diferença é usar a variável em vez do hex fixo, então se o tema mudar de cor no futuro isso acompanha automaticamente):

```typescript
  const corRetiradas =
    totalPecasRetirado === 0          ? { bg: "var(--surf2)",              border: "var(--b2)",  text: "var(--t2)"   }
    : totalPecasRetirado >= totalPecasPedido ? { bg: "rgba(16,185,129,.06)", border: "var(--ok)",  text: "var(--ok)"   }
    :                                    { bg: "rgba(245,158,11,.08)",      border: "var(--warn)", text: "var(--warn)" };
```

(O `bg` continua com opacidade fixa em rgba porque não existe uma variável de "fundo translúcido" no app — só a cor sólida `--ok`/`--warn`. Trocar só `border` e `text`/`bg` neutro pelas variáveis é a parte que elimina hex solto sem inventar variável nova.)

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem output.

- [ ] **Step 3: Rodar os testes**

Run: `npx vitest run`
Expected: 199 testes passando.

- [ ] **Step 4: Commit**

```bash
git add "app/pedidos/[id]/page.tsx"
git commit -m "fix: corRetiradas usa variaveis semanticas em vez de hex solto"
```

---

### Task 8: Verificação final

**Files:**
- Nenhum arquivo novo — só verificação.

**Interfaces:**
- Consumes: resultado de todas as tasks anteriores.
- Produces: confirmação de que a página está íntegra.

- [ ] **Step 1: Rodar build de produção**

Run: `npx next build`
Expected: compila sem erro, incluindo a rota `/pedidos/[id]`.

- [ ] **Step 2: Verificação manual (dev server)**

Run: `npm run dev`, abrir um pedido existente em `/pedidos/[id]` e conferir:
- Hero no topo mostra cliente, total, recebido, aberto/quitado e progresso de retirada (se houver itens).
- "Itens do Pedido" abre sozinho; as demais seções (Informações, Financeiro, Retiradas, Documentos) começam fechadas.
- Cada seção abre/fecha independente ao clicar no header, sem afetar as outras.
- Dentro de Documentos, os 4 toggles internos (Romaneio/NF-e/Boleto/Comprovante) e Observações continuam funcionando como antes.
- Nenhum dado sumiu (comparar com uma captura de tela de antes da mudança, se possível).

- [ ] **Step 3: Reportar resultado**

Sem commit nesta task — é só checagem. Se algo estiver quebrado, voltar pra task correspondente e corrigir antes de finalizar.

---

## Self-Review Notes

- **Cobertura da spec:** hero (Task 3) ✓, Itens aberto por padrão (Task 2) ✓, Financeiro/Retiradas/Informações/Documentos fechados por padrão (Tasks 4-6) ✓, cor consolidada em variáveis semânticas (Task 7) ✓, nenhuma lógica interna alterada (todas as tasks são só wrapper/indentação) ✓, área de impressão intocada (nenhuma task toca linhas ≥ 1949) ✓.
- **Consistência de nomes:** `abrirItens`/`abrirInformacoes`/`abrirFinanceiro`/`abrirRetiradas`/`abrirDocumentos` declarados na Task 1 são usados com esses nomes exatos nas Tasks 2-6, sem variação.
- **Ordem de dependência:** Task 1 antes de todas; Task 3 (hero) antes da Task 4 (Retiradas) porque a Task 4 remove uma duplicata assumindo que o hero já existe — mas mesmo se invertidas, o pior caso é a info aparecer duas vezes por 1 task a mais, não quebra nada. Tasks 2, 5, 6, 7 são independentes entre si e podem, na prática, ser feitas em qualquer ordem relativa (mantive a ordem por seguir o layout de cima pra baixo).
