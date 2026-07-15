import { supabase } from '@/lib/supabase/client';
import type { NotaFiscal, NotaFiscalInsert, Pedido, Cliente } from "@/types";
import { registrarLog } from './log.service';
import { getConfigPadrao, getConfigFiscalProdutos } from './contabilidade.service';
import { resolverFiscalItem } from '@/lib/fiscal';

// ─── HELPERS DE DATA ───────────────────────────────────────

/** Gera data/hora atual no fuso -03:00 (Brasília) corretamente. */
function dtBrasilia(): string {
  const now = new Date();
  // Subtrai 3 horas para converter UTC → BRT
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

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
    valor_ipi: 0,
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
  registrarLog({ acao: "excluiu", tabela: "notas_fiscais", registro_id: String(id), descricao: `Excluiu rascunho de NF-e #${id}` });
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

/** Chama a API route server-side para emitir uma NF-e via FocusNFe. */
async function chamarEmitirNFe(ref: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch("/api/notas/emitir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, payload }),
  });
}

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

/** Retorna os campos de destinatário no formato flat do FocusNFe. */
function montarCamposDestFlat(c: Cliente): Record<string, unknown> {
  const docRaw = (c.tipo_pessoa === "PF" ? c.cpf : c.cnpj).replace(/\D/g, "");
  return {
    ...(c.tipo_pessoa === "PF" ? { cpf_destinatario: docRaw } : { cnpj_destinatario: docRaw }),
    nome_destinatario:                         c.nome,
    indicador_inscricao_estadual_destinatario: String(c.ind_ie ?? "9"),
    indicador_consumidor_final:                c.consumidor_final ? "1" : "0",
    ...(c.ie && c.ind_ie === "1" ? { inscricao_estadual_destinatario: c.ie.replace(/\D/g, "") } : {}),
    ...(c.email ? { email_destinatario: c.email } : {}),
    logradouro_destinatario:       c.logradouro || c.endereco,
    numero_destinatario:           c.numero     || "S/N",
    ...(c.complemento ? { complemento_destinatario: c.complemento } : {}),
    bairro_destinatario:           c.bairro     || "Centro",
    municipio_destinatario:        c.cidade,
    uf_destinatario:               c.uf.toUpperCase(),
    pais_destinatario:             "Brasil",
    cep_destinatario:              c.cep.replace(/\D/g, ""),
    codigo_municipio_destinatario: c.cod_ibge,
  };
}

// ─── EMISSÃO COMPLETA ──────────────────────────────────────

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

  const ref        = `UG-${form.pedido_id}-${notaId}`;
  const cfopNum    = form.cfop_padrao.replace(".", "");
  const aliqPct    = form.cfop_padrao.startsWith("5") ? 18 : 12;
  const dtEmissao  = dtBrasilia();

  // Payload no formato flat do FocusNFe — emitente injetado server-side
  const payload: Record<string, unknown> = {
    natureza_operacao:  form.natureza_op,
    data_emissao:       dtEmissao,
    tipo_documento:     "1",
    finalidade_emissao: form.finalidade || "1",
    ...(form.dt_saida ? { data_entrada_saida: `${form.dt_saida}T${form.hora_saida || "00:00"}:00-03:00` } : {}),
    // Destinatário (campos flat)
    ...montarCamposDestFlat(cliente),
    // Itens
    items: form.itens.map((item, i) => ({
      numero_item:                  String(i + 1),
      codigo_produto:               `ITEM-${String(i+1).padStart(3,"0")}`,
      descricao:                    item.produto_nome,
      codigo_ncm:                   item.ncm || "70031200",
      cfop:                         (item.cfop || cfopNum).replace(".", ""),
      unidade_comercial:            item.unidade,
      quantidade_comercial:         String(Number(item.quantidade.toFixed(4))),
      valor_unitario_comercial:     String(Number(item.valor_unitario.toFixed(4))),
      valor_unitario_tributavel:    String(Number(item.valor_unitario.toFixed(4))),
      unidade_tributavel:           item.unidade,
      quantidade_tributavel:        String(Number(item.quantidade.toFixed(4))),
      valor_bruto:                  String(Number(item.valor_bruto.toFixed(2))),
      ...(item.lapidacao > 0 ? { outras_despesas: String(Number(item.lapidacao.toFixed(2))) } : {}),
      icms_situacao_tributaria:     "00",
      icms_origem:                  "0",
      icms_modalidade_base_calculo: "3",
      icms_base_calculo:            String(Number(item.valor_bruto.toFixed(2))),
      icms_aliquota:                String(aliqPct),
      icms_valor:                   String(Number(item.valor_icms.toFixed(2))),
      pis_situacao_tributaria:      "01",
      pis_base_calculo:             String(Number(item.valor_bruto.toFixed(2))),
      pis_aliquota_porcentual:      "1.65",
      pis_valor:                    String(Number(item.valor_pis.toFixed(2))),
      cofins_situacao_tributaria:   "01",
      cofins_base_calculo:          String(Number(item.valor_bruto.toFixed(2))),
      cofins_aliquota_porcentual:   "7.60",
      cofins_valor:                 String(Number(item.valor_cofins.toFixed(2))),
      ...(item.ipi_pct > 0 ? {
        ipi_situacao_tributaria: "50",
        ipi_aliquota:            String(item.ipi_pct),
        ipi_valor:               String(Number(item.valor_ipi.toFixed(2))),
      } : {}),
    })),
    // Totais
    valor_produtos:  String(Number(valorProdutos.toFixed(2))),
    valor_desconto:  String(Number(form.valor_desconto.toFixed(2))),
    valor_frete:     String(Number(form.valor_frete.toFixed(2))),
    valor_seguro:    String(Number(form.valor_seguro.toFixed(2))),
    outras_despesas: String(Number(form.valor_outros.toFixed(2))),
    valor_total:     String(Number(valorNota.toFixed(2))),
    // Transporte
    modalidade_frete: String(form.modalidade_frete),
    ...(form.transportadora ? { nome_transportadora: form.transportadora } : {}),
    ...(form.placa_veiculo  ? { placa_veiculo: form.placa_veiculo, uf_veiculo: form.uf_veiculo || undefined, rntc: form.rntc || undefined } : {}),
    ...(form.volumes ? {
      quantidade_volumes: form.volumes,
      especie_volumes:    form.especie_volume || "UN",
      peso_bruto:         form.peso_bruto   || "0",
      peso_liquido:       form.peso_liquido || "0",
    } : {}),
    // Pagamento
    forma_pagamento: form.forma_pgto || "99",
    ...(form.obs_contribuinte ? { informacoes_adicionais: form.obs_contribuinte } : {}),
  };

  try {
    const res  = await chamarEmitirNFe(ref, payload);
    const json = await res.json();
    if (!res.ok) {
      const motivo = json.mensagem_sefaz ?? json.mensagens_erro?.[0]?.mensagem ?? JSON.stringify(json);
      await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo } as never).eq("id", notaId);
      return { ok: false, mensagem: json.mensagem_sefaz ?? "Erro no FocusNFe" };
    }
    await supabase.from("notas_fiscais").update({ status: "enviando", nuvem_fiscal_id: ref } as never).eq("id", notaId);
    registrarLog({
      acao: "emitiu", tabela: "notas_fiscais", registro_id: String(notaId),
      descricao: `Emitiu NF-e #${notaId} para pedido ${p.form.pedido_id}`,
      campos_alterados: { ref, pedido_id: p.form.pedido_id, valor_nota: p.valorNota },
    });
    return { ok: true, mensagem: "NF-e enviada para processamento." };
  } catch (err) {
    console.error("emitirNFeCompleta:", err);
    return { ok: false, mensagem: "Erro de conexão com FocusNFe." };
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

  const ref          = `UG-${pedido.id}-${notaId}`;
  const dentroEstado = nota.cfop.startsWith("5");
  const dtEmissao    = dtBrasilia();
  const itensPedido  = pedidoCompleto.itens_pedido ?? [];
  const produtoIds   = Array.from(new Set(
    itensPedido.map(item => item.produto_id).filter((id): id is number => id != null)
  ));
  const [configPadrao, configProdutos] = await Promise.all([
    getConfigPadrao(),
    getConfigFiscalProdutos(produtoIds),
  ]);

  const payload: Record<string, unknown> = {
    natureza_operacao:  nota.natureza_op,
    data_emissao:       dtEmissao,
    tipo_documento:     "1",
    finalidade_emissao: "1",
    // Destinatário
    ...montarCamposDestFlat(cliente),
    // Itens
    items: itensPedido.map((item, i) => {
      const vItem  = Number(item.subtotal);
      const qtd    = Number(item.m2) * item.quantidade;
      const vUnit  = qtd > 0 ? vItem / qtd : Number(item.valor_m2);
      const fiscal = resolverFiscalItem({
        produtoId: item.produto_id, valorBruto: vItem, dentroEstado,
        configProdutos, configPadrao,
      });
      return {
        numero_item:                  String(i + 1),
        codigo_produto:               item.produto_id?.toString() ?? `ITEM-${String(i+1).padStart(3,"0")}`,
        descricao:                    item.produto_nome,
        codigo_ncm:                   fiscal.ncm,
        cfop:                         fiscal.cfop.replace(".", ""),
        unidade_comercial:            "M2",
        quantidade_comercial:         String(Number(qtd.toFixed(4))),
        valor_unitario_comercial:     String(Number(vUnit.toFixed(4))),
        valor_unitario_tributavel:    String(Number(vUnit.toFixed(4))),
        unidade_tributavel:           "M2",
        quantidade_tributavel:        String(Number(qtd.toFixed(4))),
        valor_bruto:                  String(Number(vItem.toFixed(2))),
        ...(item.lapidacao > 0 ? { outras_despesas: String(Number(item.lapidacao.toFixed(2))) } : {}),
        icms_situacao_tributaria:     fiscal.cst,
        icms_origem:                  "0",
        icms_modalidade_base_calculo: "3",
        icms_base_calculo:            String(Number(vItem.toFixed(2))),
        icms_aliquota:                String(fiscal.aliq_icms),
        icms_valor:                   String(Number(fiscal.valor_icms.toFixed(2))),
        pis_situacao_tributaria:      "01",
        pis_base_calculo:             String(Number(vItem.toFixed(2))),
        pis_aliquota_porcentual:      String(fiscal.aliq_pis),
        pis_valor:                    String(Number(fiscal.valor_pis.toFixed(2))),
        cofins_situacao_tributaria:   "01",
        cofins_base_calculo:          String(Number(vItem.toFixed(2))),
        cofins_aliquota_porcentual:   String(fiscal.aliq_cofins),
        cofins_valor:                 String(Number(fiscal.valor_cofins.toFixed(2))),
      };
    }),
    // Totais
    valor_produtos:  String(Number(nota.valor_produtos.toFixed(2))),
    valor_desconto:  "0.00",
    valor_frete:     "0.00",
    valor_seguro:    "0.00",
    outras_despesas: "0.00",
    valor_total:     String(Number(nota.valor_total.toFixed(2))),
    modalidade_frete: "9",
    forma_pagamento:  "01",
    ...(cliente.obs_nfe ? { informacoes_adicionais: cliente.obs_nfe } : {}),
  };

  try {
    const res  = await chamarEmitirNFe(ref, payload);
    const json = await res.json();
    if (!res.ok) {
      const motivo = json.mensagem_sefaz ?? json.mensagens_erro?.[0]?.mensagem ?? JSON.stringify(json);
      await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo } as never).eq("id", notaId);
      return { ok: false, mensagem: json.mensagem_sefaz ?? "Erro no FocusNFe" };
    }
    await supabase.from("notas_fiscais").update({ status: "enviando", nuvem_fiscal_id: ref } as never).eq("id", notaId);
    registrarLog({
      acao: "emitiu", tabela: "notas_fiscais", registro_id: String(notaId),
      descricao: `Emitiu NF-e #${notaId} para pedido ${pedido.id}`,
      campos_alterados: { ref, pedido_id: pedido.id },
    });
    return { ok: true, mensagem: "NF-e enviada para processamento." };
  } catch(err) { console.error("emitirNFe:", err); return { ok: false, mensagem: "Erro de conexão." }; }
}

export async function consultarStatusNFe(notaId: number): Promise<{ ok: boolean; mensagem: string }> {
  const nota = await getNotaById(notaId);
  if (!nota?.nuvem_fiscal_id) return { ok: false, mensagem: "Nota ainda não foi enviada para o FocusNFe." };
  try {
    const res = await fetch(`/api/notas/consultar/${nota.nuvem_fiscal_id}`);
    const json = await res.json();
    if (!res.ok) {
      const motivo = json.mensagem_sefaz ?? json.mensagens_erro?.[0]?.mensagem ?? "Erro ao consultar status no FocusNFe.";
      return { ok: false, mensagem: motivo };
    }
    const updates: Record<string, unknown> = {};
    let mensagem = "Nenhuma mudança de status — ainda em processamento na SEFAZ.";
    if (json.status === "autorizado") {
      updates.status         = "autorizada";
      updates.numero         = json.numero?.toString();
      updates.chave          = json.chave_nfe;
      updates.protocolo      = json.protocolo;
      updates.danfe_url      = json.caminho_danfe;
      updates.xml_url        = json.caminho_xml_nota_fiscal;
      updates.dt_autorizacao = new Date().toISOString();
      mensagem = "NF-e autorizada.";
    } else if (json.status === "erro_autorizacao" || json.status === "denegado") {
      updates.status          = "rejeitada";
      updates.motivo_rejeicao = json.mensagem_sefaz ?? json.mensagens_erro?.[0]?.mensagem ?? json.status;
      mensagem = `NF-e rejeitada: ${updates.motivo_rejeicao}`;
    } else if (json.status === "cancelado") {
      updates.status = "cancelada";
      mensagem = "NF-e cancelada.";
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("notas_fiscais").update(updates as never).eq("id", notaId);
      if (error) return { ok: false, mensagem: "Status consultado, mas falhou ao salvar no sistema." };
    }
    return { ok: true, mensagem };
  } catch (err) {
    console.error("consultarStatusNFe:", err);
    return { ok: false, mensagem: "Erro de conexão ao consultar o FocusNFe." };
  }
}