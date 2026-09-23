# Fase 1 — Gemas/Ouro

Auditoria: [ECONOMY-AUDIT.md](ECONOMY-AUDIT.md). Estado anterior: ouro comum em drops,
run, melhorias e JSON de progresso, sem ledger. Arquivos envolvidos: core/save,
simulation/coop/world, content/catalog, browser/RemoteGame, protocol/snapshots,
server/progress/actions, realtime/settlement, AccountClient, Prisma e testes econômicos.

Arquitetura: carteira única permanece em UserProgress.data. CurrencyTransaction registra
crédito/débito, moeda, origem, referência, saldo posterior e metadata. Locks de linha,
transação e unique(userId,currency,referenceId) protegem compras/recompensas concorrentes.
Compra usa rank esperado; repetir request não compra outro nível. Saldo inteiro 0..1e9.

Migration aplicada: 20260923213000_economy_gems, transação SQL com constraints de saldo.
9 contas: 995 Ouro antigo → 995 Gemas, 0 Ouro novo. Melhorias e arquivos solo preservados.
Não havia partidas ativas. Ledger registra saldo anterior. Arquivo local migra ao abrir;
import/archive nunca financia economia online. Coop de um jogador permite PvE autoritativo.

Fontes: drops comuns/urnas/baús/conclusão/conquistas ordinárias → Gemas.
Conclusões 10/15/30 min → 2/3/6 Ouro; conquistas complete/gardens/austere/third_phase
pagam em Ouro, valor antigo/10 arredondado para cima. Demais conquistas preservam valor
numérico em Gemas. Conquistas já registradas não pagam novamente.
Sink: melhorias existentes em Gemas, mesmos preços e níveis. Altar da Memória usa XP
exclusiva da run, sem gastar carteira. Sem câmbio ou monetização de poder.
PvP ainda inexistente; nenhuma alegação de implementação competitiva nesta fase.

Novos arquivos: core/economy.ts, server/economy.ts, migration, audit-economy.ts,
economy-balance.ts, economy.test.ts, economy-database.test.ts, browser/economy.spec.ts.
Telemetria: ledger por fonte e moeda, GameSessionMember.reward em Gemas com moeda
explícita no result e goldReward separado; relatórios de balanceamento/carga em docs.

Validação concluída antes da orientação de reduzir testes:
- Prisma validate/generate: passaram; migrate deploy aplicado; migrate status atualizado.
- Typecheck/lint/build: passaram.
- npm test: 64 aprovados; 12 integrações ignoradas sem flags (executadas separadamente).
- PostgreSQL: 11 aprovados, incluindo SQL ensaiada com rollback, double-click, saldo,
  grants repetidos, rollback, import forjado, settlement concorrente e social/auth.
- WebSocket: cinco clientes, RTT simulado 0/50/100/150/250 ms, reconnect, sem duplicação.
- Chrome: cinco testes aprovados (economia offline, dois contextos comprando um rank,
  resume legado, coop/social de dois e três browsers).
- Carga headless: 5 jogadores/1.100 inimigos/300 ticks; p95 total 18,24 ms;
  heap 20,95 MiB; snapshots médios 30–47 KB, aproximadamente 301–471 KB/s por cliente.
- Bots invulneráveis sem conquistas: 936/1605/3929 Gemas em 10/15/30 minutos;
  2/3/6 Ouro. Não representa dificuldade humana nem uma amostra de jogadores.

Regressões: import reutilizava snapshot bruto e resume ignorava duração; corrigidos.
Falhas de DNS/subprocesso no sandbox resolvidas executando com permissão.
Estabilidade adicional com 5 Chrome/500 inimigos/60s também passou; métricas em
stability-after-5-500.json. Não repetida após orientação de reduzir testes.

Implantação: web e realtime devem usar a mesma revisão (own.gems substitui own.gold).
Nenhum deploy/push de aplicação foi realizado nesta fase. Banco já está migrado.
