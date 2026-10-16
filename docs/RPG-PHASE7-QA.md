# Fase 7 — Forja dos Ecos: implementação e QA

Base auditada: `main` em `bb4609adabed742070958e42a781b9e7b97fcbef`, confirmada novamente após fetch em 16/10/2026. Fases 0–6.5 presentes; nenhuma forja pública anterior foi recriada. Branch consolidada `codex/rpg-phase7`, seis PRs encadeados A→B→C→D→E→F, sem merge, deploy de produção ou Fase 8.

## Auditoria e resultado

| Encontrado | Resultado |
| --- | --- |
| Catálogos de equipamentos, affixes e quatro materiais já existentes | Reutilizados; seis receitas versionadas, sem novos itens, materiais, moedas ou modificadores-base. |
| Shared world com serviços privados e revisão RPG | Forja, refinaria e comerciante usam o mesmo WORLD_RPC, presença, permit privado e lock UserProgress. |
| História de mutações sem projeção de comércio | RpgCommerceRecord acompanha o receipt canônico, custos, ganhos, instância e cotas; histórico paginado por conta. |
| GOLD compartilhado com Survivor | Compra/venda reutilizam ledger e persistSave atomicamente. Somente operações que movimentam GOLD incrementam UserProgress.version. |
| Refúgio sem estações de forja | Três estações físicas com colisão/proximidade, painel dentro do shell, confirmação, estoque e feedback. |
| Desbloqueios narrativos poderiam confiar apenas em flag | Agora exigem quest REWARDED, receipt de recompensa e definição canônica da flag. |
| Simulação inicial omitia shards garantidos das expedições/bosses | Corrigida para consultar os perfis e tabelas existentes; nenhuma recompensa histórica alterada. |
| Arena falhava na primeira criação simultânea de Season | Reproduzido: sete P2002 em doze chamadas. createMany/skipDuplicates + leitura preservam metadados existentes e removem a corrida; regressão PostgreSQL adicionada. |

Receitas: Lâmina Gasta, Manto de Cinzas, Talismã do Obelisco e as três variantes de nível 5. Refinamento transforma seis minérios/quatro fibras em um pó. Aprimoramento conserva instância/nível, limitado a COMMON→RARE e RARE→EPIC; reforja troca affixes sem garantir melhora e sem alterar identidade/raridade. LEGENDARY não é fabricado nem promovido. Itens novos entram no inventário, desequipados.

Comerciante vende dois comuns por GOLD e oferece escambo de manto. Venda consome uma instância própria, não equipada e fora do STASH; nunca aceita preço do cliente. Cotas por conta: seis crafts, dois crafts raros, dois upgrades, três reforjas, três refinamentos, duas compras e três vendas/cinco GOLD por dia UTC. GEMS não participa. Inventário de criação limitado a 200 instâncias existentes, contando STASH; itens históricos não são removidos e loot anterior mantém seus próprios limites. Detalhes e riscos de oferta em [política](RPG-ECONOMY-POLICY.md) e [balanceamento](RPG-ECONOMY-BALANCE.md).

## Segurança e persistência

Identidade deriva do ticket autenticado; comandos estritos aceitam intenções, revisão, versão e requestId. Seeds privadas usam node:crypto e o roller canônico. Ownership, localização, quantidade unitária, elegibilidade, saldo e limites são revalidados na transação Serializable. Lock UserProgress precede writes RPG/econômicos; retries limitados apenas aos aborts transitórios já reconhecidos. O permit exige visita ativa e estação correta e é revalidado após awaits, antes do commit. Ausência de presença, morte, distância, mudança de zona ou flag desligada impedem a operação.

Mesmo requestId/payload retorna o receipt persistido; payload diferente rejeita. IDs diferentes na mesma revisão produzem um vencedor. Materiais, item, revisão, ledger, receipt e registro comercial confirmam juntos ou sofrem rollback. Itens equipados/STASH, referências cruzadas entre usuários, overflow e inputs extras são rejeitados. Histórico não expõe seeds privadas; cursor deve pertencer ao usuário. Não há endpoint público de grant.

Migração única `20261016010000_rpg_forge`: RpgCommerceRecord com FKs compostas para personagem e receipt, índices, CHECKs de versão/tipo/tamanho e triggers de coerência/imutabilidade. Receipt RPG também fica imutável. instanceId histórico não é FK: a venda remove a instância e conserva sua prova. Amplia CHECK do checkpoint e a atualização de metadados para Refúgio compartilhado v2, mantendo identidade da visita imutável; Ruínas permanece v1. Migrações históricas não foram editadas. Bases temporárias vazia e preenchida Fase 6.5 conservam perfil, personagem, STASH, materiais, receipt e visita, incluindo cascata de exclusão.

Dezessete migrações foram aplicadas apenas no PostgreSQL isolado `limiar_forge_qa`. O deploy Neon solicitado antes desta fase falhou na conexão; o diagnóstico externo seguinte foi negado. Nenhuma migração foi aplicada naquela tentativa e o status remoto atual permanece sem confirmação. A migração da Fase 7 não foi enviada ao Neon.

## Validação executada

Node 22.23.3, Next 16.3.5, Prisma 7.10.0, PostgreSQL 18.4 e Chromium do sistema. Wrapper local substitui DATABASE_URL e segredos; a .env real não foi usada para QA. Suites com SQL, realtime e browser executadas sequencialmente. Logs em [qa/crafting](qa/crafting); skips não contam como aprovação. Comandos completos e combinações de flags em [deployment](RPG-PHASE7-DEPLOYMENT.md).

| Nome / comando | Aprovados | Falhos | Ignorados | Duração | Evidência |
| --- | ---: | ---: | ---: | --- | --- |
| Baseline main: npm test | 290 | 0 | 111 | 9,44 s | baseline.log |
| Baseline mundo: test:browser -- rpg-world.spec.ts | 2 | 0 | 0 | 1 min | world-baseline-browser.log |
| Prisma validate / generate | schema/cliente | 0 | 0 | log | prisma-validate.log / prisma-generate.log |
| npm run typecheck | exit 0 | 0 | 0 | log | typecheck.log |
| npm run lint | exit 0 | 0 | 0 | log | lint.log; warning TAU preexistente |
| npm test, sem flags | 298 | 0 | 132 | 10,33 s | unit.log |
| RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test | 420 | 0 | 10 | 58,99 s | database.log |
| SQL focal após ampliar o caso de item corrompido: rpg-crafting-database.test.ts | 12 | 0 | 0 | 2,62 s | database-corrupt-item.log |
| Realtime amplo, primeira execução | 9 | 1 | 0 | 317,96 s | realtime-before-season-fix.log |
| Season simultânea antes da correção | 0 | 1 | 0 | log | season-before.log |
| Season simultânea após correção | 1 | 0 | 0 | 673 ms | season-after.log |
| Exploração/Arena após correção | 1 | 0 | 0 | 28,69 s | exploration-after.log |
| Realtime amplo final, oito arquivos | 10 | 0 | 0 | 289,74 s | realtime.log |
| Browser mundo/forja final | 4 | 0 | 0 | 7,0 min | browser-world.log |
| Mobile/tablet focal e captura da estação após estabilizar resize | 1 | 0 | 0 | 21,8 s | browser-mobile.log |
| Browser legado completo | 17 | 2 | 4 | 6,5 min | browser-legacy.log |
| Prisma migrate status, banco local | 17 aplicadas | 0 | 0 | log | migrate-status.log |
| Assets tiles / personagens | exit 0 | 0 | 0 | log | assets-tiles.log / assets-characters.log |
| npm run build | exit 0 | 0 | 0 | log | build.log |

Os dois testes legados de estabilidade (duas/cinco contas) falharam na mesma asserção já registrada no QA da Fase 6.5: remoteGameInstances esperado 1, recebido 0. Foram preservadas as asserções; não foi alterado gameplay para tornar o teste verde. Diagnósticos e logs estão nesta entrega. Isso impede declarar a suíte completa de browser aprovada, embora os quatro testes do mundo/forja e os dezessete fluxos legados funcionais tenham passado.

A suíte SQL inclui autenticação/flags, ownership, STASH/equipados, revisão concorrente, replay, receita desbloqueada posteriormente, cotas, cursor e registros imutáveis, disputa com economia Survivor e entrega de quest, overflow e injeção de falhas em item/receipt/commerce. Os testes de migração são executados, não só Prisma validate.

Realtime da forja usa socket autenticado e simulação normal: coleta real, proximidade/epoch, inputs maliciosos, craft/replay/histórico. O cenário separado com fixtures explicitamente identificadas exercita GOLD e SIGKILL durante a transação: todos os writes revertem; retry confirma uma vez. Também perde resposta após commit, reinicia o processo e retorna o receipt anterior sem outro item. Fixtures internas não são prova de aquisição por gameplay.

O browser principal registra conta sem materiais/GOLD, anda nas Ruínas, realiza onze claims reais e obtém pó por combate de campo. Volta à forja, cria manto, promove a RARE, equipa, verifica modificadores, compra por escambo, vende o comum comprado, confere ledger e persistência após refresh e continua no mundo. A versão só muda pela venda GOLD; quatro registros comerciais. A primeira tentativa encontrou cancelamento legítimo da segunda coleta por combate/revisão; o teste passou a repetir a interação real com estado atualizado, sem fabricar claims. A execução intermediária passou dois testes em 5,5 min; a execução final abaixo inclui também tablet.

Mobile usa fixture declarada para isolar ergonomia, viewport 390×844/touch, criação confirmada, scroll e retorno ao mesmo Canvas; tablet 768×1024. Não substitui o fluxo principal sem fixtures. Screenshots são capturas reais da aplicação: [forja](qa/crafting/forge-before.png), [aprimoramento](qa/crafting/forge-upgraded.png), [comércio](qa/crafting/trader-history.png), [mobile](qa/crafting/forge-mobile.png) e [tablet](qa/crafting/forge-tablet.png) e [estação no mundo](qa/crafting/forge-world.png). Estações/NPCs usam os fallbacks desenhados no renderer e ícones existentes; arte dedicada ainda pode ser refinada.

## Cobertura do aceite

| Critérios do pedido | Evidência |
| --- | --- |
| 1–12: mundo, estação, receita, custos e equipamento legítimo | Geometria/protocolo, regras puras, SQL e fluxo browser sem grants de fixture. |
| 13–23: refino, upgrade, reforja, comércio, GOLD e replay | Persistência das seis operações, ledger existente, cotas e disputas de revisão. |
| 24–31: rollback, proximidade, ownership, STASH, narrativa e arbitragem | Injeções SQL e crash realtime, permit revalidado, provas canônicas de quest e simulador. |
| 32–35: HUD/Canvas/socket/mobile | Métricas de instâncias/loops, identidade de shell/epoch e capturas desktop/touch/tablet. |
| 36–42: compatibilidade, migração, suites e benchmarks | Logs completos com falhas e skips separados; banco vazio/preenchido e medições reais. |
| 43–49: screenshots, flags, rollback, PRs e escopo | Capturas da aplicação, documentação operacional e seis PRs; nenhum deploy/merge/Fase 8. |

## Medições

[Benchmark](qa/crafting/benchmark.json): vinte contas isoladas, vinte amostras sequenciais por operação, PostgreSQL local e fixture interna de permit/recursos. SQL mede chamadas reais pg.Client.query, incluindo BEGIN/COMMIT. Não representa latência WAN nem aquisição por gameplay.

| Operação | P95 ms | SQL P95 |
| --- | ---: | ---: |
| Craft | 54,80 | 23 |
| Upgrade | 21,76 | 23 |
| Reforge | 18,02 | 23 |
| Buy | 17,93 | 22 |
| Sell | 20,43 | 22 |
| Refine | 20,33 | 23 |
| Catálogo | 9,33 | 14 |
| Histórico | 4,10 | 5 |

Cinco requests simultâneos iguais: 106,59 ms/123 statements, cinco respostas confirmadas e um registro. Cinco IDs/mesma revisão: 70,74 ms/131 statements, um commit e quatro rejeições. Tempo inclui espera por locks; duração individual de lock não foi instrumentada. Catálogo P95 4.311 bytes. Hardware AMD EPYC 9V74, cinco CPUs lógicas disponíveis. Métricas individuais no JSON, sem extrapolação para produção.

As métricas realtime e browser são gravadas diretamente nos testes em realtime-metrics.json/browser-metrics.json. Na execução realtime final, craft por RPC levou 50,09 ms, resposta 503 bytes; tick P95 0,817 ms/P99 2,247 ms, drift P95 1,671 ms e lote de snapshot P95 0,710 ms, com um jogador e simulação normal. Isso mede o cenário observado, não aumento causal nem capacidade de produção. A amostra browser, coletada antes do refresh/cleanup, levou 262,19 s para onze claims e o ciclo até comércio, com uma instância, um RAF e um cliente de rede; StrictMode registra dois mounts/um dispose. Render P95 3,3 ms e intervalo de frame P95 16,8 ms. O contador SQL de mundo confirma zero statements em cinquenta ticks/vinte lotes de snapshot no Refúgio; serviços e persistência ficam fora do loop por frame. Teste de capacidade usa cinquenta conexões para limite vinte, não cinquenta avatares admitidos. Não foi feito soak longo nem benchmark de WAN.

## Compatibilidade e limites

SAVE_SCHEMA=3, ECONOMY_VERSION=2, RunState, RunSnapshot, Player.level/XP temporário, inventário Survivor de quatro slots, world seed/worldVersion/chunks/IDs antigos, importação local/CloudSolo e settlements anteriores são preservados. Não há recompensa RPG originada de save ou alegação do cliente. O patch em ranked.ts corrige somente criação concorrente de Season; não altera PvP, Ranked, Arena, pontuação ou stats. As regras puras e integração SQL verificam que equipamento forjado só influencia o contexto RPG autorizado.

WORLD_PROTOCOL=2 exige publicação coordenada de web e realtime; cliente v1 recebe atualização requerida. Refúgio legado local mantém definição v1; mundo compartilhado usa v2. Mesma instância de shell/Canvas/RAF/socket permanece nos painéis. Não foi introduzido novo renderer ou engine. Rollout tem RPG_CRAFTING_ENABLED=false por padrão, dependente de RPG_ENABLED e RPG_SHARED_WORLD_ENABLED.

Riscos residuais: calibrar oferta de GOLD e limites em staging, revisar impacto do cap 200 para contas antigas, crescimento/retention de receipts, tempo de validação de CHECK sob volume e operação de autoridade única. Sem validação em celular físico, Neon de produção, WAN ou soak longo. Warnings preexistentes pg de consultas concorrentes no mesmo cliente, React de key no RefugeClient legado e lint TAU permanecem. Build e testes não substituem smoke operacional.

Setup de ambiente atualizado em rascunho para Node 22/Chromium/PostgreSQL local e wrapper run-phase7.mjs; não foi publicado e restauração em nova tarefa não foi testada. Segredos não foram versionados.

## PRs e arquivos

O [manifesto](qa/crafting/files.txt) lista arquivos relativos à main. Descrições individuais documentam escopo, dependência e validação. Revisar A→B→C→D→E→F; após integrar uma etapa, conferir a base da seguinte conforme estratégia de merge. Não houve merge automático. Checks amplos foram executados na stack integrada; não foram repetidos em cada commit intermediário.

| PR | Branch → base | Commit principal |
| --- | --- | --- |
| [A #46](https://github.com/devKire/survivor_game/pull/46), domínio/economia | codex/rpg-phase7-domain → main | 402c822 |
| [B #47](https://github.com/devKire/survivor_game/pull/47), persistência | codex/rpg-phase7-persistence → codex/rpg-phase7-domain | 476176d |
| [C #48](https://github.com/devKire/survivor_game/pull/48), serviços | codex/rpg-phase7-services → codex/rpg-phase7-persistence | 153f6c2 |
| [D #49](https://github.com/devKire/survivor_game/pull/49), mundo/UI | codex/rpg-phase7-world-ui → codex/rpg-phase7-services | e0b1f66 |
| [E #50](https://github.com/devKire/survivor_game/pull/50), narrativa/segurança | codex/rpg-phase7-integration → codex/rpg-phase7-world-ui | d71393d |
| F, QA/rollout | codex/rpg-phase7 → codex/rpg-phase7-integration | aa5f85a (Season), QA a registrar |

Nenhuma implantação de produção foi realizada. A Fase 8 permanece fora desta entrega.
