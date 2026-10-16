# Fase 6.5 — implementação, compatibilidade e QA

Base auditada: `main` em `48db2c433cbd40ea70c3f256e482370fb12e1551`, com Fases 0–6 integradas. Branch consolidada `codex/rpg-phase6-5`. Entrega para revisão em sete PRs, sem merge automático e sem iniciar Fase 7. Rollout desligado por padrão.

## Auditoria e correções

| Encontrado | Implementado / limite |
| --- | --- |
| Refúgio local e exploração baseada em Team/GameSession, READY/START e timer | WorldCoordinator/WorldZone próprios para a atividade pública; Refúgio e Ruínas independentes de grupo, vinte por zona. Não oculta botões do modelo anterior. |
| Serviços web sem autoridade espacial | Intenções WORLD_RPC, permit privado, posição validada no servidor e novamente após locks/awaits. Actions legadas bloqueadas durante presença ativa. |
| Claims ligados apenas à expedição | Origem alternativa worldVisitId com FK composta e CHECK exclusivo, preservando unicidade/caps diários anteriores. |
| Risco de reatribuir claim ao trocar personagem | Identidade de visita imutável; mudança de personagem cria visita nova. |
| Ausência de prova durável para PvE público | Eventos e receipts próprios; prova persistida antes de grant, rollback atômico, recuperação PENDING, retry sem duplicação. |
| Potencial de duas autoridades recuperarem o mesmo banco | Advisory lock de sessão em conexão PostgreSQL dedicada, obtido antes de recoveries; perda da conexão encerra o processo. Neon pooled usa endpoint direto nessa conexão. |
| Painéis e rotas desmontavam a cena | Shell mantém Canvas/RAF/socket; reutiliza componentes atuais via transporte autenticado. |
| Animação de ataques dependia de armas locais | Projeção pública da sequência de ataques alimenta CharacterSpriteRenderer existente. Nenhum Snapshot legado mudou. |
| Comando Arena enfileirado durante WORLD_ENTER | Revalida exclusão de atividades na execução da fila; teste envia ambos consecutivamente. |
| Convite de grupo após expiração da Team | Convite autorizado do líder renova a validade da Team, mantendo máximo de cinco. |
| Falha de persistência de campo durante manutenção | Log seguro e retry do evento; falha não desconecta indiscriminadamente os modos legados. |

## Banco, confiança e migrações

`20261015010000_rpg_shared_world` adiciona RpgWorldVisit, RpgWorldRewardEvent, RpgWorldRewardReceipt e origem de claims. `20261015020000_rpg_world_visit_identity` completa a imutabilidade do personagem da visita. Nenhuma migração histórica foi editada. Upgrade foi exercitado em banco vazio e banco temporário com dados Fase 6, conservando equipamentos, materiais, quests, escolhas e claims.

Provas de campo usam ocorrências privadas, dano observado e contribuintes elegíveis. Não existe grant público nem XP de saves/CloudSolo. XP, pontos, itens, materiais, revisão e receipts pertencem ao mesmo commit. O primeiro equipamento legítimo pode ser equipado no Refúgio e permanece após refresh. Limites v1: vinte recompensas/dia/conta, três XP e um pó por recompensa, uma lâmina comum por dia. Coleta conserva dezoito claims/dia/conta e doze/visita; trocar de modo não renova o direito diário.

Teste de crash usa combate real via socket: gatilho de falha impede receipt, prova fica PENDING, processo recebe SIGKILL, reinício recupera exatamente uma recompensa e replay retorna o receipt existente. Antes da prova durável não há recuperação inventada. Mutações apenas RPG conservam UserProgress.version.

## Testes e resultados

Node 22.23.3, Next 16.3.5, Prisma 7.10.0, PostgreSQL 18.4 e Chromium local. Banco isolado `limiar_world_qa`; testes de migração criam bases temporárias. Nenhuma validação desta fase usa o Neon real do `.env`. Suites com banco/realtime/browser executadas sequencialmente. Logs completos em `qa/world`, sem segredos.

Resultados finais são registrados abaixo após o encerramento de cada comando. Skips não contam como aprovação.

| Comando / execução | Resultado | Evidência |
| --- | --- | --- |
| Baseline main `npm test` | 282 aprovados, 96 condicionais ignorados | `baseline.log` |
| Prisma validate / generate | schema válido e cliente gerado | `prisma-validate.log`, `prisma-generate.log` |
| Typecheck | exit 0 | `typecheck.log` |
| Lint | exit 0, warning preexistente TAU não usado | `lint.log` |
| npm run build | exit 0, produção compilada; /rpg/world dinâmica | `build.log` |
| Unitário final sem flags | 290 aprovados, 111 ignorados, 401 totais | `unit.log` |
| RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test | 393 aprovados, 8 realtime ignorados, 401 totais | `database.log` |
| Realtime amplo, sete arquivos | 7 aprovados, 1 falho (timeout Arena no teste legado de exploração) | `realtime-full.log` |
| Realtime exploração isolado | 1 aprovado, 27,34 s; sem alteração na lógica do jogo | `realtime-exploration.log` |
| Realtime mundo final, incluindo fila Arena, crash e cinquenta conexões | 3 aprovados, 104,35 s | `realtime-world.log` |
| Browser mundo final, servidor normal | 2 aprovados, 1,0 min; duas contas, PvE real, gathering, item equipado, refresh e toque | `browser-world.log` |
| Browser completo, mundo desligado e atividades legadas ligadas | 17 aprovados, 2 falhos, 2 ignorados, 5,6 min | `browser-legacy.log` |
| Assets tiles / personagens | concluídos; warnings existentes preservados | `assets-tiles.log`, `assets-characters.log` |

Os dois erros browser são os testes de estabilidade de dois/cinco jogadores: `remoteGameInstances` esperado 1, observado 0. A mesma falha consta no [QA da main/Fase 6](RPG-PHASE6-QA.md#8-resultados-executados); as assertions não foram relaxadas. O timeout ARENA_LOBBY_STATE também tem precedente nesse relatório. A repetição aprovada não apaga o resultado falho inicial. Não se declara a suíte legado inteira verde.

Warnings adicionais observados: key React no Refúgio legado, fallbacks de atlas no teste intencional de falha de carregamento e depreciação de consultas concorrentes do driver pg. O cenário browser do mundo não registrou pageerror. A primeira tentativa de teste touch apenas redimensionava desktop; o harness passou a usar contexto mobile real emulado. Isso revelou sobreposição de botões, corrigida na barra/joystick. A repetição passou com eventos touch reais do Chromium.

Novas suítes: domínio/índice espacial, simulação/combate, migrações, presença/autoridade, recursos, rewards, orçamento SQL, capacidade, realtime/crash e browser. A concorrência entre início de Team e entrada pública tem teste PostgreSQL próprio; o teste de comando Arena enfileirado é realtime. Suites de RPG anteriores, economia, saves, PvP e quests integram a execução completa.

## Capacidade e performance

Medições loopback em AMD EPYC 9V45, cinco CPUs lógicas disponíveis ao ambiente; não representam WAN, dispositivos físicos ou capacidade de produção. [Método/headless](qa/world/server-benchmark.json), [50 sockets reais](qa/world/socket-capacity.json), [SQL](qa/world/sql-budget.json), [browser](qa/world/browser-metrics.json).

O teste autentica cinquenta conexões: vinte entram na mesma zona e trinta recebem limite de capacidade. Mantém os limites existentes de IP/mensagens e não cria Teams ou GameSessions. Não equivale a cinquenta avatares no mundo. Amostras de 1/2/5/10/20/50 conexões incluem RTT, bytes/s, tempo de entrada, tick, drift, snapshot, CPU e heap.

No ensaio final com vinte presenças, tick P95 foi 1,148 ms; lote de snapshots P95 1,485 ms; tráfego agregado aproximadamente 895 kB/s. São snapshots de uma concentração de jogadores no Refúgio, com AOI, não compressão/delta. Com cinquenta conexões (vinte presenças) foram observados tick P95 0,883 ms e RTT loopback P95 1 ms. O ensaio headless simula combate de 1/2/5/10/20 jogadores; não contém PostgreSQL nem sockets. Com vinte, tick P95 0,198 ms e lote de snapshots P95 0,787 ms. Valores completos e datas constam nos JSONs.

Medição SQL real: zero queries durante cinquenta ticks e vinte lotes de snapshots no Refúgio. Entrada inicial 33 statements, reentrada 31, refresh de perfil 33, saída seis (incluindo BEGIN/COMMIT). Leituras discretas podem ser otimizadas antes de ampliar capacidade; não são realizadas por tick. Heap delta de benchmark não demonstra ausência de vazamento. No browser final, render P95 4,1 ms e frame P95 16,8 ms; uma instância, um RAF e um cliente de rede ativos após painéis/transições. As duas montagens e um dispose refletem Strict Mode de desenvolvimento.

## Critérios de aceite e evidências

| Critérios do prompt | Evidência / situação |
| --- | --- |
| 1–8: entrada pública, autoridade, duas contas, mais de cinco, sprites e Refúgio | Browser duas contas e realtime seis; capacidade vinte confirmada por cinquenta conexões. |
| 9–18: HUD/minimapa/painéis/NPCs/proximidade | Browser conserva shellId/epoch entre painéis; teste realtime rejeita serviço distante e input inesperado. |
| 19–25: saída física, Ruínas, conexão, gathering e descobertas | Caminho físico browser/WS, transição no mesmo Canvas; PG comprova ledger e caps compartilhados. |
| 26–33: PvE, receipts, grupos/chat, reconnect/refresh/crash/duplicação | Combate real gera item; equip/refresh; grupo cinco com seis presentes; replay e reinício recuperam uma vez. |
| 34–36: SQL, AOI e mobile | Medição SQL zero por tick, testes espaciais e touch emulado com deslocamento confirmado no servidor. |
| 37–42: Survivor/PvP/saves/migrações/rollback | Contratos e suites preservados, upgrade vazio/preenchido e flag off. Ressalvas dos testes legados relatadas acima. |
| 43–48: PG/realtime/browser/benchmarks/visual/autoridade | Logs, métricas e screenshots reais; nenhum grant de fixture no browser do mundo. |
| 49–51: novas regiões, revisão e não merge | Catálogo versionado, sete branches encadeadas; nenhuma Fase 7 ou merge automático. |

Arte canônica preservada. NPCs/serviços ainda usam os fallbacks existentes, explicitados no [inventário de arte](RPG-SHARED-WORLD.md#arte-e-acabamento). [Refúgio desktop](qa/world/refuge-desktop.png), [Ruínas após combate](qa/world/ruins-pve.png), [mundo touch](qa/world/mobile-world.png) e [personagem mobile](qa/world/mobile-character.png) são capturas da aplicação. Não foram usadas imagens conceituais como evidência.

## Compatibilidade e riscos residuais

SAVE_SCHEMA=3, ECONOMY_VERSION=2, RunState/RunSnapshot, Player.level/XP temporário, inventário Survivor quatro slots, seed/worldVersion/chunks/estruturas, GOLD/GEMS, CloudSolo e arquivos de PvP/Ranked permanecem inalterados. A união de mensagens recebe WORLD_* aditivo; formatos de mensagens legadas permanecem. O settlement Survivor continua separado e rejeitando fontes RPG. Houve extração compartilhada do runtime de gathering, coberta pelos testes antigos e novos.

Não houve regressão nova identificada nos fluxos funcionais exercitados; isso não equivale a declarar aprovados os testes legados que falharam. Capacidade é limitada a vinte por zona e uma autoridade por banco. O endpoint direto Neon precisa de validação operacional antes do deploy; aqui foi verificada a transformação de URL e o lock em PostgreSQL local. Não há teste em celular físico nem soak de produção. Event/receipt retention exige política futura, sem apagar provas que ainda sustentam direitos.

O setup reutilizável do ambiente usa Node 22, Chromium e PostgreSQL isolado; `install_script` e `start_skill` foram salvos em rascunho pela skill de onboarding. Salvar o rascunho não publica o ambiente nem demonstra restauração numa nova tarefa.

## Entrega em PRs

Ordem A → F → B → C → D → E → G. A migração precede consumidores por dependência. Cada PR contém um commit lógico e descreve seus arquivos/risco/validação; G reúne QA e correções encontradas durante integração. A revisão conjunta deve usar a comparação da branch consolidada com main. Links serão registrados após a criação; nenhum merge será executado.

O [manifesto de arquivos](qa/world/files.txt) lista as alterações de código, schema, testes e documentação em relação à main. Os checks acima foram executados na stack integrada, não repetidos isoladamente em cada commit intermediário. Artefatos históricos produzidos pelos testes foram restaurados; os resultados desta fase ficam em `docs/qa/world`.
