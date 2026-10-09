# Fase 2 — auditoria e validação

Data: 09/10/2026 (America/Sao_Paulo). Repositório `devKire/survivor_game`.
Base verificada: `main` em `9b35ab85e106c1f54846bf8717f9516b519af7a4`.
PR #5 integrado por `8f0092a542ffa20df6533e24e051485830aad06e`; a main também
contém o PR #6. A base foi conferida novamente antes da entrega e não avançou.
Branch final: `codex/rpg-phase2`. Nenhum merge automático.

## Auditoria inicial e decisões

| Área encontrada na main | Situação e entrega |
| --- | --- |
| Perfil, atributos, unlocks, revisão, lock e receipts | Fundação 1.5 completa; reutilizada, sem sistema paralelo |
| FKs compostas, slots e pilha equipada | Constraints existentes preservadas, cascata revalidada |
| Catálogo de três itens | IDs preservados, definições completas e três variantes de nível 5 |
| Instâncias sem dados de roll | Migração aditiva com versão, seed e affixes; itens antigos mantidos |
| Equipar/desequipar | Ausente; implementado com ownership, requisitos, CAS e rollback |
| Resolver/loadout/integração | Ausentes; regras puras, build congelada e contexto opcional no motor existente |
| Modo público RPG | Ausente e permanece ausente; harness interno sem recompensas |
| Interface | Listagem básica ampliada com slots, comparação, requisitos e ações autenticadas |
| Recompensas | Não há origem autorizada nesta fase; nenhum grant/loot/crafting foi adicionado |

Leitura prévia incluiu AGENTS, SPEC, arquitetura geral/RPG, baseline, hardening,
schema/migrações, core, progress/economy, realtime, protocolo e páginas existentes.
Guias locais do Next 16 foram consultados antes das alterações de UI/actions.

## Entrega por PR

As cinco branches são empilhadas. Revisar/mesclar A antes de B, B antes de C,
C antes de D e D antes de E, ajustando a base dos PRs restantes para main.

| PR | Branch / base | Commit e conteúdo |
| --- | --- | --- |
| [A — #8](https://github.com/devKire/survivor_game/pull/8) | `codex/rpg-phase2-domain` / `main` | `d2fd57d`: conteúdo, affixes, resolver, build pura e 11 testes de domínio |
| [B — #9](https://github.com/devKire/survivor_game/pull/9) | `codex/rpg-phase2-persistence` / domain | `d85f4ba`: migração, operações atômicas, 9 testes de banco e 2 de migração |
| [C — #10](https://github.com/devKire/survivor_game/pull/10) | `codex/rpg-phase2-combat` / persistence | `b3ca423`: Player/Coop, congelamento, harness, 10 testes de combate, 2 de loadout no banco e 1 realtime |
| [D — #11](https://github.com/devKire/survivor_game/pull/11) | `codex/rpg-phase2-ui` / combat | `b4496ac`: inventário/ficha/preview, action segura, teste browser e ampliação da suíte de actions |
| E | `codex/rpg-phase2` / ui | Benchmark, documentação e relatório de regressão |

## Arquivos

Criados em A:
`src/game/content/rpg/affixes.ts`,
`src/game/core/rpg/combat-types.ts`, `equipment.ts`, `loadout.ts`, `preview.ts`,
`stat-resolver.ts` (todos os cinco últimos em `src/game/core/rpg/`),
`tests/rpg-equipment-domain.test.ts`, `docs/RPG-AFFIXES.md`,
`docs/RPG-COMBAT-STATS.md`.
Modificados: `src/game/content/rpg/catalog.ts`, `src/game/core/rpg/index.ts`.

Criados em B:
`prisma/migrations/20261009100000_rpg_equipment/migration.sql`,
`src/server/rpg/equipment.ts`, `tests/rpg-equipment-database.test.ts`,
`tests/rpg-equipment-migrations.test.ts`, `docs/RPG-EQUIPMENT.md`.
Modificados: `prisma/schema.prisma`, `src/server/rpg/mutations.ts`.

Criados em C:
`src/server/rpg/loadout.ts`, `src/server/rpg/development-session.ts`,
`scripts/rpg-combat-harness.ts`, `tests/rpg-combat.test.ts`,
`tests/rpg-loadout-database.test.ts`, `tests/rpg-equipment-realtime.test.ts`,
`tests/helpers/rpg-realtime-server.ts`, `docs/RPG-LOADOUT.md`.
Modificados: `src/game/core/entities.ts`, `src/game/core/simulation.ts`,
`src/game/core/coop.ts`, `src/realtime/settlement.ts`, `vitest.config.ts`.

Criados em D:
`src/app/rpg/StatsPreview.tsx`, `src/app/rpg/presentation.ts`,
`src/app/rpg/rpg.module.css`, `src/app/rpg/inventory/EquipmentForm.tsx`,
`src/app/rpg/inventory/EquipmentInventory.tsx`,
`src/server/rpg/presentation.ts`, `tests/browser/rpg-equipment.spec.ts`.
Modificados: `src/app/rpg/character/page.tsx`, `src/app/rpg/inventory/page.tsx`,
`src/server/rpg/actions.ts`, `tests/rpg-actions.test.ts`.

Criados em E: `scripts/rpg-benchmark.ts`, `docs/rpg-phase2-performance.json`,
este relatório. Atualizados: `docs/RPG-ARCHITECTURE.md`,
`docs/RPG-COMBAT-STATS.md`, `docs/RPG-BASELINE.md`.
Arquivos de cliente gerados por testes anteriores foram restaurados;
novas medições detalhadas ficam no artefato próprio desta fase.

## Persistência e segurança

- A única migração nova adiciona `contentVersion=1`, `rollSeed=null` e
  `affixes=[]`. Não edita migrações aplicadas nem recria a tabela.
- SQL valida estrutura dos affixes, IDs, duplicatas, tiers, limites numéricos,
  cardinalidade por raridade e seed. O domínio valida também pool/slot, nível,
  grade dos valores e reprodução exata da rolagem.
- Serialização, lock UserProgress, revisão RPG, receipt e retries limitados
  são os da Fase 1.5. Equipar, trocar, transferir e remover são transações únicas.
- Concorrência real cobre requests iguais e diferentes, revisão vencida,
  replay após outras operações e payload divergente. Trigger PostgreSQL injeta
  falha na escrita da substituição após remover o item anterior: rollback total.
- Constraints e testes rejeitam ownership cruzado, slot inválido, pilha,
  requisito de nível/personagem e metadados adulterados. Cascata da conta passa.
- Actions rejeitam userId/stats/affixes/seed/raridade/nível enviados pelo cliente,
  duplicatas e inputs inesperados. Flag desligada e falta de login bloqueiam
  operações; erros internos são mascarados; revisão vencida fica inline.
- Mutações RPG não alteram UserProgress.version nem GOLD/GEMS. Nenhum save local,
  CloudSolo ou comando de cliente concede recurso persistente. Fixtures são
  exclusivas dos testes, não fazem parte de endpoints ou da UI.

## Resultados executados

Ambiente: Node 22.23.3, PostgreSQL 18.4 local, Prisma 7.10.0, Chromium 151.
Banco isolado `limiar_rpg_phase2_20261009`; nenhum banco de produção foi usado.
Migrations executadas também em databases descartáveis para instalação vazia e
upgrade com itens/personagens/dados compatíveis com a Fase 1.5.

Os comandos foram executados com um wrapper local que injeta URL do banco de
teste e Node 22. Os equivalentes no repositório são:

| Comando | Resultado |
| --- | --- |
| `npx prisma validate` | Aprovado |
| `npx prisma generate` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run lint` | 0 erros; 1 aviso preexistente `TAU` em `src/game/client/browser.ts:28` |
| `npm test` | 240 aprovados, 46 ignorados; 24 arquivos aprovados, 10 ignorados |
| `RUN_DATABASE_TESTS=1 npm test` | 280 aprovados, 6 ignorados; 30 arquivos aprovados, 4 ignorados |
| `RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test -- tests/rpg-migrations.test.ts tests/rpg-equipment-migrations.test.ts` | 4 aprovados, nenhum ignorado |
| `RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts` | 2 aprovados, nenhum ignorado |
| `npm run build` | Aprovado, incluindo páginas RPG dinâmicas |
| `RPG_ENABLED=true PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser -- tests/browser/rpg.spec.ts tests/browser/rpg-equipment.spec.ts` | 3 aprovados, 1 ignorado (caso exclusivo da flag desligada, aprovado na execução completa) |
| `RPG_ENABLED=false PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` | 6 aprovados, 2 falhos, 3 ignorados (casos exclusivos de RPG habilitado) |

Os seis ignorados na execução com banco correspondem aos dois testes realtime
e quatro testes de migração que exigem também `RUN_MIGRATION_TESTS=1`.
A execução padrão deixa também 40 testes dependentes do banco ignorados.
Os testes de migração e realtime são executados separadamente com suas flags;
skips não foram tratados como aprovações.
Somando os conjuntos sem duplicar casos repetidos, os 286 casos Vitest foram
executados e aprovados nas configurações correspondentes.

As duas falhas da suíte completa são, individualmente:

1. `tests/browser/stability.spec.ts` — `V16/V17/V18 stability 2 clients`:
   esperado `remoteGameInstances=1`, observado 0 após 60,758 segundos.
2. `tests/browser/stability.spec.ts` — `V16/V17/V18 stability 5 clients`:
   esperado `remoteGameInstances=1`, observado 0 após 64,351 segundos.

Nos dois cenários, todos os clientes também tinham `rafLoops=0`, sem erros
capturados no browser. A mesma asserção já foi reproduzida no commit-base durante
o hardening: ver [RPG-HARDENING.md](RPG-HARDENING.md). Nenhum desses testes foi
alterado ou relaxado nesta entrega. Portanto a suíte completa de navegador
**não está aprovada**. As evidências atuais ficam em
`artifacts/rpg-phase2/stability-after-{2,5}-natural.json` e traces preservados em
`artifacts/rpg-phase2/browser-disabled-results/` no workspace.

Execuções intermediárias não foram todas verdes: houve interrupção inicial do
PostgreSQL (`57P03`), expectativa de código SQL corrigida (JSON inválido pode
retornar `22023` além de CHECK `23514`), um fixture de loadout com campos extras,
um timeout de teardown IPC do teste realtime e um seletor browser amplo que
incluía o announcer do Next. Esses casos foram corrigidos e as suítes afetadas
foram executadas novamente com os resultados acima.

Uma tentativa de browser com `PLAYWRIGHT_PRODUCTION=1` foi interrompida após
2 aprovações e 1 timeout de economia: a configuração de produção já existente
recusa autenticação em HTTP/localhost e mostrou “Online indisponível”. Um caso
online foi interrompido e sete não chegaram a executar. O PostgreSQL local também
foi encerrado pelo ambiente nessa janela, causando 4 falhas de migração e erro
de conexão no cleanup do caso online. O serviço local foi reiniciado; as quatro
migrações passaram no rerun acima. A suíte browser foi reiniciada com Next dev,
adequado ao localhost, sem relaxar a proteção de origem HTTPS em produção.

## Performance e limites de balanceamento

O benchmark foi executado sem outra suíte concorrente. Quinze simulações:
aquecimento dos três cenários e quatro rodadas alternadas, cada uma com cinco
jogadores, 1.100 inimigos, seed fixa, seis armas evoluídas por jogador, 400 ticks
(100 descartados para aquecimento). Inimigos permaneceram em 1.100 em todos os
cenários. HP alto é uma fixture de carga, não uma regra de gameplay.

| Cenário | Média update | Média incluindo snapshots | P95 update, faixa das quatro rodadas |
| --- | --- | --- | --- |
| Survivor | 2,143 ms | 4,150 ms | 3,333–3,702 ms |
| RPG sem bônus | 2,189 ms | 4,241 ms | 3,335–4,142 ms |
| RPG com build nível 100/lendários | 2,455 ms | 4,745 ms | 3,403–5,665 ms |

RPG vazio variou cerca de +2,2% no update; a build completa, +14,6%, inclui
mais ataques/efeitos por cooldown, duração e crítico. Não há consulta, parse ou
roll no hot path. Mesmo a maior rodada ficou abaixo do orçamento de 40 ms a
25 Hz. Isso é evidência local de carga, não garantia de capacidade de produção.
Recálculo médio em 10.000 chamadas: 0,00265 ms clássico e 0,00339 ms RPG.
Dados brutos: [rpg-phase2-performance.json](rpg-phase2-performance.json).

Combate real com Ember demonstrou razões de dano 1,00 / 1,01 / 1,05 para
clássico / atributos / atributos+equipamento. A build extrema de Orin do
benchmark tem estimativa de DPS direto 1,464×; área e duração exigem avaliação
por arma. Os caps não concedem projéteis ou growth e não reduzem bônus clássicos.

## Compatibilidade e riscos residuais

Survivor, co-op clássico e PvP passaram nos testes de core/regressão; o protocolo
realtime real passou com cinco clientes e com builds RPG individuais. PvP rejeita
contexto RPG. Equipment WEAPON não substitui Ember/Well/Disc/Chain. SAVE_SCHEMA=3,
ECONOMY_VERSION=2, RunState, RunSnapshot, World/worldVersion/IDs, inventário de
quatro slots, catálogo Survivor, economia e protocolos não foram alterados.

Não há expedição RPG pública nem recuperação de build após reinício do processo;
o ciclo de vida atual interrompe sessões. UI mostra estimativa nível temporário 1
sem meta/passivas, claramente identificada. Itens desconhecidos/corrompidos
permanecem removíveis; builds inválidas não têm preview nem entrada em combate.

Migração exige lock de tabela e usa timeout de cinco segundos; planejar janela
conforme volume real. Conteúdo v1 deve permanecer imutável; versões futuras
exigem catálogo e migração compatíveis. O adapter-pg emite aviso de depreciação de
queries concorrentes, sem falhas nas execuções finais documentadas.

A Fase 3 depende de origem autoritativa, seed segura, recibos de concessão,
regras de recompensa e autorização/lifecycle da expedição. Loot, crafting,
comércio, quests, grants públicos e novo modo público não foram iniciados.
