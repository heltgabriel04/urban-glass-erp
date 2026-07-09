import { supabase } from "@/lib/supabase/client";
import { NAV_ROUTES, NAV_ACTIONS } from "@/lib/navRoutes";

export interface ResultadoBusca {
  tipo: "rota" | "acao" | "pedido" | "cliente" | "lancamento";
  label: string;
  sublabel?: string;
  href: string;
}

export interface BuscaGlobalResultado {
  rotas: ResultadoBusca[];
  pedidos: ResultadoBusca[];
  clientes: ResultadoBusca[];
  lancamentos: ResultadoBusca[];
}

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
function normaliza(s: string): string {
  return s.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

function buscaEstatica(query: string, limite: number): ResultadoBusca[] {
  const q = normaliza(query);
  const rotas: ResultadoBusca[] = NAV_ROUTES
    .filter(r => normaliza(r.label).includes(q))
    .map(r => ({ tipo: "rota" as const, label: r.label, sublabel: r.grupo, href: r.href }));
  const acoes: ResultadoBusca[] = NAV_ACTIONS
    .filter(a => normaliza(a.label).includes(q))
    .map(a => ({ tipo: "acao" as const, label: a.label, href: a.href }));
  return [...acoes, ...rotas].slice(0, limite);
}

async function buscaPedidos(query: string, limite: number): Promise<ResultadoBusca[]> {
  const [porId, porCliente] = await Promise.all([
    supabase.from("pedidos").select("id, status, clientes(nome)").ilike("id", `%${query}%`).limit(limite),
    supabase.from("pedidos").select("id, status, clientes!inner(nome)").ilike("clientes.nome", `%${query}%`).limit(limite),
  ]);
  const linhas = [...(porId.data ?? []), ...(porCliente.data ?? [])] as Array<{ id: string; status: string; clientes: { nome: string } | { nome: string }[] | null }>;
  const vistos = new Set<string>();
  const resultado: ResultadoBusca[] = [];
  for (const p of linhas) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);
    const cliente = Array.isArray(p.clientes) ? p.clientes[0] : p.clientes;
    resultado.push({ tipo: "pedido", label: `Pedido ${p.id}`, sublabel: `${cliente?.nome ?? "—"} · ${p.status}`, href: `/pedidos/${p.id}` });
  }
  return resultado.slice(0, limite);
}

async function buscaClientes(query: string, limite: number): Promise<ResultadoBusca[]> {
  const { data } = await supabase.from("clientes").select("id, nome, cidade").ilike("nome", `%${query}%`).limit(limite);
  return ((data ?? []) as Array<{ id: number; nome: string; cidade: string | null }>).map(c => ({
    tipo: "cliente", label: c.nome, sublabel: c.cidade ?? undefined, href: `/clientes/${c.id}`,
  }));
}

async function buscaLancamentos(query: string, limite: number): Promise<ResultadoBusca[]> {
  const { data } = await supabase
    .from("lancamentos")
    .select("id, tipo, descricao, fornecedor, valor")
    .or(`descricao.ilike.%${query}%,fornecedor.ilike.%${query}%`)
    .is("deletado_em", null)
    .limit(limite);
  return ((data ?? []) as Array<{ id: number; tipo: string; descricao: string; fornecedor: string | null; valor: number }>).map(l => ({
    tipo: "lancamento",
    label: l.descricao,
    sublabel: l.fornecedor ?? undefined,
    href: l.tipo === "Saída" ? "/contas-pagar" : "/contas-receber",
  }));
}

export async function buscaGlobal(query: string, limite = 6): Promise<BuscaGlobalResultado> {
  const q = query.trim();
  if (!q) return { rotas: buscaEstatica("", 0), pedidos: [], clientes: [], lancamentos: [] };

  const [pedidos, clientes, lancamentos] = await Promise.all([
    buscaPedidos(q, limite).catch(() => []),
    buscaClientes(q, limite).catch(() => []),
    buscaLancamentos(q, limite).catch(() => []),
  ]);

  return { rotas: buscaEstatica(q, limite), pedidos, clientes, lancamentos };
}
