# Fase 4 — auditoria e acompanhamento

Base confirmada: main `6029231db7c6c251b16b6c12e8b25f6a733388bb`, merge #19 da Fase 3. Branch `codex/rpg-phase4`.
Baseline executado em banco local isolado: npm test, 258 aprovados / 59 ignorados; migrações da main aplicadas.

## Auditoria antes de implementação

Fases anteriores presentes integralmente. Perfil/revisão, actions, equipamentos, loadouts, expedições, receipts e histórico serão reutilizados. Nenhum serviço de recompensa novo é necessário.
WorldRenderer exige run/world e contém combate. Reutilizar suas primitivas TileRenderer e CharacterSpriteRenderer evita inventar RunState ou iniciar GameSimulation/WaveDirector. Player será somente o adaptador visual existente, sem update de combate. Terreno estático próprio não modifica World/worldVersion/chunks.
Quatro sprites canônicos disponíveis; manifest e sidecars de terrenos/props existentes. Não há sprites específicos aprovados dos quatro NPCs, depósito ou quadro; fallbacks geométricos estilizados serão identificados como provisórios.

## Plano e riscos

A: domínio estático versionado, NPCs e movimento puro. B: Canvas único, primitivas compartilhadas, input e cleanup. C: location na mesma instância, depósito de até 100 instâncias, locks/revisão/receipts existentes e migração aditiva. D: rota protegida, diálogos e links/serviços reais, controles acessíveis. E: banco, browser, regressão, performance e capturas reais.
Movimento/proximidade são locais e não autorizam mutações. Flags server-side separadas permitem rollout sem liberar expedições. Depósito exige desequipar; itens armazenados não entram em loadouts. Materiais não ganham outra carteira. Não há grants, posição persistida, loot ou settlement no Refúgio.
Falhas históricas de stability 2/5 clientes serão registradas separadamente, sem enfraquecer asserções.

## Entrega funcional e segurança

Mapa compacto de 1200×900, spawn (600,620), praça central, personagens, Arsenal, Depósito, quadro e saída. Quatro NPCs funcionais com diálogos em catálogo. Sprites canônicos dos quatro personagens e atlas existentes; serviços e NPCs usam arte provisória identificada em RPG-REFUGE-SCENE.md. Nenhum PNG canônico foi alterado.

Personagens reutilizam CharacterPanel/CharacterForm e actions existentes. Arsenal reutiliza EquipmentInventory/StatsPreview. Depósito possui painel compartilhado entre diálogo e rota acessível, nova intenção autenticada e mesma instância no banco. Preparação e histórico encaminham às rotas reais da Fase 3; lobby tem retorno ao Refúgio. Projeções excluem rollSeed/owner, callbacks permanecem allowlist estrita.

Migração nova: `20261011100000_rpg_refuge_storage`. location INVENTORY/STASH, CHECK de enum, CHECK de equipamento não armazenado e índice userId/location. Default preserva itens anteriores. Não altera migrações históricas. Testes em bases descartáveis verificam banco vazio e upgrade com item equipado, seed, histórico de receipt e cascata. A suíte de transferência verifica affixes, quantidade, raridade e versão byte a byte.

## Casos adicionados

- Domínio: IDs únicos, geometria válida, spawn, serviços conhecidos, determinismo, limites, colisões, dt, normalização e oito direções/idle/walk.
- Renderer: delegação ao sprite renderer, um RAF, interação repetida, pausa de modal, troca validada de identidade e dispose idempotente.
- PostgreSQL: depósito/retirada, replay inclusive após retirada, payload conflitante, revisão vencida, usuário alheio, IDs ausentes, local incorreto, equipado, constraint SQL, capacidade com corrida, dois pedidos iguais/diferentes, rollback antes de receipt, retry, economia paralela, exclusão da conta e flags.
- Server Actions: sem autenticação, flag, userId inesperado, sessão derivada no servidor, validação estrita e erro interno opaco.
- Browser: login/callback, personagem canônico, movimento/proximidade, E repetido, diálogo/foco/Escape, seleção persistida atualiza sprite, equipamento real, armazenamento/refresh, lobby/retorno, cinco navegações, toque em viewport estreita, falha de rede com retry e assets bloqueados.

## Preservação dos contratos

Diff da base não altera GameSimulation, CoopSimulation, Player, World, WaveDirector, RunState/RunSnapshot, SAVE_SCHEMA=3, ECONOMY_VERSION=2, quatro slots temporários, geração procedural, worldVersion, estruturas Survivor, mensagens de rede, servidor realtime, settlement, Arena, Ranked ou Guerra. GOLD/GEMS e UserProgress.version preservados em transferências, inclusive com operação econômica concorrente. Itens STASH não podem equipar nem beneficiar novas builds. Nenhuma nova recompensa persistente nasce no Refúgio.

## Limitações e rollout

- Arte final de NPCs/serviços pendente; fallbacks são intencionais e não apresentados como canônicos.
- Posição não é persistida nem validada pelo servidor. Não há multiplayer social, gathering, quests, crafting ou conteúdo da Fase 5.
- Flags públicas desligadas por padrão. Aplicar migração e integrar os cinco PRs antes de habilitar a cena. Expedições continuam sob flag separada.
- Capacidade de 100 é verificada pelo serviço sob lock; acesso administrativo direto ao banco precisa respeitar essa regra.
- Chromium local e Next dev não substituem homologação de celulares físicos, Safari ou hardware alvo. Medidas incluem custo do ambiente de desenvolvimento; memória de Canvas/GPU não está integralmente no heap JS.

## Resultados realmente executados

Ambiente: Node 22.23.3, Next 16.3.5, Prisma 7.10.0, PostgreSQL local isolado e Chromium. A base final `limiar_rpg_phase4_20261011_final` foi criada vazia e recebeu as 12 migrações. Nenhum teste atingiu produção. Logs completos estão no workspace em `/workspace/.onboarding/rpg4-*.log`.

| Comando | Resultado | Aprovados | Falhos | Ignorados | Evidência |
|---|---|---:|---:|---:|---|
| `npx prisma validate` | schema válido | — | 0 | — | execução Prisma |
| `npx prisma generate` | client gerado | — | 0 | — | geração Prisma 7.10 |
| `npx prisma migrate deploy` | 12 migrações em banco vazio | — | 0 | — | rpg4-migrate-final.log |
| `npm run typecheck` | aprovado | — | 0 | — | rpg4-typecheck-last.log |
| `npm run lint` | aprovado; warning histórico TAU | — | 0 | — | rpg4-lint-last.log |
| `npm test` | aprovado | 264 | 0 | 68 | rpg4-unit-final.log |
| `RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test` | aprovado | 329 | 0 | 3 | rpg4-database-final.log |
| `RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts tests/rpg-expedition-realtime.test.ts` | aprovado | 3 | 0 | 0 | rpg4-realtime.log |
| `npm run build` | aprovado | — | 0 | — | rpg4-build.log; repetição final em rpg4-build-last.log |
| `npm run test:browser` com três flags e driver RPG de testes | parcial, falhas históricas | 11 | 2 | 1 | rpg4-browser-full.log |
| `npm run test:browser -- tests/browser/rpg-refuge.spec.ts` com três flags | aprovado após acabamento de HUD | 2 | 0 | 0 | rpg4-browser-final.log |
| `npm run test:browser -- tests/browser/rpg.spec.ts tests/browser/rpg-refuge.spec.ts` com todas flags falsas | gates aprovados | 2 | 0 | 3 | rpg4-browser-off.log |
| `npm run test:browser -- tests/browser/rpg-refuge.spec.ts` com RPG ligado e Refúgio desligado | gate independente aprovado | 1 | 0 | 1 | rpg4-browser-refuge-off.log |
| `npm run assets:tiles:validate` | 24 sidecars, 23 atlases, fontes intactas | — | 0 | — | saída do validador |
| `npm run assets:tiles:qa` | 24 pranchas geradas | — | 0 | — | rpg4-tiles-qa.log; artifacts/tiles/qa |

Os três testes ignorados na suíte de banco são os realtime, executados separadamente. O teste ignorado no browser amplo exige RPG desligado. Testes ignorados não contam como aprovados.

As duas falhas amplas são exatamente `tests/browser/stability.spec.ts:102`, com dois e cinco clientes: `remoteGameInstances` esperado 1, recebido 0. São as falhas históricas documentadas na Fase 3. Não foram corrigidas nem tiveram asserções alteradas nesta fase. Testes online normais de dois/três browsers, offline, economia, equipamento e expedição completa passaram. Não há nova falha funcional identificada na cena do Refúgio.

Durante desenvolvimento, a primeira tentativa mobile apontava coordenadas de um botão fora da viewport: o teste foi corrigido para rolar até o controle e depois passou com eventos de toque reais do Chromium via CDP. Erros iniciais de tipagem/useEffect foram corrigidos antes dos checks finais. O aviso de Fontconfig em QA de tiles não impediu a geração das 24 pranchas; nenhuma fonte canônica foi alterada.

## QA visual e performance

Capturas da aplicação real, sem composição artificial:

- [Desktop com personagem ativo e praça](qa/refuge/desktop.png).
- [Mobile com controles de toque](qa/refuge/mobile.png).
- [Fallback com imagens bloqueadas](qa/refuge/fallback.png).
- [Métricas de browser e cleanup](qa/refuge/browser-metrics.json).
- [Benchmark de armazenamento](qa/refuge/storage-benchmark.json).

Última amostra no fluxo automatizado Next dev: draw P95 8,1 ms; intervalo de RAF P95 50 ms; primeira pintura da cena 36 ms; entrada completa autenticada até sprite 1513,9 ms; interação E até diálogo verificado 62,2 ms. O intervalo de RAF foi medido durante navegação e mutações, não é uma promessa de 60 FPS nem benchmark isolado de GPU. Uma execução anterior da mesma suíte registrou 16,7 ms de intervalo P95; há variação de carga no host de testes.

Resize observado: 0,1 ms. Cinco saídas custaram 222–485 ms (wall time com navegação Next/assertions). Após cada saída: zero instâncias, RAFs, listeners próprios e observers da cena. CDP contou 709–710 listeners totais da aplicação, sem crescimento progressivo. Heap JS após GC: 17.251.432 → 17.781.468 bytes (+3,1%) em cinco navegações; caches Next e imagens compartilhadas permanecem. Isso não mede toda a memória GPU nem comprova ausência de crescimento em sessões de duração ilimitada.

Terreno usa um raster offscreen fixo de 1200×900 (~4,12 MiB RGBA), reconstruído apenas quando imagens carregam e explicitamente descartado no dispose; apenas um Canvas aparece no DOM. Não há bake de terreno por frame. Amostras limitadas a 240.

`RUN_RPG_BENCHMARK=1 RPG_ENABLED=true RPG_REFUGE_ENABLED=true node --conditions=react-server --import tsx scripts/rpg-storage-benchmark.ts`: 100 transferências confirmadas, média 15,798 ms, P95 22,177 ms, máximo 350,798 ms (inclui aquecimento), uma instância ao final e 100 receipts. Fixture removida ao terminar. Medida local não substitui latência de produção.

Logs selecionados para revisão estão em [qa/refuge/logs](qa/refuge/logs).
