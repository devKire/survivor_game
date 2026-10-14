# Missões RPG — Fase 6

Entrada: `/rpg/quests`, serviço narrativo dos quatro NPCs do Refúgio e tracker de exploração. Rollout exige `RPG_ENABLED=true` e `RPG_QUESTS_ENABLED=true`; ambas começam desligadas. As flags de Refúgio, exploração e expedições continuam independentes.

O capítulo v1 tem três missões principais e duas secundárias, não repetíveis por conta. O personagem ativo no aceite torna-se o beneficiário permanente do XP daquela missão. Trocar personagem não reinicia objetivos nem redireciona a recompensa. A instância armazena a versão aceita; provas e textos são resolvidos por essa versão.

Catálogos: `src/game/content/rpg/quests` e `dialogues`. Regras puras: `src/game/core/rpg/quests`. Persistência e reconciliação: `src/server/rpg/quests`. O cliente transmite intenções de aceitar, conversar e resgatar; não transmite provas, XP ou recompensas.

A arquitetura admite escopo CHARACTER com chave igual ao ID do personagem e provas de coleta/expedição atribuídas ao personagem participante. O conteúdo inicial é exclusivamente ACCOUNT. Descoberta da Fase 5 não identifica personagem: o validador rejeita seu uso em CHARACTER e rejeita a política não retroativa sem uma origem adequada.

Reconciliação ocorre ao abrir/atualizar o diário e nas ações narrativas. O tracker solicita atualização após mudanças em conjuntos de recursos consumidos/POIs descobertos, com debounce, nunca por snapshot. O serviço reconcilia registros duráveis; perder uma notificação não perde o progresso. A revisão retornada pelo serviço autenticado atualiza a intenção de coleta do cliente sem mudar o protocolo realtime.

Limites v1: cinco quests, até dez objetivos/quest, alvo até cem, lote até cem fontes/objetivo, vinte registros por página. Não há retenção automática de evidências: excluir sessões/claims históricos sem preservar os direitos associados continua proibido. Provas aplicadas permanecem vinculadas à quest e cascata da conta.
