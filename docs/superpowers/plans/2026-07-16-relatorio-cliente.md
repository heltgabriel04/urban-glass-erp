# Relatório Completo do Cliente (PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão na tela do cliente que gera um PDF profissional com
todo o histórico de pedidos (itens, medidas, valores) e a situação
financeira (quitado/em aberto, parcelas pendentes), pronto pra enviar
ao cliente.

**Architecture:** Reaproveita a infraestrutura de PDF já existente
(`@react-pdf/renderer`, mesma identidade visual de
`lib/pdf/romaneio.tsx`/`comprovante.tsx`/`relatorioExecutivo.tsx`). Uma
rota de API nova busca os dados com o client de service role, monta um
objeto de dados já calculado, e passa pra um componente de documento
novo que só renderiza (sem lógica de negócio).

**Tech Stack:** Next.js (App Router, Route Handlers), `@react-pdf/renderer`,
Supabase-js (service role), TypeScript.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-16-relatorio-cliente-design.md`.
- Sem seletor de período — sempre todo o histórico do cliente.
- Pedidos com `status === "Cancelado"` são excluídos.
- O total "oficial" de cada pedido é `valorComIpi(pedido)` (de
  `lib/pedidoIpi.ts`, já existente), não a view `financeiro_clientes`.
- Mesma identidade visual dos documentos já existentes: cores
  `AZUL = "#2d5fa6"`, `VERDE = "#3d8c5c"`, `VERMELHO = "#b23b3b"`,
  cabeçalho com logo+dados da empresa, rodapé fixo.
- Sem teste automatizado — nenhum gerador de PDF deste projeto tem
  teste (I/O + renderização visual). Verificação via `npx tsc --noEmit`
  e `npm run build`.
- Dados da empresa (reaproveitar literalmente, mesmo texto dos outros
  documentos): `Urban Glass Comércio Ltda` · `CNPJ: 65.668.970/0001-05`
  · `Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de
  Fora/MG` · `(32) 99986-0317`.

---

### Task 1: Documento PDF + rota de API

**Files:**
- Create: `lib/pdf/relatorioCliente.tsx`
- Create: `app/api/clientes/[id]/relatorio-pdf/route.tsx`

**Interfaces:**
- Consumes: `valorComIpi`, `ALIQ_IPI_PEDIDO` (`lib/pedidoIpi.ts`); `formatBRL`, `formatDate`, `formatM2`, `medidaReal` (`lib/formatters.ts`); `requireAuth` (`lib/auth/api-guard.ts`); tipos `Cliente`, `Pedido`, `Lancamento` (`types/index.ts`)
- Produces: `RelatorioClienteDocument`, `RelatorioClienteDados`, `PedidoRelatorio` (exportados de `lib/pdf/relatorioCliente.tsx`)

- [ ] **Step 1: Componente do documento**

Criar `lib/pdf/relatorioCliente.tsx`:

```tsx
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatDate, formatBRL, formatM2, medidaReal } from "@/lib/formatters";
import { ALIQ_IPI_PEDIDO } from "@/lib/pedidoIpi";
import type { Cliente, Pedido } from "@/types";

const AZUL = "#2d5fa6";
const VERDE = "#3d8c5c";
const VERMELHO = "#b23b3b";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 3, borderBottomColor: AZUL, paddingBottom: 12, marginBottom: 18,
  },
  logo: { fontSize: 22, fontWeight: 700, color: AZUL },
  empresaInfo: { fontSize: 8, color: "#444", marginTop: 2 },
  tituloDoc: { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "right" },
  clienteNomeTop: { fontSize: 16, fontWeight: 700, color: AZUL, textAlign: "right" },
  emissao: { fontSize: 9, color: "#333", marginTop: 6, textAlign: "right" },

  bloco: { padding: 12, backgroundColor: "#f7f7f9", borderRadius: 6, marginBottom: 14 },
  blocoTitulo: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, color: AZUL },
  linha: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  label: { fontSize: 9, color: "#333" },
  valor: { fontSize: 9, fontWeight: 700, color: "#1a1a2e" },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  kpiBox: { flex: 1, padding: 10, backgroundColor: "#f0f4ff", borderRadius: 6 },
  kpiLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#555", marginBottom: 5 },
  kpiValor: { fontSize: 15, fontWeight: 700 },

  pedidoBloco: { marginBottom: 18 },
  pedidoHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#eef1fa", borderRadius: 6, padding: 8, marginBottom: 6 },
  pedidoId: { fontSize: 11, fontWeight: 700, color: AZUL },
  pedidoMeta: { fontSize: 8.5, color: "#444" },

  table: { marginBottom: 8 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: AZUL },
  th: { color: "#fff", fontSize: 7.5, fontWeight: 700, padding: 5 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e8ecf5" },
  trAlt: { backgroundColor: "#f7f9ff" },
  td: { fontSize: 8.5, padding: 5, color: "#1a1a2e" },

  colNum: { width: "6%", textAlign: "center" },
  colProd: { width: "28%" },
  colDim: { width: "18%" },
  colMedida: { width: "16%" },
  colUnit: { width: "16%", textAlign: "right" },
  colSub: { width: "16%", textAlign: "right" },

  totaisBox: { alignItems: "flex-end", marginTop: 4, marginBottom: 6 },
  totaisLabel: { fontSize: 8.5, color: "#333" },
  totaisValor: { fontSize: 8.5, fontWeight: 700, color: "#1a1a2e" },

  statusQuitado: { fontSize: 9, fontWeight: 700, color: VERDE },
  statusAberto: { fontSize: 9, fontWeight: 700, color: VERMELHO },
  parcelaLinha: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#333", marginTop: 2, paddingLeft: 8 },

  footer: { borderTopWidth: 2, borderTopColor: AZUL, paddingTop: 8, marginTop: 12 },
  footerTexto: { fontSize: 7, color: "#333" },
});

export interface PedidoRelatorio {
  pedido: Pedido;
  totalComIpi: number;
  quitado: boolean;
  isML: boolean;
  parcelasPendentes: { vencimento: string | null; valor: number }[];
}

export interface RelatorioClienteDados {
  cliente: Cliente;
  totalFaturado: number;
  totalRecebido: number;
  totalAberto: number;
  ticketMedio: number;
  pedidos: PedidoRelatorio[];
}

function enderecoCompleto(c: Cliente): string {
  return [
    c.logradouro && c.numero ? `${c.logradouro}, ${c.numero}` : c.logradouro || c.endereco,
    c.complemento,
    c.bairro,
    c.cidade && c.uf ? `${c.cidade} / ${c.uf}` : c.cidade,
    c.cep,
  ].filter(Boolean).join(" — ");
}

export function RelatorioClienteDocument({ dados }: { dados: RelatorioClienteDados }) {
  const { cliente } = dados;
  const endereco = enderecoCompleto(cliente);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.logo}>urbanglass</Text>
            <Text style={styles.empresaInfo}>Urban Glass Comércio Ltda</Text>
            <Text style={styles.empresaInfo}>CNPJ: 65.668.970/0001-05</Text>
            <Text style={styles.empresaInfo}>Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG</Text>
            <Text style={styles.empresaInfo}>(32) 99986-0317</Text>
          </View>
          <View>
            <Text style={styles.tituloDoc}>Relatório do Cliente</Text>
            <Text style={styles.clienteNomeTop}>{cliente.nome}</Text>
            <Text style={styles.emissao}>Emitido em {formatDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Dados do Cliente</Text>
          <View style={styles.linha}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.valor}>{cliente.nome}</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>{cliente.tipo_pessoa === "PJ" ? "CNPJ" : "CPF"}</Text>
            <Text style={styles.valor}>{(cliente.tipo_pessoa === "PJ" ? cliente.cnpj : cliente.cpf) || "—"}</Text>
          </View>
          {cliente.tel && (
            <View style={styles.linha}>
              <Text style={styles.label}>Telefone</Text>
              <Text style={styles.valor}>{cliente.tel}</Text>
            </View>
          )}
          {cliente.email && (
            <View style={styles.linha}>
              <Text style={styles.label}>E-mail</Text>
              <Text style={styles.valor}>{cliente.email}</Text>
            </View>
          )}
          {endereco && (
            <View style={styles.linha}>
              <Text style={styles.label}>Endereço</Text>
              <Text style={styles.valor}>{endereco}</Text>
            </View>
          )}
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Faturado</Text>
            <Text style={styles.kpiValor}>{formatBRL(dados.totalFaturado)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={[styles.kpiValor, { color: VERDE }]}>{formatBRL(dados.totalRecebido)}</Text>
            <Text style={styles.kpiLabel}>Recebido</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Em Aberto</Text>
            <Text style={[styles.kpiValor, { color: dados.totalAberto > 0.005 ? VERMELHO : "#1a1a2e" }]}>{formatBRL(dados.totalAberto)}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Ticket Médio</Text>
            <Text style={styles.kpiValor}>{formatBRL(dados.ticketMedio)}</Text>
          </View>
        </View>

        {dados.pedidos.length === 0 ? (
          <Text style={styles.label}>Nenhum pedido registrado para este cliente.</Text>
        ) : (
          dados.pedidos.map((pr) => {
            const { pedido, totalComIpi, quitado, isML, parcelasPendentes } = pr;
            const itens = pedido.itens_pedido ?? [];
            const m2Total = itens.reduce((s, i) => s + medidaReal(i, isML), 0);
            const aberto = totalComIpi - Number(pedido.valor_recebido);
            return (
              <View key={pedido.id} style={styles.pedidoBloco}>
                <View style={styles.pedidoHeaderRow}>
                  <Text style={styles.pedidoId}>Pedido {pedido.id}</Text>
                  <Text style={styles.pedidoMeta}>
                    {formatDate(pedido.dt_pedido)} · {pedido.status}
                    {pedido.dt_retirada ? ` · Retirada ${formatDate(pedido.dt_retirada)}` : ""}
                  </Text>
                </View>

                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.th, styles.colNum]}>#</Text>
                    <Text style={[styles.th, styles.colProd]}>Produto</Text>
                    <Text style={[styles.th, styles.colDim]}>Dimensões (mm)</Text>
                    <Text style={[styles.th, styles.colMedida]}>Medida</Text>
                    <Text style={[styles.th, styles.colUnit]}>Valor Unit.</Text>
                    <Text style={[styles.th, styles.colSub]}>Subtotal</Text>
                  </View>
                  {itens.map((item, i) => (
                    <View key={item.id} style={i % 2 === 1 ? [styles.tr, styles.trAlt] : styles.tr}>
                      <Text style={[styles.td, styles.colNum]}>{i + 1}</Text>
                      <Text style={[styles.td, styles.colProd]}>{item.produto_nome}</Text>
                      <Text style={[styles.td, styles.colDim]}>{item.largura} × {item.altura}</Text>
                      <Text style={[styles.td, styles.colMedida]}>{medidaReal(item, isML).toFixed(3)} {isML ? "ml" : "m²"}</Text>
                      <Text style={[styles.td, styles.colUnit]}>{formatBRL(item.valor_m2)}</Text>
                      <Text style={[styles.td, styles.colSub]}>{formatBRL(item.subtotal)}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.totaisBox}>
                  <View style={styles.linha}>
                    <Text style={styles.totaisLabel}>{isML ? "ML Total" : "m² Total"}</Text>
                    <Text style={styles.totaisValor}>{isML ? `${m2Total.toFixed(2)} ml` : formatM2(m2Total)}</Text>
                  </View>
                  {pedido.tem_ipi ? (
                    <>
                      <View style={styles.linha}>
                        <Text style={styles.totaisLabel}>Valor Produtos</Text>
                        <Text style={styles.totaisValor}>{formatBRL(pedido.valor_total)}</Text>
                      </View>
                      <View style={styles.linha}>
                        <Text style={styles.totaisLabel}>IPI ({ALIQ_IPI_PEDIDO}%)</Text>
                        <Text style={styles.totaisValor}>{formatBRL(pedido.valor_ipi)}</Text>
                      </View>
                      <View style={styles.linha}>
                        <Text style={styles.totaisLabel}>Total</Text>
                        <Text style={styles.totaisValor}>{formatBRL(totalComIpi)}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.linha}>
                      <Text style={styles.totaisLabel}>Valor Total</Text>
                      <Text style={styles.totaisValor}>{formatBRL(totalComIpi)}</Text>
                    </View>
                  )}
                </View>

                {quitado ? (
                  <Text style={styles.statusQuitado}>✓ Quitado</Text>
                ) : (
                  <View>
                    <Text style={styles.statusAberto}>Em aberto: {formatBRL(aberto)}</Text>
                    {parcelasPendentes.map((p, i) => (
                      <View key={i} style={styles.parcelaLinha}>
                        <Text>Parcela — vence {p.vencimento ? formatDate(p.vencimento) : "data não definida"}</Text>
                        <Text>{formatBRL(p.valor)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.footer}>
          <Text style={styles.footerTexto}>
            Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG
          </Text>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Rota de API**

Criar `app/api/clientes/[id]/relatorio-pdf/route.tsx`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAuth } from "@/lib/auth/api-guard";
import { RelatorioClienteDocument, type RelatorioClienteDados, type PedidoRelatorio } from "@/lib/pdf/relatorioCliente";
import { valorComIpi } from "@/lib/pedidoIpi";
import type { Cliente, Pedido, Lancamento } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const { id } = await params;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: cliente, error: errCliente } = await sb
    .from("clientes")
    .select("*")
    .eq("id", id)
    .single();

  if (errCliente || !cliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const [{ data: pedidosData }, { data: lancData }] = await Promise.all([
    sb.from("pedidos")
      .select("*, itens_pedido(*, produtos(id, unidade))")
      .eq("cliente_id", id)
      .neq("status", "Cancelado")
      .order("dt_pedido", { ascending: false }),
    sb.from("lancamentos")
      .select("*")
      .eq("cliente_id", id)
      .eq("tipo", "Entrada")
      .eq("status", "A Receber")
      .order("vencimento", { ascending: true }),
  ]);

  const pedidosRows = (pedidosData ?? []) as Pedido[];
  const lancamentos = (lancData ?? []) as Lancamento[];

  const parcelasPorPedido = new Map<string, { vencimento: string | null; valor: number }[]>();
  for (const l of lancamentos) {
    if (!l.pedido_id) continue;
    const lista = parcelasPorPedido.get(l.pedido_id) ?? [];
    lista.push({ vencimento: l.vencimento, valor: l.valor });
    parcelasPorPedido.set(l.pedido_id, lista);
  }

  const pedidos: PedidoRelatorio[] = pedidosRows.map((pedido) => {
    const itens = pedido.itens_pedido ?? [];
    const isML = itens.length > 0 && itens.every(
      (i) => i.produtos?.unidade === "ml" || i.vidro_cliente === true
    );
    const totalComIpi = valorComIpi(pedido);
    return {
      pedido,
      totalComIpi,
      quitado: Number(pedido.valor_recebido) >= totalComIpi - 0.02,
      isML,
      parcelasPendentes: parcelasPorPedido.get(pedido.id) ?? [],
    };
  });

  const totalFaturado = pedidos.reduce((a, p) => a + p.totalComIpi, 0);
  const totalRecebido = pedidosRows.reduce((a, p) => a + Number(p.valor_recebido), 0);
  const totalAberto = totalFaturado - totalRecebido;
  const ticketMedio = pedidos.length > 0 ? totalFaturado / pedidos.length : 0;

  const dados: RelatorioClienteDados = {
    cliente: cliente as Cliente,
    totalFaturado, totalRecebido, totalAberto, ticketMedio,
    pedidos,
  };

  const buffer = await renderToBuffer(<RelatorioClienteDocument dados={dados} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-cliente_${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 3: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros (rotas de API entram no build do Next
normalmente).

- [ ] **Step 4: Commit**

```bash
git add lib/pdf/relatorioCliente.tsx "app/api/clientes/[id]/relatorio-pdf/route.tsx"
git commit -m "feat: relatorio completo do cliente em PDF"
```

---

### Task 2: Botão na tela do cliente

**Files:**
- Modify: `app/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: rota `GET /api/clientes/[id]/relatorio-pdf` (Task 1)

- [ ] **Step 1: Adicionar o link/botão na topbar**

Localizar (linhas 136-143):

```tsx
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>
          {cliente.nome}
          {!cliente.ativo && <span className="chip cr" style={{ marginLeft:"10px", fontSize:"10px" }}>Inativo</span>}
        </div>
        <button className="btn bg sm" onClick={() => router.push(`/clientes?edit=${cliente.id}`)}>Editar Cliente</button>
      </div>
```

Substituir por:

```tsx
      <div className="tb">
        <button className="btn bg sm" onClick={() => router.back()}>← Voltar</button>
        <div className="tb-title" style={{ flex:1 }}>
          {cliente.nome}
          {!cliente.ativo && <span className="chip cr" style={{ marginLeft:"10px", fontSize:"10px" }}>Inativo</span>}
        </div>
        <a
          className="btn bg sm"
          style={{ textDecoration: "none" }}
          href={`/api/clientes/${cliente.id}/relatorio-pdf`}
          target="_blank" rel="noopener noreferrer"
        >
          📄 Relatório do Cliente
        </a>
        <button className="btn bg sm" onClick={() => router.push(`/clientes?edit=${cliente.id}`)}>Editar Cliente</button>
      </div>
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/clientes/[id]/page.tsx
git commit -m "feat: botao de relatorio do cliente na tela do cliente"
```

---

### Task 3: Verificação manual

**Files:** nenhum (só validação)

**Interfaces:** N/A

- [ ] **Step 1: Rodar build completo**

Run: `npx tsc --noEmit && npm run build`
Expected: tudo verde.

- [ ] **Step 2: Gerar o relatório de clientes variados**

Subir o dev server, abrir a tela de um cliente com histórico variado
(pelo menos um pedido quitado, um em aberto com parcelas pendentes, e
se possível um com IPI marcado) e clicar em "📄 Relatório do Cliente".
Conferir no PDF gerado:
- Dados do cliente corretos (nome, CPF/CNPJ, telefone, endereço)
- KPIs (Total Faturado, Recebido, Em Aberto, Ticket Médio) batem com o
  que a tela do cliente já mostra
- Cada pedido lista os itens certos (produto, dimensões, valor unitário,
  subtotal) e o total bate com o que aparece na tela do pedido
- Pedido com IPI mostra a linha "IPI (6,5%)" e o total já somado
- Pedido em aberto lista as parcelas pendentes com vencimento e valor;
  pedido quitado mostra só "✓ Quitado"
- Pedidos cancelados (se o cliente tiver algum) não aparecem no PDF

- [ ] **Step 3: Testar cliente sem pedidos**

Abrir um cliente sem nenhum pedido (ou criar um de teste) e conferir
que o relatório gera normalmente, mostrando "Nenhum pedido registrado
para este cliente." em vez de quebrar ou mostrar uma seção vazia
estranha.
