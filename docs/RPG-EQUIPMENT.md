# Equipamento persistente — Fase 2

A definição estática é `RPG_ITEMS`, com IDs antigos preservados: `blade-weathered` (WEAPON), `mantle-ash` (ARMOR), `charm-obelisk` (CHARM), todos utilizáveis no nível 1. As variantes `blade-echo`, `mantle-still`, `charm-lens` exigem nível 5; a lâmina admite Nara/Ivo e o manto admite Orin/Sena. A raridade da instância é preservada, sem conversão para raridade Survivor.

Uma instância pertence ao perfil da conta e ocupa no máximo um slot de um personagem da mesma conta. Uma pilha não pode ser equipada nem é dividida automaticamente. O nível exigido é `max(nível da instância, minLevel da definição)`. WEAPON concede modificadores; Nara continua começando com Ember. Nenhum disparo ou habilidade foi duplicado.

`mutateRpgEquipment` reutiliza a transação, revisão e receipt da Fase 1.5. As intenções aceitas são `EQUIP_ITEM`, `UNEQUIP_ITEM`, `REPLACE_EQUIPMENT`; o cliente informa apenas instanceId, personagem, slot, revisão e requestId. A substituição explícita também confirma o ID anteriormente equipado. Equipar em slot ocupado remove a atribuição antiga e aplica a nova dentro do mesmo commit; mover um item entre personagens libera seu vínculo anterior. Autenticação fica nas Server Actions; o serviço é interno e usa a identidade derivada da sessão.

Flag, desbloqueio, ownership, quantidade, slot, nível, restrição de personagem, conteúdo e rolls são verificados no servidor. Desequipar valida ownership e a atribuição exata, mas não exige requisitos de uso: retirar um item obsoleto ou incompatível deve permanecer possível. Isso não concede stats ou recursos.

Nenhuma intenção muda `UserProgress.version`, GOLD/GEMS ou saves. Receipts são consultados antes da revisão e da reconciliação, permitindo replay do resultado antigo. Um requestId com payload/operação diferente é rejeitado. Falha depois de retirar o item antigo reverte todas as escritas; não há descarte nem duplicação.

## Migração

`20261009100000_rpg_equipment` adiciona `contentVersion=1`, `rollSeed=null`, `affixes=[]` e constraints de metadados à tabela existente. Preserva todos os itens, raridades, níveis, quantidades e vínculos. A função SQL verifica formato, IDs, tiers, valores numéricos limitados e duplicatas; a validação de domínio também confere pool, slot, raridade, nível, grade e reprodução exata da seed.

A migração usa transação e lock_timeout de 5s. CHECKs são mantidos no SQL, não pelo Prisma datamodel. Não editar migrações anteriores nem resetar contas. Banco vazio e upgrade de dados da Fase 1.5 são exercitados em bancos temporários. Desabilitar RPG durante rollback da aplicação; deixar colunas aditivas no banco é seguro.

Não existem grants, merchants, loot, crafting ou editores públicos de seed/affix. Contas novas continuam com inventário vazio. Fixtures de criação ficam apenas em testes. A Fase 3 deve definir origem autoritativa, recibo de concessão e seed criptográfica antes de distribuir equipamentos.
