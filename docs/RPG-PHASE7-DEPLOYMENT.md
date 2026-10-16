# Implantação da Fase 7

Main base `bb4609a`, seis PRs encadeados A→B→C→D→E→F. Nenhum merge/deploy automático. QA utiliza Node 22, PostgreSQL local isolado e Chromium.

No QA `limiar_forge_qa`, dezessete migrações aplicadas; upgrade vazio e com dados Fase 6.5 testados. Nova `20261016010000_rpg_forge` cria registros/índices/checks/triggers e amplia checkpoint Refúgio v2, sem apagar dados. Reservar janela de DDL compatível com o volume de visitas; lock_timeout de cinco segundos limita espera por lock, não a duração de validação do CHECK.

A tentativa autorizada anterior de migrate deploy no Neon falhou ao conectar; o diagnóstico externo seguinte foi negado. Nenhuma migração foi aplicada nessa tentativa. O status remoto atual não foi confirmado. Conferir as migrações Fase 6.5 e Fase 7 antes do rollout. Nunca executar reset, SIGKILL ou triggers de QA contra produção.

## Procedimento para o operador

1. Revisar/integrar em ordem, conferir SHA da main e backup. Validar Neon pooled/direto com TLS verificado. Uma autoridade por banco; não iniciar segunda instância.
2. Manter RPG_CRAFTING_ENABLED=false. Parar controladamente `limiar-realtime.service` antes de atualizar protocolo/geometria. Executar `npx prisma migrate deploy` no checkout integrado e banco correto. Não editar migrações históricas.
3. Usar Node 22, instalação pelo lockfile, Prisma generate, typecheck e build. Publicar web/realtime da mesma revisão. NEXT_PUBLIC_REALTIME_URL deve ser WSS em produção e existir no build; segredos permanecem no servidor.
4. Reiniciar o serviço pelo procedimento existente do home-server e conferir `/health`: build padrão limiar-phase7-v2, WORLD protocolo 2, capacidade vinte, autoridade única. O lock exige uma conexão PostgreSQL direta adicional. Processo antigo deve terminar/liberar o lock antes do novo.
5. Habilitar RPG_ENABLED, RPG_SHARED_WORLD_ENABLED e RPG_CRAFTING_ENABLED nos dois processos primeiro em staging. RPG_QUESTS_ENABLED controla narrativa independentemente; flags legadas não são dependências dos serviços básicos.
6. Smoke com contas distintas: coleta real, proximidade/bloqueio remoto, forja, comércio, histórico, replay, refresh e reconexão. Conferir ledger e UserProgress.version para GOLD, revisão RPG separada nas operações materiais. Ativar público após revisão operacional.

WORLD_ENTER aceita a versão numérica antiga para responder “Atualize o cliente”, mas não admite presença v1 no servidor v2. Refúgio público v2 e Ruínas v1 aparecem no snapshot novo. Survivor/PvP, WorldVersion/seed/chunks e Refúgio local legado são preservados. Publicar somente um dos processos não é rollout suportado.

## Rollback

Desligar RPG_CRAFTING_ENABLED no Next e realtime e reiniciar controladamente, conservando binário/protocolo compatíveis. Preservar itens, receipts, saldos e cotas. Não executar DROP nem reconstruir carteira no frontend. Se necessário, desligar também o mundo e usar as rotas legadas. Downgrade de binário/geometria exige nova auditoria; não é o rollback proposto.

## Reprodução em base isolada

A `.env` contém Neon real: fornecer DATABASE_URL e segredos próprios de QA. Suites DB/realtime/browser executam sequencialmente por usarem autoridade única e injeção de falhas.

```bash
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npm test
RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test
RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts tests/rpg-expedition-realtime.test.ts tests/rpg-exploration-realtime.test.ts tests/rpg-quests-realtime.test.ts tests/rpg-world-realtime.test.ts tests/rpg-world-capacity.test.ts tests/rpg-crafting-realtime.test.ts
RPG_ENABLED=true RPG_SHARED_WORLD_ENABLED=true RPG_CRAFTING_ENABLED=true RPG_QUESTS_ENABLED=true RPG_REFUGE_ENABLED=false RPG_EXPLORATION_ENABLED=false RPG_EXPEDITIONS_ENABLED=false npm run test:browser -- tests/browser/rpg-world.spec.ts tests/browser/rpg-crafting.spec.ts
RPG_ENABLED=true RPG_SHARED_WORLD_ENABLED=false RPG_CRAFTING_ENABLED=false RPG_QUESTS_ENABLED=true RPG_REFUGE_ENABLED=true RPG_EXPLORATION_ENABLED=true RPG_EXPEDITIONS_ENABLED=true RPG_EXPEDITION_BROWSER_DRIVER=1 npm run test:browser
node --conditions=react-server --import tsx scripts/simulate-rpg-economy.ts
RUN_RPG_BENCHMARK=1 RPG_ENABLED=true RPG_SHARED_WORLD_ENABLED=true RPG_CRAFTING_ENABLED=true node --conditions=react-server --import tsx scripts/benchmark-rpg-crafting.ts
npm run assets:tiles:validate
npm run assets:characters:validate
npm run build
```

O driver é somente das expedições legadas. O fluxo principal browser da forja usa servidor normal e ingredientes obtidos por gameplay; mobile identifica sua fixture isolada. Consulte resultados efetivos no [QA](RPG-PHASE7-QA.md).
