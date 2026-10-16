# Forja, aprimoramento e reforja

Estação `refuge:forge`, posição (220,480), raio de interação 85 e colisão 34, no Refúgio público v2. Aproximação sugerida (280,480), sem mover spawn, portais ou NPCs antigos. Colisão usa a mesma definição na previsão visual e no servidor. A silhueta Canvas de pedra/metal/brasas é fallback explícito: sprite próprio de forja permanece asset prioritário, sem substituir personagens canônicos.

Não existe campo +N. O resolver já entende raridade/affixes; a melhoria v1 promove COMMON→RARE e RARE→EPIC na mesma instância. Nível, ID e proprietário são preservados. Não modifica diretamente Player.recalculate ou combate Survivor/PvP. COMMON→RARE exige nível 1, oito minérios e seis pós; RARE→EPIC exige nível 20, doze minérios, oito fibras, doze pós e dois fragmentos. Máximo dois aprimoramentos/conta/dia; EPIC/LEGENDARY não podem ser promovidos.

Reforja conserva raridade/nível/ID, substituindo somente seed/affixes por um novo roll permitido. Não garante melhora. COMMON não possui affixes e não pode reforjar. Custos: RARE quatro minérios/dois pós; EPIC seis minérios/quatro pós; LEGENDARY oito minérios/seis pós/um fragmento. Máximo três/conta/dia.

Ambas exigem item unitário próprio, INVENTORY, desequipado, conteúdo íntegro e personagem ativo compatível com nível/restrição. STASH exige retirada prévia. Custos e mudanças são atômicos, com snapshot anterior/posterior no histórico; nenhuma duplicação de instância. A confirmação exibe item, custos e aviso de substituição dos affixes. Fechar painel mantém Shell; abrir/fechar não realiza mutação.
