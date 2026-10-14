# Fase 6 — relatório de implementação e QA

Validação local em 13–14/10/2026. Entrega para revisão; nenhum merge, deploy ou início da Fase 7. `RPG_ENABLED` e `RPG_QUESTS_ENABLED` continuam desligados por padrão. A suíte ampla de navegador **não está integralmente aprovada**: resultados e repetições estão separados abaixo.

## 1. Estado inicial

Main consultada novamente em 14/10: `aacc689da11662cad8419e10c1dd25991c29cbc8`, com Fases 0–5 integradas; Fase 5 pelo PR #31. O SHA antigo informado pelo pedido não foi usado como base. Baseline: 272 testes aprovados, 81 condicionais ignorados, 353 no total.

Foram auditados AGENTS/SPEC/README, arquitetura e QA das fases anteriores, Prisma/migrações, domínio e catálogo RPG, perfil/mutações/XP, Refúgio, exploração/gathering, settlement e receipts, autenticação/actions, navegação, realtime e testes. As instruções locais do Next 16 foram consultadas. A lacuna era a camada narrativa: as fontes autoritativas, combate, armazenamento, progressão e infraestrutura transacional já existiam. Nenhum script histórico de extração foi reexecutado.

## 2. Arquitetura

- `src/game/core/rpg/quests`: tipos, requisitos, objetivos, validação de conteúdo e transições puras.
- `src/game/content/rpg/{quests,dialogues}`: definições imutáveis, versionadas, separadas da apresentação.
- `src/server/rpg/quests`: estado, evidências, reconciliação, diário, mutações e Server Actions.
- `/rpg/quests`, componentes de diálogo no Refúgio e tracker na exploração.

Reutilizados: perfil lazy, `rpgTransaction`, lock `UserProgress`, `RpgMutationReceipt`, revisão RPG, orçamento de atributos/XP, materiais, descobertas/claims e receipts de expedição. A extração de `applyRpgProgressionXp` conserva o teto histórico de XP por recompensa de expedição; quests possuem teto próprio. Não há segunda implementação de combate, gathering ou loot.

Fluxo: intenção autenticada → revisão/receipt/lock da conta → leitura de fontes duráveis da própria conta → prova única → objetivos/estado → resgate atômico. Nenhuma consulta ou gravação narrativa por frame/inimigo; não há novo protocolo realtime. O tracker solicita reconciliação com debounce quando conjuntos duráveis de descobertas/coletas mudam.

## 3. Conteúdo

Todas as cinco definições v1 são ACCOUNT, não repetíveis; o personagem que recebe XP é congelado no aceite.

| ID / missão | Condição e recompensa |
|---|---|
| `main:refuge-introduction` — O Chamado do Refúgio | Orientação, escolha e relato; 20 XP + 1 Pó do Obelisco |
| `main:ruins-remnants` — Vestígios das Ruínas | Principal anterior recompensada, vestígio real e relato; 35 XP + 2 pós |
| `main:material-echoes` — Os Ecos da Matéria | Principal anterior recompensada, coleta posterior ao aceite e relato; entrega de 4 minérios + 4 fibras; 50 XP + 1 Fragmento de Eco |
| `side:ruins-reconnaissance` — Reconhecimento dos Arredores | Introdução recompensada, três vestígios distintos e relato; 25 XP + 2 pós |
| `side:expedition-trial` — Prova da Travessia | Introdução recompensada, nova expedição elegível confirmada e relato; 60 XP + 1 fragmento |

NPCs preservados: Guardião, Orientador, responsável pelo Depósito e Armeiro. O grafo valida nó, aresta, requisitos e efeitos no servidor. Abrir uma conversa não prova conclusão. `investigation-priority` registra REMNANTS ou ECHOES de forma exclusiva, altera fala posterior e aparece no diário; há uma opção condicionada a Nara. As cinco flags são gravadas no resgate: ver [IDs e regras](RPG-STORY-FLAGS.md).

Nomes/títulos de Nara, Orin, Ivo e Sena e lore existente foram preservados. **O novo arco e suas falas são proposta narrativa sujeita à aprovação**, não cânone histórico: [auditoria narrativa](RPG-NARRATIVE-CONTENT.md). Não foram inventadas biografias ou cosmologia, nem reutilizados retratos de protagonistas como NPCs.

## 4. Persistência

Migração aditiva: `prisma/migrations/20261013120000_rpg_phase_6/migration.sql`, no schema `limiar`. Nenhuma migração histórica editada. Novos modelos:

- `RpgQuestProgress`: versão, escopo, beneficiário, revisão de aceite, estado e datas.
- `RpgQuestObjectiveProof`: origem deduplicada por progresso/objetivo/tipo/ID.
- `RpgQuestRewardReceipt`: uma concessão por progresso, resposta persistida.
- `RpgStoryFlag`: flag vinculada ao progresso da própria conta.
- `RpgNarrativeChoice`: alternativa exclusiva e origem versionada.
- `RpgDialogueState`: cursor da conversa por conta/NPC.

FKs compostas impedem referências entre contas; cascata remove o conjunto ao excluir a conta. CHECKs limitam IDs, versões, quantidades, escopo/beneficiário e consistência estado/datas. Triggers preservam identidades, avanço de estado e imutabilidade de provas, receipts, flags e escolhas. Índices suportam consulta de claims por revisão e participantes por revisão de entrada.

Migrações testadas em banco vazio e base temporária com dados da Fase 5, preservando itens, receipts e descobertas. A criação de índices em históricos existentes requer janela operacional compatível; `lock_timeout` limita a espera. Não há DROP/reset de dados existentes nem migração de produção nesta entrega.

## 5. Gameplay

O teste de navegador registra uma conta, entra no Refúgio, aceita pelo NPC, percorre os três capítulos, faz a escolha persistente, anda na exploração autoritativa, descobre três POIs e coleta materiais reais. Entrega quatro minérios/quatro fibras, resgata as três principais e Reconhecimento, e verifica quatro receipts, 130 XP e persistência após refresh. Não usa grants nem provas fabricadas para esse percurso.

Descobertas antigas são aceitas somente nas definições que explicitamente permitem retroatividade. Gathering exige quantidade realmente concedida e revisão posterior ao aceite; saldo atual não é prova de coleta. Expedições exigem entrada posterior ao aceite, participante elegível, receipt confirmado, contexto RPG público, vitória e terminal validado. Boss exige origem no receipt cruzada com o evento terminal. Fontes estrangeiras, pendentes, derrota, sessão experimental e replay não geram progresso adicional.

A secundária de expedição é coberta por integração PostgreSQL/settlement; o arco de navegador cobre três principais e uma secundária, não cinco missões no mesmo percurso. Realtime de quests cobre 1/2/5 participantes, movimento/descoberta, reconexão, reconciliação tardia e deduplicação.

## 6. Segurança e compatibilidade

Sessão Better Auth, flags, rate limit e inputs Zod estritos precedem as operações. O cliente envia intenção; não fornece `userId`, XP, origem, quantidade concedida, personagem beneficiário ou nó arbitrário. Callback de `/rpg/quests` entra na allowlist existente. Erros internos são genéricos; revisão obsoleta orienta atualizar e repetir.

Transações Serializable usam o lock existente da conta e retries limitados somente para abortos seguros. Não adquirem Team/sessão depois desse lock. Replay do receipt precede comparação da revisão; payload diferente com mesmo ID é rejeitado. Resgate com outro requestId não concede novamente. Custos, XP/pontos, materiais, flag, estado e receipt confirmam juntos; falhas induzidas comprovam rollback. Fontes duráveis permitem reconciliação após falha sem inventar eventos perdidos.

Testes verificam ownership, cascata, corrida entre abas/requests, entrega insuficiente, troca de personagem, limites de saldo/XP, economia/armazenamento paralelos e `UserProgress.version` inalterada nas operações RPG. Nenhum endpoint público de grant foi criado.

SAVE_SCHEMA=3, ECONOMY_VERSION=2, Player.level/XP temporário, RunState/RunSnapshot, inventário Survivor, GOLD/GEMS, CloudSolo/imports, world seed/version/IDs, combate, multiplayer, Arena/Ranked/Guerra permanecem nos contratos existentes. O diff não altera `src/game/core/{coop,player,save}.ts`, `src/game/network` ou `src/realtime`. A evidência de preservação combina esse limite de alterações com os testes abaixo; não representa aprovação integral da suíte ampla de estabilidade.

## 7. Interface e capturas

Diário protegido em `/rpg/quests`, acesso em `/rpg`, diálogos no Refúgio e tracker de exploração. Exibe requisitos, progresso persistido, próxima ação, beneficiário, custos/recompensas, histórico e escolha. Fecha diálogos por Escape e devolve foco; controles de toque validados em emulação. O tracker fica à esquerda para não cobrir o chat.

Capturas **reais** do Chromium, sem mock visual:

- [Missões disponíveis](qa/quests/available.png), [serviço do NPC](qa/quests/npc-quest.png), [escolha persistente](qa/quests/choice.png).
- [Exploração](qa/quests/exploration.png), [gathering e tracker](qa/quests/gathering.png), [conclusão](qa/quests/completed.png), [diário mobile](qa/quests/mobile-reward.png).

NPCs e tiles conservam os fallbacks existentes. Nenhum novo pacote de assets foi gerado. A captura mobile mostra o topo do diário; as assertions do teste também verificam persistência e interação por toque.

## 8. Resultados executados

Node 22.23.3, Next 16.3.5, Prisma 7.10.0, PostgreSQL 18.4 e Chromium local. Banco descartável `limiar_rpg_phase6_20261013`; testes de migração criam bancos temporários próprios. Nenhum banco de produção usado. Os logs preservam a saída real, com espaços finais e CRLF normalizados; ignorados não contam como aprovados.

| Comando / execução | Aprovados | Falhos | Ignorados | Evidência |
|---|---:|---:|---:|---|
| Baseline `npm test` em main | 272 | 0 | 81 | [log](qa/quests/baseline.log) |
| `npx prisma validate` | schema válido | 0 | — | [log](qa/quests/prisma-validate.log) |
| `npx prisma generate` | cliente gerado | 0 | — | [log](qa/quests/prisma-generate.log) |
| `npm run typecheck` | concluído (exit 0) | — | — | [log](qa/quests/typecheck-final.log) |
| `npm run lint` | concluído (exit 0) | — | — | [log](qa/quests/lint-final.log) |
| `npm test` final | 282 | 0 | 96 | [log](qa/quests/unit-final.log) |
| `npm run build` | concluído (exit 0) | — | — | [log](qa/quests/build.log) |
| `RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test` | 373 | 0 | 5 realtime | [log](qa/quests/database-final.log) |
| Realtime: cinco arquivos, `RUN_REALTIME_TESTS=1` | 4 | 1 | 0 | [log](qa/quests/realtime.log) |
| Realtime exploração repetido isoladamente, sem alterações | 1 | 0 | 0 | [log](qa/quests/realtime-exploration-repeat.log) |
| `npm run test:browser` completo, flags ligadas | 14 | 4 | 1 | [log](qa/quests/browser-full.log) |
| Browser quests + Refúgio, após correção do seletor | 5 | 0 | 0 | [log](qa/quests/browser-target-final.log) |
| Browser quests, `RPG_QUESTS_ENABLED=false` | 1 | 0 | 2 dependentes da flag | [log](qa/quests/browser-disabled.log) |
| Browser auth/rollout, quests ligada e outras atividades desligadas | 1 | 0 | 0 | [log](qa/quests/browser-independent-flags.log) |

Arquivos realtime: `tests/realtime.test.ts`, `tests/rpg-equipment-realtime.test.ts`, `tests/rpg-expedition-realtime.test.ts`, `tests/rpg-exploration-realtime.test.ts`, `tests/rpg-quests-realtime.test.ts`. A execução ampla falhou esperando ARENA_LOBBY_STATE no teste existente de exploração; repetição isolada passou em 58,67 s. Isso documenta instabilidade, não transforma a primeira execução em aprovação.

Browser: `RPG_ENABLED=true RPG_QUESTS_ENABLED=true RPG_REFUGE_ENABLED=true RPG_EXPLORATION_ENABLED=true RPG_EXPEDITIONS_ENABLED=true RPG_EXPEDITION_BROWSER_DRIVER=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`. O driver é exclusivo da infraestrutura de testes. As quatro falhas amplas foram:

1. Duas falhas históricas de estabilidade com 2/5 jogadores: `remoteGameInstances` esperado 1, observado 0. Assertions preservadas; [evidência 2](qa/quests/stability-after-2-natural.json), [evidência 5](qa/quests/stability-after-5-natural.json).
2. Movimento temporizado do Refúgio não encontrou o alvo; repetição do arquivo original passou, sem mudar suas assertions.
3. Novo teste de abas usava `getByRole("alert")` ambíguo com o anunciador de rotas do Next. Seletor restringido à região do diário; teste passou, inclusive retry offline, outra conta e toque mobile.

A primeira tentativa de migração com dados antigos falhou na fixture anterior à migração por ID de POI inválido; corrigido para o formato real da Fase 5. A suíte completa de banco subsequente passou. Esses incidentes não foram ocultados nem resolvidos desativando assertions.

Novos testes: domínio (6), actions (4), banco (8), fontes de combate/settlement (4), migrações (2), realtime (1), além de três casos browser. São 25 novos casos Vitest sobre o baseline (378 totais). Warning preexistente de lint `TAU` não utilizado; logs browser também registram fallbacks de atlas, warning de key no Refúgio e depreciação do driver pg, sem pageerror no arco narrativo.

## 9. Performance

Benchmark local sequencial de 10 contas, scripts opt-in, sem tráfego de produção. [Medição completa](qa/quests/benchmark.json), [log](qa/quests/benchmark.log). P95 inclui toda a chamada (inclusive espera por lock); contagem inclui todas as consultas da operação.

| Operação | Amostras | P95 ms | P95 consultas |
|---|---:|---:|---:|
| Aceite | 10 | 427,11 | 32 |
| Escolha de diálogo | 40 | 197,23 | 55 |
| Prova/conclusão | 20 | 117,90 | 56 |
| Resgate | 10 | 86,09 | 38 |
| Diário/histórico | 30 | 50,83 | 21 |

Heap delta agregado: 47.130.120 bytes, incluindo aquecimento de Prisma/JIT; não é medida de vazamento ou custo por jogador. Leituras limitadas, mas há oportunidade de reduzir consultas antes de escala de produção. [Latências do fluxo browser](qa/quests/browser-metrics.json): aceite 491,76 ms e resgate 382,41 ms, amostras individuais, não P95.

Benchmark existente de exploração repetido com cinco jogadores: geração P95 4,32 ms, tick P95 0,144 ms, snapshot de cinco jogadores P95 0,557 ms, **zero queries no tick**, validação de intenção P95 5,93 ms, transação P95 51,33 ms, query SQL P95 2,09 ms. Cinco claims; 115 queries totais de gathering. Heap da região 407.192 bytes, estimativa 81.438,4 por jogador com aquecimento incluído. [Dados](qa/quests/exploration-benchmark.json), [log](qa/quests/exploration-benchmark.log).

O benchmark pesado anterior da Fase 5 (cinco jogadores/1.100 inimigos, P95 46,27 ms acima do orçamento de 40 ms) **não foi repetido** nesta fase nem é declarado corrigido. As medições atuais não equivalem a teste de carga ou comparação estatística antes/depois.

Reprodução dos benchmarks no banco local isolado: `RUN_RPG_BENCHMARK=1 RPG_ENABLED=true RPG_QUESTS_ENABLED=true node --conditions=react-server --import tsx scripts/rpg-quests-benchmark.ts`; o benchmark de exploração usa as flags próprias e `scripts/rpg-exploration-benchmark.ts`.

## 10. GitHub e arquivos

Cinco PRs encadeados, integração na ordem A → B → C → D → E. O settlement de recompensas foi agrupado com as fontes em C, pois depende delas; B contém persistência/migração. Teste browser integrado e capturas estão em E para executar a pilha completa. Cada PR descreve seu escopo e dependências. Nenhum merge automático.

PR_LINKS_PENDING

O [manifesto de arquivos](qa/quests/files.txt) lista alterações de implementação, testes e documentação. Artefatos de QA ficam em `docs/qa/quests`; saídas históricas de browser em outros diretórios foram preservadas. As flags desligadas permitem integrar a pilha sem publicar a campanha antes de revisão narrativa e operacional.

## 11. Riscos residuais

- Conteúdo novo e balanceamento de recompensas aguardam revisão; NPCs continuam com arte/fallbacks existentes.
- Capítulo limitado a três principais e duas secundárias. Domínio prevê CHARACTER, mas não há quest inicial desse escopo; descobertas sem atribuição por personagem são aceitas somente em ACCOUNT/retroatividade explícita.
- Fontes duráveis precisam de retenção enquanto sustentarem direitos ainda não reconciliados. Não há reconstrução de gameplay perdido sem prova persistida.
- Consultas por operação ainda podem ser otimizadas. Índices de históricos precisam ser avaliados no volume de staging; benchmark local não comprova capacidade de produção.
- Mobile foi emulado no Chromium, não testado em aparelho físico. Falhas históricas de estabilidade e intermitência de matchmaking/movimento permanecem relatadas.
- Nenhuma alteração no modelo de autoridade do realtime ou solução de múltiplos processos concorrentes de simulação nesta fase.
- Rollback de rollout: desligar `RPG_QUESTS_ENABLED`, conservar tabelas/dados; reativar reconcilia fontes duráveis. Não remover a migração com DROP.
- Fase 7, crafting, comércio, novas moedas, facções e campanha completa permanecem fora desta entrega.
