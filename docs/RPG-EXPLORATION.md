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

## Interface e assets

Entrada pelo novo `refuge:exploration-portal` (380,795), sem renomear estruturas existentes. `/rpg/exploration` prepara a região e o personagem ativo no lobby existente; líder e membros confirmam READY/START. `/team` monta RemoteExploration sobre RemoteGame: mesmos inputs, previsão/reconciliação, sprites, renderer e RAF. O HUD mostra personagem/nível congelados, região, alvo, duração, confirmação e disponibilidade pessoal. Não mostra XP temporário/ondas/itens Survivor. Menu permite atualizar perfil e sair; chat permanece separado dos controles de toque.

Os dados globais de Snapshot não mudam. CONFIG/ACCOUNT/STARTED/RESULT aceitam o tipo aditivo RPG_EXPLORATION; comandos GATHER_START/CANCEL e EXPLORATION_REFRESH/LEAVE só funcionam na sala autorizada. EXPLORATION_STATE contém estado pessoal, nunca seed privada ou inventário. O renderer só usa geometria pública; qualquer posição prevista é corrigida pela simulação e nunca serve como prova de coleta.

| Uso | Asset existente / caminho relativo a src/game/assets | Dimensões / frames | Estado e fallback | Prioridade de arte própria |
|---|---|---|---|---|
| Personagens | character/{nara,orin,ivo,sena}/source.png | 2048², células256, oito direções idle/walk | canônico, renderer compartilhado | nenhuma substituição |
| Terreno | tiles/**/source*.png (manifest) | atlases1254², slots8×8 | forest/ruins/rock existentes; cor de fundo se indisponível | baixa |
| Minério | família rocks no manifest | atlas1254², slot estático | prop existente + anel/rótulo de recurso | média: assets/rpg/exploration/ore.png, sugestão64² |
| Planta | família swamp no manifest | atlas1254², slot estático | prop vegetal provisório + anel/rótulo | alta: assets/rpg/exploration/herb.png, sugestão64² |
| Cristal | família crystals no manifest | atlas1254², slot estático | prop existente + anel/rótulo | média: assets/rpg/exploration/crystal.png, sugestão64² |
| Vestígios | família ruins no manifest | atlas1254², slot estático | marco provisório, rótulo muda após descoberta | média: assets/rpg/exploration/poi.png, sugestão128² |
| Coleta | barra de progresso, sem sprite sheet novo | duração configurável no servidor | não há animação canônica de gathering | futura animação após revisão artística |

Caminhos novos são sugestões de produção, não arquivos presentes. Em falha de imagem, marcador geométrico, anel e nome preservam legibilidade; disponibilidade esgotada reduz opacidade. Nenhum PNG canônico foi alterado. O cache de WorldTileRenderer permanece limitado a 36 rasters; dispose libera seus canvases e descritores na saída da exploração. Capturas de QA mostram a aplicação real.
