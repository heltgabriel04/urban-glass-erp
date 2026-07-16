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
            <Text style={styles.kpiLabel}>Recebido</Text>
            <Text style={[styles.kpiValor, { color: VERDE }]}>{formatBRL(dados.totalRecebido)}</Text>
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
