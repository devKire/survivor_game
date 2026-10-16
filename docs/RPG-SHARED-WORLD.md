# Mundo RPG compartilhado — Fase 6.5

Com `RPG_ENABLED=true` e `RPG_SHARED_WORLD_ENABLED=true`, `/rpg` encaminha o jogador autenticado para `/rpg/world`. Refúgio e Arredores das Ruínas são zonas públicas da mesma autoridade. Entrar não cria Team nem GameSession, não exige PRONTO/INICIAR e não inicia contagem regressiva. A capacidade inicial é vinte pessoas por zona, com grupos opcionais de até cinco.

O personagem permanente entra com a build validada no servidor. WASD/setas e joystick enviam intenções; E ou toque interage. C/I/J/M/P abrem personagem, inventário, diário, mapa e grupo sem desmontar Canvas ou socket. Depósito, diálogos e missões exigem proximidade dos respectivos serviços. Personagem, atributos e equipamentos mudam apenas no Refúgio. A saída física leva às Ruínas; o retorno conserva o mesmo Shell e atualiza a build.

Nas Ruínas existem recursos e descobertas da geração procedural atual, compartilhando os limites diários históricos por conta. O combate de campo reutiliza armas e IA existentes; mortes observadas pelo servidor podem gerar XP, material e equipamento, confirmados no painel de recompensas. Morrer retorna à entrada segura após cinco segundos. Reconectar retorna ao checkpoint de zona, sem reconstruir mortes não confirmadas. Não há crafting, comércio novo ou Fase 7.

## Mapa da implementação

| Área | Arquivos principais | Documento |
| --- | --- | --- |
| Domínio, zonas, interesse | `game/core/rpg/world`, `game/content/rpg/world-*` | [Arquitetura](RPG-WORLD-ARCHITECTURE.md), [AOI](RPG-WORLD-INTEREST-MANAGEMENT.md) |
| Autoridade, presença e serviços | `realtime/world`, `server/rpg/world` | [Presença](RPG-WORLD-PRESENCE.md), [movimento](RPG-WORLD-MOVEMENT.md), [transições](RPG-WORLD-TRANSITIONS.md) |
| Canvas, HUD e painéis | `game/client/rpg-world`, `app/rpg/world` | [HUD](RPG-WORLD-HUD.md), [zonas](RPG-WORLD-ZONES.md) |
| Grupos, chat e combate | `realtime/world/social.ts`, `combat.ts`, `server/rpg/world/rewards.ts` | [Social](RPG-WORLD-SOCIAL.md), [PvE](RPG-WORLD-PVE.md) |
| Banco e rollout | duas migrações novas, flag independente | [Persistência](RPG-WORLD-PERSISTENCE.md), [segurança](RPG-WORLD-SECURITY.md), [deploy](RPG-WORLD-DEPLOYMENT.md), [QA](RPG-PHASE6-5-QA.md) |

## Arte e acabamento

Reutilizados: atlas de tiles/biomas/props, WorldRenderer, WorldTileRenderer, CharacterSpriteRenderer, quatro sprites canônicos de Nara/Orin/Ivo/Sena, armas/efeitos/inimigos existentes e VirtualJoystick. `RefugeLayer` compartilha a cena existente com o Refúgio legado. A sequência de ataques autoritativa alimenta a animação canônica, sem inventar combate no cliente.

NPCs e serviços conservam silhuetas e formas de fallback do Refúgio existente; não são sprites novos finalizados. Portais usam os marcadores existentes. As prioridades de arte posteriores são sprites próprios de NPCs, estruturas de serviço, portal e estados consumidos de recursos. Não foram geradas imagens substitutas nem modificados os sprites canônicos. Screenshots reais desktop e touch estão em [QA visual](qa/world/); não representam acabamento artístico final.

O limite operacional é uma autoridade realtime por banco, sem sharding nem distribuição de zonas entre processos. As medições locais não representam latência WAN ou capacidade de produção. Confira resultados e ressalvas no relatório antes de habilitar o rollout.
