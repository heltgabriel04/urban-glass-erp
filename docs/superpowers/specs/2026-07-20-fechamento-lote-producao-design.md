# Fechamento em lote corrompendo dados reais de produção

## Problema

`reconciliarProgramacaoComPedido()` (`services/programacao.service.ts:1143`) roda
sempre que o **status de um pedido** avança/retrocede (chamada de
`services/pedidos.service.ts:302,348`, via `avancarStatusPedido`/
`retrocederStatusPedido`, tipicamente a partir da tela de Pedidos). Ela busca
**todos os blocos de `programacao_producao` daquele pedido** e, num loop, marca
`dt_inicio_real`/`dt_fim_real = now()` em qualquer bloco da etapa alvo que
ainda esteja vazio.

Como `programacao_producao` tem granularidade por item (`item_pedido_id`, uma
linha por item × etapa), um pedido com N itens tem N blocos de Corte
separados. Avançar o status do pedido uma vez carimba todos eles com o mesmo
instante — mesmo que fisicamente cada peça tenha sido cortada em momentos bem
diferentes ao longo do dia (ou de vários dias). Esse carimbo administrativo
contamina silenciosamente a calibração de tempos (Fase 4 do APS,
`getCalibracaoTempos()`), que lê `dt_fim_real - dt_inicio_real` como duração
real de produção pra recalibrar as taxas de `config_tempo_producao`.

O caminho alternativo, `atualizarStatusProgramacao()` (`services/
programacao.service.ts:1175`, chamado só de `app/programacao/page.tsx:1591/
1597` — clique direto num bloco específico no Gantt), grava o timestamp de
**um único bloco**, de forma deliberada. Essa é a assinatura exata que separa
os dois casos: não precisa de heurística de janela de tempo para o código
novo, só para o backfill dos dados já gravados (que não guardam qual caminho
os escreveu).

## Solução

### 1. Schema

```sql
ALTER TABLE programacao_producao
  ADD COLUMN IF NOT EXISTS horario_real_estimado boolean NOT NULL DEFAULT false;
```

`true` = esse `dt_inicio_real`/`dt_fim_real` não é uma observação real e
deliberada daquele bloco específico — é um carimbo administrativo herdado do
avanço de status do pedido. Nome descreve o que é (uma estimativa), não como
foi detectado, para servir tanto ao código novo quanto ao backfill histórico.

### 2. Write path

- `reconciliarProgramacaoComPedido()`: todo `update` que ela executa passa a
  incluir `horario_real_estimado: true` — é sempre um carimbo em lote por
  definição, mesmo para pedido de 1 item só (não é uma observação por bloco).
- `atualizarStatusProgramacao()`: continua gravando `horario_real_estimado:
  false` (valor default da coluna) — ação real e específica daquele bloco.

### 3. Calibração

`getCalibracaoTempos()` (`services/programacao.service.ts:1469`) ganha
`.eq('horario_real_estimado', false)` no select, para a Fase 4 nunca mais
aprender com números de carimbo em lote.

### 4. Backfill histórico

Script único (não trigger, roda uma vez), aplicando a assinatura real do bug:
entre linhas `status = 'Concluído'` com `item_pedido_id` preenchido, agrupa por
`pedido_id + etapa` e marca `horario_real_estimado = true` em todo grupo com
2+ linhas cujo `dt_fim_real` caia dentro de uma janela de 60s entre si (a
função roda vários `await` sequenciais — mesmo um pedido grande fecha em
segundos, não minutos).

**Limitação documentada, não resolvida:** pedidos de 1 item só não têm como
ser diferenciados retroativamente por essa assinatura — um único carimbo em
lote é indistinguível de um clique real no bloco. Fica sem marcação; não é
uma tentativa de adivinhar.

### 5. Indicador visual no Gantt

`iconeBloco()`/`corBloco()` (`app/programacao/page.tsx:99-136`) resolvem
cor/ícone por urgência; blocos com `horario_real_estimado = true` ganham um
indicador adicional sobreposto no card (ícone `lucide-react`, consistente com
a Fase 7 visual) com tooltip "Horário estimado — pedido avançado em lote, não
é uma medição real desse bloco". `LegendaCores` ganha uma entrada nova.

## Fora de escopo (fica para os próximos sub-projetos)

- Impedir fisicamente que o avanço de status do pedido carimbe os blocos —
  isso é o que o sub-projeto #2 (scan real por item, via QR) resolve de
  verdade, mudando a origem do timestamp em vez de só sinalizar.
- Modelo de capacidade/recursos (sub-projeto #3), sem relação com este bug.
