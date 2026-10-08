# Arquitetura do RPG híbrido

## Autoridade e fronteiras

O banco é a única autoridade do RPG persistente. O cliente envia apenas intenção validada, como selecionar um personagem já desbloqueado. Os serviços em `src/server/rpg` autenticam na borda, isolam consultas por `userId` e executam mutações transacionais.

O catálogo em `src/game/content/rpg` contém identificadores e dados estáticos. As regras em `src/game/core/rpg` são puras e não importam Prisma, Next.js ou dados de save. O domínio RPG não é serializado em saves Survivor nem em mensagens realtime.

## Concorrência e idempotência

`RpgProfile.revision` é o controle otimista específico do RPG. Antes de mutar, o serviço adquire `FOR UPDATE` sobre `UserProgress`, verifica o desbloqueio atual e bloqueia `RpgProfile`. A mesma combinação de usuário e `requestId` retorna o recibo existente; uma repetição com operação ou entrada diferente é rejeitada. A atualização exige a revisão esperada e incrementa somente `RpgProfile.revision`.

## Modelo inicial

- `RpgProfile`: raiz 1:1 do usuário, revisão e personagem ativo.
- `RpgCharacter`: XP e nível independentes por personagem desbloqueado.
- `RpgItemInstance`: item persistente pertencente ao perfil e, quando equipado, a um personagem do mesmo perfil.
- `RpgMaterialBalance`: saldo por material, sem relação com GOLD/GEMS.
- `RpgMutationReceipt`: resultado imutável de uma intenção idempotente.

Não existe grant público nas Fases 0 e 1. Itens, materiais e XP permanecem em zero até uma fase futura definir fontes autoritativas do servidor.
