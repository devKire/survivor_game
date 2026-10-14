# Estados das missões

LOCKED e AVAILABLE são derivados de requisitos de catálogo. Aceitar cria ACTIVE com versão, escopo, beneficiário e acceptedRevision imutáveis. Todos os objetivos satisfeitos produzem COMPLETED; o NPC pode ser um desses objetivos. CLAIM só muda para REWARDED junto de custos, grants, flags e receipt.

SQL permite somente ACTIVE → COMPLETED → REWARDED. Transições inversas, alteração da identidade e timestamps já confirmados são rejeitadas. A unicidade `(userId, questId, scopeKey)` impede repetir a missão mudando versão ou personagem ativo. Escopo ACCOUNT usa `ACCOUNT`; CHARACTER usa o personagem de catálogo.

Cada mutação aceita expectedRevision e requestId UUID. Replay de receipt precede comparação da revisão. Outra intenção com o mesmo UUID é rejeitada. Uma revisão antiga recebe orientação para atualizar o diário. Receipts da quest impedem segunda recompensa com outro UUID. Não há reset, abandono ou repetição neste capítulo.
