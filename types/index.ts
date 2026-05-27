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

export type StatusOrcamento = 'Pendente' | 'Aprovado' | 'Recusado';
export type StatusRetalho = 'Disponível' | 'Reservado' | 'Em uso' | 'Descartado';
export type StatusLancamento = 'Pago' | 'Pendente' | 'A Receber';
export type TipoLancamento = 'Entrada' | 'Saída';
export type TabelaCliente = 'p' | 'g'; // padrão | grandes clientes

// ─── CLIENTE ───────────────────────────────────────────────
export interface Cliente {
  id: number;
  nome: string;
  cnpj: string;
  tel: string;
  email: string;
  endereco: string;
  cidade: string;
  pgto: string;
  tabela: TabelaCliente;
  ativo: boolean;
  created_at: string;
}

export type ClienteInsert = Omit<Cliente, 'id' | 'created_at'>;
export type ClienteUpdate = Partial<ClienteInsert>;

// ─── TABELA DE PREÇO ───────────────────────────────────────
export interface TabelaPreco {
  id: number;
  nome: string;
  tipo: string;
  lam: number;   // laminado m²
  ref: number;   // reflecta m²
  ver: number;   // verde m²
  lap: number;   // lapidação m²
  fur: number;   // furo unid
  min: number;   // mínimo pedido
  desc: number;  // desconto %
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
  // join
  produtos?: Produto;
}

// ─── PEDIDO ────────────────────────────────────────────────
export interface Pedido {
  id: string;          // 'P-001'
  cliente_id: number;
  dt_pedido: string;
  dt_retirada: string | null;
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
  // joins
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
  largura: number;   // mm
  altura: number;    // mm
  m2: number;
  valor_m2: number;
  lapidacao: number;
  quantidade: number;
  subtotal: number;
  created_at: string;
  // join
  produtos?: Produto;
}

export type ItemPedidoInsert = Omit<ItemPedido, 'id' | 'created_at' | 'produtos'>;

// ─── ORÇAMENTO ─────────────────────────────────────────────
export interface Orcamento {
  id: string;         // 'ORC-001'
  cliente_id: number;
  dt_criacao: string;
  validade: number;
  valor_total: number;
  status: StatusOrcamento;
  obs: string;
  envio: string;
  created_at: string;
  // join
  clientes?: Cliente;
}

export type OrcamentoInsert = Omit<Orcamento, 'created_at' | 'clientes'>;

// ─── RETALHO ───────────────────────────────────────────────
export interface Retalho {
  id: string;        // 'R-001'
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
  // joins
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
  // joins
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
  created_at: string;
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
  l: number;   // largura mm
  a: number;   // altura mm
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
      clientes:             { Row: Cliente; Insert: ClienteInsert; Update: ClienteUpdate };
      produtos:             { Row: Produto; Insert: ProdutoInsert; Update: ProdutoUpdate };
      pedidos:              { Row: Pedido;  Insert: PedidoInsert;  Update: PedidoUpdate  };
      itens_pedido:         { Row: ItemPedido;  Insert: ItemPedidoInsert };
      estoque:              { Row: EstoqueItem };
      retalhos:             { Row: Retalho };
      retalhos_uso:         { Row: RetalhoUso };
      orcamentos:           { Row: Orcamento; Insert: OrcamentoInsert };
      lancamentos:          { Row: Lancamento; Insert: LancamentoInsert };
      historico_otimizador: { Row: HistoricoOtimizador };
      tabelas_preco:        { Row: TabelaPreco };
    };
    Views: {
      financeiro_clientes: { Row: FinanceiroCliente };
      faturamento_mensal:  { Row: FaturamentoMensal  };
    };
  };
};