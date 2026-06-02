import { supabase } from '@/lib/supabase/client';
import type { NotaFiscal, NotaFiscalInsert, Pedido, Cliente } from "@/types";

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

// ─── HELPERS ───────────────────────────────────────────────

async function getClienteCompleto(clienteId: number): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .single();
  if (error) { console.error("getClienteCompleto:", error); return null; }
  return data as Cliente;
}

function validarCliente(c: Cliente): string | null {
  const doc = c.tipo_pessoa === "PF" ? c.cpf : c.cnpj;
  if (!doc || doc.replace(/\D/g, "").length < 11)
    return `Cliente sem ${c.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} válido.`;
  if (!c.logradouro && !c.endereco)
    return "Cliente sem endereço cadastrado.";
  if (!c.cidade)
    return "Cliente sem cidade cadastrada.";
  if (!c.uf)
    return "Cliente sem UF cadastrada.";
  if (!c.cep || c.cep.replace(/\D/g, "").length !== 8)
    return "Cliente sem CEP válido (necessário para NF-e).";
  if (!c.cod_ibge)
    return "Cliente sem código IBGE do município. Preencha o CEP novamente para auto-completar.";
  return null;
}

function montarDestinatario(c: Cliente) {
  const docRaw = (c.tipo_pessoa === "PF" ? c.cpf : c.cnpj).replace(/\D/g, "");
  const dest: Record<string, unknown> = {
    cpf_cnpj:        docRaw,
    nome:            c.nome,
    indicador_ie:    Number(c.ind_ie ?? "9"),
    consumidor_final: c.consumidor_final ? 1 : 0,
    endereco: {
      logradouro:    c.logradouro || c.endereco,
      numero:        c.numero     || "S/N",
      complemento:   c.complemento || undefined,
      bairro:        c.bairro     || "Centro",
      nome_municipio: c.cidade,
      codigo_municipio: c.cod_ibge,
      uf:            c.uf.toUpperCase(),
      cep:           c.cep.replace(/\D/g, ""),
      codigo_pais:   "1058",
      nome_pais:     "Brasil",
    },
  };

  if (c.ie && c.ind_ie === "1") dest.ie = c.ie.replace(/\D/g, "");
  if (c.email) dest.email = c.email;

  return dest;
}

// ─── NUVEM FISCAL ──────────────────────────────────────────

const NF_API = "https://api.nuvemfiscal.com.br";

export async function emitirNFe(notaId: number, pedido: Pedido): Promise<{
  ok: boolean;
  mensagem: string;
}> {
  // Busca nota e cliente completo
  const [nota, cliente] = await Promise.all([
    getNotaById(notaId),
    getClienteCompleto(pedido.cliente_id),
  ]);

  if (!nota)    return { ok: false, mensagem: "Nota não encontrada." };
  if (!cliente) return { ok: false, mensagem: "Cliente não encontrado." };

  // Valida campos obrigatórios para NF-e
  const erroValidacao = validarCliente(cliente);
  if (erroValidacao) return { ok: false, mensagem: erroValidacao };

  // Busca pedido completo com itens se não tiver
  let pedidoCompleto = pedido;
  if (!pedido.itens_pedido?.length) {
    const { data } = await supabase
      .from("pedidos")
      .select("*, itens_pedido(*)")
      .eq("id", pedido.id)
      .single();
    if (data) pedidoCompleto = data as Pedido;
  }

  const aliqIcms = nota.cfop.startsWith("5") ? 0.18 : 0.12;
  const cfopNum  = nota.cfop.replace(".", "");

  const payload = {
    ambiente:   "homologacao", // trocar para "producao" após homologação
    referencia: `UG-${pedido.id}-${notaId}`,

    emitente: {
      cpf_cnpj: "65668970000105", // CNPJ Urban Glass
    },

    destinatario: montarDestinatario(cliente),

    itens: (pedidoCompleto.itens_pedido ?? []).map((item, i) => {
      const vItem    = Number(item.subtotal);
      const vIcms    = vItem * aliqIcms;
      const vPis     = vItem * 0.0165;
      const vCofins  = vItem * 0.076;
      const qtd      = Number(item.m2) * item.quantidade;
      const vUnit    = qtd > 0 ? vItem / qtd : Number(item.valor_m2);

      return {
        numero_item:               i + 1,
        codigo_produto:            item.produto_id?.toString() ?? `ITEM-${String(i + 1).padStart(3,"0")}`,
        descricao:                 item.produto_nome,
        ncm:                       "70031200",
        cfop:                      cfopNum,
        unidade_comercial:         "M2",
        quantidade_comercial:      Number(qtd.toFixed(4)),
        valor_unitario_comercial:  Number(vUnit.toFixed(4)),
        valor_bruto:               Number(vItem.toFixed(2)),
        // Lapidação como despesa acessória se houver
        ...(item.lapidacao > 0 ? { valor_outras_despesas: Number(item.lapidacao.toFixed(2)) } : {}),
        icms: {
          origem:                  0,
          cst:                     "00",
          modalidade_base_calculo: 3,
          valor_base_calculo:      Number(vItem.toFixed(2)),
          aliquota:                nota.cfop.startsWith("5") ? 18 : 12,
          valor:                   Number(vIcms.toFixed(2)),
        },
        pis: {
          cst:                     "01",
          valor_base_calculo:      Number(vItem.toFixed(2)),
          aliquota_porcentual:     1.65,
          valor:                   Number(vPis.toFixed(2)),
        },
        cofins: {
          cst:                     "01",
          valor_base_calculo:      Number(vItem.toFixed(2)),
          aliquota_porcentual:     7.6,
          valor:                   Number(vCofins.toFixed(2)),
        },
      };
    }),

    total: {
      icms_total: {
        valor_bc_icms:  Number(nota.valor_produtos.toFixed(2)),
        valor_icms:     Number(nota.valor_icms.toFixed(2)),
        valor_pis:      Number(nota.valor_pis.toFixed(2)),
        valor_cofins:   Number(nota.valor_cofins.toFixed(2)),
        valor_produtos: Number(nota.valor_produtos.toFixed(2)),
        valor_nota:     Number(nota.valor_total.toFixed(2)),
      },
    },

    transportador: {
      modalidade_frete: 9, // sem frete
    },

    pagamentos: [{
      forma_pagamento: "01", // dinheiro — ajustar conforme pedido
      valor:           Number(nota.valor_total.toFixed(2)),
    }],

    // Observações do cliente na NF-e
    ...(cliente.obs_nfe ? { informacoes_adicionais_contribuinte: cliente.obs_nfe } : {}),
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
        .update({ status: "rejeitada", motivo_rejeicao: json.message ?? JSON.stringify(json.errors ?? json) } as never)
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