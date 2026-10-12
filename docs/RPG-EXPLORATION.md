# Exploração RPG — Fase 5

## Auditoria e decisão

Base: `b802757932ab721a2e044f452829c7a533901c38`, main com Fase 4 integrada pelo PR #25. Baseline executado em 2026-10-12: 264 testes aprovados, 68 ignorados. Treze migrações incluindo esta fase; as doze anteriores permanecem intactas.

As Fases 0–4 já oferecem perfil, atributos, equipamentos, loot autoritativo, Refúgio, depósito e WebSocket autenticado. A cena do Refúgio é local: não pode comprovar distância para gathering. O ledger `ruins-v1` mede combate por 600 segundos e não pode remunerar exploração. World usa RNG por chunk e IDs históricos `cx:cy:type:i`.

Decisão: atividade explícita `RPG_EXPLORATION`, reutilizando Team/READY/START, GameSession, tickets, CoopSimulation, movePlayer, World.resolvePlayerMove, snapshots, RemoteGame e renderer de tiles/personagens. Uma camada de lifecycle desativa ondas, ataques e interações Survivor. O settlement Survivor continua rejeitando RPG; exploração não chama settleRpgExpedition. A saída não concede recompensa.

Conteúdo independente em `content/rpg/exploration-*` e domínio puro `core/rpg/exploration`. A geração consulta createChunk sem modificar World ou consumir seu RNG. Não muda RunState, RunSnapshot, worldVersion histórico, Player.level, SAVE_SCHEMA=3 ou ECONOMY_VERSION=2.

## Política v1

Arredores das Ruínas: seed pública canônica `limiar:exploration:ruins-outskirts:v1`, mapa ruins, geração RPG 1, worldVersion 3. Chunks [-1,1] em ambos os eixos, coordenadas [-640,1280], spawn (0,0), até 900 segundos. Até três recursos e um POI por chunk; candidatos podem ser descartados por bioma/espaço. Nenhum chunk arbitrário é solicitado pelo cliente.

Recursos pessoais por conta: minério e fibra concedem 2 unidades; cristal concede 1 pó do Obelisco. Duração mínima 1,8/1,2/2,2 s respectivamente. Uma concessão por conta/nó/versão/dia UTC, até 12 claims por sessão e 18 por ciclo. Máximo conservador 24 unidades/sessão e 36/dia/conta; cinco contas têm direitos individuais, sem distribuição implícita. Nível mínimo 1, sem bônus por nível que aumente a oferta. Não há XP, equipamentos, moeda ou recompensa de conclusão.

Esta fase não implementa quests, crafting, dungeons, corrupção ou reputação. Nomes dos novos recursos são conteúdo descritivo inicial sujeito a revisão narrativa antes de produção.
