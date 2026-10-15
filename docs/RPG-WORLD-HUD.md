# Game Shell e HUD

`/rpg/world` exige RPG_ENABLED e RPG_SHARED_WORLD_ENABLED; `/rpg` encaminha ao mundo quando habilitado. Callback usa allowlist exata. O Shell mantém Canvas, WorldGame, RealtimeClient e RAF durante painéis/transferências. A renderização usa WorldRenderer/WorldTileRenderer/CharacterSpriteRenderer, e a arte estática do Refúgio foi extraída em RefugeLayer e compartilhada com RefugeScene legado.

O HUD mostra nome/personagem, nível/XP permanente, HP confirmado, região, conexão, minimapa, objetivo persistido e confirmações. Não adiciona mana ou habilidades fictícias. Minimap/mapa derivam de bounds/portais/NPCs versionados, jogadores do AOI e somente POIs confirmados no estado pessoal. As coordenadas previstas não autorizam interações.

WASD/setas movem; E interage; I inventário; C personagem; J diário; M mapa; P grupo; Escape fecha dialog e devolve foco ao Canvas. Campos de chat/modais possuem foco próprio; ao abrir, input de movimento é limpo. O mundo segue online. Em mobile há joystick VirtualJoystick existente, captura/cancelamento de pointer, contexto de toque e painéis em tela inteira. Nada depende de hover.

CharacterPanel, EquipmentInventory, StoragePanel e QuestJournal são reutilizados. WorldActionContext fornece transporte autenticado para as mesmas intenções, validações e transações; o backend de serviços é integrado na camada de zonas. Server Actions legadas continuam para fallback, com bloqueio quando existe presença ativa. Refresh de RSC atualiza os painéis sem substituir a instância do Shell.

Diagnósticos opt-in de desenvolvimento: window.__limiarWorld e data-shell-id/data-zone/data-epoch/data-authoritative-x/y no Canvas. Contagens de instâncias/RAF/clientes e métricas de draw/frame são limitadas. QA de navegador deve comprovar identidade do Shell e socket através das transições, foco, toque, sprites e cleanup. Assets canônicos permanecem intactos; serviços/NPCs conservam fallbacks existentes explicitados no inventário de arte.
