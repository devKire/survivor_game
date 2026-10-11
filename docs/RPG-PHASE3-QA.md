# Fase 3 — auditoria e entrega

Base verificada novamente em 11/10/2026: main `4366298bec169671a219b8218dedc36015c258de`,
Fase 2 integrada pelo PR #13. Branch de trabalho `codex/rpg-phase3`.
Fases 4–9 somente planejadas em [RPG-ROADMAP.md](RPG-ROADMAP.md). Sem merge automático.

## Auditoria e alterações

Na base estavam completos equipamentos, affixes, atributos, resolver, mutações
com revisão/receipt e combate RPG experimental. Faltavam autorização pública de
sessão, loot, XP legítimo, terminal recuperável e histórico de recompensas.
`buildRpgCombatLoadout` abria sua própria leitura: foi adicionada variante que
recebe a transação/lock de START. O shutdown/startup genérico interrompia todas
as sessões: agora preserva terminais RPG pendentes. O settlement Survivor mantém
seu bloqueio de contexto RPG e filtra também a identidade persistida.

A ampliação do teste real com atributos encontrou uma incompatibilidade JSONB:
`validateCombatLoadout` comparava JSON.stringify de modificadores. PostgreSQL
reordena chaves, então builds válidas com bônus falhavam após persistir. Agora a
comparação usa campos validados, conserva ordem dos modificadores e rejeita
valores alterados. Regressão unitária e fluxo realtime com builds diferentes
comprovam a correção.

Implementados:

- Conteúdo e domínio: reward-profiles/loot-tables; loot-types/loot-rolls,
  reward-policy/calculator/ledger e xp-progression; HMAC privado por origem.
- Persistência: schema Prisma, migração `20261009200000_rpg_rewards`, serviços
  expedition-entry/terminal/recovery, rewards e reward-history. Ownership,
  exclusividade ativa, índices e audit imutável; payout integral de até cinco.
- Autoridade: Team CONFIG/READY/START, factory realtime com associação privada,
  eventos reais do motor, resultado durável e retomada de payout. Sem IO por kill.
- UI: `/rpg`, `/rpg/expeditions`, `/rpg/rewards`, lobby e navegação; personagem e
  inventário reutilizados. Prévia autenticada no servidor remove seeds da UI.
- QA: testes de domínio, ledger, banco, migração, actions, WebSocket e navegador;
  driver de ticks exclusivo de testes e benchmark local isolado.

A migração adiciona três tabelas e campos de tipo de expedição; sessões antigas
permanecem SURVIVOR. Não edita migrações anteriores, não apaga dados e foi testada
em banco vazio e banco com inventário equipado/conta/histórico compatível com a
Fase 2. GameSessionMember.user muda para Cascade para permitir exclusão de conta
com histórico RPG; FKs compostas conservam ownership. Índices/ALTER TABLE requerem
janela de implantação compatível com o volume do banco; não há reset de produção.

## Evidência executada

Node 22.23.3, PostgreSQL local 18.4, Prisma 7.10.0 e Chromium local. Banco de QA
separado, testes realtime/browser sequenciais. Proteção HTTPS de produção mantida;
browser utiliza Next dev. Nenhum teste ignorado é contabilizado como aprovado.

| Verificação | Resultado efetivamente observado |
| --- | --- |
| Baseline main, npm test | 240 aprovados; 46 ignorados |
| Baseline main, RUN_DATABASE_TESTS=1 | 280 aprovados; 6 ignorados |
| Prisma validate/generate/deploy | Aprovados; migração aplicada em banco temporário |
| npm test final | 258 aprovados; 59 condicionais ignorados |
| PostgreSQL + todas as migrações | 314 aprovados; 3 realtime ignorados e executados separadamente |
| Realtime existente + Fase 2 + Fase 3 | 3 aprovados, incluindo equipes 1/2/5, builds diferentes, reconexão, AFK e replay |
| Browser RPG personagem/equipamento | 3 aprovados; 1 cenário desligado ignorado nessa configuração |
| Browser público RPG completo | Aprovado: registro, lobby, combate, receipt, XP/level-up, item equipável, refresh e isolamento entre contas |
| Typecheck/lint | Aprovados; único aviso preexistente TAU não utilizado em client/browser.ts |
| Build | Aprovado também após inclusão da rota central /rpg |
| Browser completo, ambas as flags habilitadas | 9 aprovados, 2 falhas preexistentes de estabilidade, 1 cenário desligado ignorado |
| Browser com flags desligadas | 1 aprovado (404 nas cinco rotas RPG); 2 cenários habilitados ignorados |
| Entrada final pelo Hub | 1 aprovado: Hub → /rpg → lobby → receipt → inventário → refresh |

O teste WebSocket e o browser usam a entrada pública real. Somente o driver de
teste acelera ticks e oferece sobrevivência/dano de fixture; director, mortes,
tempo, conclusão, terminal e payout pertencem ao motor e serviços reais. Não
existe comando HTTP/WS para fabricar vitória, XP ou loot. Isso comprova o ciclo
autoritativo, não o balanceamento de dificuldade de uma partida humana completa.

Banco cobre: flags, personagem bloqueado, conteúdo equipado inválido, autorização
ativa duplicada, ownership, terminal divergente, cinco usuários, workers
concorrentes, falha no segundo participante com rollback dos anteriores, replay
após commit, derrota/inatividade, economia paralela, saturação, cascata, histórico
paginado e recuperação com rollout desligado. Regras puras testam 4.000 rolls,
fontes/caps, XP e evento de baú com chave, distância e replay.

## Desempenho medido

Relatório reproduzível: [rpg-phase3-performance.json](rpg-phase3-performance.json).
Com cinco usuários: cálculo de loot médio 0,744 ms (p95 1,404 ms); settlement
atômico médio 83,759 ms (p95 130,039 ms, dez amostras); transação Serializable
vazia média 1,457 ms. Inserções efetivas por payout: média 26,1, máximo 30.
Um milhão de tentativas de evento retiveram seis elites, em 94,450 ms;
delta retido após GC aproximadamente zero, pico transitório de heap 16,4 MB.

Benchmark de combate existente, cinco jogadores/1.100 inimigos/quatro rodadas:
update médio Survivor 2,623 ms, RPG sem bônus 2,901 ms, RPG extremo 2,960 ms;
incluindo snapshots 5,014 / 5,693 / 5,492 ms. O relatório inclui faixas p95.
Referência histórica Fase 2: 2,143 / 2,189 / 2,455 ms; não é baseline medida na
mesma rodada/máquina. Valores locais não são SLA de produção. Snapshots não
carregam inventários ou seeds; o ledger permanece limitado e não consulta SQL.

## Compatibilidade e riscos residuais

Sem alterações em RunState/RunSnapshot, SAVE_SCHEMA=3, ECONOMY_VERSION=2,
Player.level/XP temporário, inventário Survivor de quatro slots, seed/worldVersion,
chunks, IDs de estruturas, tiles, biomas ou conteúdo competitivo. GOLD/GEMS,
importação local e CloudSolo permanecem separados; testes comparam UserProgress
antes/depois. PvP não aceita contexto RPG. Somente metadados opcionais de
lobby/resultado foram adicionados; o formato dos snapshots não mudou.

Ambas as flags permanecem false no exemplo de configuração. Habilitar apenas
após integrar a pilha inteira e aplicar migração. Uma instância realtime por
banco continua obrigatória. RUNNING perdido não gera recompensa; TERMINAL
recuperável não é descartado. Corrupção/falta de participante (incluindo exclusão
de conta durante resultado pendente) falha fechada e exige investigação manual,
sem payout parcial. A elegibilidade reduz inatividade evidente, não substitui
detecção futura de bots. As duas falhas históricas de stability.spec.ts persistem:
equipes 2/5, remoteGameInstances esperado 1/observado 0 após aproximadamente um
minuto, em stability.spec.ts:102. Nenhuma asserção foi relaxada. A suíte browser
completa não está aprovada; os nove cenários aprovados
incluem o fluxo RPG. Traces e relatórios locais estão em artifacts/rpg-phase3/browser-full.

## PRs e integração

| PR | Branch | Base inicial | Conteúdo |
| --- | --- | --- | --- |
| [A #14](https://github.com/devKire/survivor_game/pull/14) | codex/rpg-phase3-domain | main | Domínio e conteúdo |
| [B #15](https://github.com/devKire/survivor_game/pull/15) | codex/rpg-phase3-persistence | codex/rpg-phase3-domain | Migração e persistência |
| [C #16](https://github.com/devKire/survivor_game/pull/16) | codex/rpg-phase3-lifecycle | codex/rpg-phase3-persistence | Ciclo autoritativo |
| [D #17](https://github.com/devKire/survivor_game/pull/17) | codex/rpg-phase3-ui | codex/rpg-phase3-lifecycle | Interface e histórico |
| [E #18](https://github.com/devKire/survivor_game/pull/18) | codex/rpg-phase3 | codex/rpg-phase3-ui | QA, correção JSONB, entrada central e relatório |

Commits funcionais: A `fa16308`, B `506eb6c`, C `fc6c41f`, D `e842e66`,
E `023bf02`; atualização final dos links em commit documental separado.

Integrar A → B → C → D → E. Depois de cada merge em main, alterar a base do
próximo PR para main e conferir o diff. Não finalizar merges somente nas branches
intermediárias: a main precisa conter todos os commits, incluindo E. Se usar
squash, atualizar/rebasear as dependentes antes de avançar. Não ativar expedições
após C isoladamente: a correção JSONB encontrada na QA está em E. Nenhum merge ou
deploy foi executado por esta implementação.
