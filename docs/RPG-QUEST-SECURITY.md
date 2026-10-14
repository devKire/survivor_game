# Segurança narrativa

Actions exigem sessão Better Auth, RPG_ENABLED + RPG_QUESTS_ENABLED, schema estrito e limite por usuário. userId nunca vem do input; valores extras, provas, XP, nó arbitrário e personagem beneficiário fornecidos pelo cliente são rejeitados. Erros internos recebem mensagem genérica; erros de revisão orientam atualização.

Ordem de locks: quests tomam somente UserProgress e leem fontes duráveis. Não adquirem Team ou sessão depois da conta; escritores de exploração/expedição continuam com sua ordem original. `rpgTransaction` usa Serializable e três tentativas apenas para abortos seguros P2034/40001/40P01. Commit desconhecido não é repetido automaticamente; o mesmo requestId recupera a resposta persistida.

Ownership composto liga progresso ao personagem da conta e provas/receipts/flags ao progresso da mesma conta. Unicidades impedem novas ocorrências, fontes duplicadas e grants repetidos. Triggers impedem mudança de identidade, redução de estado e edição de provas, escolhas e receipts. Exclusão da conta faz cascata sem apontar para outro usuário.

RPG-only incrementa apenas RpgProfile.revision; nunca chama persistSave nem altera UserProgress.version. SAVE_SCHEMA=3, ECONOMY_VERSION=2, RunState/RunSnapshot, combate, inventário Survivor, worldVersion/seed/IDs, protocolo e PvP permanecem fora das alterações.

Rollback de rollout: desligar somente RPG_QUESTS_ENABLED. Dados permanecem; fontes continuam operando sob suas próprias flags. Reativar recupera progresso por reconciliação. Não retirar a migração com DROP em produção. Manter histórico de sessões/claims enquanto direitos narrativos dependerem deles; provas já aplicadas preservam sua identidade independentemente da fonte original.
