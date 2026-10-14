# Flags narrativas e escolhas

Flags v1: refuge-introduction-completed, ruins-remnants-recorded, material-samples-delivered, ruins-reconnaissance-completed, expedition-trial-completed. São inseridas no resgate junto da recompensa, com FK composta ao progresso da mesma conta. São imutáveis; sua presença é o valor verdadeiro. Não há action genérica para editar flags.

A escolha exclusiva é separada das flags: `(userId, investigation-priority)` contém REMNANTS ou ECHOES, mais diálogo/versão/nó de origem. Um trigger impede atualização. Corridas entre abas são serializadas pela conta e revisão. Alternativas não podem ser acumuladas ou trocadas por reabrir a conversa.

Desativar o rollout bloqueia operações narrativas sem apagar flags/escolhas. Ao reativar, a reconciliação consulta evidências duráveis das fases anteriores. Não concede recompensas enquanto desligado. Recuperação de falhas usa requestId e receipts, nunca confirmação local de um diálogo.
