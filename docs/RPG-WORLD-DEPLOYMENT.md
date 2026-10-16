# Implantação e rollback da Fase 6.5

Entrega preparada para revisão; nenhum merge ou deploy de produção é automático. As duas novas migrações foram aplicadas e testadas em PostgreSQL local isolado, incluindo upgrade de dados compatíveis com a Fase 6. Esta entrega não aplicou migrações no Neon de produção.

## Ordem

1. Revisar a stack A → F → B → C → D → E → G e a comparação completa com main. F precede os consumidores por dependência do schema.
2. Manter `RPG_SHARED_WORLD_ENABLED=false` no Next/Vercel e no realtime. Validar backup, espaço/locks e janela do banco de destino. Executar `npx prisma migrate deploy` com credenciais desse ambiente; não editar migrações históricas nem executar reset.
3. Gerar Prisma e publicar web/realtime da mesma versão de protocolo WORLD v1. Parar a autoridade anterior antes de iniciar a nova: há uma autoridade por banco, sem rolling overlap. Atualizar o serviço Node 22 do home-server pelo procedimento operacional existente.
4. Confirmar `/health`: build `limiar-phase6.5-v1`, protocolo 1, autoridade única, capacidade vinte e flags coerentes. O lock usa uma conexão direta adicional ao banco. Neon pooled é convertido para direct nessa conexão; permitir acesso DNS/TLS ao endpoint direto. Não foi realizado teste de conectividade Neon nesta entrega.
5. Habilitar `RPG_ENABLED=true` e `RPG_SHARED_WORLD_ENABLED=true` em ambos os processos de um ambiente de validação. Verificar duas contas independentes, portal, coleta, PvE, refresh e replay antes do rollout público.

## Flags

| Flag | Semântica |
| --- | --- |
| RPG_ENABLED | Base de todos os recursos RPG. |
| RPG_SHARED_WORLD_ENABLED | Mundo, Shell, serviços básicos de personagem/equipamento/depósito, gathering e PvE de campo. Default false; web e realtime devem concordar. |
| RPG_QUESTS_ENABLED | Diário, objetivos, diálogo e mutações de quests, também dentro do mundo. |
| RPG_REFUGE_ENABLED | Rota e experiência local legada `/rpg/refuge`; não bloqueia o Refúgio compartilhado. |
| RPG_EXPLORATION_ENABLED | Expedição de exploração legada com Team/GameSession; não bloqueia as Ruínas públicas. |
| RPG_EXPEDITIONS_ENABLED | Expedições RPG instanciadas; não autoriza loot de campo. |
| REALTIME_DIAGNOSTICS=1 | Tempos/heap/CPU opt-in em health; desnecessário ao gameplay. |

O teste browser do mundo foi executado com flags legadas de Refúgio/exploração/expedição desligadas, demonstrando a separação. Sessões legadas permanecem disponíveis por suas flags próprias.

## Rollback e recuperação

Desabilitar a flag do mundo nos dois processos e reiniciar o realtime de forma controlada. Conservar tabelas, receipts, itens, claims e descobertas; usar as rotas legadas. Não restaurar um binário antigo incompatível com claims de origem worldVisitId sem auditar essa leitura. Rollback por flag na versão compatível é o caminho suportado.

Shutdown remove presenças e libera o lock; reinício fecha visitas antigas e recupera eventos PENDING duráveis. Reconexão volta à entrada segura do último checkpoint. Posições, ataques e mortes ainda não duráveis não são reconstruídos. Nunca limpar receipts/claims para desbloquear jogador ou liberar cota.

## Validação reproduzível

Usar Node 22, Chromium e PostgreSQL descartável, com DATABASE_URL e segredos de QA explícitos. A `.env` do checkout pode apontar ao Neon real: não executar testes destrutivos com ela. Rodar suites de banco, realtime e navegador sequencialmente, pois usam gatilhos de falha e porta realtime exclusiva.

```bash
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npm test
RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test
RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts tests/rpg-expedition-realtime.test.ts tests/rpg-exploration-realtime.test.ts tests/rpg-quests-realtime.test.ts tests/rpg-world-realtime.test.ts tests/rpg-world-capacity.test.ts
RPG_ENABLED=true RPG_SHARED_WORLD_ENABLED=true RPG_QUESTS_ENABLED=true RPG_REFUGE_ENABLED=false RPG_EXPLORATION_ENABLED=false RPG_EXPEDITIONS_ENABLED=false npm run test:browser -- tests/browser/rpg-world.spec.ts
RPG_ENABLED=true RPG_SHARED_WORLD_ENABLED=false RPG_QUESTS_ENABLED=true RPG_REFUGE_ENABLED=true RPG_EXPLORATION_ENABLED=true RPG_EXPEDITIONS_ENABLED=true RPG_EXPEDITION_BROWSER_DRIVER=1 npm run test:browser
npm run assets:tiles:validate
npm run assets:characters:validate
node --conditions=react-server --import tsx scripts/benchmark-rpg-world.ts
npm run build
```

O driver de expedições pertence exclusivamente aos testes legados. O browser do mundo usa o servidor normal, sem aceleração/grants de fixture. Benchmarks em `docs/qa/world` descrevem hardware, métodos e limites. Os resultados efetivos, incluindo falhas e skips, estão no [relatório](RPG-PHASE6-5-QA.md).
