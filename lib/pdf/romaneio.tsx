import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatBRL, formatDate, formatM2 } from "@/lib/formatters";
import type { Pedido } from "@/types";

const AZUL = "#2d5fa6";
const VERDE = "#3d8c5c";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: "#1a1a2e", fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 3, borderBottomColor: AZUL, paddingBottom: 12, marginBottom: 18,
  },
  logo: { fontSize: 22, fontWeight: 700, color: AZUL },
  empresaInfo: { fontSize: 8, color: "#444", marginTop: 2 },
  tituloDoc: { fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, textAlign: "right" },
  pedidoId: { fontSize: 22, fontWeight: 700, color: AZUL, textAlign: "right" },
  emissao: { fontSize: 10, color: "#333", marginTop: 6, textAlign: "right" },

  blocosRow: { flexDirection: "row", gap: 12, marginBottom: 18 },
  bloco: { flex: 1, padding: 10, backgroundColor: "#f0f4ff", borderRadius: 6 },
  blocoTitulo: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  blocoNome: { fontSize: 12, fontWeight: 700, color: "#1a1a2e" },
  blocoLinha: { fontSize: 9, color: "#333", marginTop: 3 },
  condLinha: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  condLabel: { fontSize: 9, color: "#333" },
  condValor: { fontSize: 9, fontWeight: 700, color: "#1a1a2e" },

  table: { marginBottom: 16 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: AZUL },
  th: { color: "#fff", fontSize: 8, fontWeight: 700, padding: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e8ecf5" },
  trAlt: { backgroundColor: "#f7f9ff" },
  td: { fontSize: 9, padding: 6, color: "#1a1a2e" },

  colNum: { width: "8%", textAlign: "center" },
  colProd: { width: "34%" },
  colDim: { width: "20%" },
  colMedida: { width: "16%" },
  colQtd: { width: "10%", textAlign: "center" },
  colCodigo: { width: "12%" },

  totalBox: {
    alignSelf: "flex-end", minWidth: 220, backgroundColor: "#f0f4ff",
    borderRadius: 6, padding: 12, marginBottom: 18,
  },
  totalLinha: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 2, borderTopColor: AZUL },
  totalLabel: { fontSize: 11, fontWeight: 700, color: AZUL },
  totalValor: { fontSize: 13, fontWeight: 700, color: AZUL },

  footer: {
    borderTopWidth: 2, borderTopColor: AZUL, paddingTop: 8, marginTop: 12,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerTexto: { fontSize: 7, color: "#333" },
  footerAviso: { fontSize: 7, color: "#c00", fontStyle: "italic" },
});

export function RomaneioDocument({ pedido }: { pedido: Pedido }) {
  const itens = pedido.itens_pedido ?? [];
  const isML = itens.length > 0 && itens.every(i => i.produtos?.unidade === "ml" || i.vidro_cliente === true);

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
            <Text style={styles.tituloDoc}>Romaneio do Pedido</Text>
            <Text style={styles.pedidoId}>{pedido.id}</Text>
            <Text style={styles.emissao}>Emissão: {formatDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.blocosRow}>
          <View style={styles.bloco}>
            <Text style={[styles.blocoTitulo, { color: AZUL }]}>Cliente</Text>
            <Text style={styles.blocoNome}>{pedido.clientes?.nome ?? "—"}</Text>
            {pedido.clientes?.cidade && <Text style={styles.blocoLinha}>{pedido.clientes.cidade}</Text>}
            {pedido.clientes?.tel && <Text style={styles.blocoLinha}>Tel: {pedido.clientes.tel}</Text>}
          </View>
          <View style={styles.bloco}>
            <Text style={[styles.blocoTitulo, { color: VERDE }]}>Condições Comerciais</Text>
            <View style={styles.condLinha}>
              <Text style={styles.condLabel}>Pagamento</Text>
              <Text style={styles.condValor}>{pedido.forma_pgto || "—"}</Text>
            </View>
            {pedido.parcelas > 1 && (
              <View style={styles.condLinha}>
                <Text style={styles.condLabel}>Parcelas</Text>
                <Text style={styles.condValor}>{pedido.parcelas}×</Text>
              </View>
            )}
            <View style={styles.condLinha}>
              <Text style={styles.condLabel}>Retirada/Entrega</Text>
              <Text style={styles.condValor}>{formatDate(pedido.dt_retirada)}</Text>
            </View>
            <View style={styles.condLinha}>
              <Text style={styles.condLabel}>{isML ? "ml total" : "m² total"}</Text>
              <Text style={styles.condValor}>{isML ? `${Number(pedido.m2_total).toFixed(2)} ml` : formatM2(pedido.m2_total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colNum]}>#</Text>
            <Text style={[styles.th, styles.colProd]}>Produto</Text>
            <Text style={[styles.th, styles.colDim]}>Dimensão (mm)</Text>
            <Text style={[styles.th, styles.colMedida]}>Medida</Text>
            <Text style={[styles.th, styles.colQtd]}>Qtd</Text>
            <Text style={[styles.th, styles.colCodigo]}>Código</Text>
          </View>
          {itens.map((item, i) => {
            const itemML = item.produtos?.unidade === "ml" || item.vidro_cliente === true;
            return (
              <View key={item.id} style={i % 2 === 1 ? [styles.tr, styles.trAlt] : styles.tr}>
                <Text style={[styles.td, styles.colNum]}>{i + 1}</Text>
                <Text style={[styles.td, styles.colProd]}>{item.produto_nome}</Text>
                <Text style={[styles.td, styles.colDim]}>{item.largura} × {item.altura}</Text>
                <Text style={[styles.td, styles.colMedida]}>{Number(item.m2).toFixed(3)} {itemML ? "ml" : "m²"}</Text>
                <Text style={[styles.td, styles.colQtd]}>{item.quantidade}</Text>
                <Text style={[styles.td, styles.colCodigo]}>{item.codigo_adicional || "—"}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalBox}>
          <View style={styles.totalLinha}>
            <Text style={styles.totalLabel}>VALOR TOTAL</Text>
            <Text style={styles.totalValor}>{formatBRL(pedido.valor_total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTexto}>
            Urban Glass Comércio Ltda · CNPJ 65.668.970/0001-05 · Av. Vereador Raymundo Hargreaves, 1250 – Fontesville – Juiz de Fora/MG
          </Text>
          <Text style={styles.footerAviso}>Este documento não substitui a Nota Fiscal Eletrônica</Text>
        </View>
      </Page>
    </Document>
  );
}
