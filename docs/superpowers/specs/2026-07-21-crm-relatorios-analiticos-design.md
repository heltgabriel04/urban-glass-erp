# CRM 6b — Relatórios Analíticos

Item deliberadamente adiado na Leva 2 da auditoria completa do ERP
(2026-07-14) até existir dado real de interação (6a). Usuário pediu pra
retomar em 2026-07-21; escopo definido por pergunta direta (`AskUserQuestion`)
em vez de brainstorm completo, já que o espaço de opções era pequeno e a
restrição técnica principal já era conhecida.

## Restrição que moldou o escopo

`interacoes_cliente` não tem coluna de autoria (sem `vendedor_id`/`usuario`) —
"desempenho por vendedor" foi descartado como opção antes mesmo de perguntar
(mudaria schema, escopo maior). As 4 opções oferecidas foram todas
agregações por cliente/tipo/período, que os dados atuais já suportam. O
usuário escolheu as 4:

1. Follow-ups em atraso (visão geral, não só o badge por cliente já existente)
2. Volume de interações por tipo/mês (tendência)
3. Conversão interação → orçamento
4. Clientes sem contato recente / nunca contatados

## Onde entrou

Nova aba **"CRM"** (11ª) em `app/relatorios/page.tsx` — página já era o hub
de relatórios analíticos do sistema (Faturamento/Clientes/Pedidos/Produção/
Eficiência/Fluxo de Caixa/Estoque/Orçamentos/Fechamento/Qualidade), mesmo
padrão visual/estrutural de cada aba existente (grid de KPI + cards +
tabelas com scroll, usando as variáveis de tema `var(--acc)` etc.). Não virou
página nova nem tab dentro de `/clientes` — evita fragmentar onde o usuário já
olha relatório agregado.

## Lógica (funções puras, testadas em `lib/crmAnalytics.test.ts`)

Toda a lógica de agregação está em `lib/crmAnalytics.ts` — a página só busca
dado bruto e chama as funções.

- **Follow-ups atrasados**: mesma regra do badge já existente em
  `app/clientes/[id]/page.tsx` (`proximo_contato < hoje`) — qualquer
  interação vencida conta, não só a mais recente por cliente. Reaproveitar a
  regra evita a UI agregada e a UI individual discordarem sobre o que é
  "atrasado".
- **Volume por mês**: `interacoes_cliente.data.slice(0,7)` agrupado por tipo.
- **Conversão interação → orçamento**: ancorado na **primeira** interação de
  cada cliente (decisão de engenharia, não perguntada) — mede se o primeiro
  contato comercial gerou orçamento numa janela configurável (30/60/90/180d,
  seletor na UI, default 90). Cliente sem nenhuma interação não entra no
  denominador — a métrica mede eficácia do follow-up, não conversão geral da
  carteira (que já existe em outro lugar do sistema).
- **Clientes sem contato**: só clientes **ativos** (`getClientes(true)`,
  evita ruído de cliente inativo "esquecido"), com limiar configurável
  (30/60/90/180 dias, default 60) — inclui quem nunca teve nenhuma interação
  (`ultimaInteracao: null`, tratado como "infinito" na ordenação).

## Dados novos

`getTodasInteracoes()` em `services/interacoes.service.ts` — todas as
interações de todos os clientes com nome do cliente já embutido (join
`clientes(nome)`), usada só pelos relatórios agregados (a página individual
do cliente continua usando `getInteracoesPorCliente(clienteId)`, inalterada).
**Sem SQL novo** — `interacoes_cliente` já existe desde o 6a.

## Fora de escopo (documentado, não esquecido)

- Desempenho por vendedor — bloqueado por schema (sem autoria).
- Funil completo de vendas (orçamento → pedido → entrega) — isso já existe
  em outras abas deste mesmo relatório (Pedidos/Orçamentos), não duplicado.
- Exportação em PDF da aba CRM — as outras abas deste hub têm export PDF
  próprio (`imprimirRelatorio`), a aba CRM não ganhou essa integração nesta
  rodada (menor prioridade, pode entrar depois se pedido).

## Verificação

`npx tsc --noEmit`, `npm test` (170 passando, 11 novos em
`lib/crmAnalytics.test.ts`), `npm run build`, `npm run lint` — todos limpos.
Sem SQL pendente. Sem smoke test em navegador (mesma limitação recorrente:
sem credencial de teste neste ambiente) — pedir pro usuário abrir
`/relatorios` → aba CRM e conferir os 4 cartões com dado real.
