# Regiões de exploração

A única região jogável v1 é **Arredores das Ruínas** (`ruins-outskirts`). Mapa ruins existente, seed pública fixa `limiar:exploration:ruins-outskirts:v1`, worldVersion=3, generationVersion=1, contentVersion=1, rulesVersion=1. Bounds: nove chunks de 640 unidades, cx/cy -1..1, área -640..1280 nos dois eixos. Spawn (0,0), participantes até (112,0). Duração máxima 900 segundos; saída individual pelo menu, reconexão até 60 segundos. Após sair não é possível reingressar na mesma sessão; a equipe volta ao lobby quando todos saem ou o tempo termina.

A região não possui ondas, combate ou XP. Reutiliza a navegação e colisão do mundo de Ruínas, com props, estruturas e sprites canônicos. Interativos Survivor são cenografia nesta atividade; não dão baús, moeda ou teleporte. A borda dourada demarca o limite autoritativo. O mundo visual pode desenhar terreno além da borda, sem permitir acesso ou gathering fora dela.

Gerador independente: RNG por seed RPG/chunk/definição; até 80 candidatos por definição/chunk; margem 85, exclusão de spawn 150, distância de estruturas raio+75, distância de outros descritores 125. Recursos filtrados pelo mesmo biomeAt do renderer. Até três recursos e um POI por chunk; ausência de posição válida descarta a definição naquele chunk. Não há densidade infinita nem geração pedida pelo cliente.

IDs: `explore:v1:ruins-outskirts:cx:cy:definition:0`. Versão faz parte da identidade. World.createChunk e os IDs Survivor não mudam. Alterar seed, regras, posições ou recompensas exige nova versão e suporte explícito no catálogo/constraints; não reinterpretar claims antigos. Perfis visuais de mina/caverna não são apresentados como novas regiões implementadas.
