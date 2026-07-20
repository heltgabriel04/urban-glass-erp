# Arquitetura — Urban Glass ERP

Este documento é o hub central do projeto. Ele não substitui os
documentos de módulo (`docs/modulos/*.md`) — ele existe para registrar
**decisões que atravessam mais de um módulo**, e para dar uma visão
rápida de como as partes do sistema dependem umas das outras.

Regra de manutenção: toda vez que uma decisão tomada dentro de um
módulo afeta outro módulo, ela ganha uma linha aqui apontando para onde
está detalhada. Não duplicar o detalhe completo aqui — só o link e o
porquê de importar.

Última atualização: 2026-07-20

---

## Mapa de módulos

| Módulo | Status da documentação | Dor principal conhecida | Prioridade |
|---|---|---|---|
| APS / Programação | Em construção (ver `modulos/aps.md`) — auditoria concluída, capacidade compartilhada + motor de cotação de prazo já implementados e pushados (2026-07-20) | Responder prazo de entrega ao cliente na hora — resolvido no backend, falta UI e validação com dado real | Alta — em implementação ativa |
| Fiscal (NF-e) | Não documentado ainda | — | A definir |
| Estoque | Não documentado ainda | — | A definir |
| Financeiro / Precificação | Não documentado ainda | Módulo de custo/precificação em construção, decisões pendentes de contador (PEPS vs média ponderada, ICMS-ST/DIFAL) | A definir |
| Cut Optimizer (nesting) | Não documentado ainda | — | A definir |
| Kanban de Produção | Não documentado ainda | — | A definir |

> Preencher "Prioridade" para os demais módulos seguindo o mesmo
> critério usado no APS: qual módulo, se quebrado ou mal desenhado
> hoje, custa mais caro ao negócio à medida que a produção cresce no
> fim do ano?

---

## Decisões cruzadas entre módulos

### 1. m² planejado como métrica única de progresso e custo
- **Onde foi decidido**: `modulos/aps.md`, ao definir como calcular %
  de conclusão de um pedido (m² concluído / m² total, não contagem de
  peça).
- **Por que atravessa módulo**: essa mesma métrica (m² por peça,
  vindo do plano de corte) é a base para custo de matéria-prima no
  módulo Financeiro/Precificação, que já trabalha com camadas de custo
  por lote de importação. Se as duas partes do sistema calcularem m²
  de formas diferentes (ex: arredondamento, ou planejado vs. realmente
  cortado), o custo por pedido e o progresso de produção vão divergir
  silenciosamente.
- **Pendência**: confirmar com o módulo financeiro se o m² usado para
  custo é o mesmo m² planejado do plano de corte, ou se há reconciliação
  contra perda real (retalho, quebra) em algum ponto.

### 2. Rastreamento por peça via QR code (mudança de granularidade)
- **Onde foi decidido**: `modulos/aps.md`.
- **Por que atravessa módulo**: hoje o QR code é gerado por pedido
  inteiro. A mudança para QR por peça (gerado junto ao plano de corte)
  pode afetar o módulo de Cut Optimizer, que hoje provavelmente só sabe
  que "peça X saiu do plano de corte", sem necessariamente expor cada
  peça individual com um identificador estável para consumo por outro
  módulo.
- **Pendência**: verificar se o Cut Optimizer já expõe uma lista
  discreta de peças por plano de corte (com dimensão e ordem), ou se
  essa granularidade precisa ser criada nele também. Ainda não
  implementado — ver seção de rastreamento por peça em `modulos/aps.md`.

### 3. Fluxo "chapa inteira" pula Corte e Lapidação
- **Onde foi decidido**: `modulos/aps.md` (mecanismo já existe no
  código hoje a nível de pedido inteiro, via `isPedidoSomenteChapas`).
- **Por que atravessa módulo**: esse tipo de item pode ter tratamento
  fiscal ou de estoque diferente (venda de chapa inteira vs. peça
  cortada sob medida). Vale confirmar se o módulo Fiscal já distingue
  esses dois casos na emissão de NF-e (CFOP pode diferir).
- **Pendência**: não verificado ainda — próxima análise deveria cruzar
  isso com o módulo Fiscal.

---

## Como usar este documento com Claude Code

Ao abrir uma sessão de Claude Code para trabalhar em qualquer módulo,
referencie este arquivo e o arquivo do módulo específico como contexto
inicial. Isso evita reexplicar decisões já tomadas a cada nova sessão.

Ao tomar uma nova decisão que pareça cruzar módulos, pare e pergunte:
"isso afeta como outro módulo já calcula ou assume algo?" — se sim,
adicionar uma entrada na seção "Decisões cruzadas" acima antes de
seguir.
