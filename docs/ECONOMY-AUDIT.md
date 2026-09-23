# Novo path — auditoria e checkpoints

Auditoria em 23/09/2026. Árvore inicialmente limpa. Fontes: código atual, schema,
migrations, testes e consulta agregada somente leitura; documentos antigos são contexto.
Baseline: `npm test`: 47 passaram / 5 ignorados; `npm run typecheck`: passou.

## Mapa dos sistemas

| Sistema | Estado / autoridade | Dependências / mudança | Migração / risco / prova |
|---|---|---|---|
| Web | Next 16.3 App Router, React 19, TS strict; `src/app` | Server Actions autenticadas; guia local `07-mutating-data.md` consultado | Preservar rotas; build/lint/Chrome |
| Conta | Better Auth, Argon2id, cookie HttpOnly; `server/auth*` | `User`, `Session`, `Account`; nenhuma troca de auth | Sem migração; auth integration |
| Progresso | `UserProgress.data` JSON; `server/progress.ts` | Reutilizar como carteira; ledger transacional, sem segundo saldo autoritativo | JSON aditivo; locks/revisões; concorrência e replay |
| Banco | Prisma 7 + adapter pg; Neon/PostgreSQL, schema `limiar` | Duas migrations existentes; adicionar ledger, constraints | Sem reset; auditar dados e aplicar migration incremental |
| Economia PvE | Ouro em run, baús, urnas, altar e settlement | Separar XP (`gems` de coleta atuais) de Gemas persistentes; renomear moeda de run | Migração explícita de run/save, sem mudar XP |
| Meta | `META_DEFINITIONS`, `Player.recalculate`, `buyMeta`, menu Canvas | F1 troca custo para Gemas; F2 evolui esses mesmos níveis para árvore | Preservar níveis; compras autenticadas e idempotentes |
| Recompensas | `simulation.finish/checkAchievements`, `realtime/settlement` | Local isolado; online só servidor; ledger e chaves por partida/conquista | Retry, saldo finito, rollback |
| Conteúdo | `content/catalog`: 4 personagens, 8 armas, 24 paths, 2 mapas, 13 conquistas, passivos, bosses, sinergias | Reutilizar identidades; balanço PvP próprio nas fases 5+ | Testes de catálogo, combate e resume |
| Engine | `simulation`, `entities`, `attacks`, `status`, `director`, `world`, `collections`, `math` | Headless compartilhada; combate no GameSimulation, sem classe CombatSystem separada | Math.random ainda usado; determinismo de replay NÃO existe integralmente |
| Co-op | `CoopSimulation` compartilha mundo; 1–5 participantes | Bônus pessoais; coleta compartilhada; migrar moeda sem multiplicar por ativação | Coop tests e 2/5 clientes |
| Realtime | Node/ws, 25 Hz, snapshots 10 Hz, interesse/deltas, input validado | `server.ts`, `snapshots.ts`, `network/*`, `RemoteGame`, `OnlineSession` | Reinício interrompe runs; novo protocolo deve ser implantado junto com cliente |
| Equipes | `Team`, `TeamMember`, locks e slots únicos; servidor | Lobby por código, ready, líder, reconexão de 60 s | Preservar; integração e Chrome |
| Sessions | `GameSession`, `GameSessionMember`; servidor decide resultado | Claim RUNNING→COMPLETED em transação; retries no realtime | Ledger dentro da mesma transação |
| Social/chat | `Friendship`, `ChatMessage`, serviços autenticados, limites | Amizades autorizam DM; equipe autoriza chat | Sem alteração; testes existentes |
| Save | `limiar.save.v1`, schema 3, import/export, activeRun | Adicionar economyVersion; preservar formato e migrar campos de run | Não resetar por versão; fixtures legadas |
| Solo na conta | BrowserGame local, `localArchive`, cache por usuário | Arquivo local sincronizado NÃO é mérito online | Imports nunca creditam carteira; teste adversarial |
| UI/HUD/Códice | Canvas/browser.ts, AccountClient, CSS existente | Mostrar Gemas/Ouro; manter estética e catálogo de descobertas | Chrome offline/online |
| Inventário | Apenas consumíveis temporários na run | Coleção cosmética ainda inexistente; F3 | Não reutilizar inventário temporário para propriedade permanente |
| Loja/Gacha | Inexistentes | F3/F4; conteúdo cosmético, odds centralizadas, RNG servidor | Não criar tabelas antecipadas |
| Matchmaking/rank/PvP | Inexistentes; lobby co-op não é matchmaking | F5 casual autoritativo → F6 Elo/seasons → F7–9 5v5 | Não anunciar suporte antes de testes e métricas |

## Volume real e migração escolhida

Consulta de 23/09/2026 20:59 UTC: 9 contas, 5 financiadas; total 995 ouro;
mínimo 0, máximo 683; p50 42, p90 218,2, p99 636,52; 2 arquivos locais.
Nenhum identificador pessoal foi coletado. Script: `scripts/audit-economy.ts`.

ANTES: ouro antigo G, melhorias U. DEPOIS: Gemas G, Ouro 0, melhorias U.
Exemplo: 683 ouro + Vitalidade 2 → 683 Gemas + 0 Ouro + Vitalidade 2.
Preços das melhorias permanecem numericamente iguais na F1. A referência 1 Ouro ≈
10 Gemas vale para a NOVA economia; o ouro antigo era recurso comum de progressão.
Não há câmbio. Valores antigos ficam documentados na migração do ledger.
Arquivos locais seguem a mesma regra, uma vez, sem crédito online.

## Revisão adversarial antes de código

- BLOCK resolvido no desenho: `progress.ts:buyMeta` não tinha identidade de compra;
  enviar rank esperado e usar chave por node/rank evita retry comprando nível seguinte.
- HARDEN: settlement e compras devem compartilhar lock da mesma UserProgress;
  leitura JSON anterior ao lock poderia perder outra recompensa. V22/V23.
- HARDEN: `simulation.gems` representa XP; não renomear essa coleção para carteira.
  A moeda tem campo `run.gems` separado, sem aplicar growth ao saldo. V24.
- HARDEN: saves sem economyVersion devem converter uma única vez, inclusive baús
  pendentes; import local continua sem mérito online. V25.
- NOTE: core atual não tem RNG totalmente determinístico; isso impede prometer
  replay determinístico no PvP sem trabalho adicional em F5.

Gate: GO para Fase 1 com essas invariantes e testes. Nenhum GO para fases futuras.

## Ordem e contrato de validação

F1 economia → F2 Obelisco → F3 coleção/loja → F4 Gacha → F5 Arena casual →
F6 ranked 1v1 → F7 protótipo 5v5 → F8 classes/Energia → F9 ranked 5v5.
Cada fase exige relatório e verificações reais antes da seguinte.

F1: `tests/economy.test.ts` (migração, drops, recompensas, XP separado),
`tests/economy-database.test.ts` (ledger, concorrência, retry, rollback),
testes existentes core/coop/realtime/browser. Rodar npm test/typecheck/lint/build;
Prisma validate/generate/migrate status; integração com banco e Chrome real.
Sem Gacha/PvP nesta fase; estatística de pulls e testes PvP pertencem às fases futuras.
