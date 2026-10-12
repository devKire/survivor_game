# O Refúgio — Fase 4

Santuário explorável em `/rpg/refuge`, com personagem ativo autenticado e serviços RPG reais. `/rpg` permanece a entrada; `/rpg/storage` é a alternativa acessível do Depósito. A navegação física é opcional para utilizar os serviços.

Habilitação independente: `RPG_ENABLED=true` e `RPG_REFUGE_ENABLED=true` no servidor web. Defaults falsos. O quadro ainda exige `RPG_EXPEDITIONS_ENABLED=true`; entrar no Refúgio nunca habilita START nem cria GameSession. Aplicar a migração antes de habilitar. Nenhum deployment ou merge automático integra esta entrega.

## Fluxo

Hub → Jornada RPG → Refúgio → NPC/estrutura ou serviços acessíveis → personagem/Arsenal/Depósito → quadro → preparação `/rpg/expeditions` → lobby `/team` → READY/START existentes. Resultado RPG → recompensas persistidas → Voltar ao Refúgio. `PENDING` continua pendente: voltar não executa settlement nem fabrica recompensas.

CharacterPanel é compartilhado com `/rpg/character`; EquipmentInventory é o mesmo componente de `/rpg/inventory`. A troca confirmada revalida o layout e atualiza o sprite da cena existente. Nenhuma seleção visual local substitui o perfil, e loadouts de sessões em andamento permanecem congelados. O histórico de recompensas continua na rota existente, autenticado e paginado.

## Autoridade e isolamento

Somente personagem, atributos, equipamentos, localização de itens, materiais e recompensas já persistidos são dados duráveis. Posição, câmera, animação, diálogo e direção são locais e descartados no unmount. Não há presença social simulada, SQL por frame, polling de gameplay, combate, WaveDirector, loot, XP por movimento, moeda ou settlement no Refúgio.

Proximidade é uma regra de interação visual local, **não uma validação autoritativa de distância**. Os botões acessíveis abrem os mesmos serviços sem caminhar. Mutação continua exigindo sessão, conta, intenção estrita, revisão, locks, receipt e transação no servidor. IDs de NPC não são enviados como autorização.

Ver [cena e assets](RPG-REFUGE-SCENE.md), [NPCs](RPG-NPCS.md), [Depósito](RPG-STORAGE.md) e [evidência de QA](RPG-PHASE4-QA.md). Fase 5 permanece fora do escopo.
