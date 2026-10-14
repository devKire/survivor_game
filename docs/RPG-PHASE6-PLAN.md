# Fase 6 — plano e auditoria antes da implementação

Base verificada: main `aacc689da11662cad8419e10c1dd25991c29cbc8`, Fase 5 integrada pelo PR #31. Baseline executado em PostgreSQL isolado e migrações existentes: `npm test`, 272 aprovados e 81 condicionais ignorados (353). Nenhum teste ignorado é considerado aprovado.

A infraestrutura existente já fornece locks Serializable, revisão RPG, receipts idempotentes, XP e orçamento de atributos, descoberta por conta, claims de coleta e receipts de expedição. Faltam domínio narrativo, persistência de quests/diálogos/escolhas, reconciliação e interface. Não serão recriados exploração, loot, storage, combate ou rede.

## Contratos decididos

- Cinco quests iniciais não repetíveis, três principais encadeadas e duas secundárias. Escopo ACCOUNT; beneficiário de XP congelado no aceite. O domínio representa CHARACTER, mas descobertas atuais não possuem atribuição por personagem e são incompatíveis com esse escopo.
- Versão aceita congelada. LOCKED/AVAILABLE são derivados; ACTIVE/COMPLETED/REWARDED persistidos. Definições antigas permanecem resolvíveis. Provas limitadas e únicas por progresso, objetivo, tipo e origem; contagens derivadas dessas provas.
- Descobertas usam POIs reais, região/versão e política retroativa explícita. Coleta exige quantidade positiva e revisão da claim posterior a acceptedRevision; não usa saldo como prova. Expedição exige entryRevision >= acceptedRevision, receipt confirmado, participante elegível e vitória terminal validada. Bosses exigem origem confirmada cruzada com evento terminal. Timestamps não decidem a ordem de transações que aguardaram locks.
- Reconciliação delimitada de fontes duráveis, sob lock UserProgress somente. Nenhum lock de Team/sessão adquirido após conta, nenhuma consulta em tick/frame e nenhum cursor que pule expedições ainda pendentes. Recupera prova cuja gravação precedeu falha de atualização da quest.
- Mutações usam autenticação, flag, limites, validação estrita, revisão RPG e RpgMutationReceipt. Replay precede comparação de revisão. RewardReceipt por quest impede segunda concessão mesmo com outro requestId. XP, custos, materiais, flags, estado e receipts confirmam juntos. UserProgress.version não muda.
- Diálogo é um grafo de conteúdo validado no servidor, com cursor persistido por conta/NPC. Abrir modal não prova conversa. Escolha explícita de uma transição permitida pode produzir prova; aproximação no Refúgio é apenas conveniência visual. Escolha exclusiva persiste e altera texto posterior sem bloquear campanha.
- RPG_QUESTS_ENABLED inicia false, depende de RPG_ENABLED e não habilita Refúgio, exploração ou expedições. Desligar interrompe operações narrativas; fontes existentes continuam sendo persistidas pelos respectivos sistemas. Reativação permite reconciliação, sem grant durante desligamento.
- Conteúdo novo é uma proposta narrativa, separada dos nomes/títulos e descrições já existentes. Sem biografias, cosmologia, retratos ou retcons inventados como cânone.

## Entrega incremental

A: domínio/catálogos/testes puros. B: schema e migração aditiva com integridade/testes. C: serviços, provas e integração autenticada. D: diário, NPCs, tracker e navegação. E: QA real, métricas, documentação e revisão final. Branches codex/rpg-phase6-domain, -persistence, -integration, -ui e codex/rpg-phase6; PRs encadeados, sem merge automático.

Preservar SAVE_SCHEMA=3, ECONOMY_VERSION=2, inventário Survivor, Player.level/XP temporário, snapshots, protocolos, IDs/seed/worldVersion, GOLD/GEMS, multiplayer/PvP e imports/CloudSolo. Fase 7 fora do escopo.
