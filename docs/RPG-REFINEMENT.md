# Bancada de refinamento

Estação `refuge:refinery` em (990,480), raio 85/colisão 30. Somente Refúgio público v2, aproximação (990,540). O visual de bancada/alambique/cristal é fallback Canvas identificado; um sprite de bancada pode substituí-lo posteriormente.

`refine:residual-dust` v1 consome seis weathered-ore e quatro ruins-fiber para produzir um obelisk-dust. Usa RpgMaterialBalance existente; máximo três operações/conta/dia UTC. Não produz echo-shard, não cria moeda e não renova direitos de gathering. Trocar personagem ou visita não altera a cota.

O custo torna a conversão uma opção para excedentes, não substituição mais eficiente de coleta/PvE. Se o resultado exceder o cap material de 1e9, toda a operação falha; não consome insumos para descartar silenciosamente a saída. Receipt, saldos e revisão confirmam juntos. UserProgress.version não muda. [Análise econômica](RPG-ECONOMY-BALANCE.md).
