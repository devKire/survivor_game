# Fase 5 — relatório de implementação e QA

Relatório: 13/10/2026 (America/Sao_Paulo). Base verificada novamente em origin/main: `b802757932ab721a2e044f452829c7a533901c38`, Fase 4 / PR #25. Branch consolidada: `codex/rpg-phase5`. Nenhum merge ou rollout de produção realizado; Fase 6 não iniciada.

## Resultado e auditoria

A Fase 4 oferecia Refúgio local, depósito, perfil/build persistente e expedições de combate. Não havia uma região autorizada de exploração, gathering ou diário de descobertas. O Refúgio local não pode provar posição para recompensas; o ledger de combate da Fase 3 tampouco pode ser reutilizado como grant de recursos.

A atividade `RPG_EXPLORATION` agora segue Refúgio → preparação → lobby READY/START → movimento autoritativo → descoberta/coleta → saída → Refúgio/depósito/diário. Reutiliza Team, GameSession, tickets, CoopSimulation, World, colisão, RemoteGame, snapshots e renderer. A região inicial é finita e não tem ondas, combate, XP ou recompensa por conclusão.

- Região: Arredores das Ruínas, nove chunks, seed pública canônica, worldVersion 3, geração/conteúdo/regras 1, duração 900 s. Geração real: 22 recursos e nove POIs; máximo teórico 27 recursos.
- Gathering: minério/fibra (2 unidades), cristal (1 pó do Obelisco); 1,2–2,2 segundos reais e simulados. Direitos pessoais por conta/nó/versão/dia UTC, limites de 12/sessão e 18/ciclo.
- Persistência: sessão, participantes/builds congeladas, descobertas e claims. Locks Team → sessão → UserProgress, Serializable, retries limitados, revisão RPG e duas chaves de idempotência. Sem incremento de UserProgress.version.
- Protocolo: intenções estritas e mensagem pessoal EXPLORATION_STATE. Estrutura de Snapshot/RunSnapshot/RunState preservada; posições, tempo concluído, materiais e quantidades não são aceitos do cliente.
- UI: `/rpg/exploration`, `/rpg/discoveries`, portal no Refúgio, HUD, progresso, controles de toque, reconexão, diário paginado e retorno. Assets canônicos reutilizados; props de gathering são provisórios, documentados no inventário de arte.

Detalhes: [arquitetura](RPG-EXPLORATION.md), [regiões](RPG-EXPLORATION-REGIONS.md), [POIs](RPG-POIS.md), [gathering](RPG-GATHERING.md), [persistência](RPG-RESOURCE-PERSISTENCE.md), [segurança/rollout](RPG-EXPLORATION-SECURITY.md).

## Integridade e correções verificadas

A migração aditiva `20261012100000_rpg_exploration/migration.sql` cria quatro tabelas no schema limiar, FKs compostas de ownership, índices de consulta/unicidade, checks e triggers de imutabilidade. Amplia somente os tipos permitidos de Team/GameSession, conservando defaults Survivor. As doze migrações históricas não mudam. Testes aplicam todo o histórico tanto em banco vazio quanto sobre dados da Fase 4 com personagens, item equipado, stash, materiais e receipt de expedição.

Durante QA foram corrigidos: inicialização do renderer ao receber delta antes do primeiro estado completo; chat sobrepondo controle mobile; descoberta automática invalidando a revisão de uma coleta em andamento; conflitos serializáveis entre cinco conclusões locais simultâneas (fila de eventos discretos por sala, mantendo proteção PostgreSQL); refresh substituindo flags de operação pendente; e exibição de esgotamento no ciclo novo para coleta iniciada antes da meia-noite.

Falhas de escrita revertem material/revisão/claim juntos. Replay pós-commit lê o receipt. Reinício interrompe sessões sem fabricar posição ou coleta perdida. Desconexão cancela coleta; reconexão recupera apenas dados confirmados. Writer valida descritores canônicos além da capacidade associada à simulação; não existe endpoint público de grant.

## Validação reproduzível

Ambiente: Node 22.23.3, Next 16.3.5, Prisma 7.10, PostgreSQL 18.4 local isolado e Chromium headless. Banco descartável com as 13 migrações. Suítes de banco/realtime/browser executadas sequencialmente porque usam locks/fault injection e recuperação de sessões no mesmo banco de teste. Flags desligadas por padrão; testes de gameplay ligam explicitamente RPG, Refúgio, expedições e exploração nos processos necessários.

| Comando / cenário | Resultado | Aprovados | Falhos | Ignorados | Evidência |
|---|---|---:|---:|---:|---|
| `npm test` na main de partida | aprovado | 264 | 0 | 68 | [baseline](qa/exploration/logs/rpg5-baseline.log) |
| `npx prisma validate` | aprovado | — | 0 | — | [validate](qa/exploration/logs/rpg5-prisma-validate.log) |
| `npx prisma generate` | aprovado | — | 0 | — | [generate](qa/exploration/logs/rpg5-prisma-generate.log) |
| `npm run typecheck` | aprovado | — | 0 | — | [typecheck](qa/exploration/logs/rpg5-typecheck-delivery.log) |
| `npm run lint` | aprovado, aviso TAU preexistente | — | 0 | — | [lint](qa/exploration/logs/rpg5-lint-delivery.log) |
| `npm run build` | aprovado | — | 0 | — | [build](qa/exploration/logs/rpg5-build-delivery.log) |
| `npm test` | aprovado | 272 | 0 | 81 | [unitários](qa/exploration/logs/rpg5-unit-final2.log) |
| `RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test` | aprovado | 347 | 0 | 4 | [banco e migrações](qa/exploration/logs/rpg5-database-final.log) |
| `RUN_DATABASE_TESTS=1 npm test -- tests/rpg-exploration-recovery.test.ts` | aprovado, dois casos adicionados depois da suíte ampla | 2 | 0 | 0 | [recuperação](qa/exploration/logs/rpg5-recovery.log) |
| `RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts tests/rpg-expedition-realtime.test.ts tests/rpg-exploration-realtime.test.ts` | três suítes existentes aprovadas; teste novo aguardava partida sem confirmar seleção na Arena | 3 | 1 | 0 | [realtime amplo](qa/exploration/logs/rpg5-realtime-final.log) |
| `RUN_REALTIME_TESTS=1 npm test -- tests/rpg-exploration-realtime.test.ts` | aprovado após usar ARENA_LOCK_SELECTION público | 1 | 0 | 0 | [realtime novo](qa/exploration/logs/rpg5-realtime-target-final.log) |
| `npm run assets:tiles:validate` | aprovado | — | 0 | — | [tiles](qa/exploration/logs/rpg5-tiles.log) |
| `npm run assets:tiles:qa` | 24 pranchas geradas | — | 0 | — | [QA atlas](qa/exploration/logs/rpg5-tiles-qa.log) |
| `scripts/qa-world-tiles.mjs` com Chromium instalado | 18 cenas, terreno remoto igual ao offline, fallback e zero erros | 18 cenas | 0 | 0 | [QA mundo](qa/exploration/logs/rpg5-world-qa.log) |
| `npm run test:browser` com flags habilitadas | falhas históricas de estabilidade | 13 | 2 | 1 | [browser amplo](qa/exploration/logs/rpg5-browser-full-final.log) |
| `npm run test:browser -- tests/browser/rpg-exploration.spec.ts` | aprovado, inclui rede offline, outra conta e reentrada adicionados após a suíte ampla | 2 | 0 | 0 | [browser exploração](qa/exploration/logs/rpg5-browser-target-final2.log) |
| `npm run test:browser -- tests/browser/rpg.spec.ts tests/browser/rpg-exploration.spec.ts` com flags falsas | gates aprovados | 2 | 0 | 3 | [RPG desligado](qa/exploration/logs/rpg5-browser-off.log) |
| `npm run test:browser -- tests/browser/rpg-exploration.spec.ts` com RPG=true e EXPLORATION=false | gate independente aprovado | 1 | 0 | 1 | [exploração desligada](qa/exploration/logs/rpg5-browser-exploration-off.log) |

A suíte ampla **não ficou verde**: `tests/browser/stability.spec.ts:102`, dois e cinco clientes, continua recebendo `remoteGameInstances=0` onde espera 1. São as duas falhas preexistentes documentadas na [Fase 4](RPG-PHASE4-QA.md), com assertions inalteradas. Todos os demais testes executados nessa suíte passaram. O teste ampliado de exploração passou separadamente após limitar o script de diagnóstico à origem HTTP da aplicação (a navegação offline cria um documento de erro opaco do Chromium).

Os ignorados no comando padrão exigem opt-ins de banco/realtime. Os quatro ignorados no comando de banco são realtime, executados separadamente. Os dois testes adicionais de recuperação não estavam ainda na descoberta da suíte ampla; seu resultado está separado. Avisos do adapter-pg sobre queries simultâneas são preexistentes; não foram suprimidos. O runner visual existente foi executado por uma cópia ignorada, alterando somente `channel: chrome` para `executablePath: /usr/bin/chromium`; seus asserts e 18 cenários permaneceram iguais.

Os testes de navegador usam `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; a suíte ampla habilita também `RPG_EXPEDITION_BROWSER_DRIVER=1`, exigido pelo teste de combate existente. Nenhum resultado ignorado ou comando não executado é contado como aprovado.

## Cobertura adicionada

- Domínio: determinismo real, IDs/versões, limites finitos, spawn, estruturas, biomas, densidade, domínio de quantidades/ciclos/inputs e geração Survivor inalterada.
- Simulação: duração monotônica e simulada, movimento/cancelamento, desconexão, limites, ausência de ondas/settlement e ciclo fixado no início.
- PostgreSQL: replay concorrente, mesma revisão, payload divergente, conta alheia, flags, rollback, saturação, limites entre sessões, depósito/economia simultâneos, descobertas duplicadas, exclusão, histórico isolado, recuperação e build inválida. Constraints testadas também por escrita direta abaixo do serviço.
- WebSocket real: 1/2/5 contas; CONFIG/READY/START/INPUT e gathering públicos; movimento adulterado, nó distante/fabricado, payload de outra conta, desconexão durante coleta, reconnect, replay, saída, Survivor e Arena sem grants RPG.
- Browser: autenticação/flags e percurso real com cadastro, portal, preparação, teclado, coleta, refresh/reconnect, perda de rede, descoberta, toque mobile, saída, saldo visível no depósito, diário persistido, outra conta e reentrada sem renovação de recurso. Capturas são do jogo real; nenhuma posição/claim é fabricada para demonstrar esse fluxo.

Fixtures de banco/domínio e o benchmark são restritos aos testes. O driver legado de combate do browser está limitado a RPG_EXPEDITION e não acelera nem concede resultados de exploração.

## Performance

[Benchmark reproduzível](../scripts/rpg-exploration-benchmark.ts): `RUN_RPG_BENCHMARK=1 RPG_ENABLED=true RPG_EXPLORATION_ENABLED=true node --expose-gc --conditions=react-server --import tsx scripts/rpg-exploration-benchmark.ts`, exclusivamente em banco local de testes. Cinco jogadores navegam por múltiplos chunks com INPUT normalizado; a navegação é acelerada pelo driver e a coleta exige duração real. O relatório confirma cinco claims, consultas por evento e zero SQL no hot path. A geração de recursos e POIs é medida em conjunto porque compartilha a mesma passagem determinística.

As métricas completas estão em [benchmark](qa/exploration/benchmark.json) e [browser](qa/exploration/browser-metrics.json). Memória por jogador é uma estimativa (delta da região dividido por cinco), inclui aquecimento Prisma e não mede GPU. A latência da transação inclui espera por lock; instrumentação fica só no script de teste. O adapter-pg omite BEGIN/COMMIT dos query events, portanto a medição envolve a promise completa de `$transaction`.

O benchmark Survivor existente (`node --import tsx scripts/benchmark.ts`) também foi executado: cinco jogadores/1100 inimigos/300 ticks; tick P95 25,743 ms, lote de snapshots P95 39,694 ms, tick incluindo snapshots P95 46,270 ms e delta de heap 68,76 MiB ([resultado](qa/exploration/survivor-benchmark.json)). São cargas distintas, e esse cenário pesado não sustenta uma afirmação de 25 Hz garantidos. A configuração do servidor permanece 25 Hz e snapshots 10 Hz.

Como referência da Fase 4, o relatório aprovado registrava draw P95 8,1 ms, RAF P95 50 ms e transferência de depósito P95 22,177 ms. Gathering adiciona validação autoritativa, tempo de interação e claim persistente; as amostras locais não equivalem a um teste A/B de produção. Cache visual e descarte de instância/RAF são verificados no fluxo real do browser.

Amostra final: geração conjunta P95 3,499 ms; validação de intenção P95 3,655 ms; tick P95 0,113 ms; snapshots para cinco P95 0,431 ms; transação P95 50,473 ms (cinco transações); 115 queries para cinco coletas, zero durante os ticks; conclusão do lote em 2258 ms incluindo duração mínima. Criação da região 74,158 ms; delta de heap 409.672 bytes, estimativa por jogador 81.934 bytes.

Browser: 59,93 FPS observado, draw P95 7,5 ms, RAF P95 16,8 ms; nove chunks/rasters visuais e 5.308.416 bytes de raster. Coleta confirmada em 2404 ms; navegação/interação até retorno e diário em 14,24 s. Após saída: zero instâncias e zero loops RAF próprios, zero pageerrors. [Desktop](qa/exploration/desktop.png) · [mobile com toque](qa/exploration/mobile.png).

## Compatibilidade e limites

SAVE_SCHEMA=3, ECONOMY_VERSION=2, inventário Survivor de quatro slots, Player.level/XP temporários, GOLD/GEMS, mundo procedural/IDs históricos, saves offline/CloudSolo e contratos de snapshot permanecem preservados. Gathering não lê saves como evidência e não equipa nem cria equipamentos. A garantia é limitada às verificações executadas; as falhas históricas de estabilidade do navegador são relatadas, sem relaxar suas assertions.

Riscos residuais: região única com pouca variedade, POIs descritivos sem quests, materiais ainda sem crafting, arte provisória e balanceamento conservador. Chromium mobile emulado não substitui aparelho físico/Safari. Medições locais não são teste de carga de produção. Uma autoridade realtime por banco continua sendo requisito; não há coordenador multi-réplica. Não excluir históricos de GameSession/claims sem política que preserve direitos consumidos. Não há detecção de bots ou limite por identidade humana. Produção requer integração dos cinco PRs, migração, staging HTTPS/WSS e rollout controlado; flags permanecem falsas.

## Arquivos e ordem de revisão

A: catálogos e `src/game/core/rpg/exploration/{types,generation,gathering}.ts`, materiais, testes de domínio e decisão arquitetural.

B: `prisma/schema.prisma`, nova migração, `src/server/rpg/exploration/*`, guard/flags, testes PostgreSQL/migração e documentação de persistência.

C: simulação, `src/realtime/rpg-exploration.ts`, integração em teams/server/coop/protocol, bloqueio recíproco com expedições, testes realtime/simulação e helpers de navegação.

D: novas rotas, ações, portal, TeamClient, OnlineExploration/RemoteExploration/CSS, callbacks, descarte de cache e testes browser/actions.

E: documentos finais, benchmark e evidências. Revisar/integrar A → B → C → D → E; os PRs seguintes têm a branch anterior como base para manter o diff revisável. A branch consolidada contém a fase inteira. A lista completa está em [arquivos alterados](qa/exploration/changed-files.txt).

## Pull requests publicados

| Camada | Branch | Commit da camada | PR | Base |
|---|---|---|---|---|
| A | `codex/rpg-phase5-domain` | `e0fb8c1` | [#26](https://github.com/devKire/survivor_game/pull/26) | `main` |
| B | `codex/rpg-phase5-persistence` | `a683a26` | [#27](https://github.com/devKire/survivor_game/pull/27) | `codex/rpg-phase5-domain` |
| C | `codex/rpg-phase5-gameplay` | `e8eacd8` | [#28](https://github.com/devKire/survivor_game/pull/28) | `codex/rpg-phase5-persistence` |
| D | `codex/rpg-phase5-ui` | `f412f87` | [#29](https://github.com/devKire/survivor_game/pull/29) | `codex/rpg-phase5-gameplay` |
| E | `codex/rpg-phase5` | `e3e8236` | [#30](https://github.com/devKire/survivor_game/pull/30) | `codex/rpg-phase5-ui` |

Os cinco PRs estão abertos para revisão, sem merge automático. Os hashes acima identificam os cinco commits lógicos; a branch consolidada inclui também o índice de entrega deste relatório. A organização dos fixups em commits foi verificada por igualdade da árvore Git antes/depois; não alterou o conteúdo validado.
