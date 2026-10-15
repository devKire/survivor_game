# Persistência do mundo compartilhado

Migração aditiva `20261015010000_rpg_shared_world`, sem alterar migrações históricas. `RpgWorldVisit` conserva personagem, autoridade, geração e checkpoint seguro por visita. Presença/movimento/HP são memória da autoridade; não há posição exata por frame no banco. Checkpoint muda apenas em transferência/respawn autorizado. Reconexão substitui a presença e retorna ao checkpoint seguro; crash não recria movimento ou combate não confirmado.

`RpgResourceClaim.sessionId` torna-se opcional, com `worldVisitId` opcional e CHECK que exige exatamente uma origem. FKs compostas ligam a origem à mesma conta. A unicidade conta/região/versão/nó/ciclo e o índice por ciclo permanecem: nem novo mundo, personagem ou visita renovam claims diários. `RpgDiscoveredPoi` permanece a mesma fonte durável.

`RpgWorldRewardEvent` registra somente uma morte de campo validada, seus participantes e seed privada; PENDING é recuperável e SETTLED é terminal. `RpgWorldRewardReceipt` possui unicidade evento/conta e pertence ao personagem da própria conta. Resultado e seed do evento são imutáveis. O ledger é independente de Survivor e RPG_EXPEDITION. Recompensas de campo só serão habilitadas após os testes de origem/commit/replay.

Locks de conta, revisão e receipts existentes continuam obrigatórios. Serviços antigos recebem uma verificação de visita ativa sob o lock: enquanto no mundo, mutações usam a capacidade criada pelo coordenador e revalidam a presença após awaits. Server Actions legadas não substituem autoridade espacial. GOLD/GEMS e UserProgress.version permanecem separados.

Upgrade conserva inventário, equipamentos, XP/atributos, quests, flags, materiais, descobertas, claims e históricos. Rollback de rollout usa RPG_SHARED_WORLD_ENABLED=false; conserva tabelas e direitos consumidos. Não usar DROP/reset para rollback. Aplicação de ALTER/índices exige janela adequada ao histórico e lock_timeout de cinco segundos. Testes usam exclusivamente bases locais descartáveis.
