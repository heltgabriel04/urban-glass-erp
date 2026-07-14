import { supabase } from '@/lib/supabase/client';
import type { Compra, CompraInsert, CompraItemInsert } from '@/types';
import { registrarMovimentacao, reverterMovimentacao } from './estoqueMovimentacoes.service';
import { getUltimoPlanoContas } from './lancamentos.service';
import { registrarLog } from './log.service';
import {
  criarDocumentoFiscal, uploadAnexoDocumentoFiscal, atualizarDocumentoFiscal,
  getDocumentoFiscalPorChaveAcesso,
} from './contabilidadeDocumentos.service';

export async function getProximoIdCompra(): Promise<string> {
  const { data } = await supabase
    .from('compras')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);

  let proximoNum = 1;
  if (data && data.length > 0) {
    const n = parseInt((data[0] as { id: string }).id.replace('C-', ''), 10);
    if (!isNaN(n)) proximoNum = n + 1;
  }
  return `C-${String(proximoNum).padStart(3, '0')}`;
}

export async function getCompras(): Promise<Compra[]> {
  const { data, error } = await supabase
    .from('compras')
    .select('*, fornecedores ( id, nome ), compras_itens ( *, produtos ( id, nome, cod, chapas_por_colar ) )')
    .order('created_at', { ascending: false });
  if (error) { console.error('getCompras:', error); return []; }
  return data as Compra[];
}

export async function createCompra(
  compra: Omit<CompraInsert, 'id' | 'status' | 'dt_recebimento'>,
  itens: Omit<CompraItemInsert, 'compra_id'>[]
): Promise<Compra | null> {
  const id = await getProximoIdCompra();
  const { data, error } = await supabase
    .from('compras')
    .insert([{ ...compra, id, status: 'rascunho', dt_recebimento: null } as never])
    .select()
    .single();
  if (error) { console.error('createCompra:', error); return null; }

  if (itens.length > 0) {
    const itensComId = itens.map(i => ({ ...i, compra_id: id }));
    const { error: errItens } = await supabase.from('compras_itens').insert(itensComId as never);
    if (errItens) console.error('createCompra itens:', errItens);
  }

  return data as Compra;
}

export async function deletarCompra(compraId: string): Promise<boolean> {
  const { data: compra } = await supabase.from('compras').select('status').eq('id', compraId).maybeSingle();
  if ((compra as { status: string } | null)?.status === 'recebido') {
    const { data: itens } = await supabase.from('compras_itens').select('id').eq('compra_id', compraId);
    for (const item of (itens ?? []) as Array<{ id: number }>) {
      await reverterMovimentacao('compra', `ci-${item.id}`);
    }
  }
  await supabase.from('compras_itens').delete().eq('compra_id', compraId);
  const { error } = await supabase.from('compras').delete().eq('id', compraId);
  if (error) { console.error('deletarCompra:', error); return false; }
  return true;
}

/** Confirma o recebimento: gera a entrada de cada item no livro-razão de
 *  estoque (idempotente — chamar de novo não duplica) e marca a compra como recebida. */
export async function confirmarRecebimento(compraId: string): Promise<{ ok: boolean; motivo?: string }> {
  const { data: compraRow } = await supabase.from('compras').select('id, status, fornecedor_id, valor_total, nf').eq('id', compraId).maybeSingle();
  if (!compraRow) return { ok: false, motivo: 'compra não encontrada' };
  const compra = compraRow as { id: string; status: string; fornecedor_id: number | null; valor_total: number; nf: string | null };
  if (compra.status === 'recebido') return { ok: true };

  const { data: itens, error: errItens } = await supabase
    .from('compras_itens')
    .select('id, produto_id, chapas, m2, custo_unitario_m2')
    .eq('compra_id', compraId);
  if (errItens) return { ok: false, motivo: errItens.message };

  for (const item of (itens ?? []) as Array<{ id: number; produto_id: number | null; chapas: number; m2: number; custo_unitario_m2: number }>) {
    if (!item.produto_id) continue;
    const res = await registrarMovimentacao({
      produtoId: item.produto_id,
      tipo: 'entrada_compra', origemTipo: 'compra', origemId: `ci-${item.id}`,
      chapas: item.chapas, m2: item.m2, custoUnitarioM2: item.custo_unitario_m2,
    });
    if (!res.ok && !res.jaExistia) return { ok: false, motivo: `item ${item.id}: ${res.motivo}` };
  }

  const { error } = await supabase
    .from('compras')
    .update({ status: 'recebido', dt_recebimento: new Date().toISOString() } as never)
    .eq('id', compraId);
  if (error) return { ok: false, motivo: error.message };

  await gerarContaAPagarDaCompra(compra);

  return { ok: true };
}

// Idempotente — se a compra já tiver um lançamento (compra_id preenchido),
// não cria de novo. Sem vencimento de propósito: o financeiro decide o
// prazo ao revisar, o sistema só evita a redigitação de fornecedor/valor.
async function gerarContaAPagarDaCompra(compra: { id: string; fornecedor_id: number | null; valor_total: number; nf: string | null }): Promise<void> {
  const { data: existente } = await supabase.from('lancamentos').select('id').eq('compra_id', compra.id).maybeSingle();
  if (existente) return;
  if (!(compra.valor_total > 0)) return;

  const sugestao = compra.fornecedor_id ? await getUltimoPlanoContas({ fornecedorId: compra.fornecedor_id }) : { planoContasId: null };

  const { data: novoLancamento, error } = await supabase
    .from('lancamentos')
    .insert([{
      tipo: 'Saída',
      descricao: `Compra ${compra.id}`,
      valor: compra.valor_total,
      status: 'Pendente',
      vencimento: null,
      documento: compra.nf,
      fornecedor_id: compra.fornecedor_id,
      compra_id: compra.id,
      plano_contas_id: sugestao.planoContasId,
      pedido_id: null,
      cliente_id: null,
    } as never])
    .select('id')
    .single();
  if (error) { console.error('gerarContaAPagarDaCompra:', error); return; }

  registrarLog({
    acao: 'criou', tabela: 'lancamentos', registro_id: String((novoLancamento as { id: number }).id),
    descricao: `Gerou conta a pagar automaticamente da compra ${compra.id} · R$ ${compra.valor_total.toFixed(2)}`,
    campos_alterados: { compra_id: compra.id, valor: compra.valor_total },
  });
}

export interface DadosXmlParaDocumento {
  chaveAcesso: string | null;
  numeroNF: string | null;
  serie: string | null;
  ncm: string | null;
  cfop: string | null;
  valorTotal: number;
  fornecedorId: number | null;
  competenciaAno: number;
  competenciaMes: number;
}

export interface ResultadoAnexarXml {
  ok: boolean;
  aviso?: string;
}

/** Cria o documento fiscal (tipo compra, entrada) linkado a uma compra já
 *  criada e anexa o XML original. Não reverte a compra em caso de falha
 *  aqui — a compra já existe e é válida por si só; só avisa o usuário pra
 *  completar manualmente em Documentos Fiscais se algo falhar. */
export async function anexarXmlNaCompra(
  compraId: string,
  dados: DadosXmlParaDocumento,
  xmlFile: File
): Promise<ResultadoAnexarXml> {
  if (dados.chaveAcesso) {
    const existente = await getDocumentoFiscalPorChaveAcesso(dados.chaveAcesso);
    if (existente) {
      return { ok: false, aviso: `Esta nota já tinha sido importada antes (documento fiscal #${existente.id}). A compra foi criada, mas não dupliquei o documento fiscal.` };
    }
  }

  const doc = await criarDocumentoFiscal({
    tipo: 'compra', entrada: true,
    competencia_ano: dados.competenciaAno, competencia_mes: dados.competenciaMes,
    numero_documento: dados.numeroNF, serie: dados.serie, chave_acesso: dados.chaveAcesso,
    fornecedor_id: dados.fornecedorId, compra_id: compraId, nota_fiscal_id: null,
    ncm: dados.ncm, cfop: dados.cfop, cst: null,
    valor_produtos: null, valor_icms: null, valor_pis: null, valor_cofins: null, valor_ipi: null,
    valor_total: dados.valorTotal,
    motivo: null, material: null, quantidade: null,
    numero_inicial: null, numero_final: null,
    sequencia_evento: null, texto_correcao: null,
    responsavel: null, observacoes: 'Importado automaticamente via XML.',
    xml_url: null, pdf_url: null, fotos_urls: null,
    criado_por: null,
  });

  if (!doc) {
    return { ok: false, aviso: 'A compra foi criada, mas não consegui registrar o documento fiscal. Registre manualmente em Documentos Fiscais.' };
  }

  const url = await uploadAnexoDocumentoFiscal(doc.id, xmlFile, 'xml');
  if (!url) {
    return { ok: false, aviso: 'A compra e o documento fiscal foram criados, mas o upload do XML falhou. Anexe manualmente em Documentos Fiscais.' };
  }
  await atualizarDocumentoFiscal(doc.id, { xml_url: url });

  return { ok: true };
}

export interface HistoricoPrecoItem {
  data: string;
  fornecedorNome: string;
  custoUnitarioM2: number;
  chapas: number;
  m2: number;
}

/** Histórico de preços já pagos por um produto — só compras já recebidas
 *  (rascunho tem preço não confirmado, fica de fora). Sem paginação: volume
 *  de compras hoje é baixo, e é histórico completo por design (não uma
 *  amostra). */
export async function getHistoricoPrecoProduto(produtoId: number): Promise<HistoricoPrecoItem[]> {
  const { data, error } = await supabase
    .from('compras_itens')
    .select('custo_unitario_m2, chapas, m2, compras!inner ( dt_recebimento, status, fornecedores ( nome ) )')
    .eq('produto_id', produtoId)
    .eq('compras.status', 'recebido');
  if (error) { console.error('getHistoricoPrecoProduto:', error); return []; }

  const linhas = (data ?? []) as unknown as Array<{
    custo_unitario_m2: number;
    chapas: number;
    m2: number;
    compras: { dt_recebimento: string | null; fornecedores: { nome: string } | null };
  }>;

  return linhas
    .map(row => ({
      data: row.compras.dt_recebimento ?? '',
      fornecedorNome: row.compras.fornecedores?.nome ?? '—',
      custoUnitarioM2: row.custo_unitario_m2,
      chapas: row.chapas,
      m2: row.m2,
    }))
    .sort((a, b) => b.data.localeCompare(a.data));
}
