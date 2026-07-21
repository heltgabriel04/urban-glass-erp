// ============================================================
// types/index.ts — Tipos completos do Urban Glass ERP
// ============================================================

export type StatusPedido =
  | 'Aguardando otimização'
  | 'Em Produção – Corte'
  | 'Qualidade (Corte)'
  | 'Em Produção – Lapidação'
  | 'Qualidade (Lapidação)'
  | 'Separação'
  | 'Finalizado'
  | 'Entregue'
  | 'Cancelado';

export type StatusOrcamento  = 'Pendente' | 'Aprovado' | 'Recusado';
export type StatusRetalho    = 'Disponível' | 'Reservado' | 'Em uso' | 'Descartado';
export type StatusLancamento = 'Pago' | 'Pendente' | 'A Receber';
export type TipoLancamento   = 'Entrada' | 'Saída';
export type TabelaCliente    = 'p' | 'g';
export type TipoPessoa       = 'PF' | 'PJ';
export type IndIE            = '1' | '2' | '9';

export type StatusNota =
  | 'rascunho'
  | 'enviando'
  | 'autorizada'
  | 'cancelada'
  | 'rejeitada';

// ─── CLIENTE ───────────────────────────────────────────────
export interface Cliente {
  id: number;
  nome: string;
  cnpj: string;
  cpf: string;
  tipo_pessoa: TipoPessoa;
  tel: string;
  email: string;
  endereco: string;
  cidade: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  uf: string;
  cod_ibge: string;
  ie: string;
  ind_ie: IndIE;
  consumidor_final: boolean;
  obs_nfe: string;
  pgto: string;
  tabela: TabelaCliente;
  ativo: boolean;
  credito: number;
  bloqueado_credito?: boolean;
  bloqueado_credito_em?: string | null;
  created_at: string;
}

export type ClienteInsert = Omit<Cliente, 'id' | 'created_at'>;
export type ClienteUpdate = Partial<ClienteInsert>;

// ─── VENDEDOR ──────────────────────────────────────────────
export interface Vendedor {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  comissao_pct: number;
  ativo: boolean;
  obs: string | null;
  created_at: string;
}

export type VendedorInsert = Omit<Vendedor, 'id' | 'created_at'>;
export type VendedorUpdate = Partial<VendedorInsert>;

// ─── FORNECEDOR ────────────────────────────────────────────
export interface Fornecedor {
  id: number;
  nome: string;
  cnpj: string;
  tel: string;
  email: string;
  contato: string;
  cidade: string;
  uf: string;
  categoria: string;
  obs: string;
  ativo: boolean;
  created_at: string;
  ie: string;
  ind_ie: IndIE;
  regime_tributario: '' | 'mei' | 'simples' | 'presumido' | 'real';
}

export type FornecedorInsert = Omit<Fornecedor, 'id' | 'created_at'>;
export type FornecedorUpdate = Partial<FornecedorInsert>;

// ─── TABELA DE PREÇO ───────────────────────────────────────
export interface TabelaPreco {
  id: number;
  nome: string;
  tipo: string;
  lam: number;
  ref: number;
  ver: number;
  lap: number;
  fur: number;
  min: number;
  desc: number;
  ativo: boolean;
  created_at: string;
}

// ─── ITEM DA TABELA DE PREÇO ───────────────────────────────
export interface TabelaPrecoItem {
  id: number;
  tabela_id: number;
  produto_id: number;
  valor: number;
  margem: number;
}

// ─── PRODUTO ───────────────────────────────────────────────
export interface Produto {
  id: number;
  cod: string;
  nome: string;
  tipo: string;
  espessura: string;
  cor: string;
  categoria: string;
  valor: number;
  margem: number;  // % máx de desconto/acréscimo permitido na negociação
  unidade: string;
  ativo: boolean;
  obs: string;
  chapas_por_colar?: number | null;   // ficha técnica de embalagem (ex.: 18, 24)
  /** @deprecated Morta desde a migração pra lotes_estoque (2026-07-21) — um produto
   * pode ter vários lotes com dimensões diferentes agora. Nunca populada em produção
   * (sempre null nos 11 produtos existentes); mantida só até decisão de remoção.
   * Fonte real de dimensão: lotes_estoque.chapa_largura_mm/altura_mm por lote. */
  chapa_largura_mm?: number | null;
  /** @deprecated Ver chapa_largura_mm acima. */
  chapa_altura_mm?: number | null;
  /** false = vidro direcional/padrão/serigrafado — otimizador nunca gira a peça. */
  pode_rotacionar: boolean;
  created_at: string;
}

export type ProdutoInsert = Omit<Produto, 'id' | 'created_at'>;
export type ProdutoUpdate = Partial<ProdutoInsert>;

// ─── ESTOQUE ───────────────────────────────────────────────
export interface EstoqueItem {
  id: number;
  produto_id: number;
  cod: string;
  chapas_entrada: number;
  m2_entrada: number;
  m2_consumido: number;
  m2_saldo: number;
  chapas_saldo: number;
  m2_por_chapa: number;
  custo_m2: number;
  estoque_minimo_chapas?: number;
  updated_at: string;
  produtos?: Produto;
}

// ─── MOVIMENTAÇÃO DE ESTOQUE (livro-razão) ─────────────────
export type TipoMovimentacaoEstoque = 'entrada_compra' | 'saida_producao' | 'ajuste' | 'devolucao' | 'saldo_inicial';
export type OrigemMovimentacaoEstoque = 'otimizacao' | 'pedido_chapa' | 'manual' | 'saldo_inicial' | 'compra';

export interface EstoqueMovimentacao {
  id: number;
  produto_id: number;
  tipo: TipoMovimentacaoEstoque;
  origem_tipo: OrigemMovimentacaoEstoque | null;
  origem_id: string | null;
  chapas: number;   // positivo = entrada, negativo = saída
  m2: number;       // positivo = entrada, negativo = saída
  custo_unitario_m2: number | null;
  saldo_chapas_apos: number | null;
  saldo_m2_apos: number | null;
  usuario: string | null;
  obs: string | null;
  created_at: string;
}

export type EstoqueMovimentacaoInsert = Omit<EstoqueMovimentacao, 'id' | 'created_at'>;

export interface EstoqueConsolidado {
  produto_id: number;
  nome: string;
  chapas_por_colar: number | null;
  colares_inteiros: number | null;
  chapas_soltas: number;
  chapas_saldo: number;
  m2_saldo: number;
  m2_comprometido: number;
  m2_disponivel: number;
  custo_m2: number;
}

// ─── MATERIAL DO CLIENTE (livro-razão próprio) ─────────────
export type TipoMovimentacaoClienteMaterial = 'entrada' | 'saida_producao' | 'devolucao' | 'perda';

export interface MaterialClienteMov {
  id: number;
  pedido_id: string | null;
  cliente_id: number | null;
  item_pedido_id: number | null;
  tipo: TipoMovimentacaoClienteMaterial;
  descricao: string | null;
  largura: number | null;
  altura: number | null;
  quantidade: number | null;
  nc_id: number | null;
  dt_movimento: string;
  obs: string | null;
}

export type MaterialClienteMovInsert = Omit<MaterialClienteMov, 'id' | 'dt_movimento'>;

// ─── COMPRA (fornecedor → recebimento) ─────────────────────
export type StatusCompra = 'rascunho' | 'recebido';

export interface Compra {
  id: string;
  fornecedor_id: number | null;
  nf: string | null;
  dt_compra: string;
  condicao_pgto: string | null;
  status: StatusCompra;
  valor_total: number;
  obs: string | null;
  dt_recebimento: string | null;
  // Importação (opcionais — só preenchidos quando eh_importacao = true;
  // ver docs/superpowers/specs/2026-07-17-custo-importacao-design.md)
  eh_importacao?: boolean;
  numero_di?: string | null;
  valor_fob_usd?: number;
  frete_internacional_usd?: number;
  seguro_internacional_usd?: number;
  cambio_usd?: number;
  ii?: number;
  ipi_importacao?: number;
  pis_cofins_importacao?: number;
  icms_importacao?: number;
  despesas_aduaneiras?: number;
  ipi_creditavel?: boolean;
  pis_cofins_creditavel?: boolean;
  icms_creditavel?: boolean;
  created_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
  compras_itens?: CompraItem[];
}

export type CompraInsert = Omit<Compra, 'created_at' | 'fornecedores' | 'compras_itens'>;

export interface CompraItem {
  id: number;
  compra_id: string;
  produto_id: number | null;
  colares: number | null;
  chapas: number;
  m2_por_chapa: number;
  m2: number;
  custo_unitario_m2: number;
  subtotal: number;
  produtos?: Pick<Produto, 'id' | 'nome' | 'cod' | 'chapas_por_colar'>;
}

export type CompraItemInsert = Omit<CompraItem, 'id' | 'produtos'>;

// ─── PEDIDO ────────────────────────────────────────────────
export interface StatusHistoryEntry {
  status: StatusPedido;
  desde: string; // ISO timestamp
}

export interface Pedido {
  id: string;
  cliente_id: number;
  vendedor_id?: number | null;
  dt_pedido: string;
  dt_retirada: string | null;
  datas_pgto: string[];
  valores_pgto: number[];
  m2_total: number;
  valor_total: number;
  tem_ipi: boolean;
  valor_ipi: number;
  valor_recebido: number;
  status: StatusPedido;
  forma_pgto: string;
  conta: string;
  parcelas: number;
  frete: string;
  obs: string;
  status_history?: StatusHistoryEntry[];
  qr_token?: string;
  romaneio_pdf_url?: string | null;
  romaneio_assinado_urls?: string[] | null;
  nfe_urls?: string[] | null;
  boleto_urls?: string[] | null;
  sem_nota_fiscal?: boolean;
  created_at: string;
  updated_at: string;
  clientes?: Cliente;
  vendedores?: Vendedor;
  itens_pedido?: ItemPedido[];
}

export type PedidoInsert = Omit<Pedido, 'created_at' | 'updated_at' | 'clientes' | 'itens_pedido'>;
export type PedidoUpdate = Partial<PedidoInsert>;

// ─── ITEM DO PEDIDO ────────────────────────────────────────
export interface ItemPedido {
  id: number;
  pedido_id: string;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  m2: number;
  valor_m2: number;
  lapidacao: number;
  quantidade: number;
  subtotal: number;
  vidro_cliente: boolean;   // true = cliente trouxe o vidro (não desconta estoque)
  codigo_adicional?: string | null; // código extra por peça (ex.: planilha própria do cliente), exibido na etiqueta
  created_at: string;
  produtos?: Produto;
}

export type ItemPedidoInsert = Omit<ItemPedido, 'id' | 'created_at' | 'produtos'>;

// ─── RETIRADA PARCIAL (viagem) ─────────────────────────────
export interface RetiradaPedido {
  id: string;
  pedido_id: string;
  dt_retirada: string;
  motorista: string | null;
  veiculo: string | null;
  obs: string | null;
  created_at: string;
  retiradas_pedido_itens?: RetiradaPedidoItem[];
}

export type RetiradaPedidoInsert = Omit<RetiradaPedido, 'id' | 'created_at' | 'retiradas_pedido_itens'>;

export interface RetiradaPedidoItem {
  id: number;
  retirada_id: string;
  item_pedido_id: number;
  quantidade: number;
  obs: string | null;
  created_at: string;
  itens_pedido?: Pick<ItemPedido, 'id' | 'produto_nome' | 'largura' | 'altura' | 'quantidade' | 'vidro_cliente' | 'codigo_adicional'> & { produtos?: Pick<Produto, 'unidade'> | null };
}

export type RetiradaPedidoItemInsert = Omit<RetiradaPedidoItem, 'id' | 'created_at' | 'itens_pedido'>;

// ─── OBSERVAÇÃO DO PEDIDO (anotação livre, datada) ────────────
export interface PedidoObservacao {
  id: string;
  pedido_id: string;
  usuario_email: string | null;
  texto: string;
  created_at: string;
}

export type PedidoObservacaoInsert = Omit<PedidoObservacao, 'id' | 'created_at'>;

export type StatusSaldoRetirada = 'Pendente' | 'Parcial' | 'Retirado';

export interface SaldoItemRetirada {
  item_pedido_id: number;
  produto_nome: string;
  largura: number;
  altura: number;
  codigo_adicional: string | null;
  quantidade_total: number;
  quantidade_retirada: number;
  quantidade_pendente: number;
  status: StatusSaldoRetirada;
}

// ─── CHECKLIST DE EXPEDIÇÃO ────────────────────────────────
export interface ChecklistItemData {
  id: string;
  valor: 'sim' | 'nao' | null;
  obs: string;
}

export interface SecaoChecklist {
  inicio: string;
  fim: string;
  itens: ChecklistItemData[];
  obs: string;
  nome: string;
  assinatura: string;
}

export interface ChecklistDados {
  transportadora: string;
  programacao: SecaoChecklist;
  separacao: SecaoChecklist;
  carregamento: SecaoChecklist;
  entrega: SecaoChecklist;
}

export type StatusChecklist = 'em_andamento' | 'concluido';

export interface ChecklistExpedicao {
  id: string;
  pedido_id: string;
  status: StatusChecklist;
  dados: ChecklistDados;
  created_at: string;
  updated_at: string;
}

// ─── ORÇAMENTO ─────────────────────────────────────────────
export interface Orcamento {
  id: string;
  cliente_id: number;
  dt_criacao: string;
  validade: number;
  valor_total: number;
  status: StatusOrcamento;
  obs: string;
  envio: string;
  motivo_rejeicao: string | null;
  obs_rejeicao: string | null;
  created_at: string;
  clientes?: Cliente;
}

export type OrcamentoInsert = Omit<Orcamento, 'created_at' | 'clientes'>;

// ─── INTERAÇÃO CLIENTE (CRM) ──────────────────────────────
export type TipoInteracao = 'ligacao' | 'email' | 'reuniao' | 'nota';

export interface InteracaoCliente {
  id: number;
  cliente_id: number;
  tipo: TipoInteracao;
  data: string;
  descricao: string;
  proximo_contato: string | null;
  created_at: string;
}

export type InteracaoClienteInsert = Omit<InteracaoCliente, 'id' | 'created_at' | 'data'>;

// ─── DOCUMENTO DIVERSO (gap do SIEG) ──────────────────────
export type CategoriaDocumentoDiverso =
  | 'energia' | 'agua' | 'telefone_internet' | 'guia_imposto'
  | 'boleto_diverso' | 'reembolso_funcionario' | 'outros';

export interface DocumentoDiverso {
  id: number;
  categoria: CategoriaDocumentoDiverso;
  fornecedor_id: number | null;
  competencia_ano: number;
  competencia_mes: number;
  descricao: string;
  valor: number;
  vencimento: string | null;
  pdf_url: string | null;
  lancamento_id: number | null;
  observacoes: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome' | 'cnpj'>;
}

export type DocumentoDiversoInsert = Pick<DocumentoDiverso,
  'categoria' | 'fornecedor_id' | 'competencia_ano' | 'competencia_mes' |
  'descricao' | 'valor' | 'vencimento' | 'observacoes'
> & { criado_por?: string | null };

// ─── RETALHO ───────────────────────────────────────────────
export interface Retalho {
  id: string;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  espessura?: number | null;
  m2: number;
  chapa_origem: string;
  pedido_origem: string | null;
  localizacao?: string | null;
  box?: string | null;
  observacao?: string | null;
  dt_gerado: string;
  status: StatusRetalho;
  created_at: string;
  produtos?: Produto;
  retalhos_uso?: RetalhoUso[];
}

export interface RetalhoUso {
  id: number;
  retalho_id: string;
  pedido_id: string;
  dt_uso: string;
  obs: string;
}

// ─── FINANCEIRO (view) ─────────────────────────────────────
export interface FinanceiroCliente {
  cliente_id: number;
  cliente_nome: string;
  cidade: string;
  faturado: number;
  recebido: number;
  a_receber: number;
  total_pedidos: number;
  pct_recebido: number;
}

// ─── LANÇAMENTO ────────────────────────────────────────────
export interface Lancamento {
  id: number;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  status: StatusLancamento;
  vencimento: string | null;
  conta?: string | null;
  forma_pgto?: string | null;
  pedido_id: string | null;
  cliente_id: number | null;
  vendedor_id?: number | null;
  plano_contas_id?: number | null;
  conta_id?: number | null;
  recorrencia_id?: number | null;
  documento?: string | null;
  dt_emissao?: string | null;
  dt_pagamento?: string | null;
  fornecedor?: string | null;
  fornecedor_id?: number | null;
  obs?: string | null;
  natureza?: NaturezaLancamento;
  lancamento_origem_id?: number | null;
  grupo_parcelamento_id?: string | null;
  compra_id?: string | null;
  deletado_em?: string | null;
  deletado_por?: string | null;
  deletado_motivo?: string | null;
  created_at: string;
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
  vendedores?: Pick<Vendedor, 'id' | 'nome'>;
  plano_contas?: { id: number; codigo_estruturado: string; descricao: string } | null;
  contas_bancarias?: Pick<ContaBancaria, 'id' | 'nome'> | null;
}

export type LancamentoInsert = Omit<Lancamento, 'id' | 'created_at' | 'pedidos' | 'clientes'>;

// ─── CONTA BANCÁRIA ────────────────────────────────────────
export type TipoContaBancaria = 'Caixa' | 'Banco' | 'Aplicação';

export interface ContaBancaria {
  id: number;
  nome: string;
  banco: string | null;
  tipo: TipoContaBancaria;
  saldo_inicial: number;
  ativo: boolean;
  created_at: string;
}

export type ContaBancariaInsert = Omit<ContaBancaria, 'id' | 'created_at'>;
export type ContaBancariaUpdate = Partial<ContaBancariaInsert>;

// ─── BAIXA DE LANÇAMENTO ───────────────────────────────────
export type NaturezaLancamento = 'normal' | 'adiantamento' | 'reembolso' | 'devolucao';

export interface BaixaLancamento {
  id: number;
  lancamento_id: number | null;
  transferencia_id?: number | null;
  valor: number;
  valor_juros?: number;
  valor_multa?: number;
  valor_desconto?: number;
  data: string;
  conta_id: number | null;
  forma_pgto: string | null;
  origem_adiantamento_id?: number | null;
  obs: string | null;
  estornado_em: string | null;
  estornado_motivo: string | null;
  created_at: string;
  contas_bancarias?: Pick<ContaBancaria, 'id' | 'nome'> | null;
}

export type BaixaLancamentoInsert = Omit<BaixaLancamento, 'id' | 'created_at' | 'estornado_em' | 'estornado_motivo' | 'contas_bancarias'>;

// ─── LANÇAMENTO RECORRENTE ─────────────────────────────────
export interface LancamentoRecorrente {
  id: number;
  tipo: TipoLancamento;
  descricao: string;
  valor: number;
  dia_vencimento: number;
  plano_contas_id: number | null;
  conta_id: number | null;
  fornecedor: string | null;
  cliente_id: number | null;
  ativo: boolean;
  gerado_ate: string | null;
  created_at: string;
  clientes?: Pick<Cliente, 'id' | 'nome'> | null;
}

export type LancamentoRecorrenteInsert = Omit<LancamentoRecorrente, 'id' | 'created_at' | 'gerado_ate' | 'clientes'>;
export type LancamentoRecorrenteUpdate = Partial<LancamentoRecorrenteInsert>;

// ─── FORMA DE PAGAMENTO ─────────────────────────────────────
export interface FormaPagamento {
  id: number;
  nome: string;
  ativo: boolean;
  taxa_pct: number | null;
  created_at: string;
}

export type FormaPagamentoInsert = Omit<FormaPagamento, 'id' | 'created_at'>;
export type FormaPagamentoUpdate = Partial<FormaPagamentoInsert>;

// ─── META FINANCEIRA ─────────────────────────────────────────
export interface MetaFinanceira {
  id: number;
  ano: number;
  mes: number;
  tipo: 'Entrada' | 'Saída';
  valor_meta: number;
  created_at: string;
}

export type MetaFinanceiraInsert = Omit<MetaFinanceira, 'id' | 'created_at'>;
export type MetaFinanceiraUpdate = Partial<MetaFinanceiraInsert>;

// ─── CONFIGURAÇÃO DE WIDGET DO DASHBOARD ────────────────────
export interface DashboardWidgetConfig {
  user_id: string;
  nivel: string;
  widget_key: string;
  visivel: boolean;
  created_at: string;
}

// ─── HISTÓRICO OTIMIZADOR ──────────────────────────────────
export interface HistoricoOtimizador {
  id: number;
  pedido_id: string | null;
  dt_otim: string;
  aproveitamento: number;
  perda: number;
  chapas_usadas: number;
  retalhos_gerados: number;
  total_pecas: number | null;
  kerf: number | null;
  borda: number | null;
  chapa_w: number | null;
  chapa_h: number | null;
  pecas_json: unknown | null;
  chapas_json: unknown | null;
  usuario: string | null;
  created_at: string;
}

export interface OtimizacaoPerdaDetalhe {
  id: number;
  pedido_id: string;
  produto_id: number | null;
  produto_nome: string;
  m2_bruta_chapas: number;
  m2_pecas: number;
  m2_retalhos: number;
  m2_perda: number;
  custo_m2: number | null;
  dt_otim: string;
  created_at: string;
}

export type OtimizacaoPerdaDetalheInsert = Omit<OtimizacaoPerdaDetalhe, 'id' | 'created_at'>;

// Espelha as colunas de `vw_perda_mensal_vidro` (view, não tabela —
// ver sql/controle-perda-vidro.sql). mes_referencia vem como string
// ISO (date_trunc no mês); tratar sempre via slice(0, 7) = "YYYY-MM".
export interface PerdaMensalVidro {
  produto_id: number | null;
  produto_nome: string;
  mes_referencia: string;
  m2_perda_otimizacao: number;
  valor_perda_otimizacao: number;
  m2_perda_incidente: number;
  valor_perda_incidente: number;
  m2_perda_total: number;
  valor_perda_total: number;
  m2_retalho_salvo: number;
}

// ─── NOTA FISCAL ───────────────────────────────────────────
export interface NotaFiscal {
  id: number;
  pedido_id: string | null;
  cliente_id: number | null;
  numero: string | null;
  serie: string;
  chave: string | null;
  protocolo: string | null;
  status: StatusNota;
  valor_produtos: number;
  valor_icms: number;
  valor_pis: number;
  valor_cofins: number;
  valor_ipi: number;
  valor_total: number;
  cfop: string;
  natureza_op: string;
  nuvem_fiscal_id: string | null;
  xml_url: string | null;
  danfe_url: string | null;
  motivo_rejeicao: string | null;
  dt_emissao: string;
  dt_autorizacao: string | null;
  created_at: string;
  updated_at: string;
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome' | 'cnpj' | 'cidade'>;
}

export type NotaFiscalInsert = Omit<NotaFiscal,
  'id' | 'created_at' | 'updated_at' | 'pedidos' | 'clientes'>;

export interface ConfigFiscalProduto {
  produto_id: number;
  ncm: string;
  cfop_dentro: string;
  cfop_fora: string;
  cst_icms: string;
  aliq_icms: number;
  aliq_pis: number;
  aliq_cofins: number;
  aliq_ipi: number;
  updated_at: string;
}

export interface ConfigFiscalPadrao {
  id: number;
  regime: 'normal' | 'simples';
  aliq_icms_dentro: number;
  aliq_icms_fora: number;
  aliq_pis: number;
  aliq_cofins: number;
  aliq_ipi: number;
  cst_icms_padrao: string;
  cfop_dentro_padrao: string;
  cfop_fora_padrao: string;
  ncm_padrao: string;
  updated_at: string;
}

// ─── CONTABILIDADE — DOCUMENTOS FISCAIS (Fase 1) ───────────
export type TipoDocumentoFiscal = 'compra' | 'perda' | 'cancelamento' | 'carta_correcao' | 'inutilizacao';

export interface DocumentoFiscal {
  id: number;
  tipo: TipoDocumentoFiscal;
  entrada: boolean;
  competencia_ano: number;
  competencia_mes: number;
  numero_documento: string | null;
  serie: string | null;
  chave_acesso: string | null;
  fornecedor_id: number | null;
  compra_id: string | null;
  nota_fiscal_id: number | null;
  ncm: string | null;
  cfop: string | null;
  cst: string | null;
  valor_produtos: number | null;
  valor_icms: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_ipi: number | null;
  valor_total: number | null;
  motivo: string | null;
  material: string | null;
  quantidade: number | null;
  numero_inicial: number | null;
  numero_final: number | null;
  sequencia_evento: number | null;
  texto_correcao: string | null;
  responsavel: string | null;
  observacoes: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  fotos_urls: string[] | null;
  status: 'ativo' | 'cancelado';
  criado_por: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome' | 'cnpj'>;
}

export type DocumentoFiscalInsert = Omit<DocumentoFiscal,
  'id' | 'status' | 'deletado_em' | 'deletado_por' | 'motivo_exclusao' | 'created_at' | 'updated_at' | 'fornecedores'>;

// ─── CONTABILIDADE — ESTOQUE GERAL / CMV (Fase 2) ──────────
export type GrupoItemEstoqueGeral =
  | 'ferragens' | 'perfis_aluminio' | 'insumos' | 'equipamentos'
  | 'consumiveis' | 'epis' | 'material_escritorio' | 'outros';

export interface ItemEstoqueGeral {
  id: number;
  codigo: string;
  descricao: string;
  grupo: GrupoItemEstoqueGeral;
  subgrupo: string | null;
  localizacao: string | null;
  unidade: string;
  ncm: string | null;
  fornecedor_principal_id: number | null;
  estoque_minimo: number;
  ativo: boolean;
  saldo_qtd: number;
  custo_medio: number;
  valor_total: number;
  ultima_compra_em: string | null;
  ultima_movimentacao_em: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome' | 'cnpj'>;
}

// Saldo/custo/valor_total ficam de fora — nunca editáveis via formulário,
// só pelo service de movimentação (services/itensEstoqueMovimentacoes.service.ts).
export type ItemEstoqueGeralInsert = Omit<ItemEstoqueGeral,
  'id' | 'saldo_qtd' | 'custo_medio' | 'valor_total' | 'ultima_compra_em' | 'ultima_movimentacao_em' | 'created_at' | 'updated_at' | 'fornecedores'>;
export type ItemEstoqueGeralUpdate = Partial<ItemEstoqueGeralInsert>;

export type TipoMovimentacaoItemEstoque = 'entrada' | 'saida' | 'ajuste' | 'perda' | 'transferencia' | 'saldo_inicial';
export type OrigemMovimentacaoItemEstoque = 'manual' | 'documento_fiscal' | 'saldo_inicial';

export interface ItemEstoqueMovimentacao {
  id: number;
  item_id: number;
  tipo: TipoMovimentacaoItemEstoque;
  origem_tipo: OrigemMovimentacaoItemEstoque;
  origem_id: string | null;
  documento_fiscal_id: number | null;
  quantidade: number;
  custo_unitario: number | null;
  saldo_apos: number;
  custo_medio_apos: number;
  localizacao_origem: string | null;
  localizacao_destino: string | null;
  usuario: string | null;
  obs: string | null;
  created_at: string;
  itens_estoque_gerais?: Pick<ItemEstoqueGeral, 'id' | 'codigo' | 'descricao' | 'unidade'>;
  documentos_fiscais?: Pick<DocumentoFiscal, 'id' | 'numero_documento' | 'tipo'>;
}

export type ItemEstoqueMovimentacaoInsert = Omit<ItemEstoqueMovimentacao,
  'id' | 'saldo_apos' | 'custo_medio_apos' | 'created_at' | 'itens_estoque_gerais' | 'documentos_fiscais'>;

// ─── CONTABILIDADE — ATIVO IMOBILIZADO (Fase 3) ────────────
export type CategoriaAtivoImobilizado =
  | 'maquinas_equipamentos' | 'veiculos' | 'moveis_utensilios'
  | 'informatica' | 'imoveis' | 'outros';

export interface AtivoImobilizado {
  id: number;
  numero_patrimonio: string;
  descricao: string;
  categoria: CategoriaAtivoImobilizado;
  fornecedor_id: number | null;
  documento_fiscal_id: number | null;
  numero_nota: string | null;
  plano_contas_id: number | null;
  valor_aquisicao: number;
  valor_residual: number;
  vida_util_meses: number;
  data_aquisicao: string;
  localizacao: string | null;
  responsavel: string | null;
  garantia_ate: string | null;
  xml_url: string | null;
  pdf_url: string | null;
  manual_url: string | null;
  fotos_urls: string[] | null;
  observacoes: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome' | 'cnpj'>;
  plano_contas?: { id: number; codigo_estruturado: string; descricao: string };
}

export type AtivoImobilizadoInsert = Omit<AtivoImobilizado,
  'id' | 'created_at' | 'updated_at' | 'fornecedores' | 'plano_contas'>;
export type AtivoImobilizadoUpdate = Partial<AtivoImobilizadoInsert>;

// ─── CONTABILIDADE — CARTÕES (Fase 4) ──────────────────────
export interface Cartao {
  id: number;
  nome: string;
  tipo: 'credito' | 'debito';
  bandeira: string | null;
  banco_emissor: string | null;
  final_numero: string | null;
  conta_bancaria_id: number | null;
  limite: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}
export type CartaoInsert = Omit<Cartao, 'id' | 'created_at' | 'updated_at'>;
export type CartaoUpdate = Partial<CartaoInsert>;

export interface CartaoFatura {
  id: number;
  cartao_id: number;
  competencia_ano: number;
  competencia_mes: number;
  valor_total: number;
  status: 'aberta' | 'fechada' | 'paga';
  data_fechamento: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  pdf_url: string | null;
  comprovante_pagamento_url: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  lancamento_id: number | null;
  cartoes?: Pick<Cartao, 'id' | 'nome' | 'tipo'>;
}
export type CartaoFaturaInsert = Omit<CartaoFatura, 'id' | 'valor_total' | 'created_at' | 'updated_at' | 'cartoes' | 'lancamento_id'>;
export type CartaoFaturaUpdate = Partial<CartaoFaturaInsert>;

export interface CartaoLancamento {
  id: number;
  cartao_id: number;
  fatura_id: number | null;
  lancamento_id: number | null;
  data: string;
  descricao: string;
  plano_contas_id: number | null;
  fornecedor_id: number | null;
  valor: number;
  parcela_atual: number | null;
  parcela_total: number | null;
  comprovante_url: string | null;
  conciliado: boolean;
  observacoes: string | null;
  criado_por: string | null;
  deletado_em: string | null;
  deletado_por: string | null;
  motivo_exclusao: string | null;
  created_at: string;
  updated_at: string;
  fornecedores?: Pick<Fornecedor, 'id' | 'nome'>;
}
export type CartaoLancamentoInsert = Omit<CartaoLancamento,
  'id' | 'deletado_em' | 'deletado_por' | 'motivo_exclusao' | 'created_at' | 'updated_at' | 'fornecedores' | 'lancamento_id'>;
export type CartaoLancamentoUpdate = Partial<CartaoLancamentoInsert>;

// ─── CONTABILIDADE — EMPRÉSTIMOS (Fase 4) ──────────────────
export interface Emprestimo {
  id: number;
  descricao: string;
  banco: string | null;
  conta_bancaria_id: number | null;
  valor_contratado: number;
  taxa_juros_pct_am: number;
  numero_parcelas: number;
  data_contratacao: string;
  data_primeira_parcela: string;
  contrato_pdf_url: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}
export type EmprestimoInsert = Omit<Emprestimo, 'id' | 'created_at' | 'updated_at'>;
export type EmprestimoUpdate = Partial<EmprestimoInsert>;

export interface EmprestimoParcela {
  id: number;
  emprestimo_id: number;
  numero_parcela: number;
  vencimento: string;
  valor_parcela: number;
  valor_juros: number;
  valor_amortizacao: number;
  saldo_devedor_apos: number;
  status: 'pendente' | 'pago';
  data_pagamento: string | null;
  comprovante_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── CONTABILIDADE — CONSÓRCIOS (Fase 4) ───────────────────
export interface Consorcio {
  id: number;
  descricao: string;
  administradora: string | null;
  grupo: string | null;
  cota: string | null;
  valor_credito: number;
  numero_parcelas: number;
  valor_parcela: number;
  data_adesao: string;
  status: 'ativo' | 'contemplado' | 'encerrado';
  contemplado_em: string | null;
  carta_contemplacao_url: string | null;
  contrato_pdf_url: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}
export type ConsorcioInsert = Omit<Consorcio, 'id' | 'created_at' | 'updated_at'>;
export type ConsorcioUpdate = Partial<ConsorcioInsert>;

export interface ConsorcioParcela {
  id: number;
  consorcio_id: number;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: 'pendente' | 'pago';
  data_pagamento: string | null;
  comprovante_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsorcioLance {
  id: number;
  consorcio_id: number;
  data: string;
  valor: number;
  tipo: 'livre' | 'embutido' | 'fixo';
  resultado: 'pendente' | 'aprovado' | 'recusado';
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}
export type ConsorcioLanceInsert = Omit<ConsorcioLance, 'id' | 'created_at' | 'updated_at'>;
export type ConsorcioLanceUpdate = Partial<ConsorcioLanceInsert>;

// ─── CONTABILIDADE — FECHAMENTO / CHECKLIST (Fase 1) ───────
export interface ContabilidadeFechamento {
  id: number;
  competencia_ano: number;
  competencia_mes: number;
  status: 'aberto' | 'concluido';
  percentual: number;
  concluido_em: string | null;
  concluido_por: string | null;
  created_at: string;
  updated_at: string;
}

export type StatusChecklistItem = 'pendente' | 'em_andamento' | 'concluido' | 'nao_aplicavel';

export interface ChecklistItem {
  id: number;
  fechamento_id: number;
  item_key: string;
  status: StatusChecklistItem;
  data_conclusao: string | null;
  responsavel: string | null;
  observacao: string | null;
  anexos: string[] | null;
  created_at: string;
  updated_at: string;
}

// ─── FATURAMENTO MENSAL (view) ─────────────────────────────
export interface FaturamentoMensal {
  ano: number;
  mes: number;
  faturado: number;
  recebido: number;
  total_pedidos: number;
}

// ─── OTIMIZADOR (client-side) ──────────────────────────────
export interface PecaOtimizador {
  l: number;
  a: number;
  qtd: number;
  prod: string;
}

export interface ResultadoOtimizador {
  chapas: number;
  aproveitamento: number;
  perda: number;
  placamentos: PlacamentoChapa[];
}

export interface PlacamentoChapa {
  pecas: PecaPlacada[];
  espacoLivre: number;
}

export interface PecaPlacada extends PecaOtimizador {
  x: number;
  y: number;
  rotacionada?: boolean;
}

// ─── DASHBOARD ─────────────────────────────────────────────
export interface DashboardKPIs {
  faturamentoTotal: number;
  faturamentoMes: number;
  recebidoTotal: number;
  pedidosAtivos: number;
  m2EmEstoque: number;
  retalhosDisponiveis: number;
  ticketMedio: number;
  aproveitamentoMedio: number;
}

// ─── QUALIDADE — ENUMS ─────────────────────────────────────
export type StatusNaoConformidade =
  | 'Aberta'
  | 'Em Análise'
  | 'Aguardando Correção'
  | 'Resolvida'
  | 'Cancelada';

export type GravidadeNC = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export type TipoNC =
  | 'Quebra de vidro'
  | 'Medida incorreta'
  | 'Corte errado'
  | 'Lapidação incorreta'
  | 'Furo em posição errada'
  | 'Mancha ou risco'
  | 'Peça trincada'
  | 'Material com defeito'
  | 'Erro de separação'
  | 'Erro de conferência'
  | 'Retrabalho necessário'
  | 'Perda de matéria-prima'
  | 'Perda operacional'
  | 'Outro';

export type SetorQualidade =
  | 'Corte'
  | 'Lapidação'
  | 'Furação'
  | 'Separação'
  | 'Expedição'
  | 'Recebimento';

export type StatusRetrabalho = 'Pendente' | 'Em Execução' | 'Concluído' | 'Cancelado';

// ─── NÃO CONFORMIDADE ──────────────────────────────────────
export interface NaoConformidade {
  id: number;
  codigo: string;                        // NC-001, NC-002…
  pedido_id: string | null;
  cliente_id: number | null;
  produto_nome: string | null;
  item_pedido_id: number | null;
  etapa: string;
  tipo: TipoNC;
  gravidade: GravidadeNC;
  status: StatusNaoConformidade;
  descricao: string;
  obs: string | null;
  fotos_urls: string[] | null;
  registrado_por: string | null;
  responsavel_analise: string | null;
  dt_ocorrencia: string;
  dt_resolucao: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
}

export type NaoConformidadeInsert = Omit<NaoConformidade, 'id' | 'created_at' | 'updated_at' | 'pedidos' | 'clientes'>;
export type NaoConformidadeUpdate = Partial<NaoConformidadeInsert>;

// ─── HISTÓRICO DE NC ────────────────────────────────────────
export interface HistoricoNC {
  id: number;
  nc_id: number;
  usuario: string | null;
  campo_alterado: string | null;
  valor_anterior: string | null;
  valor_novo: string | null;
  obs: string | null;
  created_at: string;
}

export type HistoricoNCInsert = Omit<HistoricoNC, 'id' | 'created_at'>;

// ─── QUEBRA ────────────────────────────────────────────────
export interface Quebra {
  id: number;
  nc_id: number | null;
  pedido_id: string | null;
  cliente_id: number | null;
  produto_id: number | null;
  produto_nome: string;
  espessura: string | null;
  cor: string | null;
  chapa_referencia: string | null;
  largura_mm: number | null;
  altura_mm: number | null;
  m2_perdido: number;
  custo_m2: number | null;
  valor_perda: number | null;
  motivo: string;
  setor: SetorQualidade | null;
  maquina: string | null;
  responsavel: string | null;
  baixa_estoque: boolean;
  dt_quebra: string;
  created_at: string;
  // joins
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
}

export type QuebraInsert = Omit<Quebra, 'id' | 'created_at' | 'valor_perda' | 'pedidos' | 'clientes'>;
export type QuebraUpdate = Partial<QuebraInsert>;

// ─── RETRABALHO ────────────────────────────────────────────
export interface Retrabalho {
  id: number;
  nc_id: number | null;
  pedido_id: string | null;
  cliente_id: number | null;
  produto_nome: string | null;
  motivo: string;
  etapa_origem: string;
  etapa_correcao: string;
  responsavel_original: string | null;
  responsavel_correcao: string | null;
  tempo_adicional_min: number | null;
  custo_adicional: number | null;
  quantidade: number;
  status: StatusRetrabalho;
  dt_retrabalho: string;
  dt_conclusao: string | null;
  /** true depois que custo_adicional já virou lançamento financeiro — evita duplicar se reabrir/concluir de novo. */
  lancamento_gerado: boolean;
  created_at: string;
  // joins
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
}

export type RetrabalhoInsert = Omit<Retrabalho, 'id' | 'created_at' | 'pedidos' | 'clientes'>;
export type RetrabalhoUpdate = Partial<RetrabalhoInsert>;

// ─── INDICADORES MENSAIS DE QUALIDADE (view) ───────────────
export interface IndicadorQualidadeMensal {
  mes: string;               // ISO date truncado por mês
  total_ncs: number;
  resolvidas: number;
  criticas: number;
  m2_perdido: number | null;
  valor_perda_total: number | null;
  total_retrabalhos: number;
  custo_retrabalho: number | null;
}

// ─── PROGRAMAÇÃO DA PRODUÇÃO (APS) ────────────────────────

export type StatusProgramacao = 'Agendado' | 'Em Execução' | 'Concluído' | 'Cancelado';

export interface ProducaoLinha {
  id: number;
  nome: string;
  tipo: 'Corte' | 'Lapidação' | 'Furação' | 'Separação' | 'Finalizado' | 'Outro';
  inicio_dia: string;
  fim_dia: string;
  capacidade_horas_dia: number;
  cor: string;
  ativo: boolean;
  created_at: string;
}

export interface ConfigTempoProducao {
  etapa: string;
  min_por_m2: number;
  min_por_peca: number;
  min_por_lapidacao: number;
  min_por_furo: number;
  setup_pedido_min: number;
  fator_vidro_especial: number;
  updated_at: string;
}

export interface ProgramacaoProducao {
  id: string;
  pedido_id: string;
  linha_id: number | null;
  etapa: string;
  sequencia: number;
  item_pedido_id: number | null;
  predecessor_id: string | null;
  dt_inicio_previsto: string | null;
  dt_fim_previsto: string | null;
  duracao_estimada_min: number | null;
  dt_inicio_real: string | null;
  dt_fim_real: string | null;
  status: StatusProgramacao;
  responsavel: string | null;
  obs: string | null;
  desconto_setup_min: number | null; // min. de setup economizados por repetir o produto do bloco anterior na mesma linha (motor de recálculo automático)
  travado?: boolean; // reposicionado manualmente (drag/resize) — motor de agendamento automático não deve mover
  horario_real_estimado: boolean; // true = dt_inicio_real/dt_fim_real vieram de avanço em lote do status do pedido, não de uma ação real nesse bloco específico
  created_at: string;
  updated_at: string;
  pedidos?: {
    id: string;
    dt_retirada: string | null;
    m2_total: number;
    status: StatusPedido;
    obs: string;
    clientes: { nome: string; cidade: string; } | null;
    itens_pedido: Array<{ id: number; quantidade: number; lapidacao: number; produto_nome: string; m2: number; }>;
  };
  producao_linhas?: { nome: string; cor: string; tipo: string; } | null;
  item_pedido?: {
    id: number;
    produto_nome: string;
    largura: number | null;
    altura: number | null;
    m2: number;
    quantidade: number;
    lapidacao: number;
  } | null;
}

export type ProgramacaoInsert = Partial<Pick<ProgramacaoProducao, 'desconto_setup_min'>> & Pick<
  ProgramacaoProducao,
  'pedido_id' | 'linha_id' | 'etapa' | 'sequencia' |
  'dt_inicio_previsto' | 'dt_fim_previsto' | 'duracao_estimada_min' | 'responsavel' | 'obs' |
  'item_pedido_id' | 'predecessor_id'
>;

// ─── PEÇA FÍSICA (rastreamento por QR) ──────────────────────
export type StatusPedidoPeca = 'pendente' | 'cortada' | 'lapidada' | 'separada';

export interface PedidoPeca {
  id: string;
  pedido_id: string;
  item_pedido_id: number | null;
  qr_token: string;
  ordem: number;
  chapa_num: number;
  largura: number;
  altura: number;
  precisa_lapidacao: boolean;
  status: StatusPedidoPeca;
  dt_corte_real: string | null;
  dt_lapidacao_real: string | null;
  dt_separacao_real: string | null;
  created_at: string;
  pedidos?: { id: string; clientes?: { nome: string } | null } | null;
  itens_pedido?: { produto_nome: string } | null;
}

// ─── LOTE DE ESTOQUE (múltiplas dimensões por produto) ──────
export interface LoteEstoque {
  id: number;
  produto_id: number;
  origem_tipo: string;
  origem_id: string | null;
  origem_mercadoria: '0' | '2' | null;
  chapa_largura_mm: number | null;
  chapa_altura_mm: number | null;
  pode_rotacionar: boolean;
  chapas_entrada: number;
  chapas_saldo: number;
  m2_por_chapa: number | null;
  m2_saldo: number;
  custo_m2: number | null;
  dt_entrada: string;
  dt_entrada_estimada: boolean;
  estoque_minimo_chapas: number;
  ativo: boolean;
  dimensao_confirmada: boolean;
  created_at: string;
  produtos?: { nome: string } | null;
}

export interface ProgramacaoHistorico {
  id: string;
  programacao_id: string | null;
  pedido_id: string | null;
  usuario: string | null;
  tipo_alteracao: string;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  motivo: string | null;
  created_at: string;
}

export interface TempoEstimado {
  corte_min: number;
  lapidacao_min: number;
  total_min: number;
  tem_lapidacao: boolean;
}

// ─── DATABASE TYPES (Supabase) ─────────────────────────────
export type Database = {
  public: {
    Tables: {
      clientes:                { Row: Cliente;             Insert: ClienteInsert;      Update: ClienteUpdate  };
      vendedores:              { Row: Vendedor;            Insert: VendedorInsert;     Update: VendedorUpdate };
      fornecedores:            { Row: Fornecedor;          Insert: FornecedorInsert;   Update: FornecedorUpdate };
      compras:                 { Row: Compra;              Insert: CompraInsert                                };
      compras_itens:           { Row: CompraItem;          Insert: CompraItemInsert                            };
      interacoes_cliente:      { Row: InteracaoCliente;    Insert: InteracaoClienteInsert                       };
      documentos_diversos:     { Row: DocumentoDiverso;    Insert: DocumentoDiversoInsert                       };
      produtos:                { Row: Produto;             Insert: ProdutoInsert;      Update: ProdutoUpdate  };
      pedidos:                 { Row: Pedido;              Insert: PedidoInsert;       Update: PedidoUpdate   };
      itens_pedido:            { Row: ItemPedido;          Insert: ItemPedidoInsert                           };
      estoque:                 { Row: EstoqueItem                                                             };
      estoque_movimentacoes:   { Row: EstoqueMovimentacao; Insert: EstoqueMovimentacaoInsert                  };
      material_cliente_mov:    { Row: MaterialClienteMov;  Insert: MaterialClienteMovInsert                   };
      retalhos:                { Row: Retalho                                                                 };
      retalhos_uso:            { Row: RetalhoUso                                                              };
      orcamentos:              { Row: Orcamento;           Insert: OrcamentoInsert                            };
      lancamentos:             { Row: Lancamento;          Insert: LancamentoInsert                           };
      contas_bancarias:        { Row: ContaBancaria;       Insert: ContaBancariaInsert; Update: ContaBancariaUpdate };
      baixas_lancamento:       { Row: BaixaLancamento;     Insert: BaixaLancamentoInsert                       };
      lancamentos_recorrentes: { Row: LancamentoRecorrente; Insert: LancamentoRecorrenteInsert; Update: LancamentoRecorrenteUpdate };
      formas_pagamento:        { Row: FormaPagamento;       Insert: FormaPagamentoInsert; Update: FormaPagamentoUpdate };
      metas_financeiras:       { Row: MetaFinanceira;       Insert: MetaFinanceiraInsert; Update: MetaFinanceiraUpdate };
      historico_otimizador:    { Row: HistoricoOtimizador                                                     };
      otimizacao_perda_detalhe: { Row: OtimizacaoPerdaDetalhe; Insert: OtimizacaoPerdaDetalheInsert            };
      tabelas_preco:           { Row: TabelaPreco                                                             };
      tabela_preco_itens:      { Row: TabelaPrecoItem                                                         };
      notas_fiscais:           { Row: NotaFiscal;          Insert: NotaFiscalInsert                           };
      config_fiscal_produtos:  { Row: ConfigFiscalProduto                                                     };
      config_fiscal_padrao:    { Row: ConfigFiscalPadrao                                                      };
      checklist_expedicao:     { Row: ChecklistExpedicao; Insert: Omit<ChecklistExpedicao, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<ChecklistExpedicao, 'id' | 'created_at'>> };
      nao_conformidades:       { Row: NaoConformidade;   Insert: NaoConformidadeInsert; Update: NaoConformidadeUpdate };
      historico_nc:            { Row: HistoricoNC;        Insert: HistoricoNCInsert      };
      quebras:                 { Row: Quebra;             Insert: QuebraInsert;          Update: QuebraUpdate          };
      retrabalhos:             { Row: Retrabalho;         Insert: RetrabalhoInsert;      Update: RetrabalhoUpdate      };
      retiradas_pedido:        { Row: RetiradaPedido;     Insert: RetiradaPedidoInsert     };
      retiradas_pedido_itens:  { Row: RetiradaPedidoItem; Insert: RetiradaPedidoItemInsert };
      pedido_observacoes:      { Row: PedidoObservacao;   Insert: PedidoObservacaoInsert   };
    };
    Views: {
      financeiro_clientes:              { Row: FinanceiroCliente         };
      faturamento_mensal:               { Row: FaturamentoMensal         };
      view_indicadores_qualidade_mensal:{ Row: IndicadorQualidadeMensal  };
      vw_estoque_consolidado:           { Row: EstoqueConsolidado        };
    };
  };
};