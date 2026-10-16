# Movimento autoritativo

WORLD_INPUT contém epoch, sequence e eixos limitados a [-1,1], sem posição. O servidor normaliza diagonais, aplica movimento em ticks de 40 ms, rejeita sequence repetida/epoch antigo e zera input após 250 ms. Quantidade de mensagens não determina deslocamento. Refúgio usa moveInRefuge e sua geometria/collisionRadius; Ruínas usa GameSimulation.movePlayer/World.resolvePlayerMove com bounds canônicos.

O cliente deverá prever com as mesmas regras e reconciliar pelo ACK; outros jogadores usam interpolação existente. Proximidade para NPC/portal/recurso é calculada na posição do servidor. Safe zone não inicia ondas nem PvP. Personagem não recebe XP temporário ou opções de level-up por movimento. Inputs antigos são descartados depois de transferência/reconnect.
