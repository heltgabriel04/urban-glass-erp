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
  valor_recebido: number;
  status: StatusPedido;
  forma_pgto: string;
  conta: string;
  parcelas: number;
  obs: string;
  status_history?: StatusHistoryEntry[];
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
  conta?: string | null;
  forma_pgto?: string | null;
  pedido_id: string | null;
  cliente_id: number | null;
  vendedor_id?: number | null;
  plano_contas_id?: number | null;
  documento?: string | null;
  dt_emissao?: string | null;
  dt_pagamento?: string | null;
  fornecedor?: string | null;
  obs?: string | null;
  created_at: string;
  pedidos?: Pick<Pedido, 'id'>;
  clientes?: Pick<Cliente, 'id' | 'nome'>;
  vendedores?: Pick<Vendedor, 'id' | 'nome'>;
  plano_contas?: { id: number; codigo_estruturado: string; descricao: string } | null;
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

// ─── DATABASE TYPES (Supabase) ─────────────────────────────
export type Database = {
  public: {
    Tables: {
      clientes:                { Row: Cliente;             Insert: ClienteInsert;      Update: ClienteUpdate  };
      vendedores:              { Row: Vendedor;            Insert: VendedorInsert;     Update: VendedorUpdate };
      fornecedores:            { Row: Fornecedor;          Insert: FornecedorInsert;   Update: FornecedorUpdate };
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
      tabela_preco_itens:      { Row: TabelaPrecoItem                                                         };
      notas_fiscais:           { Row: NotaFiscal;          Insert: NotaFiscalInsert                           };
      config_fiscal_produtos:  { Row: ConfigFiscalProduto                                                     };
      config_fiscal_padrao:    { Row: ConfigFiscalPadrao                                                      };
      checklist_expedicao:     { Row: ChecklistExpedicao; Insert: Omit<ChecklistExpedicao, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<ChecklistExpedicao, 'id' | 'created_at'>> };
      nao_conformidades:       { Row: NaoConformidade;   Insert: NaoConformidadeInsert; Update: NaoConformidadeUpdate };
      historico_nc:            { Row: HistoricoNC;        Insert: HistoricoNCInsert      };
      quebras:                 { Row: Quebra;             Insert: QuebraInsert;          Update: QuebraUpdate          };
      retrabalhos:             { Row: Retrabalho;         Insert: RetrabalhoInsert;      Update: RetrabalhoUpdate      };
    };
    Views: {
      financeiro_clientes:              { Row: FinanceiroCliente         };
      faturamento_mensal:               { Row: FaturamentoMensal         };
      view_indicadores_qualidade_mensal:{ Row: IndicadorQualidadeMensal  };
    };
  };
};