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
    .eq("id", id).single();
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

export async function criarRascunho(pedido: Pedido, cfop: string): Promise<NotaFiscal | null> {
  const valorProdutos = Number(pedido.valor_total);
  const aliqIcms      = cfop.startsWith("5") ? 0.18 : 0.12;
  const insert: NotaFiscalInsert = {
    pedido_id: pedido.id, cliente_id: pedido.cliente_id, status: "rascunho",
    cfop, natureza_op: "Venda de mercadoria",
    valor_produtos: valorProdutos, valor_icms: valorProdutos * aliqIcms,
    valor_pis: valorProdutos * 0.0165, valor_cofins: valorProdutos * 0.076,
    valor_total: valorProdutos, numero: null, serie: "1",
    chave: null, protocolo: null, nuvem_fiscal_id: null,
    xml_url: null, danfe_url: null, motivo_rejeicao: null,
    dt_emissao: new Date().toISOString(), dt_autorizacao: null,
  };
  const { data, error } = await supabase.from("notas_fiscais").insert(insert as never).select().single();
  if (error) { console.error("criarRascunho:", error); return null; }
  return data;
}

export async function deletarNota(id: number): Promise<boolean> {
  const { error } = await supabase.from("notas_fiscais").delete().eq("id", id);
  if (error) { console.error("deletarNota:", error); return false; }
  return true;
}

// ─── NOTA COMPLETA ─────────────────────────────────────────

interface PayloadNota {
  form: {
    pedido_id: string; cliente_id: number | null;
    natureza_op: string; finalidade: string; tipo: string; serie: string; cfop_padrao: string;
    itens: { produto_nome: string; ncm: string; cfop: string; unidade: string; quantidade: number;
      valor_unitario: number; valor_bruto: number; ipi_pct: number; icms_pct: number;
      valor_ipi: number; valor_icms: number; valor_pis: number; valor_cofins: number; lapidacao: number; }[];
    valor_desconto: number; valor_frete: number; valor_seguro: number; valor_outros: number;
    forma_pgto: string; parcelas: number; modalidade_frete: number;
    transportadora: string; placa_veiculo: string; uf_veiculo: string; rntc: string;
    peso_bruto: string; peso_liquido: string; volumes: string; especie_volume: string;
    dt_saida: string; hora_saida: string; obs_contribuinte: string; obs_internas: string;
  };
  valorProdutos: number; valorIcms: number; valorPis: number;
  valorCofins: number; valorIpi: number; valorNota: number;
}

export async function salvarNotaCompleta(p: PayloadNota): Promise<boolean> {
  const { form, valorProdutos, valorIcms, valorPis, valorCofins, valorIpi, valorNota } = p;
  const insert = {
    pedido_id:       form.pedido_id,
    cliente_id:      form.cliente_id,
    status:          "rascunho",
    cfop:            form.cfop_padrao,
    natureza_op:     form.natureza_op,
    serie:           form.serie,
    finalidade:      form.finalidade,
    tipo:            form.tipo,
    valor_produtos:  Number(valorProdutos.toFixed(2)),
    valor_icms:      Number(valorIcms.toFixed(2)),
    valor_pis:       Number(valorPis.toFixed(2)),
    valor_cofins:    Number(valorCofins.toFixed(2)),
    valor_ipi:       Number(valorIpi.toFixed(2)),
    valor_desconto:  Number(form.valor_desconto.toFixed(2)),
    valor_frete:     Number(form.valor_frete.toFixed(2)),
    valor_seguro:    Number(form.valor_seguro.toFixed(2)),
    valor_outros:    Number(form.valor_outros.toFixed(2)),
    valor_total:     Number(valorNota.toFixed(2)),
    forma_pgto:      form.forma_pgto,
    parcelas:        form.parcelas,
    modalidade_frete: form.modalidade_frete,
    transportadora:  form.transportadora || null,
    placa_veiculo:   form.placa_veiculo  || null,
    uf_veiculo:      form.uf_veiculo     || null,
    rntc:            form.rntc           || null,
    peso_bruto:      form.peso_bruto     ? Number(form.peso_bruto)    : null,
    peso_liquido:    form.peso_liquido   ? Number(form.peso_liquido)  : null,
    volumes:         form.volumes        ? Number(form.volumes)       : null,
    especie_volume:  form.especie_volume || null,
    dt_saida:        form.dt_saida       || null,
    hora_saida:      form.hora_saida     || null,
    obs_contribuinte: form.obs_contribuinte || null,
    obs_internas:    form.obs_internas   || null,
    itens_json:      form.itens,
    numero:          null, chave: null, protocolo: null,
    nuvem_fiscal_id: null, xml_url: null, danfe_url: null, motivo_rejeicao: null,
    dt_emissao:      new Date().toISOString(), dt_autorizacao: null,
  };
  const { error } = await supabase.from("notas_fiscais").insert(insert as never);
  if (error) { console.error("salvarNotaCompleta:", error); return false; }
  return true;
}

// ─── HELPERS ───────────────────────────────────────────────

async function getClienteCompleto(clienteId: number): Promise<Cliente | null> {
  const { data, error } = await supabase.from("clientes").select("*").eq("id", clienteId).single();
  if (error) { console.error("getClienteCompleto:", error); return null; }
  return data as Cliente;
}

function validarCliente(c: Cliente): string | null {
  const doc = c.tipo_pessoa === "PF" ? c.cpf : c.cnpj;
  if (!doc || doc.replace(/\D/g, "").length < 11)
    return `Cliente sem ${c.tipo_pessoa === "PF" ? "CPF" : "CNPJ"} válido.`;
  if (!c.logradouro && !c.endereco) return "Cliente sem endereço cadastrado.";
  if (!c.cidade)     return "Cliente sem cidade cadastrada.";
  if (!c.uf)         return "Cliente sem UF cadastrada.";
  if (!c.cep || c.cep.replace(/\D/g, "").length !== 8) return "Cliente sem CEP válido.";
  if (!c.cod_ibge)   return "Cliente sem código IBGE. Preencha o CEP novamente.";
  return null;
}

function montarDestinatario(c: Cliente) {
  const docRaw = (c.tipo_pessoa === "PF" ? c.cpf : c.cnpj).replace(/\D/g, "");
  const dest: Record<string, unknown> = {
    cpf_cnpj: docRaw, nome: c.nome,
    indicador_ie: Number(c.ind_ie ?? "9"),
    consumidor_final: c.consumidor_final ? 1 : 0,
    endereco: {
      logradouro: c.logradouro || c.endereco, numero: c.numero || "S/N",
      complemento: c.complemento || undefined, bairro: c.bairro || "Centro",
      nome_municipio: c.cidade, codigo_municipio: c.cod_ibge,
      uf: c.uf.toUpperCase(), cep: c.cep.replace(/\D/g, ""),
      codigo_pais: "1058", nome_pais: "Brasil",
    },
  };
  if (c.ie && c.ind_ie === "1") dest.ie = c.ie.replace(/\D/g, "");
  if (c.email) dest.email = c.email;
  return dest;
}

// ─── EMISSÃO COMPLETA ──────────────────────────────────────

const NF_API = "https://api.nuvemfiscal.com.br";

export async function emitirNFeCompleta(p: PayloadNota): Promise<{ ok: boolean; mensagem: string }> {
  const { form, valorProdutos, valorIcms, valorPis, valorCofins, valorIpi, valorNota } = p;

  if (!form.cliente_id) return { ok: false, mensagem: "Cliente não selecionado." };
  const cliente = await getClienteCompleto(form.cliente_id);
  if (!cliente) return { ok: false, mensagem: "Cliente não encontrado." };

  const erroValidacao = validarCliente(cliente);
  if (erroValidacao) return { ok: false, mensagem: erroValidacao };

  // Salva rascunho primeiro
  const ok = await salvarNotaCompleta(p);
  if (!ok) return { ok: false, mensagem: "Erro ao salvar rascunho antes de emitir." };

  // Busca o rascunho recém-criado
  const { data: notaData } = await supabase
    .from("notas_fiscais").select("id").eq("pedido_id", form.pedido_id)
    .eq("status","rascunho").order("created_at", { ascending:false }).limit(1).single();
  if (!notaData) return { ok: false, mensagem: "Rascunho não encontrado após salvar." };
  const notaId = (notaData as any).id as number;

  const cfopNum  = form.cfop_padrao.replace(".", "");
  const aliqIcms = form.cfop_padrao.startsWith("5") ? 0.18 : 0.12;

  const payload: Record<string, unknown> = {
    ambiente:   "homologacao",
    referencia: `UG-${form.pedido_id}-${notaId}`,
    emitente:   { cpf_cnpj: "65668970000105" },
    destinatario: montarDestinatario(cliente),
    itens: form.itens.map((item, i) => ({
      numero_item:               i + 1,
      codigo_produto:            `ITEM-${String(i+1).padStart(3,"0")}`,
      descricao:                 item.produto_nome,
      ncm:                       item.ncm,
      cfop:                      item.cfop || cfopNum,
      unidade_comercial:         item.unidade,
      quantidade_comercial:      Number(item.quantidade.toFixed(4)),
      valor_unitario_comercial:  Number(item.valor_unitario.toFixed(4)),
      valor_bruto:               Number(item.valor_bruto.toFixed(2)),
      ...(item.lapidacao > 0 ? { valor_outras_despesas: Number(item.lapidacao.toFixed(2)) } : {}),
      icms: {
        origem: 0, cst: "00", modalidade_base_calculo: 3,
        valor_base_calculo: Number(item.valor_bruto.toFixed(2)),
        aliquota: form.cfop_padrao.startsWith("5") ? 18 : 12,
        valor: Number(item.valor_icms.toFixed(2)),
      },
      pis: { cst:"01", valor_base_calculo:Number(item.valor_bruto.toFixed(2)), aliquota_porcentual:1.65, valor:Number(item.valor_pis.toFixed(2)) },
      cofins: { cst:"01", valor_base_calculo:Number(item.valor_bruto.toFixed(2)), aliquota_porcentual:7.6, valor:Number(item.valor_cofins.toFixed(2)) },
      ...(item.ipi_pct > 0 ? { ipi: { cst:"50", aliquota:item.ipi_pct, valor:Number(item.valor_ipi.toFixed(2)) } } : {}),
    })),
    total: {
      icms_total: {
        valor_bc_icms:  Number(valorProdutos.toFixed(2)),
        valor_icms:     Number(valorIcms.toFixed(2)),
        valor_pis:      Number(valorPis.toFixed(2)),
        valor_cofins:   Number(valorCofins.toFixed(2)),
        valor_ipi:      Number(valorIpi.toFixed(2)),
        valor_produtos: Number(valorProdutos.toFixed(2)),
        valor_desconto: Number(form.valor_desconto.toFixed(2)),
        valor_frete:    Number(form.valor_frete.toFixed(2)),
        valor_seguro:   Number(form.valor_seguro.toFixed(2)),
        outras_despesas: Number(form.valor_outros.toFixed(2)),
        valor_nota:     Number(valorNota.toFixed(2)),
      },
    },
    transportador: {
      modalidade_frete: form.modalidade_frete,
      ...(form.transportadora ? { transportadora: { nome: form.transportadora } } : {}),
      ...(form.placa_veiculo  ? { veiculo: { placa: form.placa_veiculo, uf: form.uf_veiculo, rntc: form.rntc || undefined } } : {}),
      ...(form.volumes ? { volumes: [{ especie: form.especie_volume || "UN", quantidade: Number(form.volumes), peso_bruto: Number(form.peso_bruto) || 0, peso_liquido: Number(form.peso_liquido) || 0 }] } : {}),
    },
    pagamentos: [{ forma_pagamento: form.forma_pgto, valor: Number(valorNota.toFixed(2)) }],
    ...(form.obs_contribuinte ? { informacoes_adicionais_contribuinte: form.obs_contribuinte } : {}),
    ...(form.dt_saida ? { data_saida_entrada: `${form.dt_saida}T${form.hora_saida || "00:00"}:00-03:00` } : {}),
  };

  try {
    const token = process.env.NEXT_PUBLIC_NUVEM_FISCAL_TOKEN ?? "";
    const res = await fetch(`${NF_API}/nfe`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      await supabase.from("notas_fiscais").update({ status:"rejeitada", motivo_rejeicao: json.message ?? JSON.stringify(json.errors ?? json) } as never).eq("id", notaId);
      return { ok:false, mensagem: json.message ?? "Erro na Nuvem Fiscal" };
    }
    await supabase.from("notas_fiscais").update({ status:"enviando", nuvem_fiscal_id: json.id } as never).eq("id", notaId);
    return { ok:true, mensagem:"NF-e enviada para processamento." };
  } catch (err) {
    console.error("emitirNFeCompleta:", err);
    return { ok:false, mensagem:"Erro de conexão com Nuvem Fiscal." };
  }
}

export async function emitirNFe(notaId: number, pedido: Pedido): Promise<{ ok: boolean; mensagem: string }> {
  const [nota, cliente] = await Promise.all([getNotaById(notaId), getClienteCompleto(pedido.cliente_id)]);
  if (!nota)    return { ok:false, mensagem:"Nota não encontrada." };
  if (!cliente) return { ok:false, mensagem:"Cliente não encontrado." };
  const erroValidacao = validarCliente(cliente);
  if (erroValidacao) return { ok:false, mensagem:erroValidacao };

  let pedidoCompleto = pedido;
  if (!pedido.itens_pedido?.length) {
    const { data } = await supabase.from("pedidos").select("*, itens_pedido(*)").eq("id", pedido.id).single();
    if (data) pedidoCompleto = data as Pedido;
  }

  const aliqIcms = nota.cfop.startsWith("5") ? 0.18 : 0.12;
  const cfopNum  = nota.cfop.replace(".", "");

  const payload = {
    ambiente:"homologacao", referencia:`UG-${pedido.id}-${notaId}`,
    emitente:{ cpf_cnpj:"65668970000105" },
    destinatario: montarDestinatario(cliente),
    itens: (pedidoCompleto.itens_pedido ?? []).map((item, i) => {
      const vItem = Number(item.subtotal);
      const qtd   = Number(item.m2) * item.quantidade;
      const vUnit = qtd > 0 ? vItem / qtd : Number(item.valor_m2);
      return {
        numero_item:i+1, codigo_produto:item.produto_id?.toString() ?? `ITEM-${String(i+1).padStart(3,"0")}`,
        descricao:item.produto_nome, ncm:"70031200", cfop:cfopNum,
        unidade_comercial:"M2", quantidade_comercial:Number(qtd.toFixed(4)),
        valor_unitario_comercial:Number(vUnit.toFixed(4)), valor_bruto:Number(vItem.toFixed(2)),
        ...(item.lapidacao > 0 ? { valor_outras_despesas:Number(item.lapidacao.toFixed(2)) } : {}),
        icms:{ origem:0, cst:"00", modalidade_base_calculo:3, valor_base_calculo:Number(vItem.toFixed(2)), aliquota:nota.cfop.startsWith("5")?18:12, valor:Number((vItem*aliqIcms).toFixed(2)) },
        pis:{ cst:"01", valor_base_calculo:Number(vItem.toFixed(2)), aliquota_porcentual:1.65, valor:Number((vItem*0.0165).toFixed(2)) },
        cofins:{ cst:"01", valor_base_calculo:Number(vItem.toFixed(2)), aliquota_porcentual:7.6, valor:Number((vItem*0.076).toFixed(2)) },
      };
    }),
    total:{ icms_total:{ valor_bc_icms:Number(nota.valor_produtos.toFixed(2)), valor_icms:Number(nota.valor_icms.toFixed(2)), valor_pis:Number(nota.valor_pis.toFixed(2)), valor_cofins:Number(nota.valor_cofins.toFixed(2)), valor_produtos:Number(nota.valor_produtos.toFixed(2)), valor_nota:Number(nota.valor_total.toFixed(2)) } },
    transportador:{ modalidade_frete:9 },
    pagamentos:[{ forma_pagamento:"01", valor:Number(nota.valor_total.toFixed(2)) }],
    ...(cliente.obs_nfe ? { informacoes_adicionais_contribuinte:cliente.obs_nfe } : {}),
  };

  try {
    const token = process.env.NEXT_PUBLIC_NUVEM_FISCAL_TOKEN ?? "";
    const res = await fetch(`${NF_API}/nfe`, { method:"POST", headers:{ "Content-Type":"application/json","Authorization":`Bearer ${token}` }, body:JSON.stringify(payload) });
    const json = await res.json();
    if (!res.ok) {
      await supabase.from("notas_fiscais").update({ status:"rejeitada", motivo_rejeicao:json.message ?? JSON.stringify(json.errors ?? json) } as never).eq("id", notaId);
      return { ok:false, mensagem:json.message ?? "Erro na Nuvem Fiscal" };
    }
    await supabase.from("notas_fiscais").update({ status:"enviando", nuvem_fiscal_id:json.id } as never).eq("id", notaId);
    return { ok:true, mensagem:"NF-e enviada para processamento." };
  } catch(err) { console.error("emitirNFe:",err); return { ok:false, mensagem:"Erro de conexão." }; }
}

export async function consultarStatusNFe(notaId: number): Promise<void> {
  const nota = await getNotaById(notaId);
  if (!nota?.nuvem_fiscal_id) return;
  try {
    const token = process.env.NEXT_PUBLIC_NUVEM_FISCAL_TOKEN ?? "";
    const res = await fetch(`${NF_API}/nfe/${nota.nuvem_fiscal_id}`, { headers:{ "Authorization":`Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) return;
    const updates: Record<string, unknown> = {};
    if (json.status === "autorizado") {
      updates.status="autorizada"; updates.numero=json.numero?.toString(); updates.chave=json.chave_acesso;
      updates.protocolo=json.protocolo; updates.danfe_url=json.danfe_url; updates.xml_url=json.xml_url;
      updates.dt_autorizacao=new Date().toISOString();
    } else if (json.status === "rejeitado") {
      updates.status="rejeitada"; updates.motivo_rejeicao=json.motivo;
    }
    if (Object.keys(updates).length > 0) await supabase.from("notas_fiscais").update(updates as never).eq("id", notaId);
  } catch(err) { console.error("consultarStatusNFe:",err); }
}