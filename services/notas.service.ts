import { supabase } from '@/lib/supabase/client';
import type { NotaFiscal, NotaFiscalInsert, Pedido } from "@/types";

// ─── CRUD ──────────────────────────────────────────────────

export async function getNotas(): Promise<NotaFiscal[]> {
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select(`*, pedidos(id), clientes(id, nome, cnpj, cidade)`)
    .order("dt_emissao", { ascending: false });

  if (error) { console.error("getNotas:", error); return []; }
  return data ?? [];
}

export async function getNotaById(id: number): Promise<NotaFiscal | null> {
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select(`*, pedidos(id), clientes(id, nome, cnpj, cidade)`)
    .eq("id", id)
    .single();

  if (error) { console.error("getNotaById:", error); return null; }
  return data;
}

export async function getNotasPorPedido(pedidoId: string): Promise<NotaFiscal[]> {
  const { data, error } = await supabase
    .from("notas_fiscais")
    .select(`*, clientes(id, nome, cnpj, cidade)`)
    .eq("pedido_id", pedidoId)
    .order("dt_emissao", { ascending: false });

  if (error) { console.error("getNotasPorPedido:", error); return []; }
  return data ?? [];
}

export async function criarRascunho(
  pedido: Pedido,
  cfop: string
): Promise<NotaFiscal | null> {
  const valorProdutos = Number(pedido.valor_total);
  const aliqIcms      = cfop.startsWith("5") ? 0.18 : 0.12;
  const valorIcms     = valorProdutos * aliqIcms;
  const valorPis      = valorProdutos * 0.0165;
  const valorCofins   = valorProdutos * 0.076;

  const insert: NotaFiscalInsert = {
    pedido_id:       pedido.id,
    cliente_id:      pedido.cliente_id,
    status:          "rascunho",
    cfop,
    natureza_op:     "Venda de mercadoria",
    valor_produtos:  valorProdutos,
    valor_icms:      valorIcms,
    valor_pis:       valorPis,
    valor_cofins:    valorCofins,
    valor_total:     valorProdutos,
    numero:          null,
    serie:           "1",
    chave:           null,
    protocolo:       null,
    nuvem_fiscal_id: null,
    xml_url:         null,
    danfe_url:       null,
    motivo_rejeicao: null,
    dt_emissao:      new Date().toISOString(),
    dt_autorizacao:  null,
  };

  const { data, error } = await supabase
    .from("notas_fiscais")
    .insert(insert as never)
    .select()
    .single();

  if (error) { console.error("criarRascunho:", error); return null; }
  return data;
}

export async function deletarNota(id: number): Promise<boolean> {
  const { error } = await supabase
    .from("notas_fiscais")
    .delete()
    .eq("id", id);
  if (error) { console.error("deletarNota:", error); return false; }
  return true;
}

// ─── NUVEM FISCAL ──────────────────────────────────────────

const NF_API = "https://api.nuvemfiscal.com.br";

export async function emitirNFe(notaId: number, pedido: Pedido): Promise<{
  ok: boolean;
  mensagem: string;
}> {
  if (!pedido.clientes?.cnpj) {
    return { ok: false, mensagem: "Cliente sem CNPJ cadastrado." };
  }

  const nota = await getNotaById(notaId);
  if (!nota) return { ok: false, mensagem: "Nota não encontrada." };

  const payload = {
    ambiente:   "homologacao",
    referencia: `UG-${pedido.id}-${notaId}`,
    emitente: {
      cpf_cnpj: "65668970000105",
    },
    destinatario: {
      cpf_cnpj: pedido.clientes.cnpj.replace(/\D/g, ""),
      nome:     pedido.clientes.nome,
    },
    itens: (pedido.itens_pedido ?? []).map((item, i) => ({
      numero_item:              i + 1,
      codigo_produto:           item.produto_id?.toString() ?? `ITEM-${i + 1}`,
      descricao:                item.produto_nome,
      ncm:                      "70031200",
      cfop:                     nota.cfop.replace(".", ""),
      unidade_comercial:        "M2",
      quantidade_comercial:     Number(item.m2) * item.quantidade,
      valor_unitario_comercial: Number(item.valor_m2),
      valor_bruto:              Number(item.subtotal),
      icms: {
        origem:                 0,
        cst:                    "00",
        modalidade_base_calculo: 3,
        valor_base_calculo:     Number(item.subtotal),
        aliquota:               nota.cfop.startsWith("5") ? 18 : 12,
        valor:                  Number(item.subtotal) * (nota.cfop.startsWith("5") ? 0.18 : 0.12),
      },
      pis: {
        cst:                    "01",
        valor_base_calculo:     Number(item.subtotal),
        aliquota_porcentual:    1.65,
        valor:                  Number(item.subtotal) * 0.0165,
      },
      cofins: {
        cst:                    "01",
        valor_base_calculo:     Number(item.subtotal),
        aliquota_porcentual:    7.6,
        valor:                  Number(item.subtotal) * 0.076,
      },
    })),
    total: {
      icms_total: {
        valor_bc_icms:  nota.valor_produtos,
        valor_icms:     nota.valor_icms,
        valor_pis:      nota.valor_pis,
        valor_cofins:   nota.valor_cofins,
        valor_produtos: nota.valor_produtos,
        valor_nota:     nota.valor_total,
      },
    },
    pagamentos: [{ forma_pagamento: "01", valor: nota.valor_total }],
  };

  try {
    const token = process.env.NEXT_PUBLIC_NUVEM_FISCAL_TOKEN ?? "";
    const res = await fetch(`${NF_API}/nfe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      await supabase
        .from("notas_fiscais")
        .update({ status: "rejeitada", motivo_rejeicao: json.message ?? "Erro desconhecido" } as never)
        .eq("id", notaId);
      return { ok: false, mensagem: json.message ?? "Erro na Nuvem Fiscal" };
    }

    await supabase
      .from("notas_fiscais")
      .update({ status: "enviando", nuvem_fiscal_id: json.id } as never)
      .eq("id", notaId);

    return { ok: true, mensagem: "NF-e enviada para processamento." };
  } catch (err) {
    console.error("emitirNFe:", err);
    return { ok: false, mensagem: "Erro de conexão com Nuvem Fiscal." };
  }
}

export async function consultarStatusNFe(notaId: number): Promise<void> {
  const nota = await getNotaById(notaId);
  if (!nota?.nuvem_fiscal_id) return;

  try {
    const token = process.env.NEXT_PUBLIC_NUVEM_FISCAL_TOKEN ?? "";
    const res = await fetch(`${NF_API}/nfe/${nota.nuvem_fiscal_id}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) return;

    const updates: Record<string, unknown> = {};
    if (json.status === "autorizado") {
      updates.status         = "autorizada";
      updates.numero         = json.numero?.toString();
      updates.chave          = json.chave_acesso;
      updates.protocolo      = json.protocolo;
      updates.danfe_url      = json.danfe_url;
      updates.xml_url        = json.xml_url;
      updates.dt_autorizacao = new Date().toISOString();
    } else if (json.status === "rejeitado") {
      updates.status          = "rejeitada";
      updates.motivo_rejeicao = json.motivo;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("notas_fiscais").update(updates as never).eq("id", notaId);
    }
  } catch (err) {
    console.error("consultarStatusNFe:", err);
  }
}