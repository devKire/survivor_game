# Depósito persistente

`RpgItemInstance.location`: INVENTORY (default) ou STASH. É **a mesma instância**, mesmo proprietário, ID, definição, quantidade, nível, raridade, contentVersion, rollSeed e affixes. Materiais permanecem agregados em RpgMaterialBalance; não há segunda carteira. Quantidade inteira da instância muda de local, sem split/merge de pilhas.

Capacidade STASH: 100 instâncias por conta, sob o lock compartilhado. Inventário mantém a semântica anterior e não ganha limite artificial. Equipamentos equipados devem ser desequipados antes; serviço e CHECK SQL rejeitam STASH com personagem/slot. Equipar/substituir exige INVENTORY; loadouts validam localização; prévia/Arsenal excluem itens guardados. Loot da Fase 3 continua criando instâncias INVENTORY pelo default, sem autoequipar.

`transferRpgItemAction` exige sessão e ambas RPG_ENABLED/RPG_REFUGE_ENABLED. Input estrito: requestId UUID, expectedRevision positiva, instanceId, operação DEPOSIT_ITEM ou WITHDRAW_ITEM; userId e dados de item extras são rejeitados. A conta vem de requireUser. Limite de ações existente (30) e mensagens seguras.

Serviço interno `transferRpgItem`: `rpgTransaction` Serializable (até três tentativas somente para abortos transitórios confirmados), `lockRpgAccount`/UserProgress FOR UPDATE, consulta receipt antes da revisão, valida ownership/localização/equipamento/capacidade, atualiza uma linha, CAS da revisão e receipt no mesmo commit. requestId+payload igual retorna resultado original, mesmo após operações posteriores; payload diferente falha. Falha depois da atualização mas antes do receipt reverte item e revisão. Não modifica UserProgress.version, GOLD/GEMS, saves ou atributos.

A capacidade é regra transacional do serviço; scripts administrativos não devem inserir STASH diretamente. SQL impõe enum de localização, vínculo unequipped e constraints anteriores de ownership/slots/quantidade. A migração `20261011100000_rpg_refuge_storage` somente adiciona coluna/default, dois CHECKs e índice `(userId,location)`; nenhuma migração histórica é editada. Conta excluída continua com cascata existente.

Callbacks seguros aceitam `/rpg/refuge` e `/rpg/storage` exatos. Projeção pública não expõe rollSeed nem owner IDs. Em falha de rede, o formulário conserva o mesmo requestId para retry; revisão vencida oferece atualizar perfil. Não há transferência por frame nem endpoint público de concessão.
