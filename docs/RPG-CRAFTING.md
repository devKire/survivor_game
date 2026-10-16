# A Forja dos Ecos — Fase 7

No mundo compartilhado, aproxime-se da Forja dos Ecos no lado oeste do Refúgio e pressione E/toque. O painel abre no mesmo Canvas/socket. Fabricar, aprimorar e reforjar são serviços físicos, não páginas externas. Bancada de refinamento fica a leste; o comerciante fica no setor sudeste. Mapa/minimapa mostram o comerciante e o catálogo contém as estações com IDs estáveis.

Rollout: `RPG_CRAFTING_ENABLED=false`, dependente de RPG_ENABLED e RPG_SHARED_WORLD_ENABLED, no Next e no realtime. Não depende do Refúgio/exploração legados. A geometria pública passa a Refúgio v2, protocolo WORLD 2; o Refúgio local legado continua v1 e as Ruínas continuam v1. Web/realtime precisam ser publicados juntos.

O jogador usa saldos materiais reais, confirma o custo, recebe uma instância em INVENTORY e a equipa pelo inventário existente. Refazer a mesma intenção após falha recupera a confirmação anterior. Histórico paginado da estação mostra fabricação, refino, melhoria, reforja, compra e venda confirmados. Não há grants por save, crafting offline, GEMS, leilão ou Fase 8.

Domínio e catálogos ficam em `game/{core,content}/rpg/crafting`; persistência em `server/rpg/crafting`; transporte em WORLD_RPC e autorização espacial no coordenador. [Receitas](RPG-RECIPES.md), [forja](RPG-FORGE.md), [refino](RPG-REFINEMENT.md), [comerciante](RPG-TRADERS.md), [política](RPG-ECONOMY-POLICY.md), [balanceamento](RPG-ECONOMY-BALANCE.md), [persistência](RPG-CRAFTING-PERSISTENCE.md).
