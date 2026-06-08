// ============================================================
// types/index.ts — Tipos completos do Urban Glass ERP
// ============================================================

export type StatusPedido =
  | 'Aguardando otimização'
  | 'Em Produção – Corte'
  | 'Em Produção – Lapidação'
  | 'Separação'
  | 'Saiu para entrega'
  | 'Entregue'
  | 'Finalizado'
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
  created_at: string;
}

export type ClienteInsert = Omit<Cliente, 'id' | 'created_at'>;
export type ClienteUpdate = Partial<ClienteInsert>;

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
  unidade: string;
  ativo: boolean;
  obs: string;
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
  updated_at: string;
  produtos?: Produto;
}

// ─── PEDIDO ────────────────────────────────────────────────
export interface Pedido {
  id: string;
  cliente_id: number;
  dt_pedido: string;
  dt_retirada: string | null;
  datas_pgto: string[];
  valores_pgto: number[];
  m2_total: number;
  valor_total: number;
  valor_recebido: number;
  status: StatusPedido;
  forma_pgto: string;
  conta: string;
  parcelas: number;
  obs: string;
  created_at: string;
  updated_at: string;
  clientes?: Cliente;
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
  created_at: string;
  produtos?: Produto;
}

export type ItemPedidoInsert = Omit<ItemPedido, 'id' | 'created_at' | 'produtos'>;

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
  created_at: string;
  clientes?: Cliente;
}

export type OrcamentoInsert = Omit<Orcamento, 'created_at' | 'clientes'>;

// ─── RETALHO ───────────────────────────────────────────────
export interface Retalho {
  id: string;
  produto_id: number | null;
  produto_nome: string;
  largura: number;
  altura: number;
  m2: number;
  chapa_origem: string;
  pedido_origem: string | null;
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
  pedido_id: string | null;
  cliente_id: number | null;
  created_at: string;
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
}

export type LancamentoInsert = Omit<Lancamento, 'id' | 'created_at' | 'pedidos' | 'clientes'>;

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

// ─── DATABASE TYPES (Supabase) ─────────────────────────────
export type Database = {
  public: {
    Tables: {
      clientes:                { Row: Cliente;             Insert: ClienteInsert;      Update: ClienteUpdate  };
      produtos:                { Row: Produto;             Insert: ProdutoInsert;      Update: ProdutoUpdate  };
      pedidos:                 { Row: Pedido;              Insert: PedidoInsert;       Update: PedidoUpdate   };
      itens_pedido:            { Row: ItemPedido;          Insert: ItemPedidoInsert                           };
      estoque:                 { Row: EstoqueItem                                                             };
      retalhos:                { Row: Retalho                                                                 };
      retalhos_uso:            { Row: RetalhoUso                                                              };
      orcamentos:              { Row: Orcamento;           Insert: OrcamentoInsert                            };
      lancamentos:             { Row: Lancamento;          Insert: LancamentoInsert                           };
      historico_otimizador:    { Row: HistoricoOtimizador                                                     };
      tabelas_preco:           { Row: TabelaPreco                                                             };
      notas_fiscais:           { Row: NotaFiscal;          Insert: NotaFiscalInsert                           };
      config_fiscal_produtos:  { Row: ConfigFiscalProduto                                                     };
    };
    Views: {
      financeiro_clientes: { Row: FinanceiroCliente };
      faturamento_mensal:  { Row: FaturamentoMensal  };
    };
  };
};