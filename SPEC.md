# LIMIAR — evolução incremental

## §G

Preservar survivor local; evoluir engine compartilhado, contas/social e co-op autoritativo até 5.

## §C

Auditoria integral antes de código (docs/AUDIT.md). Canvas preservado. TS strict sem any.
Reutilizar conteúdo/comportamentos. Banco nunca recebe frames. Sem polling de gameplay.
Sem migrate reset, segredos, autenticação em localStorage ou recompensas confiadas ao cliente.
Usuário autorizou implementação/testes/correções das 17 fases; checkpoints não exigem nova aprovação.

## §I

- I.core: simulação headless compartilhada; input normalizado; tick fixo.
- I.save: chave limiar.save.v1; schemas antigos migráveis; export/import e resume.
- I.web: Next App Router, ações discretas autenticadas, UI em português.
- I.db: Prisma/PostgreSQL, migrations incrementais; DATABASE_URL obrigatória para online.
- I.ws: WS autenticado por ticket curto; schemas fechados; inputs e snapshots delta.

## §V

V1. Catálogo e saves antigos preservados; baseline byte a byte disponível.
V2. Core importável em Node sem window/document/canvas; solo sem rede.
V3. Sessão HttpOnly/SameSite/Secure produção; hash moderno; userId da sessão.
V4. Máximo 5 atômico, sem ingresso após start; ready de todos; liderança transferível.
V5. Estado online pertence ao servidor; input não contém posição/dano/reward confiáveis.
V6. Resultados/recompensas idempotentes; banco sem snapshots de frames.
V7. Room compartilha mundo/seed/waves; builds individuais; XP cooperativa normalizada.
V8. Prediction/reconciliation local, interpolation remota, interesse/deltas e reconexão.
V9. Amizades autorizam DMs; chat texto limitado, paginado, protegido contra spam.
V10. Progressão: 25–30 decisões alvo; intervalo entre escolhas; path 6–8 min; evolução 10–14.
V11. HUD essencial, pause/build completo; banir em modo seleção; late-game menos modais.
V12. Reconnect não duplica jogador/recompensa; partySizeAtStart imutável; revive/wipe.
V13. Formatos locais não constituem mérito online; import explícito com proveniência.
V14. Verificações reais; registrar bloqueios e métricas medidas, nunca resultados supostos.
V15. Escolhas/recompensas pendentes sobrevivem ao resume; status restaurados sem protótipos perdidos.

## §T

| id | status | tarefa | cites |
|---|---|---|---|
| T1 | x | Baseline: auditoria, cópia, navegador, hashes | V1,V14 |
| T2 | ~ | Next/TS e extração preservando gameplay | V1,V2,V15,I.core,I.save |
| T3 | . | Prisma/schema/migrations e configuração | V3,V6,I.db |
| T4 | . | Auth: cadastro/login/logout/sessão | V3,I.web |
| T5 | . | Progresso online e import explícito | V6,V13,I.save |
| T6 | . | Design pass e telemetria | V10,V11 |
| T7 | . | Amizades/presença/DM | V3,V9 |
| T8 | . | Equipe/código/ready/liderança | V4 |
| T9 | . | WS/tickets/schemas/rooms | V3,V5,I.ws |
| T10 | . | Movimento/prediction/reconciliation/interpolation | V8 |
| T11 | . | Simulação autoritativa compartilhada | V2,V5,V7 |
| T12 | . | Co-op XP/loot/estruturas/revive/scaling | V7,V12 |
| T13 | . | Party HUD/chat/build pendente | V9,V11 |
| T14 | . | Segurança e casos adversariais | V3,V4,V5,V6,V9,V13 |
| T15 | . | Carga 5 clients, latência/reconnect | V8,V12,V14 |
| T16 | . | Balanceamento com telemetria | V10,V14 |
| T17 | . | QA final e relatório | V1,V14 |

## §B

| id | date | cause | fix |
|---|---|---|---|
| B1 | 2026-09-15 | Snapshot original omite decisões pendentes/status com protótipo | V15 |
