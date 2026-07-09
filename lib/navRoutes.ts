// Fonte única das rotas do menu — usada pela Sidebar (visual) e pela
// Command Palette (busca). Manter os grupos/itens em sincronia com o menu.
export interface NavRoute {
  href: string;
  label: string;
  grupo: string;
  iconKey: string;
}

export const NAV_ROUTES: NavRoute[] = [
  { grupo: "VISÃO GERAL", href: "/dashboard", label: "Dashboard", iconKey: "dashboard" },

  { grupo: "COMERCIAL", href: "/orcamentos", label: "Orçamentos", iconKey: "orcamentos" },
  { grupo: "COMERCIAL", href: "/pedidos", label: "Pedidos", iconKey: "pedidos" },
  { grupo: "COMERCIAL", href: "/clientes", label: "Clientes", iconKey: "clientes" },
  { grupo: "COMERCIAL", href: "/vendedores", label: "Vendedores", iconKey: "vendedores" },

  { grupo: "OPERAÇÃO", href: "/otimizador", label: "Otimizador de Corte", iconKey: "otimizador" },
  { grupo: "OPERAÇÃO", href: "/programacao", label: "Programação APS", iconKey: "aps" },
  { grupo: "OPERAÇÃO", href: "/producao", label: "Produção", iconKey: "producao" },
  { grupo: "OPERAÇÃO", href: "/compras", label: "Compras", iconKey: "compras" },
  { grupo: "OPERAÇÃO", href: "/fornecedores", label: "Fornecedores", iconKey: "fornecedores" },
  { grupo: "OPERAÇÃO", href: "/estoque", label: "Estoque · Chapas", iconKey: "estoque" },
  { grupo: "OPERAÇÃO", href: "/retalhos", label: "Retalhos", iconKey: "retalhos" },
  { grupo: "OPERAÇÃO", href: "/qualidade", label: "Qualidade", iconKey: "qualidade" },

  { grupo: "FINANCEIRO", href: "/dashboard-financeiro", label: "Visão Geral", iconKey: "visaoGeral" },
  { grupo: "FINANCEIRO", href: "/contas-receber", label: "Contas a Receber", iconKey: "receber" },
  { grupo: "FINANCEIRO", href: "/contas-pagar", label: "Contas a Pagar", iconKey: "pagar" },
  { grupo: "FINANCEIRO", href: "/fluxo", label: "Fluxo de Caixa", iconKey: "fluxo" },
  { grupo: "FINANCEIRO", href: "/movimentacoes", label: "Movimentações", iconKey: "movimentacoes" },
  { grupo: "FINANCEIRO", href: "/investimentos", label: "Investimentos", iconKey: "investimentos" },
  { grupo: "FINANCEIRO", href: "/bancos-caixa", label: "Bancos & Caixa", iconKey: "bancos" },
  { grupo: "FINANCEIRO", href: "/centro-custo", label: "Centro de Custo", iconKey: "centroCusto" },
  { grupo: "FINANCEIRO", href: "/recorrencias", label: "Recorrências", iconKey: "recorrencia" },
  { grupo: "FINANCEIRO", href: "/formas-pagamento", label: "Formas de Pagamento", iconKey: "formaPgto" },
  { grupo: "FINANCEIRO", href: "/conciliacao", label: "Conciliação Bancária", iconKey: "conciliacao" },
  { grupo: "FINANCEIRO", href: "/plano-contas", label: "Plano de Contas", iconKey: "planoContas" },

  { grupo: "FISCAL", href: "/notas", label: "Notas Fiscais", iconKey: "notas" },
  { grupo: "FISCAL", href: "/contabilidade", label: "Configuração Fiscal", iconKey: "contabilidade" },

  { grupo: "GESTÃO", href: "/produtos", label: "Produtos", iconKey: "produtos" },
  { grupo: "GESTÃO", href: "/tabelas", label: "Tabelas de Preço", iconKey: "tabelas" },
  { grupo: "GESTÃO", href: "/relatorios", label: "Relatórios & BI", iconKey: "relatorios" },
  { grupo: "GESTÃO", href: "/giro", label: "Giro & Cobertura", iconKey: "giro" },
  { grupo: "GESTÃO", href: "/logs", label: "Histórico", iconKey: "historico" },
];

// Ações rápidas de criação — atalho pra rotas /novo já existentes.
export const NAV_ACTIONS: { label: string; href: string }[] = [
  { label: "Novo Pedido", href: "/pedidos/novo" },
  { label: "Novo Orçamento", href: "/orcamentos/novo" },
];
