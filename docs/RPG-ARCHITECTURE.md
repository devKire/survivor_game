# Arquitetura do RPG híbrido

## Autoridade e fronteiras

O banco é a única autoridade do RPG persistente. O cliente envia apenas intenção validada: selecionar um personagem desbloqueado ou distribuir pontos já existentes. As páginas usam `requirePageUser` e as Server Actions usam `requireUser`; os serviços internos em `src/server/rpg` recebem exclusivamente esse `userId` derivado da sessão. Não são endpoints públicos. As consultas e mutações são isoladas por usuário. A flag server-side `RPG_ENABLED`, desligada por padrão, protege páginas, actions e serviços.

O catálogo em `src/game/content/rpg` contém identificadores e dados estáticos. As regras em `src/game/core/rpg` são puras e não importam Prisma, Next.js ou dados de save. O domínio RPG não é serializado em saves Survivor nem em mensagens realtime.

## Concorrência e idempotência

`RpgProfile.revision` é o controle otimista específico do RPG. Uma transação `Serializable` adquire `FOR UPDATE` sobre `UserProgress`, na mesma ordem da economia. O recibo é consultado antes de reconciliar desbloqueios: mesmo usuário/requestId e comando devolvem o resultado original, inclusive depois de outras mutações. Operação ou payload diferente são rejeitados. A seleção mantém o fingerprint canônico da Fase 1.

Sem recibo, o serviço verifica o desbloqueio atual, reconcilia o perfil, exige a revisão esperada e atualiza `RpgProfile` por compare-and-swap. Atributos, revisão e recibo pertencem ao mesmo commit. Mutações exclusivamente RPG não escrevem no save nem alteram `UserProgress.version`; a criação de uma conta sem progresso apenas insere o save inicial padrão. IDs de personagem vindos do cliente são IDs de catálogo, nunca IDs de registros de outra conta.

Há no máximo três tentativas da transação inteira para abortos confirmados: Prisma `P2034` ou PostgreSQL `40001`/`40P01` expostos pelo adapter-pg (inclusive dentro de `P2010`). Falhas de validação, revisão, FK ou conexão com resultado de commit desconhecido não são repetidas automaticamente. O cliente pode repetir a mesma intenção com o mesmo requestId. Campos e requestId são preservados no formulário após erro; mudar a intenção cria outro ID. Revisão vencida recebe mensagem e opção de atualizar o perfil, sem derrubar a página.

## Inicialização e leitura

O perfil e os personagens desbloqueados são criados sob demanda, dentro da transação com o lock da conta. Uma reconciliação posterior que adiciona personagem ou troca um ativo indisponível incrementa a revisão RPG uma única vez. Personagens bloqueados ficam inacessíveis sem apagar a progressão persistida.

Perfis completos são lidos numa transação `RepeatableRead`, com um snapshot consistente do progresso, personagens, itens e materiais, sem upsert nem lock de escrita. Ausência de perfil/personagem desbloqueado ou ativo inválido encaminha para a inicialização transacional. Saves inválidos falham de forma fechada, sem fabricar desbloqueios.

## Modelo inicial

- `RpgProfile`: raiz 1:1 do usuário, revisão e personagem ativo.
- `RpgCharacter`: XP, nível, `attributes` e `attributePoints` independentes por personagem desbloqueado.
- `RpgItemInstance`: item persistente pertencente ao perfil e, quando equipado, a um personagem do mesmo perfil.
- `RpgMaterialBalance`: saldo por material, sem relação com GOLD/GEMS.
- `RpgMutationReceipt`: resultado imutável de uma intenção idempotente.

Não existe grant público nas Fases 0, 1 e 1.5. Novos perfis têm XP zero, nível 1 e inventário/material vazio. Dados persistidos preexistentes são preservados. Nenhum save local, `CloudSolo`, run não autoritativa ou valor de XP informado pelo cliente concede recursos RPG.

## Invariantes de atributos

As regras puras em `src/game/core/rpg/attributes.ts` e a constraint SQL concordam:

- `vitality`, `power`, `agility`, `focus`, `will`: exatamente essas cinco chaves, inteiros entre 0 e 99.
- Nível entre 1 e 100; total concedido = `5 * (level - 1)`; gasto = soma dos atributos.
- `attributePoints = total concedido - gasto >= 0`. O saldo é persistido para leitura, mas não é uma fonte independente de pontos.
- Nível 1 começa com todos os atributos e saldo em zero. Alocar exige saldo suficiente e respeita o teto do atributo.
- A função pura `attributesAtLevel` recalcula o saldo pelo novo nível, conserva gastos e rejeita regressão. Repetir o mesmo nível não duplica pontos. Ainda não existe operação de evolução/XP; uma futura operação autoritativa deverá salvar nível e saldo juntos.

Não há efeito em `Player.recalculate()`, HP, ataques ou qualquer cálculo de combate nesta fase.

## Integridade e preparação para itens da Fase 2

Mantidos `WEAPON`, `ARMOR`, `CHARM`, unicidade de slot por personagem, raridades existentes, quantidades 1–9999, par personagem/slot ambos nulos ou preenchidos e FKs compostas que exigem mesmo proprietário. Equipar exige quantidade exatamente 1; separar uma unidade de uma pilha será responsabilidade de uma futura transação. Não há action de equipamento nesta entrega.

Os testes PostgreSQL confirmam a cascata da conta com personagem ativo, vários personagens, itens equipados e livres, materiais e receipts. As FKs `RESTRICT` de personagem ativo/equipado podem permanecer: protegem exclusão isolada de personagem e não impedem a cascata completa do usuário.

A Fase 2 precisará definir um documento versionado e validado de dados rolados, IDs/valores de affixes, versão do conteúdo usada na geração e requisito de nível capturado na instância. A instância continuará pertencendo ao perfil, com vínculo opcional a um personagem do mesmo proprietário. O requisito deverá ser validado no servidor sob o lock da conta, preservando a integridade dos slots. A política de migração/revalidação de conteúdo deve ser definida antes de gerar itens. Nenhum desses campos especulativos ou geradores foi adicionado agora; somente a constraint necessária para impedir pilhas equipadas.

## Migração e operação

`20261008180000_rpg_foundation_hardening` adiciona colunas e constraints no schema `limiar`, atribui o saldo correspondente aos níveis existentes e move pilhas equipadas para o inventário sem perder unidades. A operação é atômica e limita a espera por lock a cinco segundos; requer uma janela compatível com o tamanho das tabelas RPG. Em falha de lock, resolver a tentativa registrada pelo Prisma como revertida antes de executar novamente. Não aplicar reset nem apagar migrações anteriores.

As constraints de CHECK e a função `rpg_attribute_spent_v1` são mantidas no SQL da migração; Prisma não representa essas regras no datamodel. Reverter a aplicação pode manter as colunas aditivas, mas gravadores antigos que alterem nível isoladamente serão rejeitados: desabilitar RPG até atualizar esses gravadores. Ver [RPG-HARDENING.md](RPG-HARDENING.md) para auditoria e resultados reais.
