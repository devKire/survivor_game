# NPCs e diálogos mínimos

Conteúdo tipado em `content/rpg/refuge-npcs.ts`, contrato em `core/rpg/refuge/types.ts`. Títulos funcionais sem nomes canônicos novos, quests, reputação ou flags narrativas.

| ID | Posição | Raio | Diálogo | Serviços |
|---|---|---|---|---|
| refuge:guardian | 670,620 | 90 | welcome, 2 falas | Personagem, recompensas |
| refuge:armorer | 325,395 | 85 | arsenal, 1 fala | Arsenal |
| refuge:keeper | 905,395 | 85 | storage, 2 falas | Depósito |
| refuge:guide | 950,655 | 85 | expeditions, 2 falas | Preparação |

Todos têm raio de colisão 14. Textos, posições e serviços ficam fora do renderer. Interação local encontra apenas alvos conhecidos e próximos; E repetido e interação em modal não disparam novamente. Diálogo permite avançar, escolher serviço e fechar com Escape. O dispatcher abre UI; jamais executa grant nem considera npcId uma autorização de mutação. Dialog e passos não persistem. Fase 6 poderá evoluir o catálogo sem inferir objetivos ou recompensas de conversa local.


## Fase 6 — narrativa persistente

Missões, diálogos e escolhas usam [domínio versionado](RPG-QUESTS.md), provas duráveis das fases anteriores e resgate transacional. Rollout `RPG_QUESTS_ENABLED=false`; sem alterações em snapshots, economia Survivor ou combate. Consulte o [relatório de QA](RPG-PHASE6-QA.md). A Fase 7 não foi iniciada.
